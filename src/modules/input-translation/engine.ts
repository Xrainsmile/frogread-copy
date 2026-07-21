import type { AppConfig, InputTranslationConfig } from '../config/types';
import { getConfig, onConfigChanged } from '../config/storage';
import { DEFAULT_CONFIG } from '../config/default';
import { sendToBackground } from '../utils/bg-messaging';
import { logger } from '../utils/logger';

const REVERSED_KEY = 'rf-input-translation-reversed';

function isEditable(el: EventTarget | null): el is HTMLInputElement | HTMLTextAreaElement | HTMLElement {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  if (tag === 'INPUT') {
    const input = el as HTMLInputElement;
    return input.type !== 'password' && input.type !== 'hidden' && !input.readOnly;
  }
  if (tag === 'TEXTAREA') {
    return !(el as HTMLTextAreaElement).readOnly;
  }
  return el.isContentEditable;
}

function getText(el: HTMLInputElement | HTMLTextAreaElement | HTMLElement): string {
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return el.value;
  return el.textContent ?? '';
}

function setText(el: HTMLInputElement | HTMLTextAreaElement | HTMLElement, text: string): void {
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    el.focus();
    el.select();
    try {
      document.execCommand('insertText', false, text);
    } catch {
      el.value = text;
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
  } else {
    el.textContent = text;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }
}

function resolveLang(code: string, config: AppConfig): string {
  if (code === 'sourceCode') return config.general.sourceLang || 'auto';
  if (code === 'targetCode') return config.general.targetLang || 'zh-Hans';
  return code || 'auto';
}

/** Translate via background so the API key never touches the page world.
 *  Only the text + source/target lang are sent; the background reads config
 *  (incl. apiKey) itself. */
function translateViaBackground(text: string, from: string, to: string): Promise<string> {
  return sendToBackground<{ success?: boolean; translations?: string[]; error?: string }>(
    { type: 'translate-texts', texts: [text], from, to },
  ).then((resp) => {
    if (resp?.success) return (resp.translations?.[0] as string) ?? text;
    throw new Error(resp?.error || '翻译失败');
  });
}

export class InputTranslationController {
  private cfg: InputTranslationConfig;
  private appConfig: AppConfig;
  private spaceCount = 0;
  private lastSpaceTime = 0;
  private unsub: (() => void) | null = null;

  constructor() {
    this.appConfig = DEFAULT_CONFIG;
    this.cfg = DEFAULT_CONFIG.inputTranslation;
  }

  async init(): Promise<void> {
    this.appConfig = await getConfig();
    this.cfg = this.appConfig.inputTranslation;
    if (this.cfg.enabled) {
      document.addEventListener('keydown', this.onKeyDown, true);
    }
    this.unsub = onConfigChanged((config) => {
      const wasEnabled = this.cfg.enabled;
      this.appConfig = config;
      this.cfg = config.inputTranslation;
      if (this.cfg.enabled && !wasEnabled) {
        document.addEventListener('keydown', this.onKeyDown, true);
      } else if (!this.cfg.enabled && wasEnabled) {
        document.removeEventListener('keydown', this.onKeyDown, true);
      }
    });
  }

  destroy(): void {
    document.removeEventListener('keydown', this.onKeyDown, true);
    this.unsub?.();
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (!this.cfg.enabled) return;
    if (e.isComposing) return;
    const key = this.cfg.triggerKey;
    if (key === 'ctrl+enter') {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        void this.handle(document.activeElement);
      }
      return;
    }
    // default: 3xSpace
    if (e.key === ' ' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const now = Date.now();
      if (now - this.lastSpaceTime <= this.cfg.timeThreshold) this.spaceCount += 1;
      else this.spaceCount = 1;
      this.lastSpaceTime = now;
      if (this.spaceCount >= 3) {
        this.spaceCount = 0;
        e.preventDefault();
        void this.handle(document.activeElement);
      }
    } else {
      this.spaceCount = 0;
    }
  };

  private async handle(el: EventTarget | null): Promise<void> {
    if (!isEditable(el)) return;
    const editable = el as HTMLInputElement | HTMLTextAreaElement | HTMLElement;
    const raw = getText(editable).trim();
    if (!raw) return;

    // Trim trailing spaces in-place first.
    setText(editable, raw);

    let from = resolveLang(this.cfg.fromLang, this.appConfig);
    let to = resolveLang(this.cfg.toLang, this.appConfig);
    if (this.cfg.enableCycle && sessionStorage.getItem(REVERSED_KEY) === '1') {
      [from, to] = [to, from];
    }

    try {
      const translated = await translateViaBackground(raw, from, to);
      // Only replace if the user hasn't edited the field during the request.
      if (getText(editable).trim() === raw) {
        setText(editable, translated);
      }
    } catch (err) {
      logger.warn('[input-translation] translate failed', err);
    }

    if (this.cfg.enableCycle) {
      sessionStorage.setItem(REVERSED_KEY, sessionStorage.getItem(REVERSED_KEY) === '1' ? '0' : '1');
    }
  }
}
