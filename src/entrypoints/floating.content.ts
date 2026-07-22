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
.rf-fab svg { width: 24px; height: 24px; display: block; pointer-events: none; }
@media (prefers-color-scheme: dark) {
  .rf-fab { box-shadow: 0 6px 24px rgba(0,0,0,.5), 0 0 0 1px rgba(255,255,255,.12); }
}
`;

// Reuse the translation icon from the options sidebar (constants.tsx NAV_ITEMS).
const ICON = `<svg viewBox="0 0 1024 1024" fill="currentColor"><path d="M213.333333 682.666667v42.666666a85.333333 85.333333 0 0 0 78.933334 85.12L298.666667 810.666667h85.333333a42.666667 42.666667 0 0 1 0 85.333333H298.666667a170.666667 170.666667 0 0 1-170.666667-170.666667v-42.666666a42.666667 42.666667 0 0 1 85.333333 0z m560.042667-242.602667l170.666667 426.666667a21.333333 21.333333 0 0 1-19.84 29.269333h-45.994667a21.333333 21.333333 0 0 1-19.797333-13.397333L812.544 768h-174.506667l-45.781333 114.602667a21.333333 21.333333 0 0 1-19.84 13.397333H526.506667a21.333333 21.333333 0 0 1-19.797334-29.269333l170.666667-426.666667a21.333333 21.333333 0 0 1 19.797333-13.397333h56.405334a21.333333 21.333333 0 0 1 19.84 13.397333zM725.333333 549.76L672.128 682.666667h106.325333L725.333333 549.76zM341.333333 106.666667V170.666667h149.333334a21.333333 21.333333 0 0 1 21.333333 21.333333v256a21.333333 21.333333 0 0 1-21.333333 21.333333H341.333333v106.666667a21.333333 21.333333 0 0 1-21.333333 21.333333h-42.666667a21.333333 21.333333 0 0 1-21.333333-21.333333V469.333333H106.666667a21.333333 21.333333 0 0 1-21.333334-21.333333v-256a21.333333 21.333333 0 0 1 21.333334-21.333333H256V106.666667a21.333333 21.333333 0 0 1 21.333333-21.333334h42.666667a21.333333 21.333333 0 0 1 21.333333 21.333334z m384 21.333333a170.666667 170.666667 0 0 1 170.666667 170.666667v42.666666a42.666667 42.666667 0 0 1-85.333333 0V298.666667a85.333333 85.333333 0 0 0-85.333334-85.333334h-85.333333a42.666667 42.666667 0 0 1 0-85.333333h85.333333zM256 256H170.666667v128h85.333333V256z m170.666667 0H341.333333v128h85.333334V256z"/></svg>`;

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
