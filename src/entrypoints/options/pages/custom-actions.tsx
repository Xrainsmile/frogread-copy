import { useConfig } from '../store';
import type { CustomAction } from '../../../modules/config/types';
import { Section, Field, Switch, TextInput, Textarea, Button, ProviderSelect } from '../components/ui';

function ActionCard({ action }: { action: CustomAction }) {
  const { config, update } = useConfig();
  const set = (fn: (a: CustomAction) => void) =>
    update((d) => {
      const t = d.customActions.find((a) => a.id === action.id);
      if (t) fn(t);
    });
  const remove = () =>
    update((d) => {
      d.customActions = d.customActions.filter((a) => a.id !== action.id);
    });

  return (
    <div className="rf-provider-card">
      <div className="rf-provider-head">
        <span className="rf-provider-badge">{action.icon || '⚙'}</span>
        <strong>{action.name || '(未命名指令)'}</strong>
        <span className={action.enabled ? 'rf-badge-ok' : 'rf-badge-off'}>
          {action.enabled ? '已启用' : '已停用'}
        </span>
      </div>
      <div className="rf-provider-body">
        <Field label="名称">
          <TextInput value={action.name} onChange={(v) => set((a) => { a.name = v; })} placeholder="例如：解释" />
        </Field>
        <Field label="图标 (Emoji)">
          <TextInput value={action.icon} onChange={(v) => set((a) => { a.icon = v; })} placeholder="💡" />
        </Field>
        <Field label="使用的提供商">
          <ProviderSelect
            value={action.providerId}
            onChange={(v) => set((a) => { a.providerId = v; })}
            providers={config.providersConfig}
          />
        </Field>
        <Field label="提示词" desc="可用占位符：{{text}} 原文、{{targetLang}} 目标语言。" vertical>
          <Textarea
            value={action.prompt}
            onChange={(v) => set((a) => { a.prompt = v; })}
            rows={5}
            placeholder="你是一名语言老师，请用{{targetLang}}解释：\n\n{{text}}"
          />
        </Field>
        <Field label="在划词工具栏中显示">
          <Switch checked={action.enabled} onChange={(v) => set((a) => { a.enabled = v; })} />
        </Field>
        <Field label="删除该指令">
          <Button small variant="danger" onClick={remove}>
            删除
          </Button>
        </Field>
      </div>
    </div>
  );
}

export default function CustomActionsPage() {
  const { config, update } = useConfig();
  const add = () =>
    update((d) => {
      d.customActions.push({
        id: `action-${Date.now()}`,
        name: '新指令',
        icon: '✨',
        providerId: config.providersConfig[0]?.id ?? '',
        prompt: '请处理下面的内容：\n\n{{text}}',
        enabled: true,
      });
    });

  return (
    <div>
      <h1 className="rf-page-title">自定义 AI 指令</h1>
      <p className="rf-page-desc">
        在划词工具栏中追加自定义操作（如解释、总结、润色）。支持占位符 {'{{text}}'} 与 {'{{targetLang}}'}。
      </p>
      <Section>
        {config.customActions.map((a) => (
          <ActionCard key={a.id} action={a} />
        ))}
        <div style={{ padding: '14px 0' }}>
          <Button variant="primary" small onClick={add}>
            + 添加指令
          </Button>
        </div>
      </Section>
    </div>
  );
}
