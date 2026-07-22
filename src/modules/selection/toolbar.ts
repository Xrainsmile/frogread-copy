// 划词工具条 / 气泡：翻译 · 解释 · 词典 · 朗读 · 自定义指令
// 交互参考 read-frog：选区上方浮出工具条，结果以气泡就近呈现，带 loading 转圈。
// 关键修复：点击按钮时不再实时读取选区（选区会被折叠导致取到空串直接 return），
// 而是使用 mouseup 时拍下的「文本快照」，彻底解决「划词点了翻译没反应」。

import type { AppConfig } from '../config/types';
import { getConfig, onConfigChanged } from '../config/storage';
import type { ContentToBackground, BackgroundToContent } from '../messaging';
import { speak, stopSpeaking } from '../tts/tts';
import { hostMatches } from '../utils/hostMatch';

const PREFIX = 'rf';
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const genId = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

// 图标：内联 SVG（文本节点，非 external 资源），不受任何页面 CSP 拦截，
// 且用 currentColor 跟随主题（深/浅色）自动变色。
// 注意：svg 必须带 class="rf-tb-icon" 才能被 CSS 控制尺寸。
const ICON = {
  explain: '<svg class="rf-tb-icon" xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="-2 -2 28 28"><path d="M-2 -2h28v28H-2z" fill="none" /><g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"><path d="M15 4H7m11 12l3 3l-3 3" /><path d="M3 4v13a2 2 0 0 0 2 2h16M7 14h7M7 9h12" /></g></svg>',
  dict: '<svg class="rf-tb-icon" xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 32 32"><path d="M0 0h32v32H0z" fill="none" /><path fill="currentColor" d="M22 8h-8v2h8zm-8 8h8v-2h-8zm-4-2H8v-4h2V8H8V4h18v12h2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v4H4v2h2v4H4v2h6zm-6 6H1v10h3c1.654 0 3-1.346 3-3v-4c0-1.654-1.346-3-3-3m1 7a1 1 0 0 1-1 1H3v-6h1a1 1 0 0 1 1 1zm12-5v6c0 1.103.898 2 2 2h4v-2h-4v-6h4v-2h-4c-1.102 0-2 .898-2 2m-8 0h2v6H9v2h6v-2h-2v-6h2v-2H9zm16-2v2h2v8h2v-8h2v-2z" /></svg>',
  translate: '<svg class="rf-tb-icon" xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24"><path d="M0 0h24v24H0z" fill="none" /><path fill="currentColor" d="m19.713 8.128l-.246.566a.506.506 0 0 1-.934 0l-.246-.566a4.36 4.36 0 0 0-2.22-2.25l-.759-.339a.53.53 0 0 1 0-.963l.717-.319a4.37 4.37 0 0 0 2.251-2.326l.253-.611a.506.506 0 0 1 .942 0l.253.61a4.37 4.37 0 0 0 2.25 2.327l.718.32a.53.53 0 0 1 0 .962l-.76.338a4.36 4.36 0 0 0-2.219 2.251M5 17v-2H3v2a4 4 0 0 0 4 4h3v-2H7l-.15-.006A2 2 0 0 1 5 17m17.4 4L18 10h-2l-4.399 11h2.154l1.199-3h4.09l1.201 3zm-6.647-5L17 12.885L18.245 16zM8 4V2H6v2H2v7h4v3h2v-3h4V4zM4 6h2v3H4zm4 0h2v3H8z" /></svg>',
  read: '<svg class="rf-tb-icon" xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24"><path d="M0 0h24v24H0z" fill="none" /><path fill="currentColor" d="M17.9 8.188q-1.1-1.713-2.95-2.563q-.375-.175-.55-.537t-.05-.738q.15-.4.525-.575t.775 0q2.425 1.075 3.888 3.275T21 11.975T19.537 16.9t-3.887 3.275q-.4.175-.775 0t-.525-.575q-.125-.375.05-.737t.55-.538q1.85-.85 2.95-2.562t1.1-3.788t-1.1-3.787M7 15H4q-.425 0-.712-.288T3 14v-4q0-.425.288-.712T4 9h3l3.3-3.3q.475-.475 1.088-.213t.612.938v11.15q0 .675-.612.938T10.3 18.3zm9.5-3q0 1.025-.437 1.938t-1.213 1.537q-.275.2-.562.088T14 15.1V8.85q0-.35.288-.462t.562.087q.775.625 1.213 1.55T16.5 12M2 7q-.425 0-.712-.288T1 6V3q0-.825.588-1.412T3 1h3q.425 0 .713.288T7 2t-.288.713T6 3H3v3q0 .425-.288.713T2 7m16 16q-.425 0-.712-.288T17 22t.288-.712T18 21h3v-3q0-.425.288-.712T22 17t.713.288T23 18v3q0 .825-.587 1.413T21 23z" /></svg>',
};

let config: AppConfig | null = null;
let toolbar: HTMLDivElement | null = null;
let bubble: HTMLDivElement | null = null;

// 选区快照（点击动作时使用，不依赖实时选区）
let currentText = '';
let currentRect: DOMRect | null = null;
// 正在与工具条交互（点按钮），避免选区折叠触发 selectionchange 把工具条藏掉
let isInteracting = false;
// 当前请求 id（匹配 background 回包）
let currentId = '';
let currentTaskTitle = '';
// 响应超时兜底（F-06）：划词请求 fire-and-forget，结果经独立 onMessage 回包；
// 若 background SW 休眠/死亡，结果永不回 → spinner 永转。超时后显示错误。
let responseTimer: number | null = null;
const RESPONSE_TIMEOUT_MS = 30000;

// ── 样式注入（自包含，灰白底 + 深色字） ──
const STYLE = `
.${PREFIX}-selection-toolbar {
  position: fixed; z-index: 2147483647; display: none; pointer-events: auto;
  align-items: center; gap: 2px; padding: 4px;
  background: #ffffff; color: #1f2328;
  border: 1px solid rgba(0,0,0,0.08); border-radius: 6px;
  box-shadow: 0 8px 40px rgba(0,0,0,0.08), 0 0 1px rgba(0,0,0,0.08);
  font: 13px/1.2 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif;
  user-select: none; -webkit-user-select: none;
}
.${PREFIX}-selection-toolbar * { box-sizing: border-box; }
.${PREFIX}-tb-btn {
  height: 28px; border: 0; background: transparent; color: #1f2328; cursor: pointer;
  padding: 0 10px; border-radius: 6px; font: inherit; white-space: nowrap;
  display: inline-flex; align-items: center; gap: 6px;
}
.${PREFIX}-tb-btn:hover { background: rgba(0,0,0,0.05); }
.${PREFIX}-tb-btn:active { background: rgba(0,0,0,0.08); }
.${PREFIX}-tb-icon {
  width: 18px; height: 18px; flex-shrink: 0;
  display: inline-block; vertical-align: middle;
}
.${PREFIX}-tb-ico {
  width: 28px; padding: 0; justify-content: center;
}
.${PREFIX}-tb-btn.rf-tb-reading { color: #2563eb; background: rgba(37,99,235,0.10); }
.${PREFIX}-tb-sep { width: 1px; height: 18px; background: rgba(0,0,0,0.12); margin: 0 3px; }
.${PREFIX}-tb-custom { display: inline-flex; align-items: center; gap: 2px; }

.${PREFIX}-selection-bubble {
  position: fixed; z-index: 2147483647; display: none; pointer-events: auto;
  max-width: 380px; min-width: 160px; max-height: 52vh; overflow: auto;
  background: #ffffff; color: #1f2328;
  border: 1px solid rgba(0,0,0,0.08); border-radius: 8px;
  box-shadow: 0 8px 40px rgba(0,0,0,0.08), 0 0 1px rgba(0,0,0,0.08);
  font: 13px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif;
  padding: 0;
}
.${PREFIX}-bubble-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 7px 10px; border-bottom: 1px solid rgba(0,0,0,0.07);
  position: sticky; top: 0; background: #f7f8fa;
}
.${PREFIX}-bubble-title { font-weight: 600; color: #2563eb; }
.${PREFIX}-bubble-close {
  border: 0; background: transparent; cursor: pointer; color: #888;
  font-size: 16px; line-height: 1; padding: 0 4px; border-radius: 6px;
}
.${PREFIX}-bubble-close:hover { background: rgba(0,0,0,0.06); color: #333; }
.${PREFIX}-bubble-body { padding: 10px 12px; white-space: pre-wrap; word-break: break-word; }
.${PREFIX}-result { white-space: pre-wrap; }
.${PREFIX}-err { color: #d23f3f; }
.${PREFIX}-dict-phon { color: #666; font-style: italic; margin-bottom: 6px; }
.${PREFIX}-dict-def { white-space: pre-wrap; }

.${PREFIX}-spinner {
  width: 16px; height: 16px; margin: 6px auto;
  border: 2px solid rgba(37,99,235,0.25); border-top-color: #2563eb;
  border-radius: 50%; animation: ${PREFIX}-spin 0.7s linear infinite;
}
@keyframes ${PREFIX}-spin { to { transform: rotate(360deg); } }

@media (prefers-color-scheme: dark) {
  .${PREFIX}-selection-toolbar, .${PREFIX}-selection-bubble, .${PREFIX}-bubble-head {
    background: #2a2d33; color: #e6e6e6; border-color: rgba(255,255,255,0.10);
    box-shadow: 0 8px 40px rgba(0,0,0,0.28), 0 0 1px rgba(0,0,0,0.28);
  }
  .${PREFIX}-tb-btn { color: #e6e6e6; }
  .${PREFIX}-tb-btn:hover { background: rgba(255,255,255,0.06); }
  .${PREFIX}-tb-btn:active { background: rgba(255,255,255,0.10); }
  .${PREFIX}-tb-sep { background: rgba(255,255,255,0.16); }
  .${PREFIX}-bubble-head { border-color: rgba(255,255,255,0.12); background: #2a2d33; }
}
`;

// 整个浮层（工具条 + 气泡）渲染进 Shadow DOM，自家样式也写在 shadow 内，
// 宿主页 CSS 完全碰不到（参照 read-frog 的 react-shadow-host 隔离方案）。
// 这样无需任何 !important 防御，内联 SVG 也绝不会被宿主页 svg{} 规则重置。
let shadowHost: HTMLDivElement | null = null;
let shadowRoot: ShadowRoot | null = null;

function ensureShadow(): ShadowRoot {
  if (shadowRoot) return shadowRoot;
  shadowHost = document.createElement('div');
  shadowHost.className = `${PREFIX}-shadow-host`;
  shadowHost.style.cssText =
    'position:relative;z-index:2147483647;width:0;height:0;overflow:visible;pointer-events:none;';
  shadowRoot = shadowHost.attachShadow({ mode: 'open' });
  document.documentElement.appendChild(shadowHost);
  return shadowRoot;
}

function injectStyle(): void {
  const root = ensureShadow();
  if (root.getElementById(`${PREFIX}-selection-style`)) return;
  const s = document.createElement('style');
  s.id = `${PREFIX}-selection-style`;
  s.textContent = STYLE;
  root.appendChild(s);
}

// ── 选区辅助 ──
function getSelectedText(): string {
  const sel = window.getSelection();
  return sel ? sel.toString() : '';
}
function getSelectionRect(): DOMRect | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const r = sel.getRangeAt(0).getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return null;
  return r;
}
function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  );
}

// ── 工具条 ──
function ensureToolbar(): HTMLDivElement {
  if (toolbar) return toolbar;
  const el = document.createElement('div');
  el.className = `${PREFIX}-selection-toolbar`;
  el.style.display = 'none';
  el.innerHTML = `
    <button class="rf-tb-btn rf-tb-ico" data-act="translate" title="翻译">${ICON.translate}</button>
    <button class="rf-tb-btn rf-tb-ico" data-act="explain" title="总结">${ICON.explain}</button>
    <button class="rf-tb-btn rf-tb-ico" data-act="dict" title="词典">${ICON.dict}</button>
    <button class="rf-tb-btn rf-tb-ico" data-act="read" title="朗读">${ICON.read}</button>
    <span class="rf-tb-sep"></span>
    <span class="rf-tb-custom"></span>`;
  // 点按钮时按住选区，并标记「正在交互」避免 selectionchange 误藏工具条。
  // 仅处理左键——右键应交给浏览器上下文菜单，不能 preventDefault（否则右键失效）。
  el.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    isInteracting = true;
    // 兜底复位，防止点击未触发时永久卡死
    window.setTimeout(() => { isInteracting = false; }, 600);
  });
  el.addEventListener('click', onClick);
  ensureShadow().appendChild(el);
  toolbar = el;
  rebuildCustomButtons();
  return el;
}

function rebuildCustomButtons(): void {
  if (!toolbar) return;
  const host = toolbar.querySelector('.rf-tb-custom') as HTMLSpanElement | null;
  if (!host) return;
  const actions = (config?.customActions ?? []).filter((a) => a.enabled);
  host.innerHTML = actions
    .map((a) => `<button class="rf-tb-btn" data-act="custom" data-id="${escapeHtml(a.id)}">${escapeHtml(a.icon || '⚡')} ${escapeHtml(a.name)}</button>`)
    .join('');
}

function showToolbar(rect?: DOMRect): void {
  const tb = ensureToolbar();
  tb.style.display = 'flex';
  // 无选区矩形（程序化触发，如右键菜单）→ 置于视口顶部居中
  const r = rect ?? getSelectionRect();
  if (!r) {
    const tw = tb.offsetWidth;
    tb.style.left = `${Math.max(8, window.innerWidth / 2 - tw / 2)}px`;
    tb.style.top = '80px';
    return;
  }
  const tw = tb.offsetWidth;
  const th = tb.offsetHeight;
  let left = r.left + r.width / 2 - tw / 2;
  let top = r.top - th - 8;
  if (top < 8) top = r.bottom + 8; // 上方放不下则翻到下方
  left = clamp(left, 8, window.innerWidth - tw - 8);
  tb.style.left = `${left}px`;
  tb.style.top = `${top}px`;
}

function hideToolbar(): void {
  if (toolbar) toolbar.style.display = 'none';
}

// ── 气泡 ──
function ensureBubble(): HTMLDivElement {
  if (bubble) return bubble;
  const el = document.createElement('div');
  el.className = `${PREFIX}-selection-bubble`;
  el.innerHTML = `
    <div class="${PREFIX}-bubble-head">
      <span class="${PREFIX}-bubble-title"></span>
      <button class="${PREFIX}-bubble-close" aria-label="关闭">×</button>
    </div>
    <div class="${PREFIX}-bubble-body"></div>`;
  el.querySelector('.rf-bubble-close')?.addEventListener('mousedown', (e) => {
    e.preventDefault();
    hideBubble();
  });
  ensureShadow().appendChild(el);
  bubble = el;
  return el;
}

function renderBubble(title: string, bodyHtml: string): void {
  const b = ensureBubble();
  (b.querySelector('.rf-bubble-title') as HTMLElement).textContent = title;
  (b.querySelector('.rf-bubble-body') as HTMLElement).innerHTML = bodyHtml;
  b.style.display = 'block';
  if (currentRect) {
    const bw = b.offsetWidth;
    const bh = b.offsetHeight;
    let left = currentRect.left;
    let top = currentRect.bottom + 8;
    if (top + bh > window.innerHeight - 8) top = currentRect.top - bh - 8;
    left = clamp(left, 8, window.innerWidth - bw - 8);
    b.style.left = `${left}px`;
    b.style.top = `${top}px`;
  }
}

function hideBubble(): void {
  if (bubble) {
    bubble.remove();
    bubble = null;
  }
}

// ── 动作 ──
function armResponseTimeout(): void {
  clearResponseTimeout();
  responseTimer = window.setTimeout(() => {
    responseTimer = null;
    renderBubble(currentTaskTitle || '结果', '<div class="rf-err">请求超时：扩展后台无响应，请重试</div>');
  }, RESPONSE_TIMEOUT_MS);
}
function clearResponseTimeout(): void {
  if (responseTimer !== null) {
    clearTimeout(responseTimer);
    responseTimer = null;
  }
}

function doRequest(task: 'translate' | 'explain'): void {
  if (!currentText) return;
  currentTaskTitle = task === 'translate' ? '翻译' : '解释';
  currentId = genId();
  renderBubble(currentTaskTitle, '<div class="rf-spinner"></div>');
  const msg: ContentToBackground = {
    type: 'selection-translate',
    id: currentId,
    text: currentText,
    task,
  };
  chrome.runtime.sendMessage(msg).catch(() => {});
  armResponseTimeout();
}

function doLookup(): void {
  if (!currentText) return;
  currentTaskTitle = '词典';
  renderBubble('词典', '<div class="rf-spinner"></div>');
  const msg: ContentToBackground = { type: 'lookup', word: currentText };
  chrome.runtime.sendMessage(msg).catch(() => {});
  armResponseTimeout();
}

function doRead(): void {
  if (!currentText) return;
  // 朗读（文本转语音）开关关闭时不朗读
  if (config && config.tts.enabled === false) return;
  const synth = window.speechSynthesis;
  const btn = toolbar?.querySelector('[data-act="read"]') as HTMLButtonElement | null;
  const setReading = (on: boolean) => btn?.classList.toggle('rf-tb-reading', on);
  if (synth.speaking || synth.pending) {
    stopSpeaking();
    setReading(false);
    return;
  }
  if (config?.tts.enabled) {
    speak(currentText, config.tts, config);
  } else {
    const u = new SpeechSynthesisUtterance(currentText);
    u.lang = document.documentElement.lang || navigator.language || 'en-US';
    u.onend = () => setReading(false);
    u.onerror = () => setReading(false);
    synth.speak(u);
  }
  setReading(true);
}

// 跟随设置显隐「朗读」按钮（文本转语音关闭时隐藏）
function syncTtsButton(): void {
  const btn = toolbar?.querySelector('[data-act="read"]') as HTMLButtonElement | null;
  if (!btn) return;
  const enabled = !config || config.tts.enabled;
  btn.style.display = enabled ? '' : 'none';
}

function doCopy(): void {
  if (!currentText) return;
  navigator.clipboard?.writeText(currentText).catch(() => {});
}

function runCustom(actionId: string): void {
  if (!currentText) return;
  const act = (config?.customActions ?? []).find((a) => a.id === actionId && a.enabled);
  if (!act) return;
  currentTaskTitle = act.name;
  currentId = genId();
  renderBubble(act.name, '<div class="rf-spinner"></div>');
  const msg: ContentToBackground = {
    type: 'custom-action',
    id: currentId,
    text: currentText,
    actionId: act.id,
  };
  chrome.runtime.sendMessage(msg).catch(() => {});
  armResponseTimeout();
}

function onClick(e: MouseEvent): void {
  const btn = (e.target as HTMLElement).closest('button');
  if (!btn) return;
  const act = btn.getAttribute('data-act');
  if (act === 'translate') doRequest('translate');
  else if (act === 'explain') doRequest('explain');
  else if (act === 'dict') doLookup();
  else if (act === 'read') doRead();
  else if (act === 'custom') runCustom(btn.getAttribute('data-id') || '');
  isInteracting = false;
}

/** 当前站点是否命中「选区工具条」隐藏规则。 */
function isHostDisabled(): boolean {
  if (!config) return false;
  const host = window.location.hostname;
  return (config.selection.disabledPatterns || []).some((p) => hostMatches(p, host));
}

/** 由外部触发（如右键菜单）驱动工具条动作，并以气泡呈现结果。 */
export async function runContextAction(
  text: string,
  action: 'translate' | 'read' | 'custom',
  actionId?: string,
): Promise<void> {
  if (!text || !text.trim()) return;
  if (!toolbar) ensureToolbar();
  currentText = text.trim();
  syncTtsButton();
  showToolbar();
  if (action === 'read') {
    doRead();
  } else if (action === 'translate') {
    doRequest('translate');
  } else if (action === 'custom' && actionId) {
    runCustom(actionId);
  }
}

// ── 事件 ──
function handleMouseUp(e: MouseEvent): void {
  // 右键交给浏览器上下文菜单，不在此触发工具条（仿 read-frog）。
  if (e.button === 2) return;
  // 注意：事件从 Shadow DOM 冒泡到 document 时 e.target 会被 retarget 成 shadow host，
  // 所以不能用 toolbar.contains(e.target)。改用 composedPath() 保留完整路径判断。
  if (toolbar && e.composedPath().includes(toolbar)) return; // 点工具条本身不处理
  if (isInteracting) { isInteracting = false; return; }
  // 选区工具条总开关 / 按站点禁用
  if (config && config.selection.enabled === false) return;
  if (config && isHostDisabled()) return;
  // 延迟到鼠标松开后读取，确保选区已稳定
  window.setTimeout(() => {
    const text = getSelectedText();
    if (!text || text.trim().length < 1) {
      hideToolbar();
      hideBubble();
      currentText = '';
      return;
    }
    const rect = getSelectionRect();
    if (!rect) return;
    currentText = text.trim();
    currentRect = rect;
    showToolbar(rect);
    hideBubble();
  }, 0);
}

function onSelectionChange(): void {
  if (isInteracting) return;
  const text = getSelectedText();
  if (!text || text.trim().length < 1) {
    hideToolbar();
    hideBubble();
    currentText = '';
    currentRect = null;
    return;
  }
  // 实时刷新快照；若工具条已显示（用户在微调选区），则跟随重定位
  currentText = text.trim();
  const rect = getSelectionRect();
  if (rect) {
    currentRect = rect;
    if (toolbar && toolbar.style.display !== 'none') showToolbar(rect);
  }
}

function onDocMouseDown(e: MouseEvent): void {
  // 右键交给浏览器上下文菜单，不隐藏工具条/气泡（仿 read-frog）。
  if (e.button === 2) return;
  // composedPath 不受 Shadow DOM retargeting 影响，能正确识别点击是否落在我们的浮层内
  const path = e.composedPath();
  if (toolbar && path.includes(toolbar)) return;
  if (bubble && path.includes(bubble)) return;
  hideToolbar();
  hideBubble();
}

function onScroll(): void {
  hideToolbar();
  hideBubble();
}

function onMessage(msg: BackgroundToContent): void {
  if (msg.type === 'selection-result' && msg.id === currentId) {
    clearResponseTimeout();
    if (msg.error) renderBubble(currentTaskTitle || '结果', `<div class="rf-err">${escapeHtml(msg.error)}</div>`);
    else renderBubble(currentTaskTitle || '结果', `<div class="rf-result">${escapeHtml(msg.result ?? '')}</div>`);
  } else if (msg.type === 'lookup-result' && msg.word === currentText) {
    clearResponseTimeout();
    if (msg.error) renderBubble('词典', `<div class="rf-err">${escapeHtml(msg.error)}</div>`);
    else {
      const phon = msg.phonetic ? `<div class="rf-dict-phon">${escapeHtml(msg.phonetic)}</div>` : '';
      renderBubble('词典', `<div class="rf-dict">${phon}<div class="rf-dict-def">${escapeHtml(msg.definition || '')}</div></div>`);
    }
  }
}

export async function initSelectionToolbar(): Promise<void> {
  injectStyle();
  ensureToolbar();
  try {
    config = await getConfig();
  } catch {
    config = null;
  }
  onConfigChanged((c) => {
    config = c;
    rebuildCustomButtons();
    syncTtsButton();
  });
  syncTtsButton();

  document.addEventListener('mouseup', handleMouseUp, true);
  document.addEventListener('selectionchange', onSelectionChange);
  document.addEventListener('mousedown', onDocMouseDown, true);
  window.addEventListener('scroll', onScroll, true);
  window.addEventListener('resize', () => { hideToolbar(); hideBubble(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { hideToolbar(); hideBubble(); }
  });
  chrome.runtime.onMessage.addListener(onMessage);
}
