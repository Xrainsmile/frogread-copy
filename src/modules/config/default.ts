import type { AppConfig, ProviderConfig } from './types';
import { CONFIG_SCHEMA_VERSION } from './types';

/** Built-in provider instances, one per supported backend. */
export const DEFAULT_PROVIDERS: ProviderConfig[] = [
  {
    id: 'hunyuan',
    name: '混元 (Hunyuan)',
    provider: 'hunyuan',
    apiKey: '',
    baseURL: 'http://hunyuanapi.woa.com/openapi/v1',
    model: 'hunyuan-turbos-latest',
    enabled: true,
  },
  {
    id: 'taiji',
    name: '太极 (Taiji)',
    provider: 'taiji',
    apiKey: '',
    baseURL: 'http://api.taiji.woa.com/openapi/v2',
    model: 'hunyuan-translation-pro',
    enabled: true,
  },
  {
    id: 'fat',
    name: 'FAT (公司 AI 网关)',
    provider: 'fat',
    apiKey: '',
    baseURL: 'http://dev.fit-ai.woa.com/api/llmproxy',
    model: 'deepseek-v3.1',
    enabled: true,
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    provider: 'deepseek',
    apiKey: '',
    baseURL: 'https://api.deepseek.com',
    model: 'deepseek-chat',
    enabled: true,
  },
];

export const DEFAULT_CONFIG: AppConfig = {
  schemaVersion: CONFIG_SCHEMA_VERSION,
  general: {
    uiLanguage: 'auto',
    sourceLang: 'auto',
    targetLang: 'zh-Hans',
    level: 'intermediate',
  },
  providersConfig: DEFAULT_PROVIDERS,
  customActions: [
    {
      id: 'explain',
      name: '解释',
      icon: '💡',
      providerId: 'hunyuan',
      prompt:
        '你是一名语言老师。请用简洁的{{targetLang}}解释下面这段文字的含义、语气与难点：\n\n{{text}}',
      enabled: true,
    },
    {
      id: 'summarize',
      name: '总结',
      icon: '📝',
      providerId: 'hunyuan',
      prompt: '请用{{targetLang}}对下面内容做要点总结：\n\n{{text}}',
      enabled: true,
    },
  ],
  translate: {
    providerId: 'hunyuan',
    mode: 'bilingual',
    showOriginalOnHover: true,
    node: {
      enabled: true,
      hotkey: 'alt',
    },
    page: {
      range: 'main',
      autoTranslatePatterns: [],
      neverAutoTranslatePatterns: ['*.google.com/*', 'localhost'],
      minWordsPerNode: 1,
    },
    enableAIContentAware: true,
    customPrompt: '',
    requestQueue: {
      capacity: 300,
      rate: 5,
    },
    batchQueue: {
      maxCharactersPerBatch: 2000,
      maxItemsPerBatch: 20,
    },
    nodeStyle: {
      preset: 'dashed',
      customCSS: null,
    },
  },
  siteRules: {
    mode: 'blacklist',
    blacklistPatterns: [],
    whitelistPatterns: [],
  },
  videoSubtitles: {
    enabled: false,
    autoStart: false,
    providerId: 'hunyuan',
    style: {
      displayMode: 'bilingual',
      translationPosition: 'bottom',
      main: { fontScale: 1, color: '#ffffff', fontWeight: 400 },
      translation: { fontScale: 1, color: '#ffd54f', fontWeight: 500 },
      backgroundOpacity: 0.5,
    },
  },
  inputTranslation: {
    enabled: false,
    providerId: 'hunyuan',
    fromLang: 'auto',
    toLang: 'targetCode',
    enableCycle: false,
    timeThreshold: 500,
    triggerKey: '3xSpace',
  },
  selection: {
    providerId: 'hunyuan',
  },
  floatingButton: {
    enabled: true,
    position: 0.66,
    side: 'right',
    clickAction: 'popup',
    locked: false,
    disabledPatterns: [],
  },
};
