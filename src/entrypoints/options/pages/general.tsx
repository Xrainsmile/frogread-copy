import { useEffect, useState } from 'react';
import { useConfig } from '../store';
import {
  Section,
  Switch,
  Select,
  Button,
  ProviderSelect,
  ConfigCard,
  RadioPills,
  LinkButton,
} from '../components/ui';
import type { LanguageDetectionMode, TtsLangMode } from '../../../modules/config/types';
import { getVoices, onVoicesReady, speak, type VoiceInfo } from '../../../modules/tts/tts';

const SOURCE_LANG_OPTIONS = [
  { value: 'auto', label: '自动检测' },
  { value: 'en', label: '英语' },
  { value: 'zh-Hans', label: '简体中文' },
  { value: 'ja', label: '日语' },
  { value: 'ko', label: '韩语' },
  { value: 'fr', label: '法语' },
  { value: 'de', label: '德语' },
  { value: 'ru', label: '俄语' },
  { value: 'es', label: '西班牙语' },
];

const TARGET_LANG_OPTIONS = [
  { value: 'zh-Hans', label: '简体中文' },
  { value: 'zh-Hant', label: '繁体中文' },
  { value: 'en', label: '英语' },
  { value: 'ja', label: '日语' },
  { value: 'ko', label: '韩语' },
  { value: 'fr', label: '法语' },
  { value: 'de', label: '德语' },
  { value: 'ru', label: '俄语' },
  { value: 'es', label: '西班牙语' },
];

const LEVEL_OPTIONS = [
  { value: 'fluent', label: '地道流畅' },
  { value: 'plain', label: '平实易懂' },
  { value: 'formal', label: '正式书面' },
  { value: 'casual', label: '轻松口语' },
];

export default function GeneralPage() {
  const { config, update } = useConfig();
  const [voices, setVoices] = useState<VoiceInfo[]>([]);

  useEffect(() => {
    const load = () => setVoices(getVoices());
    load();
    return onVoicesReady(load);
  }, []);

  const navTo = (id: string) => {
    window.location.hash = '/' + id;
  };

  const providers = (config.providersConfig || [])
    .filter((p) => p.enabled)
    .map((p) => ({ id: p.id, name: p.name }));

  const actions = config.customActions || [];
  const enabledActions = actions.filter((a) => a.enabled).length;

  return (
    <div>
      <Section title="基础设置">
        <ConfigCard title="界面语言" desc="选项页与部分提示文案的语言。">
          <Select
            value={config.general.uiLanguage}
            onChange={(v) =>
              update((d) => {
                d.general.uiLanguage = v as typeof d.general.uiLanguage;
              })
            }
            options={[
              { value: 'zh-CN', label: '简体中文' },
              { value: 'en', label: 'English' },
            ]}
          />
        </ConfigCard>
        <ConfigCard title="默认源语言" desc="网页 / 划词翻译的源语言，自动检测在生产环境更稳。">
          <Select
            value={config.general.sourceLang}
            onChange={(v) => update((d) => { d.general.sourceLang = v; })}
            options={SOURCE_LANG_OPTIONS}
          />
        </ConfigCard>
        <ConfigCard title="默认目标语言" desc="译文语言。">
          <Select
            value={config.general.targetLang}
            onChange={(v) => update((d) => { d.general.targetLang = v; })}
            options={TARGET_LANG_OPTIONS}
          />
        </ConfigCard>
        <ConfigCard title="翻译等级" desc="译文的风格取向。">
          <Select
            value={config.general.level}
            onChange={(v) =>
              update((d) => {
                d.general.level = v as typeof d.general.level;
              })
            }
            options={LEVEL_OPTIONS}
          />
        </ConfigCard>
      </Section>

      <Section title="功能提供商">
        <ConfigCard title="划词翻译" desc="选区浮层中的翻译 / 解释 / 词典使用的模型。">
          <ProviderSelect
            value={config.selection.providerId}
            onChange={(v) => update((d) => { d.selection.providerId = v; })}
            providers={providers}
          />
        </ConfigCard>
        <ConfigCard title="网页翻译" desc="整页 / 选中段落翻译使用的模型。">
          <ProviderSelect
            value={config.translate.providerId}
            onChange={(v) => update((d) => { d.translate.providerId = v; })}
            providers={providers}
          />
        </ConfigCard>
        <ConfigCard title="视频字幕" desc="视频字幕翻译使用的模型。">
          <ProviderSelect
            value={config.videoSubtitles.providerId}
            onChange={(v) => update((d) => { d.videoSubtitles.providerId = v; })}
            providers={providers}
          />
        </ConfigCard>
        <ConfigCard title="输入翻译" desc="输入框内联翻译（⌥T）使用的模型。">
          <ProviderSelect
            value={config.inputTranslation.providerId}
            onChange={(v) => update((d) => { d.inputTranslation.providerId = v; })}
            providers={providers}
          />
        </ConfigCard>
      </Section>

      <Section title="语言检测">
        <ConfigCard
          title="检测模式"
          desc="基础：按字符脚本本地启发式判断（离线、秒回）；智能：调用下方提供商返回语言代码。"
        >
          <RadioPills<LanguageDetectionMode>
            value={config.languageDetection.mode}
            onChange={(v) => update((d) => { d.languageDetection.mode = v; })}
            options={[
              { value: 'basic', label: '基础' },
              { value: 'llm', label: '智能 (LLM)' },
            ]}
          />
        </ConfigCard>
        {config.languageDetection.mode === 'llm' && (
          <ConfigCard title="检测提供商" desc="用于识别语言的模型。">
            <ProviderSelect
              value={config.languageDetection.providerId}
              onChange={(v) => update((d) => { d.languageDetection.providerId = v; })}
              providers={providers}
            />
          </ConfigCard>
        )}
      </Section>

      <Section title="自定义 AI 指令">
        <ConfigCard
          title="自定义指令"
          desc={`当前已启用 ${enabledActions} / ${actions.length} 条指令，可在划词浮层「更多」中调用。`}
        >
          <LinkButton label="管理指令 →" onClick={() => navTo('custom-actions')} />
        </ConfigCard>
      </Section>

      <Section title="翻译设置">
        <ConfigCard title="默认翻译模式" desc="网页翻译的默认目标呈现方式。">
          <Select
            value={config.translate.mode}
            onChange={(v) =>
              update((d) => {
                d.translate.mode = v as typeof d.translate.mode;
              })
            }
            options={[
              { value: 'full', label: '整页替换' },
              { value: 'bilingual', label: '对照（保留原文）' },
              { value: 'hover', label: '悬停显示' },
            ]}
          />
        </ConfigCard>
        <ConfigCard title="悬停显示原文" desc="对照 / 悬停模式下，鼠标悬停时显示原文。">
          <Switch
            checked={config.translate.showOriginalOnHover}
            onChange={(v) => update((d) => { d.translate.showOriginalOnHover = v; })}
          />
        </ConfigCard>
        <ConfigCard title="更多翻译设置" desc="翻译快捷键、PDF、缓存等。">
          <LinkButton label="打开翻译设置 →" onClick={() => navTo('translation')} />
        </ConfigCard>
      </Section>

      <Section title="悬浮工具">
        <ConfigCard title="启用悬浮工具" desc="在任意网页右下角显示翻译悬浮按钮。">
          <Switch
            checked={config.floatingButton.enabled}
            onChange={(v) => update((d) => { d.floatingButton.enabled = v; })}
          />
        </ConfigCard>
        <ConfigCard title="点击动作" desc="点击悬浮按钮时的默认行为。">
          <RadioPills<'translate' | 'popup'>
            value={config.floatingButton.clickAction}
            onChange={(v) => update((d) => { d.floatingButton.clickAction = v; })}
            options={[
              { value: 'translate', label: '直接翻译' },
              { value: 'popup', label: '弹出菜单' },
            ]}
          />
        </ConfigCard>
        <ConfigCard title="锁定位置" desc="锁定后不再随页面滚动微调。">
          <Switch
            checked={config.floatingButton.locked}
            onChange={(v) => update((d) => { d.floatingButton.locked = v; })}
          />
        </ConfigCard>
        <ConfigCard title="更多悬浮工具设置" desc="位置、边、禁用站点等。">
          <LinkButton label="打开悬浮工具设置 →" onClick={() => navTo('floating-button')} />
        </ConfigCard>
      </Section>

      <Section title="选区工具条">
        <ConfigCard title="启用选区工具条" desc="关闭后划词不再弹出工具条（右键菜单不受影响）。">
          <Switch
            checked={config.selection.enabled}
            onChange={(v) => update((d) => { d.selection.enabled = v; })}
          />
        </ConfigCard>
        <ConfigCard title="隐藏规则" desc="这些网站不显示选区工具条（每行一个，支持 * 通配）。">
          <textarea
            className="rf-textarea"
            rows={3}
            value={config.selection.disabledPatterns.join('\n')}
            onChange={(e) =>
              update((d) => {
                d.selection.disabledPatterns = e.target.value
                  .split('\n')
                  .map((s) => s.trim())
                  .filter(Boolean);
              })
            }
          />
        </ConfigCard>
      </Section>

      <Section title="右键菜单">
        <ConfigCard title="启用右键菜单" desc="关闭后不再注册自定义右键菜单项。">
          <Switch
            checked={config.contextMenu.enabled}
            onChange={(v) => update((d) => { d.contextMenu.enabled = v; })}
          />
        </ConfigCard>
        <ConfigCard
          title="可用菜单项"
          desc="开启后将自动注册：翻译此页面、翻译选中文字、朗读选中文字，以及已启用的自定义指令。"
        >
          <LinkButton label="管理自定义指令 →" onClick={() => navTo('custom-actions')} />
        </ConfigCard>
      </Section>

      <Section title="文本转语音">
        <ConfigCard
          title="启用朗读"
          desc="在划词浮层显示「朗读」按钮，使用浏览器内置语音合成（Web Speech API）。"
        >
          <Switch checked={config.tts.enabled} onChange={(v) => update((d) => { d.tts.enabled = v; })} />
        </ConfigCard>
        <ConfigCard
          title="发音人"
          desc="选择语音合成使用的音色（部分浏览器需先在页面上触发一次合成以加载列表）。"
        >
          <Select
            value={config.tts.voiceURI}
            onChange={(v) => update((d) => { d.tts.voiceURI = v; })}
            options={[
              { value: '', label: '默认音色' },
              ...voices.map((v) => ({ value: v.voiceURI, label: `${v.name}（${v.lang}）` })),
            ]}
          />
        </ConfigCard>
        <ConfigCard title="语速" desc="0.5 – 2 倍。">
          <div className="rf-slider-row">
            <input
              type="range"
              min={0.5}
              max={2}
              step={0.1}
              value={config.tts.rate}
              onChange={(e) => update((d) => { d.tts.rate = Number(e.target.value); })}
            />
            <span className="rf-slider-val">{config.tts.rate.toFixed(1)}x</span>
          </div>
        </ConfigCard>
        <ConfigCard title="音调" desc="0 – 2。">
          <div className="rf-slider-row">
            <input
              type="range"
              min={0}
              max={2}
              step={0.1}
              value={config.tts.pitch}
              onChange={(e) => update((d) => { d.tts.pitch = Number(e.target.value); })}
            />
            <span className="rf-slider-val">{config.tts.pitch.toFixed(1)}</span>
          </div>
        </ConfigCard>
        <ConfigCard title="音量" desc="0 – 1。">
          <div className="rf-slider-row">
            <input
              type="range"
              min={0}
              max={1}
              step={0.1}
              value={config.tts.volume}
              onChange={(e) => update((d) => { d.tts.volume = Number(e.target.value); })}
            />
            <span className="rf-slider-val">{config.tts.volume.toFixed(1)}</span>
          </div>
        </ConfigCard>
        <ConfigCard
          title="朗读语言"
          desc="自动：跟随页面语言；目标语言：使用默认目标语言；自定义：指定语言代码。"
        >
          <RadioPills<TtsLangMode>
            value={config.tts.langMode}
            onChange={(v) => update((d) => { d.tts.langMode = v; })}
            options={[
              { value: 'auto', label: '自动' },
              { value: 'target', label: '目标语言' },
              { value: 'custom', label: '自定义' },
            ]}
          />
        </ConfigCard>
        {config.tts.langMode === 'custom' && (
          <ConfigCard title="自定义语言代码" desc="BCP-47 代码，如 zh-CN、en-US、ja-JP。">
            <input
              className="rf-input"
              style={{ width: 160 }}
              value={config.tts.customLang}
              onChange={(e) => update((d) => { d.tts.customLang = e.target.value; })}
              placeholder="zh-CN"
            />
          </ConfigCard>
        )}
        <ConfigCard title="试听" desc="使用当前设置朗读一段示例文本。">
          <Button small onClick={() => speak('这是一段用于测试语音合成的示例文本。', config.tts, config)}>
            ▶ 试听
          </Button>
        </ConfigCard>
      </Section>
    </div>
  );
}
