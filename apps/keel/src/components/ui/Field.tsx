import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cx } from './cx';

export function Field({
  label,
  hint,
  error,
  children,
  htmlFor,
  required,
  className,
  optional,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
  htmlFor?: string;
  required?: boolean;
  optional?: boolean;
  className?: string;
}) {
  return (
    <div className={cx('field', error ? 'field-invalid' : undefined, className)}>
      <label className="field-label" htmlFor={htmlFor}>
        {label}
        {required && <span className="field-req" aria-hidden> *</span>}
        {optional && <span className="field-opt"> (optional)</span>}
      </label>
      {children}
      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="field-hint">{hint}</p>
      ) : null}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { prefix?: ReactNode; suffix?: ReactNode; invalid?: boolean }>(
  function Input({ className, prefix, suffix, invalid, ...rest }, ref) {
    if (prefix || suffix) {
      return (
        <div className={cx('input-group', invalid && 'is-invalid', className)}>
          {prefix && <span className="input-affix">{prefix}</span>}
          <input ref={ref} className="input input-bare" aria-invalid={invalid || undefined} {...rest} />
          {suffix && <span className="input-affix">{suffix}</span>}
        </div>
      );
    }
    return <input ref={ref} className={cx('input', invalid && 'is-invalid', className)} aria-invalid={invalid || undefined} {...rest} />;
  },
);

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className, rows = 3, ...rest },
  ref,
) {
  return <textarea ref={ref} rows={rows} className={cx('input', 'textarea', className)} {...rest} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }>(function Select(
  { className, children, invalid, ...rest },
  ref,
) {
  return (
    <select ref={ref} className={cx('input', 'select', invalid && 'is-invalid', className)} aria-invalid={invalid || undefined} {...rest}>
      {children}
    </select>
  );
});

export function Switch({
  checked,
  onChange,
  label,
  description,
  id,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  id?: string;
  disabled?: boolean;
}) {
  const auto = useId();
  const inputId = id ?? auto;
  return (
    <label className={cx('switch-row', disabled && 'is-disabled')} htmlFor={inputId}>
      <span className="switch-text">
        <span className="switch-label">{label}</span>
        {description && <span className="switch-desc">{description}</span>}
      </span>
      <span className="switch">
        <input
          id={inputId}
          type="checkbox"
          role="switch"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className="switch-track" aria-hidden>
          <span className="switch-thumb" />
        </span>
      </span>
    </label>
  );
}

export function Checkbox({
  checked,
  onChange,
  label,
  className,
  ariaLabel,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: ReactNode;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <label className={cx('checkbox', className)}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} aria-label={ariaLabel} />
      <span className="checkbox-box" aria-hidden>
        <svg viewBox="0 0 16 16" width="12" height="12">
          <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      {label && <span className="checkbox-label">{label}</span>}
    </label>
  );
}
