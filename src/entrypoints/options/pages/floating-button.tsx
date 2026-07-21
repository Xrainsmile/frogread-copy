import { useConfig } from '../store';
import { Section, Field, Switch, Select, Slider, PatternListEditor } from '../components/ui';

export default function FloatingButtonPage() {
  const { config, update } = useConfig();
  const f = config.floatingButton;

  return (
    <div>
      <h1 className="rf-page-title">悬浮工具</h1>
      <p className="rf-page-desc">页面侧边的常驻悬浮按钮，可一键翻译当前页或打开弹窗。</p>

      <Section title="基本">
        <Field label="启用悬浮按钮">
          <Switch checked={f.enabled} onChange={(v) => update((d) => { d.floatingButton.enabled = v; })} />
        </Field>
        <Field label="所在侧边">
          <Select
            value={f.side}
            onChange={(v) => update((d) => { d.floatingButton.side = v as typeof f.side; })}
            options={[
              { value: 'left', label: '左侧' },
              { value: 'right', label: '右侧' },
            ]}
          />
        </Field>
        <Field label="垂直位置">
          <Slider
            value={f.position}
            min={0}
            max={1}
            step={0.01}
            format={(v) => `${Math.round(v * 100)}%`}
            onChange={(v) => update((d) => { d.floatingButton.position = v; })}
          />
        </Field>
        <Field label="点击行为">
          <Select
            value={f.clickAction}
            onChange={(v) => update((d) => { d.floatingButton.clickAction = v as typeof f.clickAction; })}
            options={[
              { value: 'translate', label: '翻译当前页面' },
              { value: 'popup', label: '打开弹窗' },
            ]}
          />
        </Field>
        <Field label="锁定位置" desc="锁定后无法拖动，避免误触。">
          <Switch checked={f.locked} onChange={(v) => update((d) => { d.floatingButton.locked = v; })} />
        </Field>
      </Section>

      <Section title="隐藏规则">
        <Field label="隐藏悬浮按钮的网址" desc="在这些站点不显示悬浮按钮。" vertical>
          <PatternListEditor
            patterns={f.disabledPatterns}
            onChange={(next) => update((d) => { d.floatingButton.disabledPatterns = next; })}
          />
        </Field>
      </Section>
    </div>
  );
}
