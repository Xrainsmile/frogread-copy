// Lightweight host matching for per-site rules (blacklist / auto-translate).
// Patterns support exact host, suffix match (example.com matches
// sub.example.com) and glob wildcards (*.example.com).

export function hostMatches(pattern: string, host: string): boolean {
  const p = pattern.trim().toLowerCase();
  const h = host.trim().toLowerCase();
  if (!p || !h) return false;
  if (p === h) return true;

  // Glob → regex. '*' matches any sequence; escape the rest.
  const regexSrc = p
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*');
  try {
    return new RegExp(`^(?:${regexSrc})$`).test(h);
  } catch {
    return false;
  }
}

/** True when the current page is blocked by the site rules config. */
export function isSiteDisabled(blacklist: string[], whitelist: string[], mode: string, host: string): boolean {
  if (mode === 'whitelist') {
    return !whitelist.some((p) => hostMatches(p, host));
  }
  return blacklist.some((p) => hostMatches(p, host));
}
