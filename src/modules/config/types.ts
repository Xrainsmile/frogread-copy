// ReadFlow v2 — rich nested configuration powering the standalone options page.
// Inspired by read-frog's config model, adapted to ReadFlow's simpler stack.

import type { ProviderId } from '../types';

export const CONFIG_SCHEMA_VERSION = 1;

/** Which underlying backend a provider instance talks to. */
export type ProviderType = ProviderId;

/** A single configured provider instance (user can add several). */
export interface ProviderConfig {
  /** Unique instance id, e.g. "hunyuan-default". */
  id: string;
  /** Display name shown in selectors. */
  name: string;
  /** Backend type. */
  provider: ProviderType;
  /** Bearer token / API key. */
  apiKey: string;
  /** API base URL (OpenAI-compatible). Empty => use backend default. */
  baseURL: string;
  /** Model id used for translation. */
  model: string;
  /** Whether this provider participates in selectors. */
  enabled: boolean;
}

// ── 通用 ───────────────────────────────────────────────────────────────
export type UiLanguage = 'auto' | 'zh' | 'en';
export type LangLevel = 'beginner' | 'intermediate' | 'advanced';

export interface GeneralConfig {
  uiLanguage: UiLanguage;
  /** Source language code or 'auto'. */
  sourceLang: string;
  /** Target language code. */
  targetLang: string;
  /** Learner proficiency, influences explanation depth. */
  level: LangLevel;
}

// ── 自定义 AI 指令 ──────────────────────────────────────────────────────
export interface CustomAction {
  id: string;
  name: string;
  /** Emoji or short icon text shown on the toolbar. */
  icon: string;
  /** Provider instance id used to run this action. */
  providerId: string;
  /** System prompt; may include {{text}} / {{targetLang}} placeholders. */
  prompt: string;
  /** Show this action in the selection toolbar. */
  enabled: boolean;
}

// ── 翻译 ───────────────────────────────────────────────────────────────
export type TranslateMode = 'bilingual' | 'translated-only';
export type PageTranslateRange = 'main' | 'all';
export type NodeHotkey = 'control' | 'alt' | 'shift';

export interface TranslateConfig {
  /** Provider instance id used for page translation. */
  providerId: string;
  mode: TranslateMode;
  /** Show original text on hover over a translation. */
  showOriginalOnHover: boolean;
  /** Hover + hotkey to translate a single node. */
  node: {
    enabled: boolean;
    hotkey: NodeHotkey;
  };
  page: {
    range: PageTranslateRange;
    autoTranslatePatterns: string[];
    neverAutoTranslatePatterns: string[];
    minWordsPerNode: number;
  };
  /** Inject page title / glossary into prompt for consistency. */
  enableAIContentAware: boolean;
  /** User override for the translation system prompt (empty => built-in). */
  customPrompt: string;
  requestQueue: {
    capacity: number;
    rate: number;
  };
  batchQueue: {
    maxCharactersPerBatch: number;
    maxItemsPerBatch: number;
  };
  /** Visual style of inserted translation nodes. */
  nodeStyle: {
    preset: TranslationStylePreset;
    customCSS: string | null;
  };
}

export type TranslationStylePreset =
  | 'underline'
  | 'dashed'
  | 'dotted'
  | 'wavy'
  | 'highlight'
  | 'blockquote'
  | 'none';

// ── 站点规则 ────────────────────────────────────────────────────────────
export type SiteRuleMode = 'blacklist' | 'whitelist';

export interface SiteRulesConfig {
  mode: SiteRuleMode;
  blacklistPatterns: string[];
  whitelistPatterns: string[];
}

// ── 视频字幕 ────────────────────────────────────────────────────────────
export type SubtitleDisplayMode = 'bilingual' | 'translation-only';
export type TranslationPosition = 'top' | 'bottom';

export interface SubtitleTextStyle {
  fontScale: number;
  color: string;
  fontWeight: number;
}

export interface VideoSubtitlesConfig {
  enabled: boolean;
  autoStart: boolean;
  providerId: string;
  style: {
    displayMode: SubtitleDisplayMode;
    translationPosition: TranslationPosition;
    main: SubtitleTextStyle;
    translation: SubtitleTextStyle;
    backgroundOpacity: number;
  };
}

// ── 输入翻译 ────────────────────────────────────────────────────────────
export interface InputTranslationConfig {
  enabled: boolean;
  providerId: string;
  /** Language codes or the special values 'sourceCode' / 'targetCode'. */
  fromLang: string;
  toLang: string;
  /** Cycle source/target on repeated triggers. */
  enableCycle: boolean;
  /** Double-press window (ms) for the trigger key. */
  timeThreshold: number;
  /** Trigger key combo, e.g. '3xSpace' or 'ctrl+enter'. */
  triggerKey: string;
}

// ── 划词翻译 ────────────────────────────────────────────────────────────
export interface SelectionConfig {
  /** Provider instance id used for selection (hover/toolbar) translation. */
  providerId: string;
}

// ── 悬浮工具 ────────────────────────────────────────────────────────────
export type FloatingButtonSide = 'left' | 'right';
export type FloatingButtonClickAction = 'translate' | 'popup';

export interface FloatingButtonConfig {
  enabled: boolean;
  /** Vertical position 0..1. */
  position: number;
  side: FloatingButtonSide;
  clickAction: FloatingButtonClickAction;
  /** Prevent accidental drags. */
  locked: boolean;
  /** URL patterns where the button is hidden. */
  disabledPatterns: string[];
}

// ── 顶层 ───────────────────────────────────────────────────────────────
export interface AppConfig {
  schemaVersion: number;
  general: GeneralConfig;
  providersConfig: ProviderConfig[];
  customActions: CustomAction[];
  translate: TranslateConfig;
  siteRules: SiteRulesConfig;
  videoSubtitles: VideoSubtitlesConfig;
  inputTranslation: InputTranslationConfig;
  selection: SelectionConfig;
  floatingButton: FloatingButtonConfig;
}
