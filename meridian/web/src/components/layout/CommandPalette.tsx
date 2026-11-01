import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Building2, FileText, ClipboardCheck, AlertTriangle, FolderOpen, Search, ArrowRight, LayoutDashboard, CheckSquare, BarChart3, Plus } from "lucide-react";
import clsx from "clsx";
import { api } from "@/lib/api";
import { useDebounce } from "@/lib/hooks";

interface Result { id: number; title: string; subtitle: string | null; type: "vendor" | "contract" | "assessment" | "finding" | "document" }
const ICONS = { vendor: Building2, contract: FileText, assessment: ClipboardCheck, finding: AlertTriangle, document: FolderOpen };
const PATHS = { vendor: "/vendors", contract: "/contracts", assessment: "/assessments", finding: "/findings", document: "/documents" };
const ACTIONS = [
  { label: "Go to Dashboard", to: "/", icon: LayoutDashboard },
  { label: "Add vendor", to: "/vendors/new", icon: Plus },
  { label: "Review approvals", to: "/approvals", icon: CheckSquare },
  { label: "Open reports", to: "/reports", icon: BarChart3 },
];

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);
  const dq = useDebounce(q, 200);
  const nav = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const results = useQuery({ queryKey: ["search", dq], queryFn: () => api.get<{ data: Result[] }>(`/api/search?q=${encodeURIComponent(dq)}`).then((r) => r.data), enabled: open && dq.trim().length >= 2 });
  const items = useMemo(() => {
    const acts = ACTIONS.filter((a) => !q || a.label.toLowerCase().includes(q.toLowerCase())).map((a) => ({ kind: "action" as const, ...a }));
    const res = (results.data ?? []).map((r) => ({ kind: "result" as const, ...r }));
    return [...res, ...acts];
  }, [q, results.data]);

  useEffect(() => { if (open) { setQ(""); setIdx(0); setTimeout(() => inputRef.current?.focus(), 10); } }, [open]);
  useEffect(() => setIdx(0), [items.length]);

  if (!open) return null;
  const go = (item: (typeof items)[number]) => {
    onClose();
    if (item.kind === "action") nav(item.to);
    else nav(item.type === "document" ? `/documents?q=${encodeURIComponent(item.title)}` : `${PATHS[item.type]}/${item.id}`);
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setIdx((i) => Math.min(items.length - 1, i + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setIdx((i) => Math.max(0, i - 1)); }
    else if (e.key === "Enter" && items[idx]) go(items[idx]);
    else if (e.key === "Escape") onClose();
  };
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-ink-900/40 p-4 pt-[12vh]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label="Command palette" className="w-full max-w-xl rounded-xl bg-white shadow-pop border border-ink-200 overflow-hidden animate-fade-in">
        <div className="flex items-center gap-3 px-4 border-b border-ink-100">
          <Search className="h-4.5 w-4.5 text-ink-400" />
          <input ref={inputRef} autoFocus role="combobox" aria-expanded="true" aria-controls="meridian-palette-list" aria-activedescendant={items[idx] ? `palette-opt-${idx}` : undefined} aria-autocomplete="list" aria-label="Search" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} placeholder="Search vendors, contracts, assessments, findings…" className="flex-1 h-12 text-sm outline-none placeholder:text-ink-400" />
          <kbd className="text-[11px] text-ink-400 border border-ink-200 rounded px-1.5 py-0.5">ESC</kbd>
        </div>
        <ul id="meridian-palette-list" role="listbox" className="max-h-[50vh] overflow-y-auto py-2">
          {items.length === 0 && <li className="px-4 py-8 text-center text-sm text-ink-500">{dq.length >= 2 ? "No matches." : "Type to search across Meridian."}</li>}
          {items.map((item, i) => {
            const Icon = item.kind === "action" ? item.icon : ICONS[item.type];
            return (
              <li key={item.kind === "action" ? `a-${item.to}` : `${item.type}-${item.id}`} id={`palette-opt-${i}`} role="option" aria-selected={i === idx}>
                <button tabIndex={-1} onMouseEnter={() => setIdx(i)} onClick={() => go(item)} className={clsx("w-full flex items-center gap-3 px-4 py-2.5 text-left", i === idx ? "bg-brand-50" : "hover:bg-ink-50")}>
                  <span className={clsx("h-8 w-8 rounded-md flex items-center justify-center shrink-0", item.kind === "action" ? "bg-ink-100 text-ink-600" : "bg-brand-100 text-brand-700")}><Icon className="h-4 w-4" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-ink-900 truncate">{item.kind === "action" ? item.label : item.title}</span>
                    {item.kind === "result" && <span className="block text-xs text-ink-500 truncate">{item.type.charAt(0).toUpperCase() + item.type.slice(1)}{item.subtitle ? ` · ${item.subtitle}` : ""}</span>}
                  </span>
                  {i === idx && <ArrowRight className="h-4 w-4 text-brand-600" />}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
