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
  background: #2563eb; color: #fff; border: none;
  box-shadow: 0 6px 24px rgba(37,99,235,.45), 0 0 0 1px rgba(37,99,235,.25);
  cursor: grab; user-select: none; touch-action: none;
  transition: transform .12s ease, box-shadow .12s ease;
}
.rf-fab:hover { transform: scale(1.06); }
.rf-fab:active { cursor: grabbing; }
.rf-fab.rf-active {
  background: #16a34a;
  box-shadow: 0 6px 24px rgba(22,163,74,.5), 0 0 0 1px rgba(22,163,74,.25);
}
.rf-fab svg { width: 24px; height: 24px; display: block; }
@media (prefers-color-scheme: dark) {
  .rf-fab { box-shadow: 0 6px 24px rgba(0,0,0,.5), 0 0 0 1px rgba(255,255,255,.12); }
}
`;

const ICON = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19.7 8.1q-1.1-1.7-2.95-2.55-..37-.53-.55-.53t-.05-.74.52-.57.77 0q2.42 1.07 3.88 3.27T21 12t-1.46 4.92-3.88 3.27q-.4.18-.77 0t-.52-.58q-.13-.37.05-.74t.55-.53q1.85-.85 2.95-2.56t1.1-3.79q0-2.04-1.1-3.78M7 15H4q-.42 0-.71-.29T3 14v-4q0-.42.29-.71T4 9h3l3.3-3.3q.47-.47 1.09-.21t.61.94v11.14q0 .67-.61.94t-1.09-.21zm9.5-3q0 1.02-.44 1.94t-1.21 1.54q-.28.2-.56.09t-.28-.55V8.85q0-.35.28-.46t.56.09q.77.62 1.21 1.55T16.5 12M2 7q-.42 0-.71-.29T1 6V3q0-.83.59-1.42T3 1h3q.42 0 .71.29T7 2t-.29.71T6 3H3v3q0 .42-.29.71T2 7m16 16q-.42 0-.71-.29T17 22t.29-.71T18 21h3v-3q0-.42.29-.71T22 17t.71.29T23 18v3q0 .83-.59 1.42T21 23z"/></svg>`;

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
