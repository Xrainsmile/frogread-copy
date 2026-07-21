// AppConfig persistence.
// Non-secret config lives in chrome.storage.sync (cross-device roam). API keys
// are split out into chrome.storage.local so they are NOT synced to the user's
// Google account (F-02). On read, keys are merged back into providersConfig.

import type { Settings } from '../types';
import { DEFAULT_SETTINGS } from '../types';
import type { AppConfig, ProviderConfig } from './types';
import { DEFAULT_CONFIG } from './default';

const CONFIG_KEY = 'rf-config';
const APIKEYS_KEY = 'rf-apikeys'; // local only
const LEGACY_SETTINGS_KEY = 'rf-settings';

// API keys are obfuscated at rest (not stored as raw plaintext) using a
// per-install random salt kept in local storage (F-02 hardening). This is
// obfuscation, NOT encryption: a local attacker with storage access could
// recover the key, but casual/plaintext leakage (dumps, screenshots) is
// prevented and the key never leaves local storage.
const ENC_SALT_KEY = 'rf-enc-salt';
const OBF_MARKER = '__obf__';

function randomHex(bytes: number): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
}

async function getSalt(): Promise<string> {
  const r = await chrome.storage.local.get(ENC_SALT_KEY);
  let s = r[ENC_SALT_KEY] as string | undefined;
  if (!s) {
    s = randomHex(16);
    await chrome.storage.local.set({ [ENC_SALT_KEY]: s });
  }
  return s;
}

function xorHex(data: string, salt: string): string {
  const sb = salt.match(/../g)!.map((h) => parseInt(h, 16));
  const db = new TextEncoder().encode(data);
  const out = new Uint8Array(db.length);
  for (let i = 0; i < db.length; i++) out[i] = db[i] ^ sb[i % sb.length];
  return Array.from(out, (b) => b.toString(16).padStart(2, '0')).join('');
}

function unxorHex(hex: string, salt: string): string {
  const sb = salt.match(/../g)!.map((h) => parseInt(h, 16));
  const db = hex.match(/../g)!.map((h) => parseInt(h, 16));
  const out = new Uint8Array(db.length);
  for (let i = 0; i < db.length; i++) out[i] = db[i] ^ sb[i % sb.length];
  return new TextDecoder().decode(out);
}

/** Deep-merge a partial stored config onto the defaults (section by section). */
function mergeConfig(stored: Partial<AppConfig> | undefined): AppConfig {
  const s = stored || {};
  return {
    schemaVersion: DEFAULT_CONFIG.schemaVersion,
    general: { ...DEFAULT_CONFIG.general, ...(s.general || {}) },
    providersConfig:
      Array.isArray(s.providersConfig) && s.providersConfig.length > 0
        ? s.providersConfig.map((p) => ({ ...blankProvider(), ...p }))
        : DEFAULT_CONFIG.providersConfig,
    customActions: Array.isArray(s.customActions)
      ? s.customActions
      : DEFAULT_CONFIG.customActions,
    translate: {
      ...DEFAULT_CONFIG.translate,
      ...(s.translate || {}),
      node: { ...DEFAULT_CONFIG.translate.node, ...(s.translate?.node || {}) },
      page: { ...DEFAULT_CONFIG.translate.page, ...(s.translate?.page || {}) },
      requestQueue: {
        ...DEFAULT_CONFIG.translate.requestQueue,
        ...(s.translate?.requestQueue || {}),
      },
      batchQueue: {
        ...DEFAULT_CONFIG.translate.batchQueue,
        ...(s.translate?.batchQueue || {}),
      },
      nodeStyle: {
        ...DEFAULT_CONFIG.translate.nodeStyle,
        ...(s.translate?.nodeStyle || {}),
      },
    },
    siteRules: { ...DEFAULT_CONFIG.siteRules, ...(s.siteRules || {}) },
    videoSubtitles: {
      ...DEFAULT_CONFIG.videoSubtitles,
      ...(s.videoSubtitles || {}),
      style: {
        ...DEFAULT_CONFIG.videoSubtitles.style,
        ...(s.videoSubtitles?.style || {}),
        main: {
          ...DEFAULT_CONFIG.videoSubtitles.style.main,
          ...(s.videoSubtitles?.style?.main || {}),
        },
        translation: {
          ...DEFAULT_CONFIG.videoSubtitles.style.translation,
          ...(s.videoSubtitles?.style?.translation || {}),
        },
      },
    },
    inputTranslation: {
      ...DEFAULT_CONFIG.inputTranslation,
      ...(s.inputTranslation || {}),
    },
    selection: { ...DEFAULT_CONFIG.selection, ...(s.selection || {}) },
    floatingButton: { ...DEFAULT_CONFIG.floatingButton, ...(s.floatingButton || {}) },
  };
}

function blankProvider(): ProviderConfig {
  return {
    id: '',
    name: '',
    provider: 'custom',
    apiKey: '',
    baseURL: '',
    model: '',
    enabled: true,
  };
}

/** One-time migration from the old flat `rf-settings` into `rf-config`. */
async function migrateFromLegacy(): Promise<AppConfig | null> {
  try {
    const stored = await chrome.storage.sync.get(LEGACY_SETTINGS_KEY);
    const legacy = stored[LEGACY_SETTINGS_KEY] as Partial<Settings> | undefined;
    if (!legacy) return null;

    const config = mergeConfig(undefined);
    // Fold the legacy provider/apiKey into the matching provider instance.
    const target =
      config.providersConfig.find((p) => p.provider === legacy.provider) ||
      config.providersConfig[0];
    if (target) {
      if (legacy.apiKey) target.apiKey = legacy.apiKey;
      if (legacy.endpoint) target.baseURL = legacy.endpoint;
      if (legacy.model && legacy.model !== 'translate') target.model = legacy.model;
      config.translate.providerId = target.id;
    }
    if (legacy.targetLang) config.general.targetLang = legacy.targetLang;
    if (legacy.mode && legacy.mode !== 'original') {
      config.translate.mode = legacy.mode as AppConfig['translate']['mode'];
    }
    if (typeof legacy.showOriginalOnHover === 'boolean') {
      config.translate.showOriginalOnHover = legacy.showOriginalOnHover;
    }
    return config;
  } catch {
    return null;
  }
}

export async function getConfig(): Promise<AppConfig> {
  try {
    const stored = await chrome.storage.sync.get(CONFIG_KEY);
    const raw = stored[CONFIG_KEY] as Partial<AppConfig> | undefined;
    let config: AppConfig;
    if (raw) {
      config = mergeConfig(raw);
    } else {
      // No config yet — try migrating from legacy settings, else defaults.
      const migrated = await migrateFromLegacy();
      config = migrated || mergeConfig(undefined);
    }

    // One-time migration: older versions stored apiKey inside rf-config (sync).
    // Move any non-empty keys to local and strip them from sync.
    const leaked = config.providersConfig.filter((p) => p.apiKey);
    if (leaked.length > 0) {
      const localMap = await readApiKeys();
      for (const p of leaked) {
        if (p.apiKey) localMap[p.id] = p.apiKey;
        p.apiKey = '';
      }
      await writeApiKeys(localMap);
      await chrome.storage.sync.set({ [CONFIG_KEY]: stripApiKeys(config) });
    }

    // Merge local apiKeys back into providersConfig.
    await mergeApiKeys(config);
    return config;
  } catch {
    return mergeConfig(undefined);
  }
}

/** Read the local apiKey map (id -> key), deobfuscated. */
async function readApiKeys(): Promise<Record<string, string>> {
  try {
    const data = await chrome.storage.local.get(APIKEYS_KEY);
    const raw = data[APIKEYS_KEY] as
      | { [OBF_MARKER]?: boolean; v?: string }
      | Record<string, string>
      | undefined;
    if (!raw) return {};
    // Obfuscated form.
    if (raw && (raw as Record<string, unknown>)[OBF_MARKER]) {
      const salt = await getSalt();
      try {
        return JSON.parse(unxorHex((raw as Record<string, string>).v, salt)) as Record<
          string,
          string
        >;
      } catch {
        return {};
      }
    }
    // Legacy plaintext JSON object — migrate to obfuscated form.
    const legacy = raw as Record<string, string>;
    if (legacy && typeof legacy === 'object') {
      await writeApiKeys(legacy);
      return legacy;
    }
  } catch {
    /* fall through */
  }
  return {};
}

/** Persist apiKeys obfuscated (not plaintext) in local storage. */
async function writeApiKeys(keys: Record<string, string>): Promise<void> {
  const salt = await getSalt();
  const payload = { [OBF_MARKER]: true, v: xorHex(JSON.stringify(keys), salt) };
  await chrome.storage.local.set({ [APIKEYS_KEY]: payload });
}

/** Merge local apiKeys into a config's providersConfig (mutates). */
async function mergeApiKeys(config: AppConfig): Promise<void> {
  const map = await readApiKeys();
  for (const p of config.providersConfig) {
    if (map[p.id]) p.apiKey = map[p.id];
    else p.apiKey = p.apiKey || '';
  }
}

/** Return a deep copy of config with all provider apiKeys cleared. */
function stripApiKeys(config: AppConfig): AppConfig {
  return {
    ...config,
    providersConfig: config.providersConfig.map((p) => ({ ...p, apiKey: '' })),
  };
}

/** Return a copy of config with provider apiKeys replaced by a mask.
 *  Use when serializing config for logs / export / debug. */
export function maskApiKeys(config: AppConfig): AppConfig {
  return {
    ...config,
    providersConfig: config.providersConfig.map((p) => ({ ...p, apiKey: maskStr(p.apiKey) })),
  };
}

function maskStr(s: string): string {
  if (!s) return s;
  if (s.length <= 8) return '****';
  return s.slice(0, 4) + '****' + s.slice(-4);
}

/** Resolve a provider instance by its config id (falls back to translate's). */
function resolveProvider(config: AppConfig, providerId?: string): ProviderConfig | undefined {
  if (providerId) {
    const found = config.providersConfig.find((p) => p.id === providerId);
    if (found) return found;
  }
  return (
    config.providersConfig.find((p) => p.id === config.translate.providerId) ||
    config.providersConfig[0]
  );
}

/** Derive the legacy Settings shape consumed by background/translation.
 *  Pass `providerId` to build settings for a non-translate feature
 *  (e.g. video subtitles, input translation, a custom action). */
export function deriveSettings(config: AppConfig, providerId?: string): Settings {
  const active = resolveProvider(config, providerId);
  const t = config.translate;
  return {
    ...DEFAULT_SETTINGS,
    provider: active?.provider ?? 'hunyuan',
    apiKey: active?.apiKey ?? '',
    endpoint: active?.baseURL ?? '',
    model: active?.model ?? 'translate',
    targetLang: config.general.targetLang,
    sourceLang: config.general.sourceLang,
    level: config.general.level,
    mode: t.mode,
    showOriginalOnHover: t.showOriginalOnHover,
    autoTranslate: false,
    customPrompt: t.customPrompt,
    enableAIContentAware: t.enableAIContentAware,
    requestQueue: { ...t.requestQueue },
    batchQueue: { ...t.batchQueue },
  };
}

export async function saveConfig(config: AppConfig): Promise<void> {
  // Merge apiKeys into the local map (clear entries emptied by the user).
  const localMap = await readApiKeys();
  for (const p of config.providersConfig) {
    if (p.apiKey) localMap[p.id] = p.apiKey;
    else delete localMap[p.id];
  }
  await writeApiKeys(localMap);
  // Write the config to sync with apiKeys stripped so they never roam.
  await chrome.storage.sync.set({ [CONFIG_KEY]: stripApiKeys(config) });
}

export function onConfigChanged(cb: (config: AppConfig) => void): () => void {
  const listener = async (
    changes: Record<string, chrome.storage.StorageChange>,
    area: string,
  ): Promise<void> => {
    if (area === 'sync' && changes[CONFIG_KEY]) {
      const config = mergeConfig(changes[CONFIG_KEY].newValue as Partial<AppConfig>);
      await mergeApiKeys(config);
      cb(config);
    } else if (area === 'local' && changes[APIKEYS_KEY]) {
      // apiKeys changed — re-emit a fully merged config.
      const config = await getConfig();
      cb(config);
    }
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}
