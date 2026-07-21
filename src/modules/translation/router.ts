// Translation orchestrator.
// Responsibilities:
//  - cache lookups (skip re-translating identical paragraphs)
//  - split uncached paragraphs into batches (char budget + item cap)
//  - per-batch retry with exponential backoff
//  - graceful degradation: on repeated failure, fall back to per-item
//    translation; unrecoverable items keep their original text so partial
//    results still render
//  - bounded concurrency + per-second rate limit (from Settings.requestQueue)
//  - stream progress via onProgress and honor shouldAbort

import type { Settings } from '../types';
import type { PageContext } from './context';
import { getProvider } from '../ai';
import { hashText } from '../utils/hash';
import { cacheGet, cacheSet } from '../storage/cache';
import { logger } from '../utils/logger';

export interface TranslateProgressItem {
  index: number;
  translated: string;
}

export interface TranslateOptions {
  texts: string[];
  settings: Settings;
  context: PageContext | null;
  task?: 'translate' | 'explain';
  onProgress?: (items: TranslateProgressItem[]) => void;
  shouldAbort?: () => boolean;
}

export interface TranslateResult {
  translations: string[];
  cached: boolean[];
}

const MAX_RETRIES = 3;

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function translateBatchWithRetry(
  providerId: string,
  texts: string[],
  settings: Settings,
  context: PageContext | null,
  task: 'translate' | 'explain',
  shouldAbort?: () => boolean,
): Promise<string[]> {
  const provider = getProvider(providerId);
  let lastErr: unknown;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (shouldAbort?.()) return texts.slice();
    try {
      const res = await provider.translate(texts, settings, context, task);
      if (res.length === texts.length) return res;
      // misaligned — pad with originals
      return texts.map((t, i) => res[i] ?? t);
    } catch (e) {
      lastErr = e;
      logger.warn(`Batch translate attempt ${attempt + 1} failed:`, e);
      const delay = Math.min(1000 * 2 ** attempt, 8000);
      await sleep(delay);
    }
  }

  // Degradation: translate each item individually.
  logger.warn('Batch failed after retries — falling back to per-item translation', lastErr);
  const results: string[] = [];
  for (const t of texts) {
    if (shouldAbort?.()) {
      results.push(t);
      continue;
    }
    try {
      const r = await provider.translate([t], settings, context, task);
      results.push(r[0] ?? t);
    } catch (e) {
      logger.warn('Per-item translate failed, keeping original', e);
      results.push(t);
    }
  }
  return results;
}

export async function translate(opts: TranslateOptions): Promise<TranslateResult> {
  const { texts, settings, context, onProgress, shouldAbort } = opts;

  // 1. Cache lookup
  const hashes = await Promise.all(texts.map(hashText));
  const cachedArr = await cacheGet(hashes);
  const translations: string[] = texts.map((_, i) => cachedArr[i] ?? '');
  const cachedFlags: boolean[] = cachedArr.map((c) => c !== undefined && c !== '');
  const uncachedIdx: number[] = [];
  cachedFlags.forEach((c, i) => {
    if (!c) uncachedIdx.push(i);
  });

  // 2. Split into batches by char budget + item cap
  const charBudget = settings.batchQueue?.maxCharactersPerBatch ?? 18000;
  const maxItems = settings.batchQueue?.maxItemsPerBatch ?? 100;
  const batches: number[][] = [];
  let cur: number[] = [];
  let curChars = 0;
  for (const idx of uncachedIdx) {
    const est = texts[idx].length;
    if ((cur.length > 0 && curChars + est > charBudget) || cur.length >= maxItems) {
      batches.push(cur);
      cur = [];
      curChars = 0;
    }
    cur.push(idx);
    curChars += est;
  }
  if (cur.length) batches.push(cur);

  // 3. Translate with bounded concurrency + rate limit
  const capacity = clamp(settings.requestQueue?.capacity ?? 5, 1, 20);
  const rate = settings.requestQueue?.rate ?? 10;
  const minInterval = rate > 0 ? 1000 / rate : 0;

  let cursor = 0;
  let lastStart = 0;
  const worker = async (): Promise<void> => {
    while (cursor < batches.length) {
      const bIdx = cursor++;
      if (shouldAbort?.()) break;
      const now = Date.now();
      const wait = lastStart + minInterval - now;
      if (wait > 0) await sleep(wait);
      lastStart = Date.now();

      const batchIdx = batches[bIdx];
      const batchTexts = batchIdx.map((i) => texts[i]);
      const result = await translateBatchWithRetry(
        settings.provider,
        batchTexts,
        settings,
        context,
        opts.task ?? 'translate',
        shouldAbort,
      );

      batchIdx.forEach((origIdx, k) => {
        translations[origIdx] = result[k] ?? batchTexts[k];
      });

      const toCache: { hash: string; translation: string }[] = [];
      batchIdx.forEach((origIdx, k) => {
        const tr = result[k];
        if (tr && tr !== batchTexts[k]) {
          toCache.push({ hash: hashes[origIdx], translation: tr });
        }
      });
      await cacheSet(toCache);

      if (onProgress) {
        onProgress(batchIdx.map((origIdx) => ({ index: origIdx, translated: translations[origIdx] })));
      }
    }
  };

  const workers = Array.from({ length: capacity }, () => worker());
  await Promise.all(workers);

  return { translations, cached: cachedFlags };
}
