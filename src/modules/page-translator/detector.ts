// Paragraph detection — ported from the legacy content/detector.ts.

const MIN_PARAGRAPH_LENGTH = 40;
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
];

function isParagraphElement(el: Element): boolean {
  if (EXCLUDE_SELECTORS.some((sel) => el.matches(sel))) return false;
  if (el.closest(EXCLUDE_SELECTORS.join(','))) return false;

  const text = sanitizeText(el);
  if (text.length < MIN_PARAGRAPH_LENGTH || text.length > MAX_PARAGRAPH_LENGTH) return false;

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
  return words >= 10;
}

function getMainContent(): Element[] {
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
    ps = Array.from(container.querySelectorAll('*')).filter(isParagraphElement);
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

export function detectParagraphs(): Element[] {
  return getMainContent();
}
