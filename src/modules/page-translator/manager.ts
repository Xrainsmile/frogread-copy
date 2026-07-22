// PageTranslator — orchestrates paragraph detection, translation, the floating
// toggle button, SPA navigation handling, and the session/abort guard.
// This is the content-side brain, formerly content.ts.

import { getSettings, onSettingsChanged } from '../storage/settings';
import { getConfig, onConfigChanged } from '../config/storage';
import { isSiteDisabled, hostMatches } from '../utils/hostMatch';
import { getPageContext } from '../translation/context';
import { detectParagraphs, sanitizeText } from './detector';
import { injectTranslations, setMode, getOrCreateWrapper, getExistingWrapper, CSS_PREFIX, showLoading } from './injector';
import { initHoverDict } from './hoverDict';
import { hashText } from '../utils/hash';
import { isPdfPage } from '../utils/dom';
import { logger } from '../utils/logger';
import { sendToBackground } from '../utils/bg-messaging';
import type { Settings, Mode } from '../types';
import type { AppConfig } from '../config/types';
import type { BackgroundToContent, ContentToBackground } from '../messaging';
import { DEFAULT_SETTINGS } from '../types';

export class PageTranslator {
  private settings: Settings = { ...DEFAULT_SETTINGS };
  private translatedSet = new Set<Element>();
  private storedHashMap = new Map<string, Element>();
  private storedHashKeys: string[] = [];
  /** hashKey → original source text. Used to re-locate the *live* DOM node
   *  when X's SPA has replaced the element we originally detected (the stale
   *  reference would otherwise receive the translation and never show). */
  private storedHashTexts = new Map<string, string>();
  /** session-local hash -> translation, reused for duplicate paragraphs. */
  private sessionTranslations = new Map<string, string>();

  private isTranslated = false;
  private isTranslating = false;
  /** Whether the current translation was started by auto-translate (vs manual). */
  private autoStarted = false;

  private pageSession = 0;
  private activeBaseIndex = 0;
  private currentUrl = location.href;
  private domDebounce: number | null = null;
  private watchdogTimer: number | null = null;
  /** After a translation error, pause API retries for a few seconds so we
   *  don't hammer a failing endpoint in a tight loop. */
  private errorCooldownUntil = 0;
  /** Stall guard (F-04): if the SW dies mid-translate, no partial/done/error
   *  ever arrives and isTranslating would hang forever. This timer fires after
   *  a grace window to surface a timeout error. Reset on every progress event. */
  private stallTimer: number | null = null;

  async init(): Promise<void> {
    this.settings = await getSettings();
    const config = await getConfig();
    const host = location.hostname;
    // Per-site disable (read-frog "在此网站禁用扩展").
    if (isSiteDisabled(config.siteRules.blacklistPatterns, config.siteRules.whitelistPatterns, config.siteRules.mode, host)) {
      return;
    }
    // Per-site auto-translate (read-frog "总是翻译这个网站").
    if (config.translate.page.autoTranslatePatterns.some((p) => hostMatches(p, host))) {
      this.settings.autoTranslate = true;
    }
    if (isPdfPage()) {
      // PDF pages are handled by the dedicated PDF controller.
      return;
    }
    this.setupMessageListener();
    this.setupUrlPoll();
    this.setupMutationObserver();
    this.setupHover();
    this.setupRetryHandler();
    this.setupWatchdog();
    onSettingsChanged((s) => this.onSettingsChanged(s));
    onConfigChanged((c) => this.onConfigChanged(c));

    if (this.settings.autoTranslate) {
      this.autoStarted = true;
      void this.doTranslate();
    }
  }

  /**
   * Periodically re-inject translations that were wiped by SPA re-renders
   * (e.g. X replaces a tweet's node when its media/link card or "Translated
   * from …" inline UI loads). The mutation-observer debounce can be starved by
   * continuous DOM churn, so we rescan on a fixed interval and re-inject from
   * the session cache (no extra API calls for already-translated text).
   */
  private setupWatchdog(): void {
    if (this.watchdogTimer !== null) return;
    this.watchdogTimer = window.setInterval(() => {
      if (!this.isTranslated || this.isTranslating) return;

      // Drop detached nodes so re-rendered elements are treated as new.
      for (const el of [...this.translatedSet]) {
        if (!document.contains(el)) this.translatedSet.delete(el);
      }

      const paragraphs = detectParagraphs();
      const needsWork = paragraphs.some((el) => {
        if (!this.translatedSet.has(el)) return true;
        return !getExistingWrapper(el as HTMLElement);
      });
      if (needsWork) void this.doTranslate();
    }, 1200);
  }

  private updateBadge(state: 'on' | 'off' | 'loading' | 'error'): void {
    chrome.runtime
      .sendMessage({ type: 'update-badge', state } as ContentToBackground)
      .catch(() => {});
  }

  private send(msg: ContentToBackground): void {
    chrome.runtime.sendMessage(msg, () => {
      if (chrome.runtime.lastError) {
        logger.warn('sendMessage failed:', chrome.runtime.lastError.message, '| msg=', msg.type);
        // F-07: if the translate request itself couldn't reach the SW, surface
        // an error instead of leaving isTranslating stuck on. cancel-translation
        // failures are non-critical (best-effort) so they only log.
        if (msg.type === 'translate') {
          this.handleError('无法连接扩展后台：' + chrome.runtime.lastError.message);
        }
      }
    });
  }

  private armStallTimer(): void {
    this.clearStallTimer();
    this.stallTimer = window.setTimeout(() => {
      this.stallTimer = null;
      if (this.isTranslating) {
        this.handleError('翻译超时：扩展后台无响应，请重试');
      }
    }, 120000);
  }

  private clearStallTimer(): void {
    if (this.stallTimer !== null) {
      clearTimeout(this.stallTimer);
      this.stallTimer = null;
    }
  }

  // ── Toggle ──
  private toggleTranslate(): void {
    // Manual trigger always overrides any prior auto-translation.
    this.autoStarted = false;
    if (this.isTranslated) this.doTurnOff();
    else this.doTranslate();
  }

  // ── Translate ──
  async doTranslate(): Promise<void> {
    const paragraphs = detectParagraphs();
    const strMap = new Map<string, string>();
    const texts: string[] = [];
    const baseIndex = this.storedHashKeys.length;

    for (const el of paragraphs) {
      const t = sanitizeText(el);
      if (!t) continue;
      const hash = await hashText(t);
      if (this.translatedSet.has(el)) continue;
      if (this.sessionTranslations.has(hash)) {
        strMap.set(hash, this.sessionTranslations.get(hash)!);
        this.storedHashMap.set(hash, el);
        this.storedHashTexts.set(hash, t);
        this.storedHashKeys.push(hash);
        continue;
      }
      this.storedHashMap.set(hash, el);
      this.storedHashTexts.set(hash, t);
      this.storedHashKeys.push(hash);
      texts.push(t);
      showLoading(el as HTMLElement);
    }

    this.activeBaseIndex = baseIndex;

    // Back off after a previous failure so we don't loop hammering a broken
    // endpoint (e.g. unreachable provider off-VPN).
    if (texts.length > 0 && Date.now() < this.errorCooldownUntil) {
      return;
    }

    if (texts.length === 0 && strMap.size === 0) {
      this.finishTranslate();
      return;
    }

    this.isTranslating = true;
    this.updateBadge('loading');
    this.currentUrl = location.href;

    if (strMap.size > 0) {
      injectTranslations(
        strMap,
        this.settings.mode,
        this.settings.showOriginalOnHover,
        this.storedHashMap,
        this.translatedSet,
      );
    }

    if (texts.length > 0) {
      const context = await getPageContext();
      this.send({
        type: 'translate',
        paragraphs: texts,
        baseIndex,
        session: this.pageSession,
        context,
      });
      this.armStallTimer();
    } else {
      this.finishTranslate();
    }
  }

  private finishTranslate(): void {
    this.clearStallTimer();
    this.isTranslated = true;
    this.isTranslating = false;
    this.updateBadge('on');
  }

  private handlePartialResult(items: { index: number; translated: string }[]): void {
    this.armStallTimer(); // progress received — extend the stall window
    const strMap = new Map<string, string>();
    for (const { index, translated } of items) {
      const hashKey = this.storedHashKeys[this.activeBaseIndex + index];
      if (!hashKey) continue;
      this.sessionTranslations.set(hashKey, translated);
      strMap.set(hashKey, translated);
    }
    // X is a heavy SPA: by the time the response arrives the originally
    // detected nodes may have been replaced. Re-resolve each hash to a live
    // DOM node before injecting, otherwise the wrapper is attached to a
    // detached node and never becomes visible.
    for (const hashKey of strMap.keys()) {
      const live = this.resolveLiveElement(hashKey);
      if (live) this.storedHashMap.set(hashKey, live);
    }
    injectTranslations(
      strMap,
      this.settings.mode,
      this.settings.showOriginalOnHover,
      this.storedHashMap,
      this.translatedSet,
    );
  }

  /** Find the current live DOM node for a hashKey. If the stored element is
   *  still attached, use it; otherwise re-locate a tweetText whose sanitized
   *  text matches the original we recorded. */
  private resolveLiveElement(hashKey: string): HTMLElement | null {
    const stored = this.storedHashMap.get(hashKey) as HTMLElement | null;
    if (stored && document.contains(stored)) return stored;
    const text = this.storedHashTexts.get(hashKey);
    if (!text) return stored ?? null;
    const candidates = Array.from(
      document.querySelectorAll('[data-testid="tweetText"]'),
    ) as HTMLElement[];
    for (const c of candidates) {
      if (c.querySelector('.' + CSS_PREFIX + 'wrapper')) continue;
      if (sanitizeText(c) === text) {
        return c;
      }
    }
    logger.debug('relocate failed for', hashKey.slice(0, 8), 'text=', text.slice(0, 30));
    return stored ?? null;
  }

  private handleError(message: string): void {
    logger.error('Translation error:', message);
    this.clearStallTimer();
    this.isTranslating = false;
    this.errorCooldownUntil = Date.now() + 5000;
    this.updateBadge('error');
    // Clear any in-flight spinners so they don't hang on a dead request.
    document.querySelectorAll('.' + CSS_PREFIX + 'loader').forEach((n) => n.remove());
  }

  private doTurnOff(): void {
    this.cancelBackgroundTranslation();
    this.removeAllTranslations();
    this.clearState();
    this.updateBadge('off');
  }

  private resetForSpaNav(): void {
    this.cancelBackgroundTranslation();
    this.removeAllTranslations();
    this.clearState();
    this.updateBadge('off');
  }

  private clearState(): void {
    this.clearStallTimer();
    this.translatedSet.clear();
    this.storedHashMap.clear();
    this.storedHashKeys = [];
    this.storedHashTexts.clear();
    this.sessionTranslations.clear();
    this.activeBaseIndex = 0;
    this.isTranslated = false;
    this.isTranslating = false;
  }

  private removeAllTranslations(): void {
    for (const el of Array.from(this.translatedSet)) {
      const wrapper = getExistingWrapper(el as HTMLElement);
      if (wrapper) wrapper.remove();
    }
    this.translatedSet.clear();
  }

  private cancelBackgroundTranslation(): void {
    this.pageSession++;
    this.send({ type: 'cancel-translation', session: this.pageSession });
  }

  // ── SPA / URL polling ──
  private setupUrlPoll(): void {
    window.setInterval(() => {
      if (location.href !== this.currentUrl) {
        this.currentUrl = location.href;
        if (this.isTranslated) this.resetForSpaNav();
        else {
          this.clearState();
          this.activeBaseIndex = 0;
        }
      }
    }, 1000);
  }

  // ── DOM mutation (incremental translation) ──
  private setupMutationObserver(): void {
    const observer = new MutationObserver(() => this.onDomChange());
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  private onDomChange(): void {
    if (!this.isTranslated || this.isTranslating) return;
    const paragraphs = detectParagraphs();
    const newOnes = paragraphs.filter((el) => !this.translatedSet.has(el));
    if (newOnes.length === 0) return;
    if (this.domDebounce) clearTimeout(this.domDebounce);
    this.domDebounce = window.setTimeout(() => {
      if (this.isTranslated && !this.isTranslating) this.doTranslate();
    }, 800);
  }

  // ── Retry handler (per-paragraph) ──
  private setupRetryHandler(): void {
    document.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (!target) return;
      const retryBtn = target.closest('[data-rf-action="retry"]');
      if (!retryBtn) return;
      e.stopPropagation();
      const wrapper = retryBtn.closest('.rf-wrapper');
      const el = wrapper?.parentElement as HTMLElement | null;
      if (el) void this.retryTranslate(el);
    });
  }

  private async retryTranslate(el: HTMLElement): Promise<void> {
    const text = sanitizeText(el);
    if (!text) return;
    const wrapper = getOrCreateWrapper(el);
    wrapper.classList.add('rf-retrying');
    try {
      const resp = await sendToBackground<{ translation?: string; error?: string }>(
        { type: 'translate-single', text, session: this.pageSession },
      );
      if (resp?.translation && resp.translation !== text) {
        const translationEl = wrapper.querySelector('.rf-translation') as HTMLElement | null;
        if (translationEl) translationEl.textContent = resp.translation;
        const errEl = wrapper.querySelector('.rf-error-mark');
        if (errEl) errEl.remove();
        hashText(text).then((hash) => {
          this.sessionTranslations.set(hash, resp.translation!);
        });
      }
    } catch (e) {
      logger.warn('retry translate failed', e);
    } finally {
      wrapper.classList.remove('rf-retrying');
    }
  }

  // ── Hover dictionary ──
  private setupHover(): void {
    initHoverDict({
      isEnabled: () => this.isTranslated,
      lookup: (word) =>
        sendToBackground<{ phonetic?: string; definition?: string; error?: string }>(
          { type: 'lookup', word, session: this.pageSession },
        ).then((resp) => {
          if (resp?.error) throw new Error(resp.error);
          return { phonetic: resp?.phonetic, definition: resp?.definition ?? '' };
        }),
    });
  }

  // ── Settings ──
  private onSettingsChanged(s: Settings): void {
    const modeChanged = s.mode !== this.settings.mode;
    const hoverChanged = s.showOriginalOnHover !== this.settings.showOriginalOnHover;
    this.settings = s;
    if (this.isTranslated && (modeChanged || hoverChanged)) {
      setMode(s.mode as Mode, s.showOriginalOnHover, this.translatedSet);
    }
  }

  /**
   * Live re-evaluation of the auto-translate whitelist. Without this, toggling
   * "总是翻译这个网站" / editing the patterns in options or the popup only took
   * effect after a full page reload — the already-loaded tab kept its in-memory
   * `autoTranslate` flag, so removing a site never stopped it from re-translating.
   */
  private onConfigChanged = (config: AppConfig): void => {
    const host = location.hostname;
    const shouldAuto = config.translate.page.autoTranslatePatterns.some((p) => hostMatches(p, host));
    const wasAuto = this.settings.autoTranslate;
    this.settings.autoTranslate = shouldAuto;
    if (shouldAuto && !wasAuto && !this.isTranslated) {
      this.autoStarted = true;
      void this.doTranslate();
    } else if (!shouldAuto && wasAuto && this.autoStarted) {
      this.autoStarted = false;
      if (this.isTranslated) this.doTurnOff();
    }
  };

  // ── Messages from background ──
  private setupMessageListener(): void {
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      // Popup queries the current page translation status.
      if (msg?.type === 'get-translation-status') {
        sendResponse({ isTranslated: this.isTranslated, isTranslating: this.isTranslating });
        return true;
      }
      this.handleMessage(msg as BackgroundToContent, sendResponse);
      return true;
    });
  }

  private handleMessage(msg: BackgroundToContent, sendResponse: (r?: unknown) => void): void {
    switch (msg.type) {
      case 'translate-partial':
        if (msg.session !== this.pageSession) break;
        this.handlePartialResult(msg.items);
        break;
      case 'translate-done':
        if (msg.session !== this.pageSession) break;
        // Fallback: if partial messages were lost in transit, render from the
        // full translation array carried by `translate-done`. Index i maps to
        // storedHashKeys[i] (both follow the original paragraph order).
        if (msg.translations && msg.translations.length) {
          const strMap = new Map<string, string>();
          msg.translations.forEach((tr, i) => {
            const hashKey = this.storedHashKeys[this.activeBaseIndex + i];
            if (!hashKey) return;
            this.sessionTranslations.set(hashKey, tr);
            strMap.set(hashKey, tr);
          });
          if (strMap.size > 0) {
            for (const hashKey of strMap.keys()) {
              const live = this.resolveLiveElement(hashKey);
              if (live) this.storedHashMap.set(hashKey, live);
            }
            injectTranslations(
              strMap,
              this.settings.mode,
              this.settings.showOriginalOnHover,
              this.storedHashMap,
              this.translatedSet,
            );
          }
        }
        this.finishTranslate();
        break;
      case 'error':
        if (msg.session !== this.pageSession) break;
        this.handleError(msg.message);
        break;
      case 'toggle-translate':
        this.toggleTranslate();
        break;
      default:
        break;
    }
    sendResponse({ received: true });
  }
}
