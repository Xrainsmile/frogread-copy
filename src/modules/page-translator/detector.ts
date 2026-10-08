// Paragraph detection — ported from the legacy content/detector.ts.

/** Detection thresholds, overridable per-call (page translation wires the
 *  user's translate.page.minWordsPerNode config through here). */
export interface DetectOptions {
  /** Min sanitized-text length. Default 2 (short UI labels allowed). */
  minChars?: number;
  /** Min word count for non-CJK text. Default 1 — the old hardcoded 10
   *  silently dropped all short UI labels on app-style pages. */
  minWords?: number;
}

const DEFAULT_MIN_CHARS = 2;
const DEFAULT_MIN_WORDS = 1;
const MAX_PARAGRAPH_LENGTH = 4000;

const INLINE_TAGS = new Set([
  'A', 'B', 'I', 'EM', 'STRONG', 'SPAN', 'CODE', 'SUB', 'SUP', 'MARK', 'U',
  'SMALL', 'TIME', 'RUBY', 'BDO', 'ABBR', 'CITE', 'Q', 'DEL', 'INS', 'KBD', 'SAMP', 'VAR',
]);

function isInlineElement(el: Element): boolean {
  return INLINE_TAGS.has(el.tagName);
}

export function sanitizeText(node: Node | null): string {
  if (!node) return '';
  let text = node.textContent ?? '';
  // Unified Ideographs zero-width / non-breaking space cleanup
  text = text.replace(/​/g, '');
  text = text.replace(/ /g, ' ');
  text = text.replace(/\s+/g, ' ').trim();
  return text;
}

const EXCLUDE_SELECTORS = [
  'script', 'style', 'noscript', 'svg', 'path', 'button', 'input', 'textarea',
  'select', 'option', 'code', 'pre', 'template', '[role="navigation"]',
  '[role="banner"]', '[role="contentinfo"]', 'nav', 'header', 'footer', 'aside',
  '.sidebar', '#sidebar', '.comment', '.comments', '.ad', '.ads', '.advertisement',
  '.social', '.share', '.menu', '.header', '.footer', '.nav', '.breadcrumb',
  '.pagination', '.related', 'form', 'label', 'figure', '.caption', 'figcaption',
  // Exclude ReadFlow's own injected elements (wrapper / translation / loader /
  // retry / error) so translated text isn't re-detected as a new paragraph,
  // which would cause an infinite translation loop.
  '.rf-wrapper', '.rf-translation', '.rf-loader', '.rf-error-mark', '.rf-retry-btn',
];

function isParagraphElement(el: Element, opts: Required<DetectOptions>): boolean {
  if (EXCLUDE_SELECTORS.some((sel) => el.matches(sel))) return false;
  if (el.closest(EXCLUDE_SELECTORS.join(','))) return false;

  const text = sanitizeText(el);
  if (text.length < opts.minChars || text.length > MAX_PARAGRAPH_LENGTH) return false;
  // Must contain at least one letter — skips pure-symbol/number junk (↻, ★, 2024).
  if (!/\p{L}/u.test(text)) return false;

  const hasInline =
    Array.from(el.childNodes).some(
      (n) => n.nodeType === Node.TEXT_NODE && sanitizeText(n).length > 0,
    ) || Array.from(el.children).some((c) => isInlineElement(c));
  if (!hasInline) return false;

  const p = el.querySelector('p, li, blockquote, td, h1, h2, h3, h4, h5, h6, div');
  if (p) return false;

  const cjk = (text.match(/[一-鿿]/g) || []).length;
  const total = text.replace(/\s/g, '').length;
  if (total > 0 && cjk / total > 0.7) return true;

  const words = text.split(/\s+/).length;
  return words >= opts.minWords;
}

/** Recursively collect all elements under root, descending into open shadow
 *  roots. querySelectorAll('*') cannot pierce Shadow DOM, which web-component
 *  apps (e.g. Moody's Orbis) use for whole panels — without this the detector
 *  is blind to them entirely. */
function collectDeep(root: ParentNode, out: Element[]): void {
  const all = root.querySelectorAll('*');
  for (const el of Array.from(all)) {
    out.push(el);
    if (el.shadowRoot) collectDeep(el.shadowRoot, out);
  }
}

function getMainContent(opts: Required<DetectOptions>): Element[] {
  const candidates = [
    document.querySelector('main'),
    document.querySelector('article'),
    document.querySelector('.content'),
    document.querySelector('#content'),
    document.querySelector('.post-content'),
    document.querySelector('.article'),
    document.querySelector('[role="main"]'),
  ].filter(Boolean) as Element[];

  let ps: Element[] = [];
  for (const container of [candidates[0], document.body]) {
    if (!container) continue;
    const all: Element[] = [];
    collectDeep(container, all);
    ps = all.filter((el) => isParagraphElement(el, opts));
    if (ps.length >= 3 || container === document.body) break;
  }

  // Collect X (Twitter) tweet texts regardless of length — they are often
  // shorter than MIN_PARAGRAPH_LENGTH but should always be translated.
  const tweets = Array.from(document.querySelectorAll('[data-testid="tweetText"]'));
  if (tweets.length) {
    const seen = new Set<Element>(ps);
    for (const t of tweets) {
      if (!seen.has(t) && sanitizeText(t).length > 0) {
        ps.push(t);
        seen.add(t);
      }
    }
  }

  return ps;
}

export function detectParagraphs(opts?: DetectOptions): Element[] {
  return getMainContent({
    minChars: opts?.minChars ?? DEFAULT_MIN_CHARS,
    minWords: opts?.minWords ?? DEFAULT_MIN_WORDS,
  });
}
