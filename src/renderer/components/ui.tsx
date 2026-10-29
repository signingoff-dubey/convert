import { Check, X } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { ACCENT_PRESETS } from '../theme/themes';

/** Small component library (docs/03 section 5). Every control is keyboard accessible with a visible focus ring. */

export function Button({
  children,
  onClick,
  variant = 'default',
  disabled,
  title,
  type = 'button',
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'default' | 'primary' | 'ghost' | 'danger';
  disabled?: boolean;
  title?: string;
  type?: 'button' | 'submit';
}) {
  const styles = {
    default: 'bg-surface2 border-line hover:border-accent',
    primary: 'bg-accent text-on-accent border-transparent hover:bg-accent-hover',
    ghost: 'bg-transparent border-transparent hover:bg-surface2',
    danger: 'bg-transparent border-line text-danger hover:border-danger',
  }[variant];
  return (
    <button
      type={type}
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`no-drag inline-flex items-center justify-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition-colors duration-100 disabled:cursor-not-allowed disabled:opacity-45 ${styles}`}
    >
      {children}
    </button>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`no-drag relative h-6 w-11 shrink-0 rounded-full border transition-colors duration-100 disabled:opacity-45 ${
        checked ? 'border-transparent bg-accent' : 'border-line bg-surface2'
      }`}
    >
      <span
        className={`absolute top-0.5 h-4.5 w-4.5 rounded-full transition-all duration-100 ${
          checked ? 'left-[22px] bg-on-accent' : 'left-0.5 bg-muted'
        }`}
        style={{ height: 18, width: 18 }}
      />
    </button>
  );
}

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="no-drag inline-flex flex-wrap rounded-lg border border-line bg-surface2 p-0.5"
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={`rounded-md px-3 py-1 text-sm transition-colors duration-100 ${
            o.value === value ? 'bg-accent text-on-accent' : 'text-muted hover:text-ink'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Slider({
  value,
  min,
  max,
  step = 1,
  onChange,
  label,
  format,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  label: string;
  format?: (v: number) => string;
}) {
  return (
    <div className="no-drag flex items-center gap-3">
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 w-44 cursor-pointer accent-[var(--accent)]"
      />
      <span className="w-12 text-right text-sm tabular-nums text-muted">
        {format ? format(value) : value}
      </span>
    </div>
  );
}

export function Swatch({
  color,
  selected,
  onClick,
  label,
}: {
  color: string;
  selected: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={selected}
      onClick={onClick}
      className="no-drag grid h-7 w-7 place-items-center rounded-full border border-line"
      style={{ background: color }}
    >
      {selected && <Check size={14} color="#fff" strokeWidth={3} />}
    </button>
  );
}

export function ColorInput({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
}) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const valid = /^#[0-9a-fA-F]{6}$/.test(text);
  return (
    <span className="no-drag inline-flex items-center gap-2">
      <input
        type="color"
        aria-label={`${label} picker`}
        value={valid ? text : value}
        onChange={(e) => onChange(e.target.value.toUpperCase())}
        className="h-7 w-9 cursor-pointer rounded border border-line bg-transparent p-0"
      />
      <input
        type="text"
        aria-label={label}
        value={text}
        maxLength={7}
        onChange={(e) => {
          setText(e.target.value);
          if (/^#[0-9a-fA-F]{6}$/.test(e.target.value)) onChange(e.target.value.toUpperCase());
        }}
        className={`w-24 rounded-lg border bg-surface2 px-2 py-1 text-sm uppercase ${valid ? 'border-line' : 'border-danger'}`}
      />
    </span>
  );
}

export function SwatchRow({ value, onChange }: { value: string; onChange: (hex: string) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {Object.entries(ACCENT_PRESETS).map(([name, hex]) => (
        <Swatch
          key={name}
          color={hex}
          label={name}
          selected={value.toLowerCase() === hex.toLowerCase()}
          onClick={() => onChange(hex)}
        />
      ))}
      <ColorInput value={value} onChange={onChange} label="Custom accent" />
    </div>
  );
}

export function StatusBadge({ status }: { status: 'ok' | 'warning' | 'blocked' | 'checking' }) {
  const map = {
    ok: ['OK', 'text-success border-success/40'],
    warning: ['Warning', 'text-[#e0a100] border-[#e0a100]/40'],
    blocked: ['Blocked', 'text-danger border-danger/40'],
    checking: ['Checking', 'text-muted border-line'],
  } as const;
  const [label, cls] = map[status];
  return (
    <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${cls}`}>{label}</span>
  );
}

export function Section({
  title,
  children,
  description,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="mb-6">
      <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-muted">{title}</h2>
      {description && <p className="mb-2 text-sm text-muted">{description}</p>}
      <div className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
        {children}
      </div>
    </section>
  );
}

export function SettingRow({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-6 px-4 py-3">
      <div className="min-w-0">
        <div className="font-medium">{label}</div>
        {description && <div className="mt-0.5 text-sm text-muted">{description}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export function Callout({
  children,
  tone = 'info',
}: {
  children: ReactNode;
  tone?: 'info' | 'warning' | 'danger';
}) {
  const cls = {
    info: 'border-line bg-surface2',
    warning: 'border-[#e0a100]/50 bg-surface2',
    danger: 'border-danger/50 bg-surface2',
  }[tone];
  return <div className={`mb-4 rounded-xl border px-4 py-3 text-sm ${cls}`}>{children}</div>;
}

export function Dialog({
  title,
  children,
  onClose,
  actions,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  actions: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => {
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50">
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
        className="w-[420px] rounded-2xl border border-line bg-surface p-5 shadow-2xl"
      >
        <h3 id={id} className="mb-2 text-base font-semibold">
          {title}
        </h3>
        <div className="mb-4 text-sm text-muted">{children}</div>
        <div className="flex justify-end gap-2">{actions}</div>
      </div>
    </div>
  );
}

export function PathField({
  value,
  onPick,
  placeholder,
  onClear,
}: {
  value: string | null;
  onPick: () => void;
  placeholder: string;
  onClear?: () => void;
}) {
  return (
    <span className="no-drag inline-flex items-center gap-2">
      <span
        className="max-w-[260px] truncate rounded-lg border border-line bg-surface2 px-3 py-1.5 text-sm text-muted"
        title={value ?? ''}
      >
        {value ?? placeholder}
      </span>
      <Button onClick={onPick}>Browse</Button>
      {value && onClear && (
        <Button variant="ghost" onClick={onClear} title="Clear">
          <X size={16} />
        </Button>
      )}
    </span>
  );
}

export function KeyCap({ children, sub }: { children: ReactNode; sub?: string }) {
  return (
    <span
      className="inline-flex min-w-11 flex-col items-center justify-center rounded-lg border border-line bg-surface2 px-2.5 py-1 text-sm font-medium"
      style={{ boxShadow: '0 2px 0 var(--border)' }}
    >
      <span>{children}</span>
      {sub && <span className="text-[10px] font-normal text-muted">{sub}</span>}
    </span>
  );
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="mb-3 block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export const inputCls =
  'no-drag w-full rounded-lg border border-line bg-surface2 px-3 py-1.5 text-sm';

export function SortableList<T extends { id: string }>({
  items,
  render,
  onReorder,
  label,
}: {
  items: readonly T[];
  render: (item: T, index: number) => ReactNode;
  onReorder: (ids: string[]) => void;
  label: string;
}) {
  const [dragging, setDragging] = useState<string | null>(null);
  const move = (id: string, delta: number) => {
    const ids = items.map((i) => i.id);
    const from = ids.indexOf(id);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= ids.length) return;
    ids.splice(to, 0, ...ids.splice(from, 1));
    onReorder(ids);
  };
  return (
    <ul aria-label={label} className="divide-y divide-line">
      {items.map((item, i) => (
        <li
          key={item.id}
          draggable
          onDragStart={() => setDragging(item.id)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => {
            if (!dragging || dragging === item.id) return;
            const ids = items.map((x) => x.id).filter((x) => x !== dragging);
            ids.splice(i, 0, dragging);
            onReorder(ids);
            setDragging(null);
          }}
          onKeyDown={(e) => {
            if (e.altKey && e.key === 'ArrowUp') move(item.id, -1);
            if (e.altKey && e.key === 'ArrowDown') move(item.id, 1);
          }}
          tabIndex={0}
          className="flex items-center gap-3 px-4 py-2 outline-offset-[-2px]"
        >
          {render(item, i)}
        </li>
      ))}
    </ul>
  );
}
