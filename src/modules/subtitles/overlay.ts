import type { VideoSubtitlesConfig } from '../config/types';
import type { SubtitlesFragment } from './fetcher';

type Style = VideoSubtitlesConfig['style'];

const MODE_LABEL: Record<Style['displayMode'], string> = {
  bilingual: '双语',
  'translation-only': '仅译文',
};

export class SubtitlesOverlay {
  private container: HTMLElement;
  private originalEl: HTMLElement;
  private translationEl: HTMLElement;
  private toggleBtn: HTMLButtonElement;
  private modeBtn: HTMLButtonElement;
  private visible = true;
  private style: Style | null = null;
  private currentFragment: SubtitlesFragment | null = null;

  constructor(player: HTMLElement, onToggle: () => void, onCycle: () => void) {
    this.container = document.createElement('div');
    this.container.className = 'rf-sub-overlay';

    this.originalEl = document.createElement('div');
    this.originalEl.className = 'rf-sub-line rf-sub-original';

    this.translationEl = document.createElement('div');
    this.translationEl.className = 'rf-sub-line rf-sub-translation';

    const controls = document.createElement('div');
    controls.className = 'rf-sub-controls';

    this.toggleBtn = document.createElement('button');
    this.toggleBtn.type = 'button';
    this.toggleBtn.className = 'rf-sub-btn';
    this.toggleBtn.textContent = '隐藏';
    this.toggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      onToggle();
    });

    this.modeBtn = document.createElement('button');
    this.modeBtn.type = 'button';
    this.modeBtn.className = 'rf-sub-btn';
    this.modeBtn.textContent = '模式';
    this.modeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      onCycle();
    });

    controls.appendChild(this.toggleBtn);
    controls.appendChild(this.modeBtn);
    this.container.appendChild(this.originalEl);
    this.container.appendChild(this.translationEl);
    this.container.appendChild(controls);

    player.appendChild(this.container);
    this.setVisible(true);
  }

  setStyle(style: Style): void {
    this.style = style;
    this.applyStyle();
  }

  private applyStyle(): void {
    if (!this.style || !this.container) return;
    const s = this.style;
    this.container.classList.toggle('rf-sub-top', s.translationPosition === 'top');
    this.container.classList.toggle('rf-sub-bottom', s.translationPosition === 'bottom');
    this.container.style.background = `rgba(0,0,0,${s.backgroundOpacity})`;

    const main = s.main;
    this.originalEl.style.fontSize = `${main.fontScale}em`;
    this.originalEl.style.color = main.color;
    this.originalEl.style.fontWeight = String(main.fontWeight);

    const tr = s.translation;
    this.translationEl.style.fontSize = `${tr.fontScale}em`;
    this.translationEl.style.color = tr.color;
    this.translationEl.style.fontWeight = String(tr.fontWeight);
  }

  setVisible(v: boolean): void {
    this.visible = v;
    this.container.style.display = v ? '' : 'none';
    this.toggleBtn.textContent = v ? '隐藏' : '显示';
  }

  getVisible(): boolean {
    return this.visible;
  }

  cycleDisplayMode(): void {
    if (!this.style) return;
    const next: Style['displayMode'] =
      this.style.displayMode === 'bilingual' ? 'translation-only' : 'bilingual';
    this.style = { ...this.style, displayMode: next };
    this.applyStyle();
    this.modeBtn.textContent = MODE_LABEL[next];
    this.render(this.currentFragment);
  }

  render(fragment: SubtitlesFragment | null): void {
    this.currentFragment = fragment;
    if (!this.style) return;
    const mode = this.style.displayMode;
    const orig = fragment?.text ?? '';
    const tr = fragment?.translation ?? orig;

    if (mode === 'translation-only') {
      this.originalEl.style.display = 'none';
      this.translationEl.style.display = '';
      this.translationEl.textContent = tr;
    } else {
      this.originalEl.style.display = '';
      this.translationEl.style.display = '';
      this.originalEl.textContent = orig;
      this.translationEl.textContent = tr;
    }
  }

  destroy(): void {
    this.container?.remove();
  }
}
