// Shared domain types for ReadFlow v2.

export type ProviderId =
  | 'hunyuan'
  | 'taiji'
  | 'fat'
  | 'deepseek'
  | 'glm'
  | 'openai'
  | 'siliconflow'
  | 'custom';

export type Mode = 'bilingual' | 'translated-only' | 'original';

/** BCP-47-ish target languages offered in the popup. */
export interface TargetLangOption {
  value: string;
  label: string;
}

export const TARGET_LANGS: TargetLangOption[] = [
  { value: 'zh-Hans', label: '简体中文' },
  { value: 'zh-Hant', label: '繁體中文' },
  { value: 'en', label: 'English' },
  { value: 'ja', label: '日本語' },
  { value: 'ko', label: '한국어' },
  { value: 'fr', label: 'Français' },
  { value: 'de', label: 'Deutsch' },
  { value: 'es', label: 'Español' },
  { value: 'ru', label: 'Русский' },
  { value: 'pt', label: 'Português' },
  { value: 'it', label: 'Italiano' },
  { value: 'ar', label: 'العربية' },
];

export type GeneralLevel = 'beginner' | 'intermediate' | 'advanced';

export interface Settings {
  provider: ProviderId;
  apiKey: string;
  /** Custom API base URL (for OpenAI-compatible providers). */
  endpoint: string;
  /** Model id; may be a dropdown value or free text. */
  model: string;
  /** BCP-47 target language, e.g. 'zh-Hans', 'en'. */
  targetLang: string;
  /** BCP-47 source language; 'auto' for detection. */
  sourceLang: string;
  /** Learning level, affects explain/summary phrasing. */
  level: GeneralLevel;
  mode: Mode;
  /** Show original text when hovering the translation. */
  showOriginalOnHover: boolean;
  /** Auto-translate on page open (off by default). */
  autoTranslate: boolean;
  /** Custom system prompt override (empty = built-in). */
  customPrompt: string;
  /** Inject page title/glossary into the prompt for context awareness. */
  enableAIContentAware: boolean;
  /** Concurrency + per-second rate cap for translation requests. */
  requestQueue: { capacity: number; rate: number };
  /** Batch splitting budget (chars + item count). */
  batchQueue: { maxCharactersPerBatch: number; maxItemsPerBatch: number };
}

export const DEFAULT_SETTINGS: Settings = {
  provider: 'hunyuan',
  apiKey: '',
  endpoint: '',
  model: 'translate',
  targetLang: 'zh-Hans',
  sourceLang: 'auto',
  level: 'intermediate',
  mode: 'bilingual',
  showOriginalOnHover: true,
  autoTranslate: false,
  customPrompt: '',
  enableAIContentAware: true,
  requestQueue: { capacity: 5, rate: 10 },
  batchQueue: { maxCharactersPerBatch: 18000, maxItemsPerBatch: 100 },
};

export interface AIModelOption {
  name: string;
  value: string;
}
