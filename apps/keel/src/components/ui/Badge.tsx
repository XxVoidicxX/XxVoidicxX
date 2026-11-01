import type { ReactNode } from 'react';
import type { Tone } from '@/lib/meta';
import { cx } from './cx';

export function Badge({
  tone = 'neutral',
  children,
  dot,
  className,
  title,
}: {
  tone?: Tone;
  children: ReactNode;
  dot?: boolean;
  className?: string;
  title?: string;
}) {
  return (
    <span className={cx('badge', `badge-${tone}`, className)} title={title}>
      {dot && <span className="badge-dot" aria-hidden />}
      {children}
    </span>
  );
}
