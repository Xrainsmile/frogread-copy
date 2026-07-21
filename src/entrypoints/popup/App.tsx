import { useEffect, useState } from 'react';
import { getSettings, saveSettings } from '../../modules/storage/settings';
import { getConfig, saveConfig } from '../../modules/config/storage';
import type { AppConfig } from '../../modules/config/types';
import { TARGET_LANGS, type Settings } from '../../modules/types';
import { hostMatches } from '../../modules/utils/hostMatch';

/** 内置提供商 logo 路径 */
const PROVIDER_LOGOS: Record<string, string> = {
  taiji: '/icons/provider-taiji.png',
  hunyuan: '/icons/provider-hunyuan.png',
  fat: '/icons/provider-fat.png',
  deepseek: '/icons/provider-deepseek.png',
};

function ProviderLogoImg({ type, size = 20 }: { type: string; size?: number }) {
  const src = PROVIDER_LOGOS[type];
  if (!src) return null;
  return <img src={src} alt="" width={size} height={size} style={{ borderRadius: 4, objectFit: 'contain' }} />;
}

/** Source language options (auto + full list). */
const SOURCE_LANGS = [
  { value: 'auto', label: '自动检测' },
  ...TARGET_LANGS,
];

/** The four translation features, each with its own provider selection. */
const FEATURES: {
  key: string;
  label: string;
  get: (c: AppConfig) => string;
  set: (c: AppConfig, v: string) => void;
}[] = [
  { key: 'translate', label: '网页翻译', get: (c) => c.translate.providerId, set: (c, v) => { c.translate.providerId = v; } },
  { key: 'videoSubtitles', label: '视频字幕', get: (c) => c.videoSubtitles.providerId, set: (c, v) => { c.videoSubtitles.providerId = v; } },
  { key: 'selection', label: '划词翻译', get: (c) => c.selection.providerId, set: (c, v) => { c.selection.providerId = v; } },
  { key: 'inputTranslation', label: '输入翻译', get: (c) => c.inputTranslation.providerId, set: (c, v) => { c.inputTranslation.providerId = v; } },
];

export default function App() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [saved, setSaved] = useState(false);
  const [providerOpen, setProviderOpen] = useState(false);
  const [openFeature, setOpenFeature] = useState<string | null>(null);
  const [pageTranslated, setPageTranslated] = useState(false);
  const [translateError, setTranslateError] = useState('');
  const [host, setHost] = useState('');

  useEffect(() => {
    getSettings().then(setSettings);
    getConfig().then(setConfig);
    // Query current page translation status from the active tab's content script.
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (tab?.url) {
        try {
          setHost(new URL(tab.url).hostname);
        } catch {
          /* ignore */
        }
      }
      if (tab?.id) {
        chrome.tabs.sendMessage(tab.id, { type: 'get-translation-status' }, (resp: any) => {
          if (chrome.runtime.lastError) return; // content not injected yet
          if (resp?.isTranslated) setPageTranslated(true);
        });
      }
    });
  }, []);

  if (!settings || !config) return <div className="rf-loading">加载中…</div>;

  const update = (patch: Partial<Settings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    saveSettings(next).then(() => {
      setSaved(true);
      setTimeout(() => setSaved(false), 1200);
    });
  };

  const updateConfig = (fn: (c: AppConfig) => void) => {
    const next = JSON.parse(JSON.stringify(config)) as AppConfig;
    fn(next);
    setConfig(next);
    saveConfig(next).then(() => {
      setSaved(true);
      setTimeout(() => setSaved(false), 1200);
    });
  };

  // Per-site rule state derived from the current tab host.
  const siteDisabled =
    !!host && config.siteRules.blacklistPatterns.some((p) => hostMatches(p, host));
  const alwaysOn =
    !!host && config.translate.page.autoTranslatePatterns.some((p) => hostMatches(p, host));

  const toggleSiteDisable = (checked: boolean) => {
    if (!host) return;
    updateConfig((c) => {
      const list = c.siteRules.blacklistPatterns;
      if (checked) {
        if (!list.includes(host)) list.push(host);
      } else {
        c.siteRules.blacklistPatterns = list.filter((p) => p !== host);
      }
    });
    // Immediately hide translations on the current page if disabling.
    if (checked && pageTranslated) sendToContent({ type: 'toggle-translate' });
  };

  const toggleAlways = (checked: boolean) => {
    if (!host) return;
    updateConfig((c) => {
      const list = c.translate.page.autoTranslatePatterns;
      if (checked) {
        if (!list.includes(host)) list.push(host);
      } else {
        c.translate.page.autoTranslatePatterns = list.filter((p) => p !== host);
      }
    });
    // Immediately start translating the current page if enabling.
    if (checked && !pageTranslated) sendToContent({ type: 'toggle-translate' });
  };

  // One avatar per feature (网页翻译/视频字幕/划词翻译/输入翻译), NOT deduped —
  // mirrors read-frog's ProviderAvatarSummary so the 4 providers overlap visibly
  // even when several features share the same provider.
  const selectedProviders = FEATURES
    .map((f) => config.providersConfig.find((p) => p.id === f.get(config)))
    .filter(Boolean) as { id: string; name: string }[];

  const openOptions = () => {
    chrome.runtime.openOptionsPage();
  };

  const sendToContent = (msg: Record<string, unknown>) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (tab?.id) chrome.tabs.sendMessage(tab.id, msg, () => {});
    });
  };

  const toggleTranslate = () => {
    setTranslateError('');
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (!tab?.id) return;
      chrome.tabs.sendMessage(tab.id, { type: 'toggle-translate' }, () => {
        if (chrome.runtime.lastError) {
          setTranslateError('该页面未注入扩展，请刷新页面后重试');
          return;
        }
        setPageTranslated((v) => !v);
      });
    });
  };

  return (
    <div className="rf-popup">
      {/* ── Language selectors ── */}
      <div className="rf-lang-row">
        <div className="rf-lang-box">
          <select
            className="rf-lang-select"
            value={settings.sourceLang}
            onChange={(e) => update({ sourceLang: e.target.value })}
          >
            {SOURCE_LANGS.map((l) => (
              <option key={l.value} value={l.value}>{l.label}</option>
            ))}
          </select>
          <span className="rf-lang-hint">自动检测</span>
        </div>
        <span className="rf-lang-arrow">→</span>
        <div className="rf-lang-box">
          <select
            className="rf-lang-select"
            value={settings.targetLang}
            onChange={(e) => update({ targetLang: e.target.value })}
          >
            {TARGET_LANGS.map((l) => (
              <option key={l.value} value={l.value}>{l.label}</option>
            ))}
          </select>
          <span className="rf-lang-hint">目标语言</span>
        </div>
      </div>

      {/* ── Provider selector (avatar summary → drawer) ── */}
      <div className="rf-provider-row">
        <span className="rf-provider-label">提供商</span>
        <button className="rf-provider-avatars" onClick={() => setProviderOpen(true)}>
          <div className="rf-avatar-group">
            {selectedProviders.map((p, idx) => {
              const pCfg = config.providersConfig.find((pp) => pp.id === p.id);
              return (
                <span className="rf-avatar" key={`${p.id}-${idx}`} title={p.name}>
                  <ProviderLogoImg type={pCfg?.provider ?? ''} size={16} />
                </span>
              );
            })}
          </div>
          <span className="rf-provider-avatars-arrow">⌄</span>
        </button>
      </div>

      {/* ── Translation mode (双语 / 仅译文) ── */}
      <div className="rf-mode-row">
        <button
          className={`rf-mode-btn ${settings.mode === 'bilingual' ? 'active' : ''}`}
          onClick={() => update({ mode: 'bilingual' })}
        >
          双语
        </button>
        <button
          className={`rf-mode-btn ${settings.mode === 'translated-only' ? 'active' : ''}`}
          onClick={() => update({ mode: 'translated-only' })}
        >
          仅译文
        </button>
      </div>

      {/* ── Translate / Show original button ── */}
      <button
        className={`rf-translate-action ${pageTranslated ? 'is-translated' : ''}`}
        onClick={toggleTranslate}
        disabled={siteDisabled}
        title={siteDisabled ? '已在本站禁用扩展' : undefined}
      >
        {siteDisabled ? '已禁用' : pageTranslated ? '显示原文' : '翻译'}
      </button>
      {translateError && <div className="rf-translate-error">{translateError}</div>}

      {/* ── Toggle switches ── */}
      <div className="rf-toggles">
        <label className="rf-toggle-item">
          <span>在此网站禁用扩展</span>
          <input
            type="checkbox"
            className="rf-toggle"
            checked={!!siteDisabled}
            disabled={!host}
            onChange={(e) => toggleSiteDisable(e.target.checked)}
          />
        </label>
        <label className="rf-toggle-item">
          <span>总是翻译这个网站</span>
          <input
            type="checkbox"
            className="rf-toggle"
            checked={!!alwaysOn}
            disabled={!host}
            onChange={(e) => toggleAlways(e.target.checked)}
          />
        </label>
        <label className="rf-toggle-item">
          <span>悬停显示原文</span>
          <input
            type="checkbox"
            className="rf-toggle"
            checked={settings.showOriginalOnHover}
            onChange={(e) => update({ showOriginalOnHover: e.target.checked })}
          />
        </label>
        <label className="rf-toggle-item">
          <span>AI 智能上下文 <span className="rf-help" data-tip="结合上下文进行翻译，需要配合 LLM 提供商">?</span></span>
          <input
            type="checkbox"
            className="rf-toggle"
            checked={settings.enableAIContentAware}
            onChange={(e) => update({ enableAIContentAware: e.target.checked })}
          />
        </label>
      </div>

      {/* ── Footer ── */}
      <div className="rf-footer">
        <button className="rf-footer-btn" onClick={openOptions}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
          选项
        </button>
        <span className="rf-version">2.0.0</span>
      </div>

      {/* ── Provider drawer ── */}
      {providerOpen && (
        <div className="rf-drawer-wrap">
          <div className="rf-drawer-overlay" onClick={() => setProviderOpen(false)} />
          <div className="rf-drawer">
            <div className="rf-drawer-handle" />
            <div className="rf-drawer-header">
              <span className="rf-drawer-title">提供商</span>
              <button className="rf-drawer-close" onClick={() => setProviderOpen(false)}>✕</button>
            </div>
            <div className="rf-drawer-body">
              {FEATURES.map((f) => {
                const pid = f.get(config);
                const pCfg = config.providersConfig.find((p) => p.id === pid);
                const isOpen = openFeature === f.key;
                return (
                  <div className="rf-feature" key={f.key}>
                    <span className="rf-feature-label">{f.label}</span>
                    <button
                      className={`rf-feature-trigger ${isOpen ? 'open' : ''}`}
                      onClick={() => setOpenFeature(isOpen ? null : f.key)}
                    >
                      <span className="rf-feature-icon"><ProviderLogoImg type={pCfg?.provider ?? ''} size={18} /></span>
                      <span className="rf-feature-name">{pCfg?.name ?? '未配置'}</span>
                      <span className={`rf-feature-arrow ${isOpen ? 'up' : ''}`}>⌄</span>
                    </button>
                    {isOpen && (
                      <div className="rf-feature-options">
                        {config.providersConfig.map((p) => (
                          <button
                            key={p.id}
                            className={`rf-feature-option ${pid === p.id ? 'active' : ''}`}
                            onClick={() => {
                              updateConfig((c) => f.set(c, p.id));
                              setOpenFeature(null);
                            }}
                          >
                            <span className="rf-feature-option-icon"><ProviderLogoImg type={p.provider} size={16} /></span>
                            <span className="rf-feature-option-name">{p.name}</span>
                            {pid === p.id && <span className="rf-check">✓</span>}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {saved && <div className="rf-toast">已保存</div>}
    </div>
  );
}
