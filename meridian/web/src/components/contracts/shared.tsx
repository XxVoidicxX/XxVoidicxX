import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type ReactNode, type Ref } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronDown, Search, X, type LucideIcon } from "lucide-react";
import { api } from "@/lib/api";
import { LABELS, TONES, daysUntil } from "@/lib/format";
import type { Paged, Vendor } from "@/lib/types";
import { Badge, Button, Modal, cn } from "@/components/ui";

export function useVendorOptions() {
  return useQuery({
    queryKey: ["vendors", "options"],
    queryFn: () => api.get<Paged<Vendor>>("/api/vendors?limit=200&sort=name&dir=asc").then((r) => r.data),
    staleTime: 60_000,
  });
}

export function useDebouncedSearch(urlValue: string, commit: (v: string) => void, ms = 300) {
  const [value, setValue] = useState(urlValue);
  const commitRef = useRef(commit);
  commitRef.current = commit;
  const lastUrl = useRef(urlValue);
  useEffect(() => {
    if (urlValue !== lastUrl.current) {
      lastUrl.current = urlValue;
      setValue(urlValue);
    }
  }, [urlValue]);
  useEffect(() => {
    if (value === lastUrl.current) return;
    const t = setTimeout(() => {
      lastUrl.current = value;
      commitRef.current(value);
    }, ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return [value, setValue] as const;
}

export function SearchInput({ value, onChange, placeholder, className }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  return (
    <div className={cn("relative", className)}>
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder ?? "Search"}
        className="block h-9 w-full rounded-md border border-ink-200 bg-white pl-8 pr-8 text-sm text-ink-900 placeholder:text-ink-400 shadow-sm outline-none transition-colors focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <button type="button" onClick={() => onChange("")} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-ink-400 hover:text-ink-700" aria-label="Clear search">
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

export interface ChipOption { id: string; label: string; count?: number; tone?: "neutral" | "warning" | "danger" | "info" }
export function FilterChips({ options, value, onChange }: { options: ChipOption[]; value: string; onChange: (id: string) => void }) {
  const dot = { neutral: "bg-ink-400", warning: "bg-warning-600", danger: "bg-danger-600", info: "bg-sky-500" };
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label="Quick filters">
      {options.map((o) => {
        const active = o.id === value;
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.id)}
            className={cn(
              "inline-flex h-7 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors focus-ring",
              active ? "border-brand-600 bg-brand-600 text-white shadow-sm" : "border-ink-200 bg-white text-ink-600 hover:border-ink-300 hover:text-ink-900"
            )}
          >
            {o.tone && !active && <span className={cn("h-1.5 w-1.5 rounded-full", dot[o.tone])} />}
            {o.label}
            {o.count != null && <span className={cn("tnum rounded-full px-1.5 text-[11px] font-semibold", active ? "bg-white/20 text-white" : "bg-ink-100 text-ink-600")}>{o.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function daysTone(d: number | null | undefined): string {
  if (d == null) return "text-ink-400";
  if (d < 0) return "text-danger-700";
  if (d <= 30) return "text-danger-700 font-semibold";
  if (d <= 90) return "text-warning-700 font-medium";
  return "text-ink-600";
}

export function DaysLabel({ date, pastLabel = "ago", className }: { date: string | null | undefined; pastLabel?: string; className?: string }) {
  const d = daysUntil(date);
  if (d == null) return <span className={cn("text-ink-400", className)}>—</span>;
  const text = d === 0 ? "Today" : d > 0 ? `${d}d` : `${Math.abs(d)}d ${pastLabel}`;
  return <span className={cn("tnum whitespace-nowrap", daysTone(d), className)}>{text}</span>;
}

export const CELL = "px-2.5!";
export const SHORT_CONTRACT_TYPE: Record<string, string> = { msa: "MSA", sow: "SOW", nda: "NDA", dpa: "DPA", saas: "SaaS", license: "License", services: "Services" };
export const SHORT_DOCUMENT_TYPE: Record<string, string> = { soc2: "SOC 2", iso27001: "ISO 27001", insurance: "Insurance", pen_test: "Pen test", dpa: "DPA", financial: "Financials", policy: "Policy", other: "Other" };

export function VendorTierBadge({ tier }: { tier?: string | null }) {
  if (!tier) return null;
  return <Badge size="xs" tone={TONES.tier[tier]}>{LABELS.tier[tier]}</Badge>;
}

export function VendorPicker({ value, onChange, invalid, disabled, autoFocus }: { value: number | null; onChange: (id: number | null, vendor: Vendor | null) => void; invalid?: boolean; disabled?: boolean; autoFocus?: boolean }) {
  const { data: vendors = [], isLoading } = useVendorOptions();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const selected = vendors.find((v) => v.id === value) ?? null;
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? vendors.filter((v) => v.name.toLowerCase().includes(q) || v.category.toLowerCase().includes(q)) : vendors;
    return list.slice(0, 50);
  }, [vendors, query]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (!rootRef.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);
  useEffect(() => { setCursor(0); }, [query]);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${cursor}"]`)?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  const choose = (v: Vendor) => {
    onChange(v.id, v);
    setOpen(false);
    setQuery("");
  };
  const onKey = (e: ReactKeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setCursor((c) => Math.min(filtered.length - 1, c + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setCursor((c) => Math.max(0, c - 1)); }
    else if (e.key === "Enter") { if (open && filtered[cursor]) { e.preventDefault(); choose(filtered[cursor]); } }
    else if (e.key === "Escape") { if (open) { e.stopPropagation(); setOpen(false); } }
  };

  return (
    <div ref={rootRef} className="relative">
      <div className={cn("flex h-9 w-full items-center rounded-md border bg-white shadow-sm transition-colors focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-500/20", invalid ? "border-danger-600" : "border-ink-200", disabled && "bg-ink-50")}>
        <Search className="ml-2.5 h-4 w-4 shrink-0 text-ink-400" />
        <input
          ref={inputRef}
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          autoFocus={autoFocus}
          disabled={disabled}
          value={open ? query : selected?.name ?? ""}
          placeholder={isLoading ? "Loading vendors…" : selected ? selected.name : "Search vendors…"}
          onFocus={() => { setOpen(true); setQuery(""); }}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onKeyDown={onKey}
          className="h-full min-w-0 flex-1 bg-transparent px-2 text-sm text-ink-900 placeholder:text-ink-400 outline-none"
        />
        {selected && !open && <span className="mr-1"><VendorTierBadge tier={selected.tier} /></span>}
        {selected && !disabled ? (
          <button type="button" onClick={() => { onChange(null, null); inputRef.current?.focus(); }} className="mr-2 rounded p-0.5 text-ink-400 hover:text-ink-700" aria-label="Clear vendor"><X className="h-3.5 w-3.5" /></button>
        ) : (
          <ChevronDown className="mr-2.5 h-4 w-4 text-ink-400" />
        )}
      </div>
      {open && !disabled && (
        <ul ref={listRef} role="listbox" className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-ink-200 bg-white py-1 shadow-pop">
          {filtered.length === 0 ? (
            <li className="px-3 py-6 text-center text-sm text-ink-500">{isLoading ? "Loading…" : "No vendors match"}</li>
          ) : (
            filtered.map((v, i) => (
              <li
                key={v.id}
                data-idx={i}
                role="option"
                aria-selected={v.id === value}
                onMouseDown={(e) => { e.preventDefault(); choose(v); }}
                onMouseEnter={() => setCursor(i)}
                className={cn("flex cursor-pointer items-center gap-3 px-3 py-2 text-sm", i === cursor ? "bg-brand-50" : "")}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-ink-900">{v.name}</p>
                  <p className="truncate text-xs text-ink-500">{v.category} · {LABELS.vendorStatus[v.status]}</p>
                </div>
                <VendorTierBadge tier={v.tier} />
                {v.id === value && <Check className="h-4 w-4 text-brand-600" />}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

export interface MenuItem { label: string; icon?: LucideIcon; onSelect: () => void; danger?: boolean; disabled?: boolean; hint?: string }
export function Dropdown({ trigger, items, align = "right", label }: { trigger: (props: { onClick: (e: ReactMouseEvent) => void; "aria-expanded": boolean; "aria-haspopup": "menu"; ref: Ref<HTMLButtonElement> }) => ReactNode; items: (MenuItem | "divider")[]; align?: "left" | "right"; label?: string }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);

  const place = useCallback(() => {
    if (!triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    if (r.bottom < 0 || r.top > window.innerHeight) { setOpen(false); return; }
    const menuH = menuRef.current?.offsetHeight ?? 0;
    const width = 208;
    const below = r.bottom + 4;
    const top = below + menuH > window.innerHeight - 8 && r.top - menuH - 4 > 8 ? r.top - menuH - 4 : below;
    const left = align === "right" ? Math.max(8, r.right - width) : Math.min(window.innerWidth - width - 8, r.left);
    setPos({ top, left, width });
  }, [align]);

  useLayoutEffect(() => {
    if (open) place();
    else setPos(null);
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!menuRef.current?.contains(t) && !triggerRef.current?.contains(t)) close();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); close(); triggerRef.current?.focus(); } };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open, close, place]);

  const placed = !!pos;
  useEffect(() => {
    if (open && placed) menuRef.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus({ preventScroll: true });
  }, [open, placed]);

  const onMenuKey = (e: ReactKeyboardEvent) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const btns = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []);
    const i = btns.indexOf(document.activeElement as HTMLButtonElement);
    btns[(i + (e.key === "ArrowDown" ? 1 : -1) + btns.length) % btns.length]?.focus();
  };

  return (
    <>
      {trigger({ onClick: (e) => { e.stopPropagation(); setOpen((o) => !o); }, "aria-expanded": open, "aria-haspopup": "menu", ref: triggerRef })}
      {open && createPortal(
        <div
          ref={menuRef}
          role="menu"
          aria-label={label}
          onKeyDown={onMenuKey}
          onClick={(e) => e.stopPropagation()}
          style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999, width: pos?.width ?? 208 }}
          className="fixed z-[55] rounded-lg border border-ink-200 bg-white py-1 shadow-pop animate-fade-in"
        >
          {items.map((it, i) =>
            it === "divider" ? (
              <div key={`d${i}`} className="my-1 border-t border-ink-100" />
            ) : (
              <button
                key={it.label}
                type="button"
                role="menuitem"
                disabled={it.disabled}
                title={it.hint}
                onClick={() => { close(); it.onSelect(); }}
                className={cn(
                  "flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm outline-none transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                  it.danger ? "text-danger-700 hover:bg-danger-50 focus:bg-danger-50" : "text-ink-700 hover:bg-ink-50 focus:bg-ink-50"
                )}
              >
                {it.icon && <it.icon className={cn("h-4 w-4", it.danger ? "text-danger-600" : "text-ink-400")} />}
                {it.label}
              </button>
            )
          )}
        </div>,
        document.body
      )}
    </>
  );
}

export function ConfirmDialog({ open, onClose, onConfirm, title, description, confirmLabel = "Confirm", danger, loading, children }: { open: boolean; onClose: () => void; onConfirm: () => void; title: ReactNode; description?: ReactNode; confirmLabel?: string; danger?: boolean; loading?: boolean; children?: ReactNode }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button variant={danger ? "danger" : "primary"} onClick={onConfirm} loading={loading} autoFocus>{confirmLabel}</Button>
        </>
      }
    >
      {description && <p className="text-sm text-ink-600">{description}</p>}
      {children}
    </Modal>
  );
}

export function errorMessage(e: unknown): string {
  if (e && typeof e === "object" && "message" in e) {
    const msg = String((e as { message: unknown }).message);
    const details = (e as { details?: { fieldErrors?: Record<string, string[]> } }).details;
    const fields = details?.fieldErrors ? Object.entries(details.fieldErrors).map(([k, v]) => `${k}: ${v.join(", ")}`).join("; ") : "";
    return fields ? `${msg} — ${fields}` : msg;
  }
  return "Something went wrong";
}

export function ToolbarSelect({ value, onChange, label, children, className }: { value: string; onChange: (v: string) => void; label: string; children: ReactNode; className?: string }) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        "h-9 appearance-none rounded-md border pl-3 pr-8 text-sm shadow-sm outline-none transition-colors focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 bg-no-repeat bg-[right_0.5rem_center] bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2216%22 height=%2216%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%2364748b%22 stroke-width=%222%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22><path d=%22m6 9 6 6 6-6%22/></svg>')]",
        value ? "border-brand-300 bg-brand-50/50 text-brand-800" : "border-ink-200 bg-white text-ink-700",
        className
      )}
    >
      {children}
    </select>
  );
}

export function HeaderActions({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("flex flex-wrap items-center justify-start gap-2 sm:justify-end max-w-[calc(100vw-2rem)] sm:max-w-[calc(100vw-3rem)] lg:max-w-[calc(100vw-19rem)]", className)}>{children}</div>;
}

export function useInFlight() {
  const busy = useRef(false);
  return useCallback((run: () => Promise<unknown>) => {
    if (busy.current) return;
    busy.current = true;
    run().catch(() => undefined).finally(() => { busy.current = false; });
  }, []);
}
