// Small DOM helpers shared by content-side modules.

/** Escape a string for safe insertion into HTML via innerHTML. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Detect whether the current document is a PDF (file or viewer). */
export function isPdfPage(): boolean {
  const url = location.href;
  if (url.match(/\.pdf(\?|#|$)/i)) return true;
  if (document.contentType === 'application/pdf') return true;
  const embed = document.querySelector('embed[type="application/pdf"]');
  if (embed) return true;
  return false;
}

/** Create a closed-shadow host element appended to <html>. Returns the host + shadow root. */
export function createShadowHost(id: string): { host: HTMLElement; shadow: ShadowRoot } {
  let host = document.getElementById(id) as HTMLElement | null;
  if (host) host.remove();
  host = document.createElement('div');
  host.id = id;
  const shadow = host.attachShadow({ mode: 'closed' });
  document.documentElement.appendChild(host);
  return { host, shadow };
}
