// Helpers for formatting the model prompt (numbered list) and parsing the
// numbered response back into a parallel array of translations.

/** Join texts into an "N. text" numbered list for the model prompt. */
export function numberedList(texts: string[]): string {
  return texts.map((t, i) => `${i + 1}. ${t}`).join('\n');
}

const MARKER_RE = /^\s*(\d+)[\.、)．。]\s*(.*)$/;

/**
 * Parse a numbered response back into an array aligned with the input `texts`.
 *
 * We group by the leading "N." markers so a translation that itself spans
 * multiple lines stays together (the previous line-index approach misaligned
 * whenever a translation wrapped across lines). When no markers are present we
 * fall back to a line-based split so plain output still yields results.
 *
 * Guard: a marker only starts a new block when its number matches the *next
 * expected* sequence (blocks.length + 1). This prevents an original paragraph
 * that itself begins with e.g. "1." from being split into a bogus block.
 */
export function parseNumbered(content: string, expected?: number): string[] {
  const lines = content.split('\n');
  const blocks: string[] = [];
  let current: string[] | null = null;

  for (const line of lines) {
    const m = line.match(MARKER_RE);
    const num = m ? parseInt(m[1], 10) : NaN;
    // Next expected marker = completed blocks + in-progress block + 1.
    const nextExpected = blocks.length + (current ? 1 : 0) + 1;
    if (m && num === nextExpected) {
      if (current) blocks.push(current.join('\n').trim());
      current = [m[2]];
    } else if (current) {
      current.push(line);
    }
    // Lines before the first marker (preamble) are ignored.
  }
  if (current) blocks.push(current.join('\n').trim());

  if (blocks.length === 0) {
    // No numbered markers — fall back to the original line-based behaviour.
    const fallback = lines
      .map((l) => l.replace(/^\s*\d+[\.、)]\s*/, '').trim())
      .filter((l) => l.length > 0);
    if (expected == null) return fallback;
    const out: string[] = [];
    for (let i = 0; i < expected; i++) out.push(fallback[i] ?? '');
    return out;
  }

  if (expected == null) return blocks.filter((b) => b.length > 0);
  const out: string[] = [];
  for (let i = 0; i < expected; i++) out.push(blocks[i] ?? '');
  return out;
}
