import { useConfig } from '../store';
import { Section, Field, Select, PatternListEditor } from '../components/ui';

export default function SiteRulesPage() {
  const { config, update } = useConfig();
  const s = config.siteRules;

  return (
    <div>
      <h1 className="rf-page-title">站点规则</h1>
      <p className="rf-page-desc">
        控制 ReadFlow 在哪些网站上生效。支持通配符，例如 <code>*.example.com/*</code> 或 <code>mail.google.com</code>。
      </p>

      <Section title="模式">
        <Field
          label="规则模式"
          desc="黑名单：除列表外全部启用；白名单：仅列表内启用。"
        >
          <Select
            value={s.mode}
            onChange={(v) => update((d) => { d.siteRules.mode = v as typeof s.mode; })}
            options={[
              { value: 'blacklist', label: '黑名单' },
              { value: 'whitelist', label: '白名单' },
            ]}
          />
        </Field>
      </Section>

      {s.mode === 'blacklist' ? (
        <Section title="黑名单（这些站点禁用）">
          <PatternListEditor
            patterns={s.blacklistPatterns}
            onChange={(next) => update((d) => { d.siteRules.blacklistPatterns = next; })}
          />
        </Section>
      ) : (
        <Section title="白名单（仅这些站点启用）">
          <PatternListEditor
            patterns={s.whitelistPatterns}
            onChange={(next) => update((d) => { d.siteRules.whitelistPatterns = next; })}
          />
        </Section>
      )}
    </div>
  );
}
