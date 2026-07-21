import { useState } from 'react';
import { useConfig } from '../store';
import type { ProviderConfig, ProviderType } from '../../../modules/config/types';
import { PROVIDERS } from '../../../modules/ai';
import { saveConfig } from '../../../modules/config/storage';
import { sendToBackground } from '../../../modules/utils/bg-messaging';
import {
  Section,
  Field,
  Switch,
  TextInput,
  Button,
  ProviderSelect,
} from '../components/ui';

/** 内置提供商的 logo 路径（public/icons/ 下的文件） */
const PROVIDER_LOGOS: Record<string, string> = {
  taiji: '/icons/provider-taiji.png',
  hunyuan: '/icons/provider-hunyuan.png',
  fat: '/icons/provider-fat.png',
  deepseek: '/icons/provider-deepseek.png',
};

function ProviderLogo({ type }: { type: string }) {
  const src = PROVIDER_LOGOS[type];
  if (!src) return null;
  return <img src={src} alt="" className="rf-provider-logo" />;
}

const PROVIDER_TYPE_OPTIONS: { value: ProviderType; label: string }[] = [
  { value: 'hunyuan', label: '混元 Hunyuan' },
  { value: 'taiji', label: '太极 Taiji' },
  { value: 'fat', label: 'FAT 公司 AI 网关' },
  { value: 'deepseek', label: 'DeepSeek' },
  { value: 'glm', label: '智谱 GLM' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'siliconflow', label: 'SiliconFlow' },
  { value: 'custom', label: '自定义 OpenAI 兼容' },
];

function ProviderCard({ cfg }: { cfg: ProviderConfig }) {
  const { config, update } = useConfig();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [testing, setTesting] = useState(false);

  const set = (fn: (c: ProviderConfig) => void) =>
    update((d) => {
      const t = d.providersConfig.find((p) => p.id === cfg.id);
      if (t) fn(t);
    });

  const test = async () => {
    setTesting(true);
    setStatus(null);
    try {
      // Persist current edits (incl. the key) so the background can read them
      // from local storage — the key is never sent in the message.
      await saveConfig(config);
      const res = await sendToBackground<{ ok: boolean; message: string }>({
        type: 'test-connection',
        providerId: cfg.id,
      });
      setStatus(res);
    } catch (e) {
      setStatus({ ok: false, message: String(e) });
    } finally {
      setTesting(false);
    }
  };

  const remove = () =>
    update((d) => {
      d.providersConfig = d.providersConfig.filter((p) => p.id !== cfg.id);
    });

  return (
    <div className="rf-provider-card">
      <div className="rf-provider-head" onClick={() => setOpen((o) => !o)}>
        <span className="rf-provider-badge">
          <ProviderLogo type={cfg.provider} />
          {PROVIDER_TYPE_OPTIONS.find((o) => o.value === cfg.provider)?.label ?? cfg.provider}
        </span>
        <strong>{cfg.name || '(未命名)'}</strong>
        <span className={cfg.enabled ? 'rf-badge-ok' : 'rf-badge-off'}>
          {cfg.enabled ? '已启用' : '已停用'}
        </span>
        <span className="rf-spacer" />
        <span className="rf-nav-icon">{open ? '▴' : '▾'}</span>
      </div>
      {open && (
        <div className="rf-provider-body">
          <Field label="显示名称">
            <TextInput
              value={cfg.name}
              onChange={(v) => set((c) => { c.name = v; })}
              placeholder="例如：我的混元"
            />
          </Field>
          <Field label="类型" desc="底层接口协议，切换后会保留已填密钥。">
            <ProviderSelect
              value={cfg.provider}
              onChange={(v) => set((c) => { c.provider = v as ProviderType; })}
              providers={PROVIDER_TYPE_OPTIONS.map((o) => ({ id: o.value, name: o.label }))}
            />
          </Field>
          <Field label="接口地址 (Base URL)" desc="留空则使用该类厂商的默认地址。">
            <TextInput
              value={cfg.baseURL}
              onChange={(v) => set((c) => { c.baseURL = v; })}
              placeholder="留空使用默认"
            />
          </Field>
          <Field label="API Key / 令牌">
            <TextInput
              value={cfg.apiKey}
              onChange={(v) => set((c) => { c.apiKey = v; })}
              password
              placeholder="sk-..."
            />
          </Field>
          <Field label="模型" desc="用于翻译 / 解释的模型 id。">
            <TextInput
              value={cfg.model}
              onChange={(v) => set((c) => { c.model = v; })}
              placeholder={PROVIDERS[cfg.provider]?.defaultModel ?? '模型 id'}
            />
          </Field>
          <Field label="启用该提供商" desc="关闭后不会出现在各功能的提供商下拉中。">
            <Switch checked={cfg.enabled} onChange={(v) => set((c) => { c.enabled = v; })} />
          </Field>
          <Field label="连接测试">
            <div className="rf-row">
              <Button small onClick={test} disabled={testing}>
                {testing ? '测试中…' : '测试连接'}
              </Button>
              {status && (
                <span className={`rf-inline-status ${status.ok ? 'ok' : 'err'}`}>
                  {status.ok ? '✓ ' : '✗ '}
                  {status.message}
                </span>
              )}
            </div>
          </Field>
          <Field label="删除该提供商">
            <Button small variant="danger" onClick={remove}>
              删除
            </Button>
          </Field>
        </div>
      )}
    </div>
  );
}

export default function ApiProvidersPage() {
  const { config, update } = useConfig();

  const add = () => {
    const id = `custom-${Date.now()}`;
    update((d) => {
      d.providersConfig.push({
        id,
        name: '新建提供商',
        provider: 'custom',
        apiKey: '',
        baseURL: '',
        model: '',
        enabled: true,
      });
    });
  };

  return (
    <div>
      <h1 className="rf-page-title">API 提供商</h1>
      <p className="rf-page-desc">
        配置一个或多个翻译后端。已内置混元、太极、FAT、DeepSeek，可继续添加自定义 OpenAI 兼容服务。
      </p>

      <Section>
        {config.providersConfig.map((cfg) => (
          <ProviderCard key={cfg.id} cfg={cfg} />
        ))}
        <div style={{ padding: '14px 0' }}>
          <Button variant="primary" small onClick={add}>
            + 添加提供商
          </Button>
        </div>
      </Section>
    </div>
  );
}
