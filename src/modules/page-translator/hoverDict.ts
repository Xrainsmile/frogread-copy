// Hover dictionary — shows a tooltip with the English definition of the word
// under the cursor. Ported/adapted from the legacy content/hoverDict.ts.

import { escapeHtml } from '../utils/dom';

export interface HoverDictOptions {
  lookup: (word: string) => Promise<{ phonetic?: string; definition: string }>;
  isEnabled: () => boolean;
}

const TOOLTIP_ID = 'rf-hover-dict';

function getWordAtPoint(x: number, y: number): string {
  const doc = document as Document & {
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
  };
  let range: Range | null = null;
  if (doc.caretRangeFromPoint) {
    range = doc.caretRangeFromPoint(x, y);
  } else if (doc.caretPositionFromPoint) {
    const pos = doc.caretPositionFromPoint(x, y);
    if (pos) {
      range = document.createRange();
      range.setStart(pos.offsetNode, pos.offset);
      range.collapse(true);
    }
  }
  if (!range) return '';
  const node = range.startContainer;
  if (node.nodeType !== Node.TEXT_NODE) return '';
  const offset = range.startOffset;
  const text = node.textContent || '';
  const left = text.slice(0, offset).search(/[^\w'-]$/);
  const start = left === -1 ? 0 : left + 1;
  const right = text.slice(offset).search(/[^\w'-]/);
  const end = right === -1 ? text.length : offset + right;
  let word = text.slice(start, end).replace(/^'+|'+$/g, '');
  if (!/^[a-zA-Z][a-zA-Z'-]*$/.test(word)) return '';
  return word;
}

export function initHoverDict(options: HoverDictOptions): void {
  let lastWord = '';
  let tooltip: HTMLElement | null = null;
  let hideTimer: number | null = null;

  const ensureTooltip = (): HTMLElement => {
    if (!tooltip) {
      tooltip = document.createElement('div');
      tooltip.id = TOOLTIP_ID;
      document.documentElement.appendChild(tooltip);
    }
    return tooltip;
  };

  const showTooltip = (word: string, x: number, y: number) => {
    const tip = ensureTooltip();
    tip.innerHTML = `<div class="rf-hover-loading">查询中…</div>`;
    tip.style.display = 'block';
    positionTooltip(tip, x, y);
    options
      .lookup(word)
      .then((res) => {
        tip.innerHTML =
          `<div class="rf-hover-word">${escapeHtml(word)}` +
          (res.phonetic ? ` <span class="rf-hover-phon">/${escapeHtml(res.phonetic)}/</span>` : '') +
          `</div><div class="rf-hover-def">${escapeHtml(res.definition)}</div>`;
        positionTooltip(tip, x, y);
      })
      .catch((e) => {
        tip.innerHTML = `<div class="rf-hover-word">${escapeHtml(word)}</div><div class="rf-hover-def">${escapeHtml(String(e))}</div>`;
        positionTooltip(tip, x, y);
      });
  };

  const hideTooltip = () => {
    if (tooltip) tooltip.style.display = 'none';
    lastWord = '';
  };

  let moveTimer: number | null = null;
  document.addEventListener('mousemove', (e: MouseEvent) => {
    if (!options.isEnabled()) {
      hideTooltip();
      return;
    }
    const x = e.clientX;
    const y = e.clientY;
    if (moveTimer) clearTimeout(moveTimer);
    moveTimer = window.setTimeout(() => {
      const word = getWordAtPoint(x, y);
      if (!word) {
        hideTooltip();
        return;
      }
      if (word === lastWord) return;
      lastWord = word;
      if (hideTimer) clearTimeout(hideTimer);
      showTooltip(word, x, y);
    }, 350);
  });

  document.addEventListener('mouseout', (e) => {
    if (!e.relatedTarget) {
      if (hideTimer) clearTimeout(hideTimer);
      hideTimer = window.setTimeout(hideTooltip, 300);
    }
  });
  document.addEventListener('mousedown', hideTooltip);
}

function positionTooltip(tip: HTMLElement, x: number, y: number): void {
  const rect = tip.getBoundingClientRect();
  let left = x + 12;
  let top = y + 16;
  if (left + rect.width > window.innerWidth) left = x - rect.width - 12;
  if (top + rect.height > window.innerHeight) top = y - rect.height - 16;
  tip.style.left = `${Math.max(4, left)}px`;
  tip.style.top = `${Math.max(4, top)}px`;
}
