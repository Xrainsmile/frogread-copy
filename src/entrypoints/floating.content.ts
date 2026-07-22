// 悬浮按钮：仿 read-frog，在网页侧边常驻一个可拖拽的圆形按钮。
// 点击默认「翻译当前页面」（toggle），也可配置为「打开弹窗」。
// 通过 Shadow DOM 隔离宿主页 CSS；位置/锁定/隐藏规则由 config.floatingButton 控制。

import { defineContentScript } from 'wxt/utils/define-content-script';
import { getConfig, saveConfig, onConfigChanged } from '../modules/config/storage';
import type { AppConfig } from '../modules/config/types';
import { hostMatches } from '../modules/utils/hostMatch';

const BTN_SIZE = 44;

const STYLE = `
:host { all: initial; }
.rf-fab {
  position: fixed; z-index: 2147483647;
  width: ${BTN_SIZE}px; height: ${BTN_SIZE}px;
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  background: #707070; color: #fff; border: none;
  box-shadow: 0 6px 24px rgba(112,112,112,.45), 0 0 0 1px rgba(112,112,112,.25);
  cursor: grab; user-select: none; touch-action: none;
  transition: transform .12s ease, box-shadow .12s ease;
}
.rf-fab:hover { transform: scale(1.06); }
.rf-fab:active { cursor: grabbing; }
.rf-fab.rf-active {
  background: #16a34a;
  box-shadow: 0 6px 24px rgba(22,163,74,.5), 0 0 0 1px rgba(22,163,74,.25);
}
.rf-fab img { width: 24px; height: 24px; display: block; pointer-events: none; }
@media (prefers-color-scheme: dark) {
  .rf-fab { box-shadow: 0 6px 24px rgba(0,0,0,.5), 0 0 0 1px rgba(255,255,255,.12); }
}
`;

const ICON = `<img src="data:image/png;base64,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" alt="ReadFlow" />`;

let cfg: AppConfig | null = null;
let host: HTMLDivElement | null = null;
let btn: HTMLButtonElement | null = null;

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function isHostDisabled(): boolean {
  if (!cfg) return false;
  const hostName = window.location.hostname;
  return (cfg.floatingButton.disabledPatterns || []).some((p) => hostMatches(p, hostName));
}

function positionButton(): void {
  if (!btn || !cfg) return;
  const fb = cfg.floatingButton;
  const top = clamp(fb.position, 0.02, 0.98) * window.innerHeight - BTN_SIZE / 2;
  const left = fb.side === 'left' ? 8 : window.innerWidth - BTN_SIZE - 8;
  btn.style.top = `${top}px`;
  btn.style.left = `${left}px`;
}

function onActivate(): void {
  if (!cfg) return;
  if (cfg.floatingButton.clickAction === 'translate') {
    chrome.runtime.sendMessage({ type: 'toggle-page-translation' }).catch(() => {});
  } else {
    chrome.tabs
      .create({ url: chrome.runtime.getURL('popup.html'), active: true })
      .catch(() => {});
  }
}

function buildButton(): void {
  if (!cfg) return;
  if (!cfg.floatingButton.enabled || isHostDisabled()) {
    if (host) host.remove();
    host = null;
    btn = null;
    return;
  }
  if (!host) {
    host = document.createElement('div');
    host.style.cssText =
      'position:fixed;z-index:2147483647;top:0;left:0;width:0;height:0;pointer-events:none;';
    const root = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = STYLE;
    root.appendChild(style);
    btn = document.createElement('button');
    btn.className = 'rf-fab';
    btn.title = '翻译此页面';
    btn.innerHTML = ICON;
    btn.style.pointerEvents = 'auto';
    root.appendChild(btn);
    document.documentElement.appendChild(host);
    wireDrag();
    chrome.runtime.onMessage.addListener((msg: any) => {
      if (msg?.type === 'translation-status' && btn) {
        btn.classList.toggle('rf-active', !!msg.isTranslated);
      }
    });
  }
  positionButton();
}

function wireDrag(): void {
  if (!btn) return;
  let dragging = false;
  let moved = false;
  let startX = 0;
  let startY = 0;

  btn.addEventListener('pointerdown', (e) => {
    if (!cfg || cfg.floatingButton.locked) return;
    dragging = true;
    moved = false;
    startX = e.clientX;
    startY = e.clientY;
    btn!.setPointerCapture(e.pointerId);
  });

  btn.addEventListener('pointermove', (e) => {
    if (!dragging || !btn) return;
    if (Math.abs(e.clientX - startX) > 4 || Math.abs(e.clientY - startY) > 4) moved = true;
    const nx = clamp(e.clientX, BTN_SIZE / 2, window.innerWidth - BTN_SIZE / 2);
    const ny = clamp(e.clientY, BTN_SIZE / 2, window.innerHeight - BTN_SIZE / 2);
    btn.style.left = `${nx - BTN_SIZE / 2}px`;
    btn.style.top = `${ny - BTN_SIZE / 2}px`;
  });

  btn.addEventListener('pointerup', (e) => {
    if (!dragging || !btn || !cfg) return;
    dragging = false;
    try {
      btn.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    if (moved) {
      const nx = clamp(e.clientX, BTN_SIZE / 2, window.innerWidth - BTN_SIZE / 2);
      const ny = clamp(e.clientY, BTN_SIZE / 2, window.innerHeight - BTN_SIZE / 2);
      cfg.floatingButton.side = nx < window.innerWidth / 2 ? 'left' : 'right';
      cfg.floatingButton.position = clamp(ny / window.innerHeight, 0.02, 0.98);
      saveConfig(cfg).catch(() => {});
      positionButton();
    }
  });

  btn.addEventListener('click', (e) => {
    if (moved) {
      e.preventDefault();
      e.stopPropagation();
      moved = false;
      return;
    }
    onActivate();
  });
}

export default defineContentScript({
  matches: ['*://*/*'],
  runAt: 'document_idle',
  async main() {
    if (document.documentElement.dataset.rfFab) return;
    document.documentElement.dataset.rfFab = '1';
    cfg = await getConfig();
    buildButton();
    onConfigChanged((c) => {
      cfg = c;
      buildButton();
    });
    window.addEventListener('resize', () => positionButton());
  },
});
