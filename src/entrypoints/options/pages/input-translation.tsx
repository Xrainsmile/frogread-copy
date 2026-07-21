import { useConfig } from '../store';
import { Section, Field, Switch, TextInput, NumberInput, ProviderSelect } from '../components/ui';

export default function InputTranslationPage() {
  const { config, update } = useConfig();
  const i = config.inputTranslation;
  const providers = config.providersConfig;

  return (
    <div>
      <h1 className="rf-page-title">输入翻译</h1>
      <p className="rf-page-desc">
        在网页输入框内触发翻译（如连续按空格三下）。可把 <code>sourceCode</code> / <code>targetCode</code> 作为动态语种。
      </p>

      <Section title="基本">
        <Field label="启用输入翻译">
          <Switch checked={i.enabled} onChange={(v) => update((d) => { d.inputTranslation.enabled = v; })} />
        </Field>
        <Field label="翻译提供商">
          <ProviderSelect value={i.providerId} onChange={(v) => update((d) => { d.inputTranslation.providerId = v; })} providers={providers} />
        </Field>
      </Section>

      <Section title="语种">
        <Field label="源语言" desc="可填语言代码，或 sourceCode 表示当前网页源语言。">
          <TextInput value={i.fromLang} onChange={(v) => update((d) => { d.inputTranslation.fromLang = v; })} placeholder="auto / sourceCode" />
        </Field>
        <Field label="目标语言" desc="可填语言代码，或 targetCode 表示默认目标语言。">
          <TextInput value={i.toLang} onChange={(v) => update((d) => { d.inputTranslation.toLang = v; })} placeholder="zh-Hans / targetCode" />
        </Field>
        <Field label="循环切换源/目标" desc="重复触发时在源与目标间来回切换。">
          <Switch checked={i.enableCycle} onChange={(v) => update((d) => { d.inputTranslation.enableCycle = v; })} />
        </Field>
      </Section>

      <Section title="触发">
        <Field label="触发按键" desc="例如 3xSpace（连按空格三次）、ctrl+enter。">
          <TextInput value={i.triggerKey} onChange={(v) => update((d) => { d.inputTranslation.triggerKey = v; })} placeholder="3xSpace" />
        </Field>
        <Field label="连击窗口 (ms)" desc="在此时间内的重复按键视为一次触发。">
          <NumberInput value={i.timeThreshold} min={100} step={50} onChange={(v) => update((d) => { d.inputTranslation.timeThreshold = v; })} />
        </Field>
      </Section>
    </div>
  );
}
