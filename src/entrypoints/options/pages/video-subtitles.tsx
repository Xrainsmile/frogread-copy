import { useConfig } from '../store';
import type { SubtitleTextStyle } from '../../../modules/config/types';
import { Section, Field, Switch, Select, Slider, ProviderSelect } from '../components/ui';

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <Field label={label}>
      <input type="color" className="rf-color" value={value} onChange={(e) => onChange(e.target.value)} />
    </Field>
  );
}

function TextStyleEditor({ title, style, set }: { title: string; style: SubtitleTextStyle; set: (fn: (s: SubtitleTextStyle) => void) => void }) {
  return (
    <Section title={title}>
      <Field label="字号缩放">
        <Slider
          value={style.fontScale}
          min={0.5}
          max={2.5}
          step={0.1}
          format={(v) => `${v.toFixed(1)}x`}
          onChange={(v) => set((s) => { s.fontScale = v; })}
        />
      </Field>
      <ColorField label="文字颜色" value={style.color} onChange={(v) => set((s) => { s.color = v; })} />
      <Field label="字重">
        <Slider
          value={style.fontWeight}
          min={100}
          max={900}
          step={100}
          format={(v) => String(v)}
          onChange={(v) => set((s) => { s.fontWeight = v; })}
        />
      </Field>
    </Section>
  );
}

export default function VideoSubtitlesPage() {
  const { config, update } = useConfig();
  const v = config.videoSubtitles;
  const providers = config.providersConfig;
  const setStyle = (fn: (s: typeof v.style) => void) => update((d) => fn(d.videoSubtitles.style as typeof v.style));

  return (
    <div>
      <h1 className="rf-page-title">视频字幕</h1>
      <p className="rf-page-desc">为在线视频实时生成翻译字幕（需页面内嵌字幕轨道或借助字幕抓取）。</p>

      <Section title="基本">
        <Field label="启用视频字幕">
          <Switch checked={v.enabled} onChange={(val) => update((d) => { d.videoSubtitles.enabled = val; })} />
        </Field>
        <Field label="进入视频页自动开始">
          <Switch checked={v.autoStart} onChange={(val) => update((d) => { d.videoSubtitles.autoStart = val; })} />
        </Field>
        <Field label="翻译提供商">
          <ProviderSelect value={v.providerId} onChange={(val) => update((d) => { d.videoSubtitles.providerId = val; })} providers={providers} />
        </Field>
      </Section>

      <Section title="样式">
        <Field label="显示模式">
          <Select
            value={v.style.displayMode}
            onChange={(val) => setStyle((s) => { s.displayMode = val as typeof v.style.displayMode; })}
            options={[
              { value: 'bilingual', label: '双语' },
              { value: 'translation-only', label: '仅译文' },
            ]}
          />
        </Field>
        <Field label="译文位置">
          <Select
            value={v.style.translationPosition}
            onChange={(val) => setStyle((s) => { s.translationPosition = val as typeof v.style.translationPosition; })}
            options={[
              { value: 'top', label: '顶部' },
              { value: 'bottom', label: '底部' },
            ]}
          />
        </Field>
        <Field label="背景不透明度">
          <Slider
            value={v.style.backgroundOpacity}
            min={0}
            max={1}
            step={0.05}
            format={(val) => `${Math.round(val * 100)}%`}
            onChange={(val) => setStyle((s) => { s.backgroundOpacity = val; })}
          />
        </Field>
      </Section>

      <TextStyleEditor
        title="原文字幕样式"
        style={v.style.main}
        set={(fn) => setStyle((s) => fn(s.main))}
      />
      <TextStyleEditor
        title="翻译字幕样式"
        style={v.style.translation}
        set={(fn) => setStyle((s) => fn(s.translation))}
      />
    </div>
  );
}
