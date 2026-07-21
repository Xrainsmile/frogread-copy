import { useConfig } from '../store';
import type { TranslationStylePreset } from '../../../modules/config/types';
import { Section, Field, Switch, Select, NumberInput, Textarea, ProviderSelect, PatternListEditor } from '../components/ui';

const STYLE_OPTIONS: { value: TranslationStylePreset; label: string }[] = [
  { value: 'underline', label: '下划线' },
  { value: 'dashed', label: '虚线下划线' },
  { value: 'dotted', label: '点线下划线' },
  { value: 'wavy', label: '波浪线' },
  { value: 'highlight', label: '高亮' },
  { value: 'blockquote', label: '引用块' },
  { value: 'none', label: '无样式' },
];

export default function TranslationPage() {
  const { config, update } = useConfig();
  const t = config.translate;
  const providers = config.providersConfig;

  return (
    <div>
      <h1 className="rf-page-title">翻译</h1>
      <p className="rf-page-desc">页面翻译的行为、范围、并发与样式。</p>

      <Section title="基本">
        <Field label="翻译提供商">
          <ProviderSelect value={t.providerId} onChange={(v) => update((d) => { d.translate.providerId = v; })} providers={providers} />
        </Field>
        <Field label="显示模式">
          <Select
            value={t.mode}
            onChange={(v) => update((d) => { d.translate.mode = v as typeof t.mode; })}
            options={[
              { value: 'bilingual', label: '双语（原文 + 译文）' },
              { value: 'translated-only', label: '仅译文' },
            ]}
          />
        </Field>
        <Field label="悬停显示原文" desc="在译文上悬停时临时显示被翻译的原句。">
          <Switch checked={t.showOriginalOnHover} onChange={(v) => update((d) => { d.translate.showOriginalOnHover = v; })} />
        </Field>
        <Field label="AI 内容感知" desc="将网页标题 / 术语表注入提示词，提升上下文一致性。">
          <Switch checked={t.enableAIContentAware} onChange={(v) => update((d) => { d.translate.enableAIContentAware = v; })} />
        </Field>
      </Section>

      <Section title="单句翻译">
        <Field label="启用悬停 + 快捷键翻译单句">
          <Switch checked={t.node.enabled} onChange={(v) => update((d) => { d.translate.node.enabled = v; })} />
        </Field>
        <Field label="触发修饰键">
          <Select
            value={t.node.hotkey}
            onChange={(v) => update((d) => { d.translate.node.hotkey = v as typeof t.node.hotkey; })}
            options={[
              { value: 'control', label: 'Ctrl' },
              { value: 'alt', label: 'Alt' },
              { value: 'shift', label: 'Shift' },
            ]}
          />
        </Field>
      </Section>

      <Section title="整页翻译">
        <Field label="翻译范围">
          <Select
            value={t.page.range}
            onChange={(v) => update((d) => { d.translate.page.range = v as typeof t.page.range; })}
            options={[
              { value: 'main', label: '正文区域' },
              { value: 'all', label: '整页（含侧栏/页脚）' },
            ]}
          />
        </Field>
        <Field label="单节点最少词数" desc="低于该词数的文本节点不翻译。">
          <NumberInput value={t.page.minWordsPerNode} min={1} onChange={(v) => update((d) => { d.translate.page.minWordsPerNode = v; })} />
        </Field>
        <Field label="自动翻译匹配的网址" desc="打开这些网址时自动整页翻译。" vertical>
          <PatternListEditor
            patterns={t.page.autoTranslatePatterns}
            onChange={(next) => update((d) => { d.translate.page.autoTranslatePatterns = next; })}
          />
        </Field>
        <Field label="永不自动翻译的网址" desc="即使命中上方规则也跳过。" vertical>
          <PatternListEditor
            patterns={t.page.neverAutoTranslatePatterns}
            onChange={(next) => update((d) => { d.translate.page.neverAutoTranslatePatterns = next; })}
          />
        </Field>
      </Section>

      <Section title="性能（请求队列）">
        <Field label="并发请求数">
          <NumberInput value={t.requestQueue.capacity} min={1} onChange={(v) => update((d) => { d.translate.requestQueue.capacity = v; })} />
        </Field>
        <Field label="每秒请求速率">
          <NumberInput value={t.requestQueue.rate} min={1} onChange={(v) => update((d) => { d.translate.requestQueue.rate = v; })} />
        </Field>
        <Field label="每批最大字符数">
          <NumberInput value={t.batchQueue.maxCharactersPerBatch} min={1} onChange={(v) => update((d) => { d.translate.batchQueue.maxCharactersPerBatch = v; })} />
        </Field>
        <Field label="每批最大条数">
          <NumberInput value={t.batchQueue.maxItemsPerBatch} min={1} onChange={(v) => update((d) => { d.translate.batchQueue.maxItemsPerBatch = v; })} />
        </Field>
      </Section>

      <Section title="样式">
        <Field label="译文样式预设">
          <Select
            value={t.nodeStyle.preset}
            onChange={(v) => update((d) => { d.translate.nodeStyle.preset = v as TranslationStylePreset; })}
            options={STYLE_OPTIONS}
          />
        </Field>
        <Field label="自定义 CSS" desc="留空则使用预设样式；填写后覆盖预设。" vertical>
          <Textarea
            value={t.nodeStyle.customCSS ?? ''}
            onChange={(v) => update((d) => { d.translate.nodeStyle.customCSS = v === '' ? null : v; })}
            rows={4}
            placeholder=".rf-translation { color: #555; }"
          />
        </Field>
      </Section>

      <Section title="高级提示词">
        <Field label="自定义翻译系统提示词" desc="留空使用内置提示词。" vertical>
          <Textarea
            value={t.customPrompt}
            onChange={(v) => update((d) => { d.translate.customPrompt = v; })}
            rows={4}
            placeholder="你是一名专业译者，请将下方内容翻译为{{targetLang}}…"
          />
        </Field>
      </Section>
    </div>
  );
}
