import type { HTMLAttributes, ReactNode } from 'react';
import { cx } from './cx';

export function Card({ className, padded = true, ...rest }: HTMLAttributes<HTMLDivElement> & { padded?: boolean }) {
  return <div className={cx('card', padded && 'card-padded', className)} {...rest} />;
}

export function CardHeader({
  title,
  subtitle,
  actions,
  icon,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx('card-header', className)}>
      {icon && <div className="card-header-icon">{icon}</div>}
      <div className="card-header-text">
        <h3 className="card-title">{title}</h3>
        {subtitle && <p className="card-subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="card-header-actions">{actions}</div>}
    </div>
  );
}
