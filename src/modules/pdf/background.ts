// PDF translation — parsing happens in the background (no page CSP issues),
// a lightweight panel is injected into the PDF page to render results.
// Ported from the legacy background PDF handling.

import { getDocument } from 'pdfjs-dist';
import * as pdfjsWorker from 'pdfjs-dist/build/pdf.worker.mjs';
import type { Settings } from '../types';
import { translate } from '../translation/router';
import { logger } from '../utils/logger';

// Mount worker on globalThis so pdf.js uses the inline (fake) worker.
(globalThis as unknown as { pdfjsWorker: unknown }).pdfjsWorker = pdfjsWorker;

type PdfUpdate =
  | { type: 'rf-pdf-update'; action: 'status' | 'loading' | 'error' | 'page' | 'done'; text?: string; progress?: string; pageNum?: number; paragraphs?: { original: string; translated: string }[] };

function send(tabId: number, msg: PdfUpdate): void {
  chrome.tabs.sendMessage(tabId, msg).catch(() => {});
}

export async function handlePdfTab(
  tabId: number,
  pdfUrl: string,
  getSettings: () => Promise<Settings>,
): Promise<void> {
  await chrome.scripting.executeScript({ target: { tabId }, func: injectPdfPanel });
  send(tabId, { type: 'rf-pdf-update', action: 'status', text: '正在下载 PDF…' });

  try {
    const pdfResp = await fetch(pdfUrl);
    if (!pdfResp.ok) throw new Error(`下载 PDF 失败: HTTP ${pdfResp.status}`);
    const pdfBytes = new Uint8Array(await pdfResp.arrayBuffer());
    send(tabId, { type: 'rf-pdf-update', action: 'loading', text: '正在解析 PDF 内容…' });

    const doc = await getDocument({ data: pdfBytes }).promise;
    const totalPages = doc.numPages;
    let totalParagraphs = 0;

    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      send(tabId, {
        type: 'rf-pdf-update',
        action: 'loading',
        text: `正在解析第 ${pageNum}/${totalPages} 页…`,
        progress: `${pageNum} / ${totalPages}`,
      });
      const page = await doc.getPage(pageNum);
      const content = await page.getTextContent();
      const texts = (content.items as { str?: string }[])
        .map((it) => (it.str || '').trim())
        .join(' ')
        .split(/\n+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 30 && s.length < 4000);
      const filtered = texts.filter((t) => !/^[\d\s.\-]+$/.test(t));
      totalParagraphs += filtered.length;

      send(tabId, {
        type: 'rf-pdf-update',
        action: 'loading',
        text: `正在翻译第 ${pageNum}/${totalPages} 页 (${filtered.length} 段)…`,
        progress: `${pageNum} / ${totalPages}`,
      });

      if (filtered.length === 0) {
        send(tabId, { type: 'rf-pdf-update', action: 'page', pageNum, paragraphs: [] });
        continue;
      }

      try {
        const settings = await getSettings();
        if (!settings.apiKey) {
          send(tabId, { type: 'rf-pdf-update', action: 'error', text: '请先在扩展弹窗中设置 API Key' });
          return;
        }
        const { translations } = await translate({ texts: filtered, settings, context: null });
        const pageParagraphs = filtered.map((orig, i) => ({
          original: orig,
          translated: translations[i] ?? orig,
        }));
        send(tabId, { type: 'rf-pdf-update', action: 'page', pageNum, paragraphs: pageParagraphs });
      } catch (err) {
        send(tabId, {
          type: 'rf-pdf-update',
          action: 'error',
          text: `翻译第 ${pageNum} 页时出错: ${String(err)}`,
        });
        return;
      }
    }

    send(tabId, {
      type: 'rf-pdf-update',
      action: 'done',
      text: `✅ ${totalPages} 页，${totalParagraphs} 段`,
    });
  } catch (err) {
    logger.error('PDF handling failed', err);
    try {
      await chrome.scripting.executeScript({ target: { tabId }, func: injectPdfPanel });
      send(tabId, { type: 'rf-pdf-update', action: 'error', text: String(err) });
    } catch {
      /* ignore */
    }
  }
}

// Injected into the PDF page (ISOLATED world). Pure DOM, no eval.
function injectPdfPanel(): void {
  if (document.getElementById('rf-pdf-panel')) {
    document.getElementById('rf-pdf-panel')!.remove();
  }

  const panel = document.createElement('div');
  panel.id = 'rf-pdf-panel';
  panel.innerHTML = `
    <div style="position:fixed;top:0;right:0;width:420px;height:100vh;background:#fff;border-left:1px solid #e5e7eb;
      box-shadow:-4px 0 24px rgba(0,0,0,.12);z-index:2147483647;display:flex;flex-direction:column;
      font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;
        border-bottom:1px solid #e5e7eb;background:#f9fafb;flex-shrink:0;">
        <div>
          <div style="font-size:15px;font-weight:600;color:#1f2937;">📄 PDF 翻译</div>
          <div id="rf-pdf-status" style="font-size:12px;color:#6b7280;margin-top:2px;"></div>
        </div>
        <button id="rf-pdf-close"
          style="background:none;border:none;cursor:pointer;font-size:18px;color:#6b7280;padding:4px 8px;border-radius:4px;">✕</button>
      </div>
      <div id="rf-pdf-body" style="flex:1;overflow-y:auto;padding:16px;line-height:1.8;font-size:14px;color:#374151;">
        <div id="rf-pdf-loading" style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;color:#6b7280;">
          <div style="width:32px;height:32px;border:3px solid #e5e7eb;border-top:3px solid #2563eb;
            border-radius:50%;animation:rfspin .8s linear infinite;margin-bottom:12px;"></div>
          <span id="rf-pdf-loading-text">正在准备…</span>
          <span id="rf-pdf-progress" style="font-size:12px;color:#9ca3af;margin-top:8px;"></span>
        </div>
      </div>
    </div>`;
  document.body.appendChild(panel);

  const style = document.createElement('style');
  style.textContent = '@keyframes rfspin{to{transform:rotate(360deg)}}';
  document.head.appendChild(style);

  document.getElementById('rf-pdf-close')!.addEventListener('click', () => panel.remove());

  const escHtml = (s: string): string =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');

  chrome.runtime.onMessage.addListener((msg: unknown) => {
    const m = msg as PdfUpdate;
    if (m.type !== 'rf-pdf-update') return;
    const loadingText = document.getElementById('rf-pdf-loading-text');
    const progressEl = document.getElementById('rf-pdf-progress');
    const statusEl = document.getElementById('rf-pdf-status');
    const body = document.getElementById('rf-pdf-body');

    if (m.action === 'loading' || m.action === 'status') {
      if (loadingText) loadingText.textContent = m.text || '';
      if (progressEl && m.progress) progressEl.textContent = m.progress;
      if (m.action === 'status' && statusEl) statusEl.textContent = m.text || '';
    } else if (m.action === 'error') {
      if (body)
        body.innerHTML = `<div style="color:#ef4444;text-align:center;padding:24px;">❌ ${escHtml(m.text || '未知错误')}</div>`;
    } else if (m.action === 'page') {
      const loading = document.getElementById('rf-pdf-loading');
      if (loading) loading.remove();
      if (body) {
        let html = `<div style="font-size:11px;color:#9ca3af;letter-spacing:.05em;margin-bottom:8px;padding:4px 8px;background:#f3f4f6;border-radius:4px;display:inline-block;">第 ${m.pageNum} 页</div>`;
        for (const p of m.paragraphs || []) {
          html += `<div style="margin-bottom:16px;padding-bottom:16px;border-bottom:1px dashed #e5e7eb;">
            <div style="color:#6b7280;margin-bottom:8px;font-size:13px;line-height:1.6;">${escHtml(p.original)}</div>
            <div style="color:#1f2937;font-size:14px;line-height:1.75;">${escHtml(p.translated)}</div>
          </div>`;
        }
        body.insertAdjacentHTML('beforeend', html);
        body.scrollTop = body.scrollHeight;
      }
    } else if (m.action === 'done') {
      const loading = document.getElementById('rf-pdf-loading');
      if (loading) loading.remove();
      if (statusEl) statusEl.textContent = m.text || '';
    }
  });
}
