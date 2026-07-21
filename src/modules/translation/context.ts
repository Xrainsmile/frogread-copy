// Page-context extraction for context-aware translation.
// Mirrors read-frog's idea of feeding the page title / headings / glossary into
// the translation prompt so terms stay consistent across a page.

export interface PageContext {
  title: string;
  url: string;
  description?: string;
  headings: string[];
  /** Optional user glossary (term -> translation), read from extension storage. */
  glossary?: string;
}

/** Synchronous extraction of DOM-derived context. */
export function extractPageContext(): Omit<PageContext, 'glossary'> {
  const title = document.title?.trim() ?? '';
  const url = location.href;

  let description = '';
  const metaDesc = document.querySelector('meta[name="description"]') as HTMLMetaElement | null;
  if (metaDesc?.content) description = metaDesc.content.trim();
  const ogDesc = document.querySelector('meta[property="og:description"]') as HTMLMetaElement | null;
  if (!description && ogDesc?.content) description = ogDesc.content.trim();

  const headings: string[] = [];
  for (const sel of ['h1', 'h2', '.title', '#title', '[data-title]']) {
    for (const el of Array.from(document.querySelectorAll(sel))) {
      const t = (el.textContent ?? '').trim();
      if (t && t.length > 1 && t.length < 80) headings.push(t);
      if (headings.length >= 8) break;
    }
    if (headings.length >= 8) break;
  }

  return { title, url, description, headings };
}

/** Async variant that also attaches the user glossary from extension storage. */
export async function getPageContext(): Promise<PageContext> {
  const base = extractPageContext();
  let glossary: string | undefined;
  try {
    const stored = await chrome.storage.local.get('rf-cfg');
    const raw = stored['rf-cfg'] as string | undefined;
    if (raw && raw.trim()) glossary = raw.trim();
  } catch {
    /* storage unavailable — ignore */
  }
  return { ...base, glossary };
}
