import { defineBackground } from 'wxt/utils/define-background';
import { getSettings } from '../modules/storage/settings';
import { getConfig, deriveSettings } from '../modules/config/storage';
import { translate } from '../modules/translation/router';
import { getProvider } from '../modules/ai';
import { lookupWord } from '../modules/ai/dictionary';
import { handlePdfTab } from '../modules/pdf/background';
import { initContextMenu } from '../modules/background/context-menu';
import { logger } from '../modules/utils/logger';
import type { ContentToBackground, BackgroundToContent } from '../modules/messaging';

// Tracks the active translation session per tab. When a tab navigates away or
// turns translation off, the session is bumped so late results are dropped and
// the in-flight run is aborted (releasing the API rate limit).
const tabTranslationSession = new Map<number, number>();

function updateBadge(state: 'on' | 'off' | 'loading' | 'error'): void {
  const colorMap: Record<string, string> = {
    on: '#3b82f6',
    off: '#9ca3af',
    loading: '#f59e0b',
    error: '#ef4444',
  };
  const textMap: Record<string, string> = {
    on: '',
    off: '',
    loading: '...',
    error: '!',
  };
  chrome.action.setBadgeText({ text: textMap[state] ?? '' });
  if (state !== 'off') {
    chrome.action.setBadgeBackgroundColor({ color: colorMap[state] });
  }
}

// ── Message validation (F-01) ──
// The listener receives `any`; validate shape before trusting fields. This
// guards against malformed messages from any content script context.
const KNOWN_MSG_TYPES = new Set<ContentToBackground['type']>([
  'translate', 'cancel-translation', 'selection-translate', 'lookup', 'translate-pdf',
  'test-connection', 'translate-subtitles', 'translate-texts', 'translate-single',
  'custom-action', 'detect-language', 'update-badge', 'get-translation-status',
  'toggle-page-translation',
]);

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function isStrArr(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string');
}

/** Validate and narrow an unknown message into ContentToBackground, or null. */
function parseMessage(raw: unknown): ContentToBackground | null {
  if (!isObj(raw)) return null;
  const type = raw.type;
  if (typeof type !== 'string' || !KNOWN_MSG_TYPES.has(type as ContentToBackground['type'])) return null;
  switch (type as ContentToBackground['type']) {
    case 'translate':
      if (!isStrArr(raw.paragraphs)) return null;
      break;
    case 'selection-translate':
      if (typeof raw.id !== 'string' || typeof raw.text !== 'string') return null;
      break;
    case 'translate-single':
      if (typeof raw.text !== 'string') return null;
      break;
    case 'lookup':
      if (typeof raw.word !== 'string') return null;
      break;
    case 'custom-action':
      if (typeof raw.id !== 'string' || typeof raw.text !== 'string' || typeof raw.actionId !== 'string') return null;
      break;
    case 'translate-subtitles':
    case 'translate-texts':
      if (!isStrArr(raw.texts)) return null;
      break;
    case 'test-connection':
      if (!isObj(raw.settings)) return null;
      break;
    case 'translate-pdf':
      if (raw.url !== undefined && typeof raw.url !== 'string') return null;
      break;
    case 'update-badge':
      if (!['on', 'off', 'loading', 'error'].includes(raw.state as string)) return null;
      break;
    case 'detect-language':
      if (typeof raw.text !== 'string' || typeof raw.providerId !== 'string') return null;
      break;
    // cancel-translation / get-translation-status: no payload to validate.
  }
  return raw as ContentToBackground;
}

async function handleMessage(
  message: ContentToBackground,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: unknown) => void,
): Promise<void> {
  const tabId = sender.tab?.id;

  switch (message.type) {
    case 'translate': {
      const settings = await getSettings();
      const session = message.session ?? 0;
      if (tabId !== undefined) tabTranslationSession.set(tabId, session);
      const isCurrent = () => tabId === undefined || tabTranslationSession.get(tabId) === session;

      if (!settings.apiKey) {
        if (tabId)
          chrome.tabs
            .sendMessage(tabId, { type: 'error', message: '请先在扩展弹窗中设置 API Key', session } as BackgroundToContent)
            .catch(() => {});
        sendResponse({ type: 'error', message: 'API key not configured' });
        return;
      }

      try {
        const result = await translate({
          texts: message.paragraphs,
          settings,
          context: message.context ?? null,
          onProgress: (items) => {
            if (tabId && isCurrent()) {
              chrome.tabs
                .sendMessage(tabId, { type: 'translate-partial', items, session } as BackgroundToContent)
                .catch(() => {});
            }
          },
          shouldAbort: () => !isCurrent(),
        });

        // Always carry the full translation array in `translate-done` so the
        // content can render even if some `translate-partial` messages are lost
        // in transit (MV3 message delivery is best-effort and can drop under
        // load). The partial path still handles incremental updates first.
        if (isCurrent() && tabId) {
          chrome.tabs
            .sendMessage(
              tabId,
              {
                type: 'translate-done',
                total: message.paragraphs.length,
                cachedCount: 0,
                translations: result.translations,
                session,
              } as BackgroundToContent,
            )
            .catch(() => {});
        }
        sendResponse({ type: 'translate-done', total: message.paragraphs.length });
      } catch (err) {
        logger.error('Translation failed', err);
        if (tabId && isCurrent()) {
          chrome.tabs
            .sendMessage(tabId, { type: 'error', message: String(err), session } as BackgroundToContent)
            .catch(() => {});
        }
        sendResponse({ type: 'error', message: String(err) });
      }
      return;
    }

    case 'cancel-translation': {
      if (tabId !== undefined) {
        tabTranslationSession.set(tabId, message.session ?? Date.now());
      }
      sendResponse({ success: true });
      return;
    }

    case 'selection-translate': {
      const config = await getConfig();
      const settings = deriveSettings(config, config.selection.providerId);
      const task = message.task ?? 'translate';
      const respond = (payload: Partial<BackgroundToContent> & { type: 'selection-result' }) => {
        if (tabId)
          chrome.tabs
            .sendMessage(
              tabId,
              { ...payload, id: message.id, text: message.text, session: message.session } as BackgroundToContent,
            )
            .catch(() => {});
      };
      if (!settings.apiKey) {
        respond({ type: 'selection-result', error: '请先在扩展弹窗中设置 API Key' });
        sendResponse({ success: true });
        return;
      }
      try {
        const { translations } = await translate({
          texts: [message.text],
          settings,
          context: null,
          task,
        });
        respond({ type: 'selection-result', result: translations[0] ?? '' });
      } catch (err) {
        respond({ type: 'selection-result', error: String(err) });
      }
      sendResponse({ success: true });
      return;
    }

    case 'lookup': {
      try {
        const res = await lookupWord(message.word);
        if (tabId)
          chrome.tabs
            .sendMessage(
              tabId,
              {
                type: 'lookup-result',
                word: message.word,
                phonetic: res.phonetic,
                definition: res.definition,
                session: message.session,
              } as BackgroundToContent,
            )
            .catch(() => {});
      } catch (err) {
        if (tabId)
          chrome.tabs
            .sendMessage(
              tabId,
              { type: 'lookup-result', word: message.word, error: String(err), session: message.session } as BackgroundToContent,
            )
            .catch(() => {});
      }
      sendResponse({ success: true });
      return;
    }

    case 'translate-pdf': {
      // Prefer the tab's own URL (trusted) over the content-supplied url to
      // avoid SSRF via a crafted message.url. Only http(s) is allowed.
      const url = sender.tab?.url ?? message.url ?? '';
      if (!/^https?:\/\//i.test(url)) {
        sendResponse({ success: false, error: 'invalid pdf url' });
        return;
      }
      if (tabId) {
        handlePdfTab(tabId, url, getSettings).catch((e) => logger.error('PDF failed', e));
      }
      sendResponse({ success: true });
      return;
    }

    case 'test-connection': {
      // Self-fetch config (incl. apiKey from local storage) — the key is never
      // carried in the message. Only a provider id is transmitted.
      const config = await getConfig();
      const settings = deriveSettings(config, message.providerId);
      if (!settings.apiKey) {
        sendResponse({
          type: 'test-connection-result',
          ok: false,
          message: '请先在提供商设置中填写 API Key',
        });
        return;
      }
      try {
        const res = await getProvider(settings.provider).testConnection(settings);
        sendResponse({ type: 'test-connection-result', ok: res.ok, message: res.message });
      } catch (e) {
        sendResponse({ type: 'test-connection-result', ok: false, message: String(e) });
      }
      return;
    }

    case 'translate-subtitles': {
      try {
        const config = await getConfig();
        const settings = deriveSettings(config, config.videoSubtitles.providerId);
        if (!settings.apiKey) {
          sendResponse({ success: false, error: '请先在扩展弹窗中设置 API Key' });
          return;
        }
        const { translations } = await translate({
          texts: message.texts,
          settings,
          context: null,
          task: 'translate',
        });
        sendResponse({ success: true, translations });
      } catch (err) {
        sendResponse({ success: false, error: String(err) });
      }
      return;
    }

    case 'translate-texts': {
      try {
        const config = await getConfig();
        const settings = deriveSettings(config, config.inputTranslation.providerId);
        if (message.from) settings.sourceLang = message.from;
        if (message.to) settings.targetLang = message.to;
        if (!settings.apiKey) {
          sendResponse({ success: false, error: '请先在扩展弹窗中设置 API Key' });
          return;
        }
        const { translations } = await translate({
          texts: message.texts,
          settings,
          context: null,
          task: 'translate',
        });
        sendResponse({ success: true, translations });
      } catch (err) {
        sendResponse({ success: false, error: String(err) });
      }
      return;
    }

    case 'translate-single': {
      const settings = await getSettings();
      try {
        const { translations } = await translate({
          texts: [message.text],
          settings,
          context: null,
          task: 'translate',
        });
        sendResponse({ translation: translations[0] ?? message.text });
      } catch (err) {
        sendResponse({ error: String(err), translation: message.text });
      }
      return;
    }

    case 'custom-action': {
      const respond = (payload: Partial<BackgroundToContent> & { type: 'selection-result' }) => {
        if (tabId)
          chrome.tabs
            .sendMessage(
              tabId,
              { ...payload, id: message.id, text: message.text, session: message.session } as BackgroundToContent,
            )
            .catch(() => {});
      };
      try {
        const config = await getConfig();
        const action = config.customActions.find((a) => a.id === message.actionId);
        if (!action) {
          respond({ type: 'selection-result', error: '未找到自定义指令' });
          sendResponse({ success: true });
          return;
        }
        const targetLang = config.general.targetLang;
        const systemPrompt = action.prompt
          .replace(/\{\{\s*text\s*\}\}/g, message.text)
          .replace(/\{\{\s*targetLang\s*\}\}/g, targetLang);
        const settings = deriveSettings(config, action.providerId);
        const [result] = await getProvider(settings.provider).translate(
          [message.text],
          settings,
          null,
          'translate',
          systemPrompt,
        );
        respond({ type: 'selection-result', result: result ?? message.text });
      } catch (err) {
        respond({ type: 'selection-result', error: String(err) });
      }
      sendResponse({ success: true });
      return;
    }

    case 'detect-language': {
      try {
        const config = await getConfig();
        const settings = deriveSettings(config, message.providerId);
        const prompt =
          'Identify the language of the following text. Reply with ONLY a BCP-47 ' +
          'language code (e.g. en, zh-Hans, ja, ko, fr, de, ru, es, pt, it). ' +
          'No explanation, no punctuation.';
        const [result] = await getProvider(settings.provider).translate(
          [message.text],
          settings,
          null,
          'translate',
          prompt,
        );
        const m = (result || '').match(/[a-z]{2,3}(?:[-_][a-z]{2,4})?/i);
        sendResponse({ lang: m ? m[0].replace('_', '-') : 'en' });
      } catch {
        sendResponse({ lang: 'en' });
      }
      return;
    }

    case 'update-badge': {
      updateBadge(message.state);
      sendResponse({ success: true });
      return;
    }

    case 'toggle-page-translation': {
      // Forwarded from the floating button content script: toggle page
      // translation on the very tab the button lives in.
      if (sender.tab?.id) {
        chrome.tabs.sendMessage(sender.tab.id, { type: 'toggle-translate' }).catch(() => {});
      }
      sendResponse({ success: true });
      return;
    }

    default:
      sendResponse({ success: true });
  }
}

export default defineBackground(() => {
  initContextMenu();

  chrome.runtime.onMessage.addListener((message: any, sender, sendResponse) => {
    const msg = parseMessage(message);
    if (!msg) {
      // Malformed / unknown message — reject without invoking handlers.
      sendResponse({ success: false, error: 'invalid message' });
      return false;
    }
    handleMessage(msg, sender, sendResponse);
    return true;
  });

  chrome.commands?.onCommand.addListener((command) => {
    if (command === 'toggle-translate') {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tab = tabs[0];
        if (tab?.id) chrome.tabs.sendMessage(tab.id, { type: 'toggle-translate' }).catch(() => {});
      });
    }
  });
});
