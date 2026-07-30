// Simple translation cache backed by chrome.storage.local with an in-memory
// LRU front for speed. Keyed by the SHA-256 of the source paragraph.

const MEMORY = new Map<string, string>();
const STORAGE_KEY = 'rf-translation-cache';
const MAX_ENTRIES = 5000;

let loaded = false;

/** One-time load of the persisted map into MEMORY. The stored map's key order
 *  is itself LRU order (cacheSet persists in insertion order), so recency
 *  survives across service-worker restarts. */
async function ensureLoaded(): Promise<void> {
  if (loaded) return;
  loaded = true;
  try {
    const stored = await chrome.storage.local.get(STORAGE_KEY);
    const map = (stored[STORAGE_KEY] as Record<string, string>) || {};
    for (const [k, v] of Object.entries(map)) {
      if (!MEMORY.has(k)) MEMORY.set(k, v);
    }
  } catch {
    /* storage unavailable — ignore */
  }
}

/** Move a key to the most-recently-used end (JS Map preserves insertion order,
 *  so delete+set re-appends it). */
function touch(hash: string): void {
  if (!MEMORY.has(hash)) return;
  const v = MEMORY.get(hash)!;
  MEMORY.delete(hash);
  MEMORY.set(hash, v);
}

export async function cacheGet(hashes: string[]): Promise<(string | undefined)[]> {
  await ensureLoaded();
  const result = hashes.map((h) => MEMORY.get(h));
  for (const h of hashes) touch(h);
  return result;
}

export async function cacheSet(entries: { hash: string; translation: string }[]): Promise<void> {
  if (entries.length === 0) return;
  await ensureLoaded();
  for (const e of entries) {
    MEMORY.delete(e.hash); // refresh recency on overwrite
    MEMORY.set(e.hash, e.translation);
  }

  // LRU eviction: drop the oldest (front) entries beyond the cap, not an
  // arbitrary insertion-order slice — hot terms stay cached.
  while (MEMORY.size > MAX_ENTRIES) {
    const oldest = MEMORY.keys().next().value;
    if (oldest === undefined) break;
    MEMORY.delete(oldest);
  }

  // Persist in LRU (insertion) order so recency survives restarts.
  try {
    await chrome.storage.local.set({ [STORAGE_KEY]: Object.fromEntries(MEMORY) });
  } catch {
    /* ignore */
  }
}
