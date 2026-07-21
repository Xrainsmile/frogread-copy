import { TARGET_LANGS } from '../../modules/types';

export const TARGET_LANG_OPTIONS = TARGET_LANGS.map((l) => ({
  value: l.value,
  label: l.label,
}));

export const SOURCE_LANG_OPTIONS = [
  { value: 'auto', label: '自动检测' },
  ...TARGET_LANG_OPTIONS,
];

export interface NavItem {
  id: string;
  label: string;
  icon: string;
}

/** Sidebar navigation — TTS/account/sync/hub/updates intentionally excluded. */
export const NAV_ITEMS: NavItem[] = [
  { id: 'general', label: '通用', icon: '⚙️' },
  { id: 'api-providers', label: 'API 提供商', icon: '🔌' },
  { id: 'custom-actions', label: '自定义 AI 指令', icon: '✨' },
  { id: 'translation', label: '翻译', icon: '🌐' },
  { id: 'site-rules', label: '站点规则', icon: '📋' },
  { id: 'video-subtitles', label: '视频字幕', icon: '🎬' },
  { id: 'input-translation', label: '输入翻译', icon: '⌨️' },
  { id: 'floating-button', label: '悬浮工具', icon: '🧭' },
];
