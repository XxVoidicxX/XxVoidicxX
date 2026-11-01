import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes, useEffect } from "react";
import { Link } from "react-router-dom";
import clsx from "clsx";
import { X, Loader2, Inbox, ChevronLeft, ChevronRight, type LucideIcon } from "lucide-react";
import type { Tone } from "@/lib/format";

export const cn = clsx;

/* ---------- Button ---------- */
type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "outline";
type ButtonSize = "xs" | "sm" | "md" | "lg";
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: LucideIcon;
  iconRight?: LucideIcon;
}
const btnVariant: Record<ButtonVariant, string> = {
  primary: "bg-brand-600 text-white hover:bg-brand-700 shadow-sm disabled:bg-brand-300",
  secondary: "bg-white text-ink-700 border border-ink-200 hover:bg-ink-50 hover:border-ink-300 shadow-sm",
  outline: "bg-transparent text-brand-700 border border-brand-200 hover:bg-brand-50",
  ghost: "bg-transparent text-ink-600 hover:bg-ink-100 hover:text-ink-900",
  danger: "bg-danger-600 text-white hover:bg-danger-700 shadow-sm",
};
const btnSize: Record<ButtonSize, string> = {
  xs: "h-7 px-2 text-xs gap-1 rounded-md",
  sm: "h-8 px-3 text-sm gap-1.5 rounded-md",
  md: "h-9 px-3.5 text-sm gap-2 rounded-md",
  lg: "h-11 px-5 text-base gap-2 rounded-lg",
};
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant = "primary", size = "md", loading, icon: Icon, iconRight: IconRight, children, disabled, ...props }, ref) => (
  <button ref={ref} disabled={disabled || loading} className={cn("inline-flex items-center justify-center font-medium transition-colors focus-ring disabled:opacity-60 disabled:cursor-not-allowed whitespace-nowrap", btnVariant[variant], btnSize[size], className)} {...props}>
    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : Icon ? <Icon className={size === "xs" ? "h-3.5 w-3.5" : "h-4 w-4"} /> : null}
    {children}
    {IconRight && !loading ? <IconRight className="h-4 w-4" /> : null}
  </button>
));
Button.displayName = "Button";

/* ---------- Badge ---------- */
const toneClass: Record<Tone, string> = {
  neutral: "bg-ink-100 text-ink-700 ring-ink-200",
  brand: "bg-brand-50 text-brand-700 ring-brand-200",
  info: "bg-sky-50 text-sky-700 ring-sky-200",
  success: "bg-success-50 text-success-700 ring-emerald-200",
  warning: "bg-warning-50 text-warning-700 ring-amber-200",
  danger: "bg-danger-50 text-danger-700 ring-red-200",
};
const dotClass: Record<Tone, string> = { neutral: "bg-ink-400", brand: "bg-brand-500", info: "bg-sky-500", success: "bg-success-600", warning: "bg-warning-600", danger: "bg-danger-600" };
export function Badge({ tone = "neutral", children, className, dot, size = "sm" }: { tone?: Tone; children: ReactNode; className?: string; dot?: boolean; size?: "xs" | "sm" }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full font-medium ring-1 ring-inset whitespace-nowrap", size === "xs" ? "px-1.5 py-0 text-[11px]" : "px-2 py-0.5 text-xs", toneClass[tone], className)}>
      {dot && <span className={cn("h-1.5 w-1.5 rounded-full", dotClass[tone])} />}
      {children}
    </span>
  );
}

/* ---------- Card ---------- */
export function Card({ children, className, padded = true }: { children: ReactNode; className?: string; padded?: boolean }) {
  return <div className={cn("bg-white rounded-[var(--radius-card)] border border-ink-200 shadow-card", padded && "p-5", className)}>{children}</div>;
}
export function CardHeader({ title, description, action, className }: { title: ReactNode; description?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-start justify-between gap-4 mb-4", className)}>
      <div className="min-w-0">
        <h3 className="text-sm font-semibold text-ink-900 leading-5">{title}</h3>
        {description && <p className="text-sm text-ink-500 mt-0.5">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/* ---------- Form controls ---------- */
const controlBase = "block w-full rounded-md border border-ink-200 bg-white px-3 text-sm text-ink-900 placeholder:text-ink-400 shadow-sm transition-colors focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 outline-none disabled:bg-ink-50 disabled:text-ink-500";
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(({ className, invalid, ...props }, ref) => (
  <input ref={ref} className={cn(controlBase, "h-9", invalid && "border-danger-600 focus:border-danger-600 focus:ring-danger-600/20", className)} {...props} />
));
Input.displayName = "Input";
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }>(({ className, invalid, ...props }, ref) => (
  <textarea ref={ref} className={cn(controlBase, "py-2 min-h-[80px]", invalid && "border-danger-600", className)} {...props} />
));
Textarea.displayName = "Textarea";
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }>(({ className, invalid, children, ...props }, ref) => (
  <select ref={ref} className={cn(className?.includes("w-") ? controlBase.replace("w-full ", "") : controlBase, "h-9 pr-8 appearance-none bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2216%22 height=%2216%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%2364748b%22 stroke-width=%222%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22><path d=%22m6 9 6 6 6-6%22/></svg>')] bg-no-repeat bg-[right_0.5rem_center]", invalid && "border-danger-600", className)} {...props}>
    {children}
  </select>
));
Select.displayName = "Select";
export function Field({ label, hint, error, required, children, className }: { label: ReactNode; hint?: ReactNode; error?: ReactNode; required?: boolean; children: ReactNode; className?: string }) {
  return (
    <label className={cn("block", className)}>
      <span className="block text-sm font-medium text-ink-700 mb-1.5">
        {label}
        {required && <span className="text-danger-600 ml-0.5">*</span>}
      </span>
      {children}
      {error ? <span className="block text-xs text-danger-600 mt-1">{error}</span> : hint ? <span className="block text-xs text-ink-500 mt-1">{hint}</span> : null}
    </label>
  );
}
export function Checkbox({ label, className, ...props }: InputHTMLAttributes<HTMLInputElement> & { label?: ReactNode }) {
  return (
    <label className={cn("inline-flex items-center gap-2 text-sm text-ink-700 cursor-pointer", className)}>
      <input type="checkbox" className="h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-500" {...props} />
      {label}
    </label>
  );
}

/* ---------- Avatar ---------- */
export function Avatar({ name, size = "md", className }: { name: string | null | undefined; size?: "xs" | "sm" | "md" | "lg"; className?: string }) {
  const initials = (name || "?").split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  const hues = ["bg-brand-100 text-brand-800", "bg-violet-100 text-violet-800", "bg-emerald-100 text-emerald-800", "bg-amber-100 text-amber-800", "bg-rose-100 text-rose-800", "bg-sky-100 text-sky-800"];
  const h = hues[(name || "").split("").reduce((a, c) => a + c.charCodeAt(0), 0) % hues.length];
  const sz = { xs: "h-5 w-5 text-[9px]", sm: "h-6 w-6 text-[10px]", md: "h-8 w-8 text-xs", lg: "h-10 w-10 text-sm" }[size];
  return <span title={name ?? undefined} className={cn("inline-flex items-center justify-center rounded-full font-semibold shrink-0", sz, h, className)}>{initials}</span>;
}

/* ---------- Modal / Drawer ---------- */
export function Modal({ open, onClose, title, description, children, footer, size = "md" }: { open: boolean; onClose: () => void; title: ReactNode; description?: ReactNode; children: ReactNode; footer?: ReactNode; size?: "sm" | "md" | "lg" | "xl" }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [open, onClose]);
  if (!open) return null;
  const w = { sm: "max-w-md", md: "max-w-lg", lg: "max-w-2xl", xl: "max-w-4xl" }[size];
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink-900/40 p-4 sm:p-8 backdrop-blur-[1px]" onMouseDown={(e) => e.target === e.currentTarget && onClose()} role="dialog" aria-modal="true">
      <div className={cn("w-full bg-white rounded-xl shadow-pop border border-ink-200 animate-fade-in my-auto", w)}>
        <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-3">
          <div>
            <h2 className="text-base font-semibold text-ink-900">{title}</h2>
            {description && <p className="text-sm text-ink-500 mt-0.5">{description}</p>}
          </div>
          <button onClick={onClose} className="text-ink-400 hover:text-ink-700 rounded-md p-1 focus-ring" aria-label="Close"><X className="h-5 w-5" /></button>
        </div>
        <div className="px-6 pb-5">{children}</div>
        {footer && <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-ink-100 bg-ink-50/60 rounded-b-xl">{footer}</div>}
      </div>
    </div>
  );
}

/* ---------- Tabs ---------- */
export function Tabs<T extends string>({ tabs, value, onChange, className }: { tabs: { id: T; label: ReactNode; count?: number }[]; value: T; onChange: (v: T) => void; className?: string }) {
  return (
    <div className={cn("flex gap-1 border-b border-ink-200 overflow-x-auto", className)} role="tablist">
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={value === t.id} onClick={() => onChange(t.id)} className={cn("relative px-3 py-2.5 text-sm font-medium whitespace-nowrap transition-colors focus-ring rounded-t-md", value === t.id ? "text-brand-700" : "text-ink-500 hover:text-ink-800")}>
          <span className="inline-flex items-center gap-1.5">
            {t.label}
            {t.count != null && <span className={cn("rounded-full px-1.5 text-[11px] font-semibold tnum", value === t.id ? "bg-brand-100 text-brand-700" : "bg-ink-100 text-ink-600")}>{t.count}</span>}
          </span>
          {value === t.id && <span className="absolute inset-x-1 -bottom-px h-0.5 bg-brand-600 rounded-full" />}
        </button>
      ))}
    </div>
  );
}

/* ---------- Empty / Skeleton / Spinner ---------- */
export function EmptyState({ icon: Icon = Inbox, title, description, action, className }: { icon?: LucideIcon; title: ReactNode; description?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center text-center py-12 px-6", className)}>
      <div className="h-11 w-11 rounded-full bg-ink-100 text-ink-400 flex items-center justify-center mb-3"><Icon className="h-5 w-5" /></div>
      <p className="text-sm font-medium text-ink-800">{title}</p>
      {description && <p className="text-sm text-ink-500 mt-1 max-w-sm">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton rounded-md", className)} />;
}
export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn("h-5 w-5 animate-spin text-brand-600", className)} />;
}
export function PageLoader() {
  return (
    <div className="space-y-4 animate-fade-in">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-4 w-96" />
      <div className="grid grid-cols-4 gap-4 mt-6">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}</div>
      <Skeleton className="h-64" />
    </div>
  );
}

/* ---------- Page header ---------- */
export function PageHeader({ title, description, actions, breadcrumbs, meta }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; breadcrumbs?: { label: string; to?: string }[]; meta?: ReactNode }) {
  return (
    <div className="mb-6">
      {breadcrumbs && (
        <nav className="flex items-center gap-1.5 text-xs text-ink-500 mb-2" aria-label="Breadcrumb">
          {breadcrumbs.map((b, i) => (
            <span key={i} className="inline-flex items-center gap-1.5">
              {i > 0 && <ChevronRight className="h-3 w-3 text-ink-300" />}
              {b.to ? <Link to={b.to} className="hover:text-brand-700">{b.label}</Link> : <span className="text-ink-700">{b.label}</span>}
            </span>
          ))}
        </nav>
      )}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-ink-900 tracking-tight">{title}</h1>
          {description && <p className="text-sm text-ink-500 mt-1">{description}</p>}
          {meta && <div className="flex flex-wrap items-center gap-2 mt-2">{meta}</div>}
        </div>
        {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
      </div>
    </div>
  );
}

/* ---------- Data table ---------- */
export interface Column<T> {
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  sortable?: boolean;
  className?: string;
  align?: "left" | "right" | "center";
  width?: string;
}
export function DataTable<T extends { id: number | string }>({ columns, rows, loading, sort, onSort, onRowClick, emptyTitle = "No results", emptyDescription, rowHref, dense }: {
  columns: Column<T>[]; rows: T[]; loading?: boolean; sort?: { key: string; dir: "asc" | "desc" }; onSort?: (key: string) => void; onRowClick?: (row: T) => void; emptyTitle?: ReactNode; emptyDescription?: ReactNode; rowHref?: (row: T) => string; dense?: boolean;
}) {
  const alignCls = (a?: string) => (a === "right" ? "text-right" : a === "center" ? "text-center" : "text-left");
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-ink-200 bg-ink-50/70">
            {columns.map((c) => (
              <th key={c.key} style={{ width: c.width }} className={cn("px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-ink-500 whitespace-nowrap", alignCls(c.align), c.className)}>
                {c.sortable && onSort ? (
                  <button onClick={() => onSort(c.key)} className={cn("inline-flex items-center gap-1 uppercase tracking-wide hover:text-ink-800 focus-ring rounded", sort?.key === c.key && "text-brand-700")}>
                    {c.header}
                    <span className="text-[10px]">{sort?.key === c.key ? (sort.dir === "asc" ? "▲" : "▼") : <span className="text-ink-300">↕</span>}</span>
                  </button>
                ) : c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100">
          {loading
            ? Array.from({ length: 6 }).map((_, i) => (
                <tr key={i}>{columns.map((c) => <td key={c.key} className="px-4 py-3"><Skeleton className="h-4 w-3/4" /></td>)}</tr>
              ))
            : rows.length === 0
            ? <tr><td colSpan={columns.length}><EmptyState title={emptyTitle} description={emptyDescription} className="py-10" /></td></tr>
            : rows.map((r) => (
                <tr key={r.id} onClick={onRowClick ? () => onRowClick(r) : undefined} className={cn("bg-white transition-colors", (onRowClick || rowHref) && "hover:bg-brand-50/40 cursor-pointer")}>
                  {columns.map((c) => (
                    <td key={c.key} className={cn("px-4 align-middle", dense ? "py-2" : "py-3", alignCls(c.align), c.className)}>
                      {rowHref ? <Link to={rowHref(r)} className="block -mx-4 px-4 -my-3 py-3" onClick={(e) => e.stopPropagation()}>{c.render(r)}</Link> : c.render(r)}
                    </td>
                  ))}
                </tr>
              ))}
        </tbody>
      </table>
    </div>
  );
}

export function Pagination({ page, limit, total, onPage }: { page: number; limit: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / limit));
  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(total, page * limit);
  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-ink-200 text-sm text-ink-600">
      <span className="tnum">Showing <span className="font-medium text-ink-800">{from}–{to}</span> of <span className="font-medium text-ink-800">{total}</span></span>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="sm" icon={ChevronLeft} disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page" />
        <span className="px-2 tnum">Page {page} of {pages}</span>
        <Button variant="ghost" size="sm" icon={ChevronRight} disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page" />
      </div>
    </div>
  );
}

/* ---------- Misc ---------- */
export function Stat({ label, value, hint, tone, icon: Icon, to }: { label: ReactNode; value: ReactNode; hint?: ReactNode; tone?: Tone; icon?: LucideIcon; to?: string }) {
  const body = (
    <Card className="h-full hover:border-brand-200 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-500">{label}</p>
          <p className={cn("mt-1.5 text-2xl font-semibold tracking-tight tnum", tone === "danger" ? "text-danger-700" : tone === "warning" ? "text-warning-700" : tone === "success" ? "text-success-700" : "text-ink-900")}>{value}</p>
          {hint && <p className="text-xs text-ink-500 mt-1">{hint}</p>}
        </div>
        {Icon && <span className={cn("h-9 w-9 rounded-lg flex items-center justify-center shrink-0", tone ? toneClass[tone] : "bg-brand-50 text-brand-600")}><Icon className="h-4.5 w-4.5" /></span>}
      </div>
    </Card>
  );
  return to ? <Link to={to} className="block focus-ring rounded-[var(--radius-card)]">{body}</Link> : body;
}

export function RiskScore({ value, size = "md", showLabel = true }: { value: number; size?: "sm" | "md" | "lg"; showLabel?: boolean }) {
  const tone = value >= 80 ? "danger" : value >= 60 ? "warning" : value >= 35 ? "info" : "success";
  const bar = { danger: "bg-danger-600", warning: "bg-warning-600", info: "bg-sky-500", success: "bg-success-600" }[tone];
  return (
    <div className={cn("inline-flex items-center gap-2", size === "sm" ? "text-xs" : "text-sm")}>
      <span className={cn("rounded-full bg-ink-100 overflow-hidden", size === "lg" ? "h-2.5 w-28" : size === "sm" ? "h-1.5 w-14" : "h-2 w-20")}><span className={cn("block h-full rounded-full", bar)} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} /></span>
      {showLabel && <span className="font-semibold tnum text-ink-800">{value}</span>}
    </div>
  );
}

export function DescriptionList({ items, cols = 2, className }: { items: { label: ReactNode; value: ReactNode }[]; cols?: 1 | 2 | 3 | 4; className?: string }) {
  return (
    <dl className={cn("grid gap-x-6 gap-y-4", { 1: "grid-cols-1", 2: "grid-cols-1 sm:grid-cols-2", 3: "grid-cols-1 sm:grid-cols-3", 4: "grid-cols-2 lg:grid-cols-4" }[cols], className)}>
      {items.map((it, i) => (
        <div key={i} className="min-w-0">
          <dt className="text-xs font-medium uppercase tracking-wide text-ink-500">{it.label}</dt>
          <dd className="text-sm text-ink-900 mt-1 break-words">{it.value ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Divider({ className }: { className?: string }) {
  return <hr className={cn("border-ink-200", className)} />;
}
