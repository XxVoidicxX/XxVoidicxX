import { Fragment, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, ChevronRight, Download, Lock, ScrollText, Search, X } from "lucide-react";
import { Avatar, Badge, Button, Card, EmptyState, Input, PageHeader, Pagination, Select, Skeleton, cn } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { useDebounce, useListParams, usePagedQuery, useUsers } from "@/lib/hooks";
import { LABELS, fmtDateTime, fmtRelative, titleCase, type Tone } from "@/lib/format";
import type { Activity } from "@/lib/types";
import { entityPath, humanizeKey, humanizeValue } from "@/components/approvals/rules";

const ENTITY_TYPES = ["vendor", "contract", "assessment", "finding", "document", "approval", "user", "settings", "template"] as const;
const ACTIONS = ["create", "update", "status_change", "submit", "approve", "reject", "complete", "return", "comment", "login", "delete", "cancel"] as const;
const ACTION_TONE: Record<string, Tone> = {
  create: "brand", update: "neutral", status_change: "info", submit: "info", approve: "success", complete: "success",
  reject: "danger", delete: "danger", return: "warning", cancel: "warning", comment: "neutral", login: "neutral",
};
const ACTION_LABEL: Record<string, string> = { status_change: "Status change" };
const actionLabel = (a: string) => ACTION_LABEL[a] ?? titleCase(a);

function auditEntityLink(type: string, id: number | null): string | null {
  if (type === "user") return "/settings?tab=users";
  if (type === "template") return "/settings?tab=templates";
  if (type === "settings") return "/settings?tab=organization";
  if (type === "document") return "/documents";
  return entityPath(type, id);
}

function parseMeta(raw: string | null): { key: string; value: string }[] | null {
  if (!raw) return null;
  try {
    const v: unknown = JSON.parse(raw);
    if (v && typeof v === "object" && !Array.isArray(v)) {
      return Object.entries(v as Record<string, unknown>).map(([key, value]) => ({ key, value: value !== null && typeof value === "object" ? JSON.stringify(value) : String(value) }));
    }
    return [{ key: "value", value: typeof v === "string" ? v : JSON.stringify(v) }];
  } catch {
    return [{ key: "raw", value: raw }];
  }
}

const isoDay = (offsetDays: number) => new Date(Date.now() - offsetDays * 86_400_000).toISOString().slice(0, 10);

export default function AuditLogPage() {
  const lp = useListParams({ limit: 50 });
  const { toast } = useToast();
  const users = useUsers();
  const [search, setSearch] = useState(lp.q);
  const q = useDebounce(search, 300);
  const [open, setOpen] = useState<Set<number>>(new Set());
  const f = { entity_type: lp.get("entity_type"), action: lp.get("action"), actor_id: lp.get("actor_id"), from: lp.get("from"), to: lp.get("to") };
  const params = { q: q || undefined, ...f, page: lp.page, limit: lp.limit };
  const list = usePagedQuery<Activity>("activity", "/api/activity", params);
  const rows = list.data?.data ?? [];
  const userById = useMemo(() => new Map((users.data ?? []).map((u) => [u.id, u])), [users.data]);
  const hasFilters = !!(q || f.entity_type || f.action || f.actor_id || f.from || f.to);

  const toggle = (id: number) => setOpen((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const onSearch = (v: string) => { setSearch(v); lp.set({ q: v || null }); };
  const clear = () => { setSearch(""); lp.set({ q: null, entity_type: null, action: null, actor_id: null, from: null, to: null }); };
  const preset = (days: number) => lp.set({ from: isoDay(days), to: isoDay(0) });

  const exportCsv = () => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries({ q: q || undefined, ...f })) if (v) sp.set(k, String(v));
    sp.set("format", "csv");
    window.open(`/api/activity?${sp.toString()}`, "_blank");
  };


  const cols = 6;
  return (
    <>
      <PageHeader
        title="Audit Log"
        description="Immutable, chronological record of every change, decision and sign-in across Meridian."
        meta={<Badge tone="neutral"><Lock className="h-3 w-3" />Append-only · cannot be edited or deleted</Badge>}
        actions={<Button variant="secondary" icon={Download} onClick={exportCsv} disabled={!rows.length}>Export CSV</Button>}
      />
      <Card padded={false}>
        <div className="p-4 border-b border-ink-200 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-400" />
              <Input value={search} onChange={(e) => onSearch(e.target.value)} placeholder="Search summary, actor, details…" className="pl-9" aria-label="Search audit log" />
            </div>
            <Select value={f.entity_type} onChange={(e) => lp.set({ entity_type: e.target.value || null })} className="!w-40 shrink-0" aria-label="Entity type">
              <option value="">All entities</option>
              {ENTITY_TYPES.map((t) => <option key={t} value={t}>{titleCase(t)}</option>)}
            </Select>
            <Select value={f.action} onChange={(e) => lp.set({ action: e.target.value || null })} className="!w-40 shrink-0" aria-label="Action">
              <option value="">All actions</option>
              {ACTIONS.map((a) => <option key={a} value={a}>{actionLabel(a)}</option>)}
            </Select>
            <Select value={f.actor_id} onChange={(e) => lp.set({ actor_id: e.target.value || null })} className="!w-48 shrink-0" aria-label="Actor">
              <option value="">All actors</option>
              {(users.data ?? []).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </Select>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium uppercase tracking-wide text-ink-500 mr-1">Date</span>
            <Input type="date" value={f.from} max={f.to || undefined} onChange={(e) => lp.set({ from: e.target.value || null })} className="!w-40 shrink-0" aria-label="From date" />
            <span className="text-ink-400 text-sm">to</span>
            <Input type="date" value={f.to} min={f.from || undefined} onChange={(e) => lp.set({ to: e.target.value || null })} className="!w-40 shrink-0" aria-label="To date" />
            <div className="flex items-center gap-1 ml-1">
              {[{ l: "24h", d: 1 }, { l: "7d", d: 7 }, { l: "30d", d: 30 }, { l: "90d", d: 90 }].map((p) => (
                <Button key={p.l} variant="ghost" size="xs" onClick={() => preset(p.d)} className={cn(f.from === isoDay(p.d) && f.to === isoDay(0) && "bg-brand-50 text-brand-700")}>{p.l}</Button>
              ))}
            </div>
            {hasFilters && <Button variant="ghost" size="sm" icon={X} onClick={clear}>Clear filters</Button>}
            <span className="ml-auto text-sm text-ink-500 tnum">{list.data ? `${list.data.total.toLocaleString()} event${list.data.total === 1 ? "" : "s"}` : ""}</span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink-200 bg-ink-50/70 text-left">
                <th className="w-8 px-2 py-2.5" />
                {["Timestamp", "Actor", "Action", "Entity", "Summary"].map((h) => <th key={h} className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-ink-500 whitespace-nowrap">{h}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {list.isLoading ? (
                Array.from({ length: 8 }).map((_, i) => <tr key={i}>{Array.from({ length: cols }).map((__, j) => <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-3/4" /></td>)}</tr>)
              ) : rows.length === 0 ? (
                <tr><td colSpan={cols}><EmptyState icon={ScrollText} title={hasFilters ? "No events match your filters" : "No audit events yet"} description={hasFilters ? "Adjust or clear filters to see more events." : "Activity is recorded here as people use Meridian."} action={hasFilters ? <Button variant="secondary" size="sm" onClick={clear}>Clear filters</Button> : undefined} /></td></tr>
              ) : (
                rows.map((r) => {
                  const expanded = open.has(r.id);
                  const link = auditEntityLink(r.entity_type, r.entity_id);
                  const meta = parseMeta(r.metadata);
                  const actor = r.actor_id ? userById.get(r.actor_id) : undefined;
                  return (
                    <Fragment key={r.id}>
                      <tr onClick={() => toggle(r.id)} className={cn("cursor-pointer transition-colors", expanded ? "bg-brand-50/40" : "bg-white hover:bg-ink-50")} aria-expanded={expanded}>
                        <td className="px-2 py-2.5 text-ink-400 align-middle">
                          <button className="rounded p-0.5 hover:text-ink-700 focus-ring" aria-label={expanded ? "Collapse details" : "Expand details"} onClick={(e) => { e.stopPropagation(); toggle(r.id); }}>
                            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </button>
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          <p className="text-ink-800 tnum">{fmtDateTime(r.created_at)}</p>
                          <p className="text-xs text-ink-500">{fmtRelative(r.created_at)}</p>
                        </td>
                        <td className="px-4 py-2.5">
                          {r.actor_name ? (
                            <div className="flex items-center gap-2 whitespace-nowrap">
                              <Avatar name={r.actor_name} size="sm" />
                              <div className="leading-tight">
                                <p className="text-ink-800">{r.actor_name}</p>
                                <p className="text-xs text-ink-500">{LABELS.role[r.actor_role ?? ""] ?? "—"}</p>
                              </div>
                            </div>
                          ) : <span className="text-ink-500 italic">System</span>}
                        </td>
                        <td className="px-4 py-2.5"><Badge tone={ACTION_TONE[r.action] ?? "neutral"}>{actionLabel(r.action)}</Badge></td>
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          <span className="text-ink-600">{titleCase(r.entity_type)}</span>
                          {r.entity_id != null && (link
                            ? <Link to={link} onClick={(e) => e.stopPropagation()} className="ml-1.5 font-mono text-xs text-brand-700 hover:underline">#{r.entity_id}</Link>
                            : <span className="ml-1.5 font-mono text-xs text-ink-500">#{r.entity_id}</span>)}
                        </td>
                        <td className="px-4 py-2.5 text-ink-700 min-w-[16rem]"><span className="line-clamp-2">{r.summary}</span></td>
                      </tr>
                      {expanded && (
                        <tr className="bg-ink-50/60">
                          <td />
                          <td colSpan={cols - 1} className="px-4 pt-1 pb-4">
                            <div className="rounded-lg border border-ink-200 bg-white p-4 space-y-3 animate-fade-in">
                              <p className="text-sm text-ink-800 whitespace-pre-wrap break-words">{r.summary}</p>
                              <dl className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-2 text-xs">
                                <div><dt className="text-ink-500 uppercase tracking-wide font-medium">Event ID</dt><dd className="font-mono text-ink-800 mt-0.5">{r.id}</dd></div>
                                <div><dt className="text-ink-500 uppercase tracking-wide font-medium">Recorded (UTC)</dt><dd className="font-mono text-ink-800 mt-0.5">{r.created_at}</dd></div>
                                <div className="min-w-0"><dt className="text-ink-500 uppercase tracking-wide font-medium">Actor</dt><dd className="text-ink-800 mt-0.5 truncate">{actor ? `${actor.name} · ${actor.email}` : r.actor_name ?? "System"}</dd></div>
                                <div><dt className="text-ink-500 uppercase tracking-wide font-medium">Entity</dt><dd className="text-ink-800 mt-0.5">{titleCase(r.entity_type)}{r.entity_id != null ? ` #${r.entity_id}` : ""}{link && <Link to={link} className="ml-2 text-brand-700 hover:underline">Open</Link>}</dd></div>
                              </dl>
                              <div>
                                <p className="text-xs text-ink-500 uppercase tracking-wide font-medium mb-1.5">Metadata</p>
                                {meta?.length ? (
                                  <div className="flex flex-wrap gap-1.5">
                                    {meta.map((m) => {
                                      const human = humanizeValue(m.key, m.value, r.entity_type);
                                      return (
                                        <span key={m.key} className="inline-flex max-w-full items-center rounded-md border border-ink-200 bg-ink-50 text-xs overflow-hidden" title={`${m.key}: ${m.value}`}>
                                          <span className="px-2 py-1 font-medium text-ink-600 bg-ink-100 border-r border-ink-200 whitespace-nowrap">{humanizeKey(m.key)}</span>
                                          <span className={cn("px-2 py-1 text-ink-800 truncate", human === m.value && "font-mono")}>{human}</span>
                                        </span>
                                      );
                                    })}
                                  </div>
                                ) : <p className="text-xs text-ink-400">No additional metadata recorded for this event.</p>}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {(list.data?.total ?? 0) > 0 && <Pagination page={lp.page} limit={lp.limit} total={list.data?.total ?? 0} onPage={(p) => { setOpen(new Set()); lp.setPage(p); }} />}
      </Card>
    </>
  );
}
