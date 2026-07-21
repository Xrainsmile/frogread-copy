// Simple translation cache backed by chrome.storage.local with an in-memory
// front for speed. Keyed by the SHA-256 of the source paragraph.

const MEMORY = new Map<string, string>();
const STORAGE_KEY = 'rf-translation-cache';
const MAX_ENTRIES = 5000;

export async function cacheGet(hashes: string[]): Promise<(string | undefined)[]> {
  const result = hashes.map((h) => MEMORY.get(h));
  const missing = result
    .map((v, i) => (v === undefined ? i : -1))
    .filter((i) => i >= 0);
  if (missing.length === 0) return result;

  try {
    const stored = await chrome.storage.local.get(STORAGE_KEY);
    const map = (stored[STORAGE_KEY] as Record<string, string>) || {};
    for (const i of missing) {
      const h = hashes[i];
      if (map[h] !== undefined) {
        MEMORY.set(h, map[h]);
        result[i] = map[h];
      }
    }
  } catch {
    /* storage unavailable — ignore */
  }
  return result;
}

export async function cacheSet(entries: { hash: string; translation: string }[]): Promise<void> {
  if (entries.length === 0) return;
  for (const e of entries) MEMORY.set(e.hash, e.translation);

  try {
    const stored = await chrome.storage.local.get(STORAGE_KEY);
    const map = (stored[STORAGE_KEY] as Record<string, string>) || {};
    for (const e of entries) map[e.hash] = e.translation;

    // crude eviction
    const keys = Object.keys(map);
    if (keys.length > MAX_ENTRIES) {
      const drop = keys.slice(0, keys.length - MAX_ENTRIES);
      for (const k of drop) delete map[k];
    }
    await chrome.storage.local.set({ [STORAGE_KEY]: map });
  } catch {
    /* ignore */
  }
}
