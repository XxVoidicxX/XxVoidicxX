import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Building2, Check, ChevronDown, Search, X } from "lucide-react";
import { api } from "@/lib/api";
import { LABELS, TONES } from "@/lib/format";
import type { Paged, Vendor } from "@/lib/types";
import { Badge, cn, Spinner } from "@/components/ui";

export function useVendorOptions() {
  return useQuery({
    queryKey: ["vendors", "options"],
    queryFn: () => api.get<Paged<Vendor>>("/api/vendors?limit=200&sort=name&dir=asc").then((r) => r.data),
    staleTime: 60_000,
  });
}

export function VendorPicker({ value, onChange, invalid, disabled, placeholder = "Search vendors…", excludeStatuses = [] }: { value: number | null; onChange: (id: number | null, vendor: Vendor | null) => void; invalid?: boolean; disabled?: boolean; placeholder?: string; excludeStatuses?: string[] }) {
  const { data, isLoading } = useVendorOptions();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();
  const selected = useMemo(() => data?.find((v) => v.id === value) ?? null, [data, value]);
  const options = useMemo(() => {
    const t = query.trim().toLowerCase();
    return (data ?? []).filter((v) => !excludeStatuses.includes(v.status)).filter((v) => !t || v.name.toLowerCase().includes(t) || v.category.toLowerCase().includes(t) || (v.legal_name ?? "").toLowerCase().includes(t)).slice(0, 80);
  }, [data, query, excludeStatuses]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);
  useEffect(() => { setActive(0); }, [query]);
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const choose = (v: Vendor) => { onChange(v.id, v); setOpen(false); setQuery(""); };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setActive((a) => Math.min(options.length - 1, a + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === "Enter") { if (open && options[active]) { e.preventDefault(); choose(options[active]); } }
    else if (e.key === "Escape") { if (open) { e.stopPropagation(); setOpen(false); } }
  };

  return (
    <div ref={wrapRef} className="relative">
      <div className={cn("flex items-center h-9 w-full rounded-md border bg-white shadow-sm transition-colors", disabled ? "bg-ink-50 border-ink-200" : open ? "border-brand-500 ring-2 ring-brand-500/20" : invalid ? "border-danger-600" : "border-ink-200")}>
        {open || !selected ? (
          <>
            <Search className="h-4 w-4 text-ink-400 ml-3 shrink-0" />
            <input
              ref={inputRef}
              role="combobox"
              aria-expanded={open}
              aria-controls={listId}
              aria-autocomplete="list"
              disabled={disabled}
              value={query}
              onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
              onFocus={() => setOpen(true)}
              onKeyDown={onKey}
              placeholder={selected ? selected.name : placeholder}
              className="flex-1 min-w-0 h-full bg-transparent px-2 text-sm text-ink-900 placeholder:text-ink-400 outline-none"
            />
          </>
        ) : (
          <button type="button" disabled={disabled} onClick={() => { setOpen(true); setTimeout(() => inputRef.current?.focus(), 0); }} className="flex-1 min-w-0 h-full flex items-center gap-2 px-3 text-left text-sm outline-none" onKeyDown={(e) => { if (e.key === "ArrowDown" || e.key === "Enter") { e.preventDefault(); setOpen(true); setTimeout(() => inputRef.current?.focus(), 0); } }}>
            <Building2 className="h-4 w-4 text-ink-400 shrink-0" />
            <span className="truncate text-ink-900">{selected.name}</span>
            <Badge size="xs" tone={TONES.tier[selected.tier]}>{LABELS.tier[selected.tier]}</Badge>
          </button>
        )}
        {selected && !disabled && (
          <button type="button" onClick={() => onChange(null, null)} className="p-1 mr-1 text-ink-400 hover:text-ink-700 rounded focus-ring" aria-label="Clear vendor"><X className="h-4 w-4" /></button>
        )}
        {!disabled && <ChevronDown className="h-4 w-4 text-ink-400 mr-2.5 shrink-0" />}
      </div>
      {open && !disabled && (
        <ul ref={listRef} id={listId} role="listbox" className="absolute z-30 mt-1 w-full max-h-64 overflow-y-auto rounded-lg border border-ink-200 bg-white shadow-pop py-1 animate-fade-in">
          {isLoading ? (
            <li className="flex items-center justify-center py-6"><Spinner /></li>
          ) : options.length === 0 ? (
            <li className="px-3 py-6 text-center text-sm text-ink-500">No vendors match “{query}”</li>
          ) : (
            options.map((v, i) => (
              <li key={v.id} data-idx={i} role="option" aria-selected={v.id === value} onMouseEnter={() => setActive(i)} onMouseDown={(e) => { e.preventDefault(); choose(v); }} className={cn("flex items-center gap-2 px-3 py-2 cursor-pointer text-sm", i === active ? "bg-brand-50" : "")}>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-ink-900">{v.name}</span>
                  <span className="block truncate text-xs text-ink-500">{v.category} · {LABELS.vendorStatus[v.status]}</span>
                </span>
                <Badge size="xs" tone={TONES.tier[v.tier]}>{LABELS.tier[v.tier]}</Badge>
                {v.id === value ? <Check className="h-4 w-4 text-brand-600" /> : <span className="w-4" />}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
