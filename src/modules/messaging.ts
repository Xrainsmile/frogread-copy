// Typed messages exchanged between content scripts and the background.
// Content -> Background and Background -> Content unions.
// NOTE: API keys are NEVER carried in these messages — the background reads
// config (incl. keys) itself from local storage. `test-connection` carries
// only a provider id; the key is read by the background, never transmitted.

import type { PageContext } from './translation/context';

export interface TranslationItem {
  index: number;
  translated: string;
}

// ── Content script -> Background ──
export type ContentToBackground =
  | { type: 'translate'; paragraphs: string[]; baseIndex?: number; session?: number; context?: PageContext }
  | { type: 'cancel-translation'; session?: number }
  | { type: 'selection-translate'; id: string; text: string; task?: 'translate' | 'explain'; session?: number }
  | { type: 'lookup'; word: string; session?: number }
  | { type: 'translate-pdf'; url?: string; session?: number }
  | { type: 'test-connection'; providerId: string }
  | { type: 'translate-subtitles'; texts: string[] }
  | { type: 'translate-texts'; texts: string[]; from?: string; to?: string }
  | { type: 'translate-single'; text: string; session?: number }
  | { type: 'custom-action'; id: string; text: string; actionId: string; session?: number }
  | { type: 'detect-language'; text: string; providerId: string }
  | { type: 'update-badge'; state: 'on' | 'off' | 'loading' | 'error' }
  | { type: 'get-translation-status' }
  | { type: 'toggle-page-translation' };

// ── Background -> Content ──
export type BackgroundToContent =
  | { type: 'translate-partial'; items: TranslationItem[]; session: number }
  | { type: 'translate-done'; total: number; cachedCount: number; session: number; translations?: string[] }
  | { type: 'error'; message: string; session: number }
  | { type: 'selection-result'; id: string; text: string; result?: string; error?: string; session?: number }
  | { type: 'lookup-result'; word: string; phonetic?: string; definition?: string; error?: string; session?: number }
  | { type: 'test-connection-result'; ok: boolean; message: string }
  | { type: 'detect-language-result'; lang: string }
  | { type: 'toggle-translate' }
  | { type: 'translation-status'; isTranslated: boolean }
  | { type: 'context-selection-translate'; text: string }
  | { type: 'context-selection-read'; text: string }
  | { type: 'context-selection-custom'; text: string; actionId: string };

export type { PageContext };
