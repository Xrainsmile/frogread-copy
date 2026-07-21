import { getConfig, onConfigChanged, deriveSettings } from '../config/storage';
import type { AppConfig, VideoSubtitlesConfig } from '../config/types';
import type { Settings } from '../types';
import { sendToBackground } from '../utils/bg-messaging';
import { injectYoutubeBridge, requestPlayerResponse } from './bridge';
import {
  extractCaptionTracks,
  selectTrack,
  fetchSubtitles,
  type SubtitlesFragment,
} from './fetcher';
import { SubtitlesOverlay } from './overlay';

const PLAYER_SELECTOR = '#movie_player';
const POLL_INTERVAL = 500;
const POLL_TIMEOUT = 15000;

export class SubtitlesController {
  private config: AppConfig | null = null;
  private overlay: SubtitlesOverlay | null = null;
  private fragments: SubtitlesFragment[] = [];
  private rafId = 0;
  private video: HTMLVideoElement | null = null;
  private player: HTMLElement | null = null;
  private providerId = '';
  private unsub: (() => void) | null = null;
  private destroyed = false;

  async init(): Promise<void> {
    injectYoutubeBridge();
    this.config = await getConfig();
    if (!this.config.videoSubtitles.enabled) return;

    const player = await this.waitForPlayer();
    if (!player) {
      this.log('找不到 YouTube 播放器');
      return;
    }
    this.player = player;
    this.video = player.querySelector('video');

    this.unsub = onConfigChanged((cfg) => this.onConfigChange(cfg));
    this.bindNavigation();
    void this.load();
  }

  private log(...args: unknown[]): void {
    // eslint-disable-next-line no-console
    console.info('[ReadFlow subtitles]', ...args);
  }

  private async waitForPlayer(): Promise<HTMLElement | null> {
    const start = Date.now();
    return new Promise((resolve) => {
      const tick = () => {
        const el = document.querySelector<HTMLElement>(PLAYER_SELECTOR);
        if (el) return resolve(el);
        if (Date.now() - start > POLL_TIMEOUT) return resolve(null);
        window.setTimeout(tick, POLL_INTERVAL);
      };
      tick();
    });
  }

  private bindNavigation(): void {
    document.addEventListener('yt-navigate-finish', () => {
      this.log('检测到页面导航，重新加载字幕');
      this.teardownOverlay();
      this.fragments = [];
      window.setTimeout(() => void this.load(), POLL_INTERVAL * 2);
    });
  }

  private async load(): Promise<void> {
    if (this.destroyed) return;
    if (!this.player) {
      this.player = await this.waitForPlayer();
      if (!this.player) return;
      this.video = this.player.querySelector('video');
    }
    try {
      const playerResponse = await requestPlayerResponse();
      if (!playerResponse) throw new Error('无法获取播放器数据（请刷新页面重试）');
      const tracks = extractCaptionTracks(playerResponse);
      const track = selectTrack(tracks);
      if (!track) throw new Error('该视频没有可用的字幕轨道（请确认已开启字幕）');

      this.log('选择字幕轨道：', track.languageCode, track.kind);
      const fragments = await fetchSubtitles(track);
      if (!fragments.length) throw new Error('字幕内容为空');

      this.fragments = fragments;
      await this.translateAll();
      this.mountOverlay();
    } catch (err) {
      this.log('加载失败：', err);
      this.showError(String(err instanceof Error ? err.message : err));
    }
  }

  private buildSettings(): Settings | null {
    if (!this.config) return null;
    const providerId = this.config.videoSubtitles.providerId;
    this.providerId = providerId;
    return deriveSettings(this.config, providerId);
  }

  private async translateAll(): Promise<void> {
    const settings = this.buildSettings();
    if (!settings || !settings.apiKey) {
      // No provider configured — fall back to showing original text.
      this.fragments.forEach((f) => (f.translation = f.text));
      return;
    }
    try {
      const translations = await this.translateViaBackground(
        this.fragments.map((f) => f.text),
      );
      this.fragments.forEach((f, i) => {
        f.translation = translations[i] || f.text;
      });
    } catch (err) {
      this.log('翻译失败，回退为原文：', err);
      this.fragments.forEach((f) => (f.translation = f.text));
    }
  }

  private translateViaBackground(texts: string[]): Promise<string[]> {
    // Only texts are sent; the background reads config (incl. apiKey) itself.
    return sendToBackground<{ success?: boolean; translations?: string[]; error?: string }>(
      { type: 'translate-subtitles', texts },
    ).then((resp) => {
      if (resp?.success && resp.translations) return resp.translations;
      throw new Error(resp?.error || '翻译失败');
    });
  }

  private mountOverlay(): void {
    if (!this.player) return;
    this.teardownOverlay();
    const cfg = this.config!.videoSubtitles;
    this.overlay = new SubtitlesOverlay(
      this.player,
      () => {
        if (this.overlay) this.overlay.setVisible(!this.overlay.getVisible());
      },
      () => {
        if (this.overlay) this.overlay.cycleDisplayMode();
      },
    );
    this.overlay.setStyle(cfg.style);
    this.overlay.setVisible(cfg.autoStart);
    this.startRenderLoop();
  }

  private startRenderLoop(): void {
    const loop = () => {
      this.renderCurrent();
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  private lastIdx = -1;
  private renderCurrent(): void {
    if (!this.overlay || !this.video) return;
    const t = this.video.currentTime * 1000;
    // Search around the last matched index for efficiency.
    let idx = this.findFragment(t);
    if (idx === this.lastIdx) return;
    this.lastIdx = idx;
    this.overlay.render(idx >= 0 ? this.fragments[idx] : null);
  }

  private findFragment(t: number): number {
    const frags = this.fragments;
    if (!frags.length) return -1;
    // Linear scan from lastIdx outward; falls back to full scan.
    for (let i = Math.max(0, this.lastIdx); i < frags.length; i++) {
      if (frags[i].start <= t && t < frags[i].end) return i;
      if (frags[i].start > t) break;
    }
    for (let i = Math.min(frags.length - 1, this.lastIdx); i >= 0; i--) {
      if (frags[i].start <= t && t < frags[i].end) return i;
    }
    return -1;
  }

  private onConfigChange(cfg: AppConfig): void {
    const prev = this.config?.videoSubtitles;
    this.config = cfg;
    if (!cfg.videoSubtitles.enabled) {
      this.teardownOverlay();
      this.fragments = [];
      return;
    }
    if (!this.overlay) {
      void this.load();
      return;
    }
    this.overlay.setStyle(cfg.videoSubtitles.style);
    // Re-translate if the chosen provider changed.
    if (prev && prev.providerId !== cfg.videoSubtitles.providerId) {
      void this.translateAll();
    }
  }

  private teardownOverlay(): void {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = 0;
    this.overlay?.destroy();
    this.overlay = null;
    this.lastIdx = -1;
  }

  private showError(message: string): void {
    if (!this.player) return;
    const tip = document.createElement('div');
    tip.className = 'rf-sub-error';
    tip.textContent = `ReadFlow 字幕：${message}`;
    this.player.appendChild(tip);
    window.setTimeout(() => tip.remove(), 6000);
  }

  destroy(): void {
    this.destroyed = true;
    this.unsub?.();
    this.teardownOverlay();
  }
}
