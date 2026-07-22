import type { AppConfig, TtsConfig } from '../config/types';

export interface VoiceInfo {
  name: string;
  voiceURI: string;
  lang: string;
}

// Normalize our internal lang codes (zh-Hans/zh-Hant) to the BCP-47 codes
// that speechSynthesis voices use.
const LANG_ALIAS: Record<string, string> = {
  'zh-Hans': 'zh-CN',
  'zh-Hant': 'zh-TW',
  'zh-CN': 'zh-CN',
  'zh-TW': 'zh-TW',
};

export function ttsSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

export function getVoices(): VoiceInfo[] {
  if (!ttsSupported()) return [];
  return window.speechSynthesis.getVoices().map((v) => ({
    name: v.name,
    voiceURI: v.voiceURI,
    lang: v.lang,
  }));
}

/** Subscribe to async voice list availability (voices load lazily in most browsers). */
export function onVoicesReady(cb: () => void): () => void {
  if (!ttsSupported()) return () => {};
  window.speechSynthesis.addEventListener('voiceschanged', cb);
  return () => window.speechSynthesis.removeEventListener('voiceschanged', cb);
}

function normalizeLang(lang: string): string {
  return LANG_ALIAS[lang] || lang;
}

export function resolveTtsLang(tts: TtsConfig, config: AppConfig): string {
  if (tts.langMode === 'target') return normalizeLang(config.general.targetLang);
  if (tts.langMode === 'custom') return tts.customLang || 'zh-CN';
  // auto: prefer the page's declared language, fall back to target lang.
  const docLang =
    typeof document !== 'undefined' ? document.documentElement.lang : '';
  return normalizeLang(docLang || config.general.targetLang);
}

export function isSpeaking(): boolean {
  if (!ttsSupported()) return false;
  return window.speechSynthesis.speaking;
}

export function stopSpeaking(): void {
  if (ttsSupported()) window.speechSynthesis.cancel();
}

export function speak(text: string, tts: TtsConfig, config: AppConfig): void {
  if (!ttsSupported() || !text.trim()) return;
  stopSpeaking();
  const u = new SpeechSynthesisUtterance(text.trim());
  const lang = resolveTtsLang(tts, config);
  if (lang) u.lang = lang;
  u.rate = tts.rate;
  u.pitch = tts.pitch;
  u.volume = tts.volume;
  if (tts.voiceURI) {
    const v = window.speechSynthesis
      .getVoices()
      .find((x) => x.voiceURI === tts.voiceURI);
    if (v) u.voice = v;
  }
  window.speechSynthesis.speak(u);
}
