import type { ReactNode } from 'react';
import { cx } from './cx';

export interface SegmentOption<T extends string> {
  value: T;
  label: ReactNode;
  count?: number;
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  size = 'md',
  ariaLabel,
  className,
}: {
  options: SegmentOption<T>[];
  value: T;
  onChange: (v: T) => void;
  size?: 'sm' | 'md';
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <div className={cx('segmented', `segmented-${size}`, className)} role="tablist" aria-label={ariaLabel}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={o.value === value}
          className={cx('segment', o.value === value && 'is-active')}
          onClick={() => onChange(o.value)}
        >
          {o.label}
          {o.count !== undefined && <span className="segment-count">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}
