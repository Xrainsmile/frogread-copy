import type { ReactNode } from 'react';

// ── Section container ────────────────────────────────────
export function Section({
  title,
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  return (
    <div className="rf-section">
      {title && <div className="rf-section-title">{title}</div>}
      {children}
    </div>
  );
}

// ── Field row (label + control) ──────────────────────────
export function Field({
  label,
  desc,
  children,
  vertical = false,
}: {
  label: ReactNode;
  desc?: ReactNode;
  children?: ReactNode;
  vertical?: boolean;
}) {
  return (
    <div className={`rf-field${vertical ? ' rf-field-col' : ''}`}>
      <div>
        <div className="rf-field-label">{label}</div>
        {desc && <div className="rf-field-desc">{desc}</div>}
      </div>
      {children && <div className="rf-field-control">{children}</div>}
    </div>
  );
}

// ── Switch ───────────────────────────────────────────────
export function Switch({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      className={`rf-switch${checked ? ' on' : ''}`}
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
    />
  );
}

// ── Select ───────────────────────────────────────────────
export function Select<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <select
      className="rf-select"
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

// ── Text input ───────────────────────────────────────────
export function TextInput({
  value,
  onChange,
  placeholder,
  type = 'text',
  password,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  password?: boolean;
}) {
  return (
    <input
      className="rf-input"
      type={password ? 'password' : type}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

// ── Number input ─────────────────────────────────────────
export function NumberInput({
  value,
  onChange,
  min,
  max,
  step,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <input
      className="rf-input"
      style={{ minWidth: 120 }}
      type="number"
      value={value}
      min={min}
      max={max}
      step={step}
      onChange={(e) => onChange(Number(e.target.value))}
    />
  );
}

// ── Slider ───────────────────────────────────────────────
export function Slider({
  value,
  onChange,
  min = 0,
  max = 1,
  step = 0.01,
  format,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  format?: (v: number) => string;
}) {
  return (
    <span className="rf-row">
      <input
        className="rf-slider"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className="rf-slider-value">
        {format ? format(value) : value}
      </span>
    </span>
  );
}

// ── Textarea ─────────────────────────────────────────────
export function Textarea({
  value,
  onChange,
  placeholder,
  rows,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <textarea
      className="rf-textarea"
      value={value}
      rows={rows}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

// ── Button ───────────────────────────────────────────────
export function Button({
  children,
  onClick,
  variant = 'default',
  small,
  disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'default' | 'primary' | 'danger';
  small?: boolean;
  disabled?: boolean;
}) {
  const cls = [
    'rf-btn',
    variant === 'primary' ? 'rf-btn-primary' : '',
    variant === 'danger' ? 'rf-btn-danger' : '',
    small ? 'rf-btn-sm' : '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <button type="button" className={cls} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

// ── Provider selector (built from current provider instances) ──
export function ProviderSelect({
  value,
  onChange,
  providers,
}: {
  value: string;
  onChange: (v: string) => void;
  providers: { id: string; name: string }[];
}) {
  const options = providers.map((p) => ({ value: p.id, label: p.name }));
  return (
    <Select
      value={value}
      onChange={onChange}
      options={options.length ? options : [{ value: '', label: '（无可用提供商）' }]}
    />
  );
}

// ── Pattern list editor (add/remove URL patterns) ────────
export function PatternListEditor({
  patterns,
  onChange,
  placeholder = '*.example.com/*',
}: {
  patterns: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}) {
  return (
    <div className="rf-pattern-list">
      {patterns.map((p, i) => (
        <div className="rf-pattern-row" key={i}>
          <input
            className="rf-input"
            value={p}
            placeholder={placeholder}
            onChange={(e) => {
              const next = [...patterns];
              next[i] = e.target.value;
              onChange(next);
            }}
          />
          <Button
            small
            variant="danger"
            onClick={() => onChange(patterns.filter((_, j) => j !== i))}
          >
            删除
          </Button>
        </div>
      ))}
      <div>
        <Button small onClick={() => onChange([...patterns, ''])}>
          + 添加规则
        </Button>
      </div>
    </div>
  );
}
