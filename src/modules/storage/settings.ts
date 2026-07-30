// Settings persistence bridge backed by the new AppConfig store.
// The options page and popup both read/write through here; the underlying
// source of truth is `rf-config` (see modules/config/storage.ts).

import type { Settings } from '../types';
import type { AppConfig } from '../config/types';
import { getConfig, saveConfig, onConfigChanged, deriveSettings } from '../config/storage';

export async function getSettings(): Promise<Settings> {
  const config = await getConfig();
  return deriveSettings(config);
}

export async function saveSettings(settings: Settings): Promise<void> {
  const config = await getConfig();
  // Resolve the *active* provider instance (the one page translation uses) so
  // this round-trips with deriveSettings. Matching by provider *type* would
  // pick the wrong instance when several share the same backend type.
  const target =
    config.providersConfig.find((p) => p.id === config.translate.providerId) ||
    config.providersConfig[0];
  if (target) {
    if (settings.apiKey !== undefined) target.apiKey = settings.apiKey;
    if (settings.endpoint !== undefined) target.baseURL = settings.endpoint;
    if (settings.model) target.model = settings.model;
    config.translate.providerId = target.id;
  }
  config.general.targetLang = settings.targetLang;
  config.general.sourceLang = settings.sourceLang;
  config.general.level = settings.level;
  config.translate.mode =
    settings.mode === 'original' ? 'bilingual' : (settings.mode as AppConfig['translate']['mode']);
  config.translate.showOriginalOnHover = settings.showOriginalOnHover;
  config.translate.customPrompt = settings.customPrompt;
  config.translate.enableAIContentAware = settings.enableAIContentAware;
  config.translate.requestQueue = { ...settings.requestQueue };
  config.translate.batchQueue = { ...settings.batchQueue };
  await saveConfig(config);
}

export function onSettingsChanged(cb: (settings: Settings) => void): void {
  onConfigChanged((config) => {
    cb(deriveSettings(config));
  });
}
