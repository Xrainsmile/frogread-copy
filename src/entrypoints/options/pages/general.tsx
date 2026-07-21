import { useConfig } from '../store';
import { Section, Field, Select } from '../components/ui';
import { SOURCE_LANG_OPTIONS, TARGET_LANG_OPTIONS } from '../constants';

export default function GeneralPage() {
  const { config, update } = useConfig();
  const g = config.general;
  return (
    <div>
      <h1 className="rf-page-title">通用</h1>
      <p className="rf-page-desc">界面语言、默认翻译语种与学习层级。</p>

      <Section title="界面与语言">
        <Field label="界面语言" desc="扩展界面的显示语言。">
          <Select
            value={g.uiLanguage}
            onChange={(v) => update((d) => { d.general.uiLanguage = v as typeof g.uiLanguage; })}
            options={[
              { value: 'auto', label: '跟随系统' },
              { value: 'zh', label: '简体中文' },
              { value: 'en', label: 'English' },
            ]}
          />
        </Field>

        <Field label="源语言" desc="需要被翻译的原文语言，默认自动检测。">
          <Select
            value={g.sourceLang}
            onChange={(v) => update((d) => { d.general.sourceLang = v; })}
            options={SOURCE_LANG_OPTIONS}
          />
        </Field>

        <Field label="目标语言" desc="翻译结果的目标语言。">
          <Select
            value={g.targetLang}
            onChange={(v) => update((d) => { d.general.targetLang = v; })}
            options={TARGET_LANG_OPTIONS}
          />
        </Field>
      </Section>

      <Section title="学习层级">
        <Field
          label="水平"
          desc="影响解释、总结等 AI 指令的措辞深度与示例详细程度。"
        >
          <Select
            value={g.level}
            onChange={(v) => update((d) => { d.general.level = v as typeof g.level; })}
            options={[
              { value: 'beginner', label: '入门' },
              { value: 'intermediate', label: '进阶' },
              { value: 'advanced', label: '高级' },
            ]}
          />
        </Field>
      </Section>
    </div>
  );
}
