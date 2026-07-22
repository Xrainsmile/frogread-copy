import type { AppConfig } from './config/types';
import { getConfig } from './config/storage';
import { sendToBackground } from './utils/bg-messaging';

// Heuristic script-based language detection (works fully offline).
export function basicDetectLanguage(text: string): string {
  const sample = text.slice(0, 2000);
  let cjk = 0;
  let hiraKata = 0;
  let hangul = 0;
  let cyrillic = 0;
  let latin = 0;
  for (const ch of sample) {
    const cp = ch.codePointAt(0) ?? 0;
    if (cp >= 0x4e00 && cp <= 0x9fff) cjk++;
    else if (cp >= 0x3040 && cp <= 0x30ff) hiraKata++;
    else if (cp >= 0xac00 && cp <= 0xd7a3) hangul++;
    else if (cp >= 0x0400 && cp <= 0x04ff) cyrillic++;
    else if (
      (cp >= 0x0041 && cp <= 0x007a) ||
      (cp >= 0x00c0 && cp <= 0x024f) ||
      (cp >= 0x1e00 && cp <= 0x1eff)
    )
      latin++;
  }
  if (hangul > 0) return 'ko';
  if (hiraKata > 0 && cjk > 0) return 'ja';
  if (cjk > 0) return 'zh';
  if (cyrillic > 0) return 'ru';
  if (latin > 0) return 'en';
  return 'en';
}

const CODE_RE = /[a-z]{2,3}(?:[-_][a-z]{2,4})?/i;

/** Detect the language of `text` using the configured detection mode. */
export async function detectLanguage(text: string): Promise<string> {
  const config = await getConfig();
  if (!config.languageDetection.mode || config.languageDetection.mode === 'basic') {
    return basicDetectLanguage(text);
  }
  try {
    const providerId = config.languageDetection.providerId;
    const res = await sendToBackground<{ lang: string }>({
      type: 'detect-language',
      text: text.slice(0, 1000),
      providerId,
    });
    if (res && res.lang) {
      const m = res.lang.match(CODE_RE);
      if (m) return m[0].replace('_', '-');
    }
  } catch {
    // fall through to heuristic
  }
  return basicDetectLanguage(text);
}
