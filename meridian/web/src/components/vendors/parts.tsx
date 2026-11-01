import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Check, ChevronDown, type LucideIcon } from "lucide-react";
import { Badge, Button, Card, cn } from "@/components/ui";
import { LABELS, TONES, fmtMoney, type Tone } from "@/lib/format";
import type { DataAccess, Tier } from "@/lib/types";
import { DATA_ACCESS_OPTIONS, inherentBreakdown, tierFromInherent } from "./risk";

const MARK_HUES = ["bg-brand-600", "bg-violet-600", "bg-emerald-600", "bg-amber-600", "bg-rose-600", "bg-sky-600", "bg-indigo-600", "bg-teal-600"];

export function VendorMark({ name, size = "md" }: { name: string; size?: "sm" | "md" | "lg" }) {
  const letters = name.split(/\s+/).filter((p) => /^[A-Za-z0-9]/.test(p)).map((p) => p[0]).slice(0, 2).join("").toUpperCase() || "?";
  const hue = MARK_HUES[name.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % MARK_HUES.length];
  const sz = { sm: "h-8 w-8 text-[11px] rounded-md", md: "h-10 w-10 text-xs rounded-lg", lg: "h-12 w-12 text-sm rounded-xl" }[size];
  return <span className={cn("inline-flex items-center justify-center font-semibold text-white shrink-0 shadow-sm", sz, hue)}>{letters}</span>;
}

export function TierBadge({ tier, size }: { tier: Tier; size?: "xs" | "sm" }) {
  return <Badge tone={TONES.tier[tier]} size={size}>{LABELS.tier[tier]} tier</Badge>;
}

export function Kpi({ label, children, hint, tone, icon: Icon }: { label: ReactNode; children: ReactNode; hint?: ReactNode; tone?: Tone; icon?: LucideIcon }) {
  const iconTone = { neutral: "text-ink-400", brand: "text-brand-500", info: "text-sky-500", success: "text-success-600", warning: "text-warning-600", danger: "text-danger-600" }[tone ?? "neutral"];
  return (
    <Card className="h-full !p-4">
      <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-ink-500 whitespace-nowrap">
        {Icon && <Icon className={cn("h-3.5 w-3.5 shrink-0", iconTone)} />}
        <span className="truncate">{label}</span>
      </p>
      <div className={cn("mt-2 text-2xl font-semibold tracking-tight tnum min-h-8 flex items-center whitespace-nowrap", tone === "danger" ? "text-danger-700" : tone === "warning" ? "text-warning-700" : tone === "success" ? "text-success-700" : "text-ink-900")}>{children}</div>
      {hint && <div className="text-xs text-ink-500 mt-1">{hint}</div>}
    </Card>
  );
}

export function DataAccessPicker({ value, onChange, columns = 2 }: { value: DataAccess; onChange: (v: DataAccess) => void; columns?: 1 | 2 }) {
  return (
    <div className={cn("grid gap-3", columns === 2 ? "sm:grid-cols-2" : "grid-cols-1")} role="radiogroup" aria-label="Data access">
      {DATA_ACCESS_OPTIONS.map((o) => {
        const active = o.value === value;
        const Icon = o.icon;
        return (
          <button
            type="button"
            key={o.value}
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={cn("relative flex items-start text-left rounded-lg border p-3.5 transition-all focus-ring", active ? "border-brand-500 bg-brand-50/60 ring-1 ring-brand-500" : "border-ink-200 bg-white hover:border-ink-300 hover:bg-ink-50/60")}
          >
            <div className="flex w-full items-start gap-3">
              <span className={cn("h-8 w-8 rounded-md flex items-center justify-center shrink-0", active ? "bg-brand-600 text-white" : "bg-ink-100 text-ink-500")}><Icon className="h-4 w-4" /></span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-ink-900">{o.label}</span>
                  <span className={cn("h-4 w-4 rounded-full border flex items-center justify-center shrink-0", active ? "border-brand-600 bg-brand-600 text-white" : "border-ink-300 bg-white")}>{active && <Check className="h-3 w-3" strokeWidth={3} />}</span>
                </div>
                <p className="text-xs text-ink-600 mt-0.5 leading-relaxed">{o.description}</p>
                <p className="text-[11px] text-ink-400 mt-1">e.g. {o.examples}</p>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function BreakdownRow({ label, detail, points, max }: { label: string; detail: string; points: number; max: number }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="text-ink-600"><span className="font-medium text-ink-800">{label}</span> · {detail}</span>
        <span className="font-semibold tnum text-ink-800">+{points}</span>
      </div>
      <div className="mt-1 h-1.5 rounded-full bg-ink-100 overflow-hidden"><div className="h-full rounded-full bg-brand-500 transition-all duration-300" style={{ width: `${(points / max) * 100}%` }} /></div>
    </div>
  );
}

export function RiskPreview({ dataAccess, annualSpend, category, cadenceMonths, compact }: { dataAccess: DataAccess; annualSpend: number; category: string; cadenceMonths: Record<Tier, number>; compact?: boolean }) {
  const b = inherentBreakdown({ data_access: dataAccess, annual_spend: annualSpend, category });
  const tier = tierFromInherent(b.total);
  const tone = TONES.tier[tier];
  const ring = { danger: "text-danger-600", warning: "text-warning-600", info: "text-sky-500", success: "text-success-600", neutral: "text-ink-400", brand: "text-brand-600" }[tone];
  const circ = 2 * Math.PI * 34;
  return (
    <div className={cn(!compact && "space-y-4")}>
      <div className="flex items-center gap-4">
        <div className="relative h-20 w-20 shrink-0">
          <svg viewBox="0 0 80 80" className="h-20 w-20 -rotate-90">
            <circle cx="40" cy="40" r="34" fill="none" strokeWidth="8" className="stroke-ink-100" />
            <circle cx="40" cy="40" r="34" fill="none" strokeWidth="8" strokeLinecap="round" className={cn("transition-all duration-500", ring)} stroke="currentColor" strokeDasharray={circ} strokeDashoffset={circ * (1 - b.total / 100)} />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-xl font-semibold tnum text-ink-900 leading-none">{b.total}</span>
            <span className="text-[10px] text-ink-400 mt-0.5">/ 100</span>
          </div>
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-500">Inherent risk</p>
          <div className="mt-1"><TierBadge tier={tier} /></div>
          <p className="text-xs text-ink-500 mt-1.5">Reassess every <span className="font-medium text-ink-700">{cadenceMonths[tier]} months</span></p>
        </div>
      </div>
      <div className={cn("space-y-3", compact && "mt-4")}>
        <BreakdownRow label="Data access" detail={LABELS.dataAccess[dataAccess]} points={b.access} max={80} />
        <BreakdownRow label="Annual spend" detail={fmtMoney(annualSpend || 0, "USD", true)} points={b.spend} max={20} />
        <BreakdownRow label="Category" detail={category || "Not selected"} points={b.category} max={10} />
      </div>
      {!compact && (
        <div className="rounded-md bg-ink-50 border border-ink-100 p-3 text-xs text-ink-600 leading-relaxed">
          Tier thresholds: <span className="font-medium text-ink-800">Critical</span> ≥ 80 · <span className="font-medium text-ink-800">High</span> ≥ 60 · <span className="font-medium text-ink-800">Medium</span> ≥ 35 · <span className="font-medium text-ink-800">Low</span> &lt; 35. Residual risk starts equal to inherent and is reduced by completed assessments.
        </div>
      )}
    </div>
  );
}

export interface MenuItem { key: string; label: ReactNode; description?: ReactNode; icon?: LucideIcon; onSelect: () => void; disabled?: boolean; danger?: boolean; active?: boolean }

export function DropdownMenu({ label, icon, items, align = "right", variant = "secondary" }: { label: ReactNode; icon?: LucideIcon; items: MenuItem[]; align?: "left" | "right"; variant?: "secondary" | "ghost" | "outline" }) {
  const [open, setOpen] = useState(false);
  const [side, setSide] = useState(align);
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!open || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const w = Math.min(256, window.innerWidth - 16);
    setSide(align === "right" ? (r.right - w < 8 ? "left" : "right") : (r.left + w > window.innerWidth - 8 ? "right" : "left"));
  }, [open, align]);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      <Button variant={variant} icon={icon} iconRight={ChevronDown} onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open}>{label}</Button>
      {open && (
        <div role="menu" className={cn("absolute z-40 mt-1.5 w-64 max-w-[calc(100vw-1rem)] rounded-lg border border-ink-200 bg-white p-1 shadow-pop animate-fade-in", side === "right" ? "right-0" : "left-0")}>
          {items.map((it) => {
            const Icon = it.icon;
            return (
              <button
                key={it.key}
                role="menuitem"
                disabled={it.disabled}
                onClick={() => { setOpen(false); it.onSelect(); }}
                className={cn("w-full flex items-start gap-2.5 rounded-md px-2.5 py-2 text-left text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed", it.danger ? "text-danger-700 hover:bg-danger-50" : "text-ink-700 hover:bg-ink-50", it.active && "bg-brand-50/60")}
              >
                {Icon && <Icon className={cn("h-4 w-4 mt-0.5 shrink-0", it.danger ? "text-danger-600" : "text-ink-400")} />}
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2 font-medium">{it.label}{it.active && <Check className="h-4 w-4 text-brand-600" />}</span>
                  {it.description && <span className="block text-xs text-ink-500 mt-0.5 font-normal">{it.description}</span>}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
