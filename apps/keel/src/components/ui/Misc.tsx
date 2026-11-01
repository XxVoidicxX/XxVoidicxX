import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cx } from './cx';

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  eyebrow?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div className="page-header-text">
        {eyebrow && <p className="page-eyebrow">{eyebrow}</p>}
        <h1 className="page-title">{title}</h1>
        {description && <p className="page-desc">{description}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = 'brand',
  footer,
  onClick,
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  tone?: 'brand' | 'success' | 'warning' | 'danger' | 'neutral';
  footer?: ReactNode;
  onClick?: () => void;
}) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag className={cx('card', 'stat', onClick && 'stat-clickable')} onClick={onClick} type={onClick ? 'button' : undefined}>
      <div className="stat-top">
        <span className="stat-label">{label}</span>
        {icon && <span className={cx('stat-icon', `tone-${tone}`)}>{icon}</span>}
      </div>
      <div className="stat-value tabular">{value}</div>
      {hint && <div className="stat-hint">{hint}</div>}
      {footer && <div className="stat-footer">{footer}</div>}
    </Tag>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  compact,
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={cx('empty', compact && 'empty-compact')}>
      {icon && <div className="empty-icon">{icon}</div>}
      <p className="empty-title">{title}</p>
      {description && <p className="empty-desc">{description}</p>}
      {action && <div className="empty-action">{action}</div>}
    </div>
  );
}

const MONO_COLORS = ['#2058eb', '#7c3aed', '#0891b2', '#16a34a', '#ea580c', '#be123c', '#4f46e5', '#0d9488', '#b45309', '#c026d3'];

export function Monogram({ name, color, size = 36 }: { name: string; color?: string; size?: number }) {
  const letters =
    name
      .replace(/[^A-Za-z0-9 ]/g, ' ')
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join('') || '?';
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  const c = color ?? MONO_COLORS[h % MONO_COLORS.length];
  return (
    <span
      className="monogram"
      aria-hidden
      style={{ width: size, height: size, fontSize: Math.max(11, size * 0.38), color: `color-mix(in srgb, ${c} 65%, #000)`, background: `${c}14`, borderColor: `${c}2e` }}
    >
      {letters}
    </span>
  );
}

export function Progress({
  value,
  max = 100,
  tone = 'brand',
  label,
  size = 'md',
}: {
  value: number;
  max?: number;
  tone?: 'brand' | 'success' | 'warning' | 'danger';
  label?: string;
  size?: 'sm' | 'md';
}) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div
      className={cx('progress', `progress-${size}`)}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div className={cx('progress-fill', `tone-bg-${tone}`)} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="kbd">{children}</kbd>;
}

export interface MenuItem {
  label: ReactNode;
  icon?: ReactNode;
  onSelect: () => void;
  danger?: boolean;
  hint?: ReactNode;
}

export function Menu({
  trigger,
  items,
  align = 'end',
  label,
}: {
  trigger: (props: { onClick: () => void; 'aria-expanded': boolean; 'aria-haspopup': 'menu' }) => ReactNode;
  items: (MenuItem | 'divider')[];
  align?: 'start' | 'end';
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const focusTrigger = () => ref.current?.querySelector<HTMLElement>('[aria-haspopup]')?.focus();
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      focusTrigger();
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    const first = ref.current?.querySelector<HTMLElement>('[role="menuitem"]');
    first?.focus();
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="menu-wrap" ref={ref}>
      {trigger({ onClick: () => setOpen((o) => !o), 'aria-expanded': open, 'aria-haspopup': 'menu' })}
      {open && (
        <div
          className={cx('menu', `menu-${align}`)}
          role="menu"
          aria-label={label}
          onKeyDown={(e) => {
            const nodes = Array.from(ref.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
            const i = nodes.indexOf(document.activeElement as HTMLElement);
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              nodes[(i + 1) % nodes.length]?.focus();
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              nodes[(i - 1 + nodes.length) % nodes.length]?.focus();
            }
          }}
        >
          {items.map((item, i) =>
            item === 'divider' ? (
              <div key={`d${i}`} className="menu-divider" role="separator" />
            ) : (
              <button
                key={i}
                type="button"
                role="menuitem"
                className={cx('menu-item', item.danger && 'is-danger')}
                onClick={() => {
                  setOpen(false);
                  focusTrigger();
                  item.onSelect();
                }}
              >
                {item.icon && <span className="menu-icon">{item.icon}</span>}
                <span className="menu-label">{item.label}</span>
                {item.hint && <span className="menu-hint">{item.hint}</span>}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}

export function SearchInput({
  value,
  onChange,
  placeholder = 'Search…',
  className,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <div className={cx('search-input', className)}>
      <svg viewBox="0 0 20 20" width="16" height="16" aria-hidden>
        <circle cx="9" cy="9" r="6" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path d="M14 14l4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel ?? placeholder}
      />
    </div>
  );
}

export function DescriptionList({ items }: { items: { label: ReactNode; value: ReactNode }[] }) {
  return (
    <dl className="dl">
      {items.map((it, i) => (
        <div key={i} className="dl-row">
          <dt>{it.label}</dt>
          <dd>{it.value ?? '—'}</dd>
        </div>
      ))}
    </dl>
  );
}
