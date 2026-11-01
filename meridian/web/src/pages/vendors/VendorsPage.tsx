import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Download, Plus, Search, X } from "lucide-react";
import { Avatar, Badge, Button, Card, DataTable, Input, PageHeader, Pagination, RiskScore, Select, cn, type Column } from "@/components/ui";
import { Kpi, VendorMark } from "@/components/vendors/parts";
import { api, qs } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useDebounce, useListParams, usePagedQuery, useUsers } from "@/lib/hooks";
import { LABELS, TONES, daysUntil, fmtDate, fmtMoney, fmtNumber } from "@/lib/format";
import type { Vendor } from "@/lib/types";

const FILTER_KEYS = ["status", "tier", "category", "data_access", "owner_id"] as const;
type FilterKey = (typeof FILTER_KEYS)[number];
const FILTER_LABEL: Record<FilterKey, string> = { status: "Status", tier: "Tier", category: "Category", data_access: "Data access", owner_id: "Owner" };

interface Summary { total: number; active: number; onboarding: number; critical: number; high: number; overdue_reviews: number; elevated_residual: number; total_spend: number; avg_residual: number; open_findings: number }

export default function VendorsPage() {
  const navigate = useNavigate();
  const { canWrite } = useAuth();
  const lp = useListParams({ sort: "name", dir: "asc", limit: 25 });
  const [search, setSearch] = useState(lp.q);
  const debounced = useDebounce(search, 300);
  const { set, q } = lp;
  useEffect(() => { if (debounced !== q) set({ q: debounced }); }, [debounced]);

  const users = useUsers();
  const categories = useQuery({ queryKey: ["vendor-categories"], queryFn: () => api.get<{ data: string[] }>("/api/vendors/categories").then((r) => r.data), staleTime: Infinity });

  const filters = useMemo(() => Object.fromEntries(FILTER_KEYS.map((k) => [k, lp.get(k)])) as Record<FilterKey, string>, [lp.get]);
  const filterParams = useMemo(() => ({ q: lp.q, ...filters }), [lp.q, filters]);
  const params = useMemo(() => ({ ...filterParams, page: lp.page, limit: lp.limit, sort: lp.sort, dir: lp.dir }), [filterParams, lp.page, lp.limit, lp.sort, lp.dir]);

  const list = usePagedQuery<Vendor>("vendors", "/api/vendors", params);
  const summary = useQuery({ queryKey: ["vendors", "summary", filterParams], queryFn: () => api.get<{ data: Summary }>(`/api/vendors/summary${qs(filterParams)}`).then((r) => r.data), placeholderData: (p) => p });

  const userName = (id: string) => users.data?.find((u) => String(u.id) === id)?.name ?? `User #${id}`;
  const chipValue = (k: FilterKey, v: string) => (k === "status" ? LABELS.vendorStatus[v] : k === "tier" ? LABELS.tier[v] : k === "data_access" ? LABELS.dataAccess[v] : k === "owner_id" ? userName(v) : v);
  const activeFilters = FILTER_KEYS.filter((k) => filters[k]);
  const hasAny = activeFilters.length > 0 || !!lp.q;

  const clearAll = () => { setSearch(""); set({ q: null, ...Object.fromEntries(FILTER_KEYS.map((k) => [k, null])) }); };
  const exportCsv = () => window.open(`/api/vendors${qs({ format: "csv", ...filterParams, sort: lp.sort, dir: lp.dir })}`, "_blank");

  const s = summary.data;
  const baseColumns: Column<Vendor>[] = [
    {
      key: "name", header: "Vendor", sortable: true,
      render: (v) => (
        <div className="flex items-center gap-3 min-w-[160px] max-w-[200px]">
          <VendorMark name={v.name} size="sm" />
          <div className="min-w-0">
            <p className="font-medium text-ink-900 leading-snug hover:text-brand-700" title={v.name}>{v.name}</p>
            <p className="text-xs text-ink-500 truncate" title={v.country ?? undefined}>{v.category}</p>
          </div>
        </div>
      ),
    },
    { key: "status", header: "Status", sortable: true, render: (v) => <Badge tone={TONES.vendorStatus[v.status]} dot>{LABELS.vendorStatus[v.status]}</Badge> },
    { key: "tier", header: "Tier", sortable: true, render: (v) => <Badge tone={TONES.tier[v.tier]}>{LABELS.tier[v.tier]}</Badge> },
    { key: "residual_risk", header: "Residual", sortable: true, render: (v) => <RiskScore value={v.residual_risk} size="sm" /> },
    { key: "inherent_risk", header: "Inherent", sortable: true, align: "right", render: (v) => <span className="tnum text-ink-600">{v.inherent_risk}</span> },
    { key: "annual_spend", header: "Spend", sortable: true, align: "right", render: (v) => <span className="tnum text-ink-800" title={fmtMoney(v.annual_spend)}>{fmtMoney(v.annual_spend, "USD", true)}</span> },
    {
      key: "owner_name", header: "Owner", sortable: true,
      render: (v) => v.owner_name ? <span className="inline-flex items-center gap-2 whitespace-nowrap max-w-[120px]"><Avatar name={v.owner_name} size="xs" /><span className="text-ink-700 truncate">{v.owner_name}</span></span> : <span className="text-ink-400">Unassigned</span>,
    },
    { key: "open_findings", header: "Findings", sortable: true, align: "center", render: (v) => v.open_findings > 0 ? <Badge tone="danger">{v.open_findings}</Badge> : <span className="text-ink-300 tnum">0</span> },
    { key: "document_alerts", header: "Docs", sortable: true, align: "center", render: (v) => v.document_alerts > 0 ? <Badge tone="warning">{v.document_alerts}</Badge> : <span className="text-ink-300 tnum">0</span> },
    {
      key: "next_review_date", header: "Next review", sortable: true,
      render: (v) => {
        const d = daysUntil(v.next_review_date);
        if (d == null) return <span className="text-ink-400">Not scheduled</span>;
        const overdue = d < 0 && v.status !== "terminated";
        return (
          <div className="whitespace-nowrap">
            <p className={overdue ? "text-danger-700 font-medium" : "text-ink-700"}>{fmtDate(v.next_review_date)}</p>
            {(overdue || d <= 30) && <p className={overdue ? "text-xs text-danger-600" : "text-xs text-warning-700"}>{overdue ? `${Math.abs(d)}d overdue` : d === 0 ? "Due today" : `in ${d}d`}</p>}
          </div>
        );
      },
    },
    { key: "last_assessed_at", header: "Assessed", sortable: true, render: (v) => v.last_assessed_at ? <span className="text-ink-600 whitespace-nowrap" title={fmtDate(v.last_assessed_at)}>{fmtDate(v.last_assessed_at, "MMM yyyy")}</span> : <span className="text-ink-400">Never</span> },
  ];
  const columns: Column<Vendor>[] = baseColumns.map((c) => ({ ...c, className: cn("!px-3 first:!pl-4 last:!pr-4", c.key === "last_assessed_at" && "hidden 2xl:table-cell", c.key === "next_review_date" && "!pr-4 2xl:!pr-3") }));

  return (
    <>
      <PageHeader
        title="Vendors"
        description="Inventory of third parties, their risk posture, ownership and review cadence."
        actions={
          <>
            <Button variant="secondary" icon={Download} onClick={exportCsv}>Export CSV</Button>
            {canWrite && <Button icon={Plus} onClick={() => navigate("/vendors/new")}>Add vendor</Button>}
          </>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4 mb-6">
        <Kpi label="Vendors" hint={s ? `${s.active} active · ${s.onboarding} onboarding` : "\u00a0"}>{s ? fmtNumber(s.total) : "—"}</Kpi>
        <Kpi label="Critical · High" tone={s && s.critical > 0 ? "danger" : undefined} hint="By inherent tier">{s ? <span>{s.critical}<span className="text-ink-300 font-normal mx-1.5">/</span><span className="text-warning-700">{s.high}</span></span> : "—"}</Kpi>
        <Kpi label="Elevated residual" tone={s && s.elevated_residual > 0 ? "warning" : undefined} hint={s ? `Residual ≥ 60 · avg ${s.avg_residual}` : "\u00a0"}>{s ? fmtNumber(s.elevated_residual) : "—"}</Kpi>
        <Kpi label="Open findings" tone={s && s.open_findings > 0 ? "danger" : undefined} hint="Open or in remediation">{s ? fmtNumber(s.open_findings) : "—"}</Kpi>
        <Kpi label="Overdue reviews" tone={s && s.overdue_reviews > 0 ? "danger" : "success"} hint="Past next review date">{s ? fmtNumber(s.overdue_reviews) : "—"}</Kpi>
        <Kpi label="Annual spend" hint="Across matching vendors">{s ? fmtMoney(s.total_spend, "USD", true) : "—"}</Kpi>
      </div>

      <Card padded={false}>
        <div className="p-4 border-b border-ink-200 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[220px] max-w-sm">
              <Search className="h-4 w-4 text-ink-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, legal name or category" className="pl-9" aria-label="Search vendors" />
            </div>
            <Select aria-label="Status" className="!w-[150px] shrink-0" value={filters.status} onChange={(e) => set({ status: e.target.value })}>
              <option value="">All statuses</option>
              {Object.entries(LABELS.vendorStatus).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </Select>
            <Select aria-label="Tier" className="!w-[120px] shrink-0" value={filters.tier} onChange={(e) => set({ tier: e.target.value })}>
              <option value="">All tiers</option>
              {Object.entries(LABELS.tier).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </Select>
            <Select aria-label="Category" className="!w-[180px] shrink-0" value={filters.category} onChange={(e) => set({ category: e.target.value })}>
              <option value="">All categories</option>
              {(categories.data ?? []).map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
            <Select aria-label="Data access" className="!w-[160px] shrink-0" value={filters.data_access} onChange={(e) => set({ data_access: e.target.value })}>
              <option value="">Any data access</option>
              {Object.entries(LABELS.dataAccess).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </Select>
            <Select aria-label="Owner" className="!w-[160px] shrink-0" value={filters.owner_id} onChange={(e) => set({ owner_id: e.target.value })}>
              <option value="">All owners</option>
              {(users.data ?? []).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </Select>
          </div>
          {hasAny && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-ink-500">Filters</span>
              {lp.q && (
                <FilterChip label="Search" value={`“${lp.q}”`} onRemove={() => { setSearch(""); set({ q: null }); }} />
              )}
              {activeFilters.map((k) => <FilterChip key={k} label={FILTER_LABEL[k]} value={chipValue(k, filters[k])} onRemove={() => set({ [k]: null })} />)}
              <button onClick={clearAll} className="text-xs font-medium text-brand-700 hover:text-brand-800 hover:underline ml-1">Clear all</button>
              <span className="ml-auto text-xs text-ink-500 tnum">{list.data ? `${fmtNumber(list.data.total)} matching` : ""}</span>
            </div>
          )}
        </div>
        <DataTable
          columns={columns}
          rows={list.data?.data ?? []}
          loading={list.isLoading}
          sort={lp.sort ? { key: lp.sort, dir: lp.dir } : undefined}
          onSort={lp.toggleSort}
          rowHref={(v) => `/vendors/${v.id}`}
          emptyTitle={hasAny ? "No vendors match your filters" : "No vendors yet"}
          emptyDescription={hasAny ? "Try adjusting or clearing the filters to see more results." : "Add your first vendor to start tracking third-party risk."}
        />
        {list.data && list.data.total > 0 && <Pagination page={lp.page} limit={lp.limit} total={list.data.total} onPage={lp.setPage} />}
      </Card>
    </>
  );
}

function FilterChip({ label, value, onRemove }: { label: string; value: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-brand-200 bg-brand-50 pl-2.5 pr-1 py-0.5 text-xs text-brand-800">
      <span className="text-brand-600">{label}:</span>
      <span className="font-medium">{value}</span>
      <button onClick={onRemove} className="ml-0.5 rounded-full p-0.5 hover:bg-brand-100 text-brand-600" aria-label={`Remove ${label} filter`}><X className="h-3 w-3" /></button>
    </span>
  );
}
