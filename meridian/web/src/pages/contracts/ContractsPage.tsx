import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AlarmClock, CheckCircle2, Download, FileSignature, ListChecks, Plus, RefreshCw, Wallet, X } from "lucide-react";
import { api, qs } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useListParams, usePagedQuery, useUsers } from "@/lib/hooks";
import { LABELS, TONES, fmtDate, fmtMoney } from "@/lib/format";
import type { Contract, ContractStatus, ContractType } from "@/lib/types";
import { Avatar, Badge, Button, Card, DataTable, PageHeader, Pagination, Stat, type Column } from "@/components/ui";
import { ContractFormModal } from "@/components/contracts/ContractFormModal";
import { CELL, DaysLabel, FilterChips, SHORT_CONTRACT_TYPE, SearchInput, ToolbarSelect, useDebouncedSearch, useVendorOptions, type ChipOption } from "@/components/contracts/shared";

interface ContractSummary {
  total: number; active_count: number; active_value: number; expiring_30: number; expiring_90: number; in_progress: number; expired: number;
  auto_renew: number; pending_obligations: number; overdue_obligations: number;
}

const STATUSES: ContractStatus[] = ["draft", "in_review", "active", "expiring", "expired", "terminated"];
const TYPES: ContractType[] = ["msa", "sow", "nda", "dpa", "saas", "license", "services"];
const FILTER_KEYS = ["q", "status", "type", "vendor_id", "owner_id", "expiring_within"] as const;

const PRESETS: Record<string, { status?: string; expiring_within?: string }> = {
  all: {},
  exp30: { expiring_within: "30" },
  exp90: { expiring_within: "90" },
  pipeline: { status: "draft,in_review" },
  expired: { status: "expired" },
};

export default function ContractsPage() {
  const navigate = useNavigate();
  const { canWrite } = useAuth();
  const p = useListParams({ sort: "end_date", dir: "asc" });
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useDebouncedSearch(p.q, (v) => p.set({ q: v }));
  const { data: users = [] } = useUsers();
  const { data: vendors = [] } = useVendorOptions();

  const status = p.get("status");
  const type = p.get("type");
  const vendorId = p.get("vendor_id");
  const ownerId = p.get("owner_id");
  const expiringWithin = p.get("expiring_within");

  const params = { q: p.q, page: p.page, limit: p.limit, sort: p.sort, dir: p.dir, status, type, vendor_id: vendorId, owner_id: ownerId, expiring_within: expiringWithin };
  const list = usePagedQuery<Contract>("contracts", "/api/contracts", params);
  const summary = useQuery({ queryKey: ["contracts-summary"], queryFn: () => api.get<{ data: ContractSummary }>("/api/contracts/summary").then((r) => r.data) });
  const s = summary.data;

  const preset = useMemo(() => {
    for (const [id, cfg] of Object.entries(PRESETS)) {
      if ((cfg.status ?? "") === status && (cfg.expiring_within ?? "") === expiringWithin) return id;
    }
    return "";
  }, [status, expiringWithin]);
  const chips: ChipOption[] = [
    { id: "all", label: "All", count: s?.total },
    { id: "exp30", label: "Expiring ≤30d", count: s?.expiring_30, tone: "danger" },
    { id: "exp90", label: "Expiring ≤90d", count: s?.expiring_90, tone: "warning" },
    { id: "pipeline", label: "Draft & In review", count: s?.in_progress, tone: "info" },
    { id: "expired", label: "Expired", count: s?.expired, tone: "neutral" },
  ];
  const applyPreset = (id: string) => {
    const cfg = PRESETS[id] ?? {};
    p.set({ status: cfg.status ?? null, expiring_within: cfg.expiring_within ?? null });
  };
  const hasFilters = FILTER_KEYS.some((k) => !!p.get(k));
  const clearFilters = () => { setSearch(""); p.set(Object.fromEntries(FILTER_KEYS.map((k) => [k, null]))); };

  const exportCsv = () => {
    const { page: _page, limit: _limit, ...rest } = params;
    window.location.assign(`/api/contracts${qs({ ...rest, format: "csv" })}`);
  };

  const columns: Column<Contract>[] = [
    {
      key: "title", header: "Contract", sortable: true, className: CELL,
      render: (c) => (
        <div className="w-[210px] 2xl:w-[300px]">
          <Link to={`/contracts/${c.id}`} onClick={(e) => e.stopPropagation()} title={c.title} className="block truncate font-medium text-ink-900 hover:text-brand-700">{c.title}</Link>
          <span className="font-mono text-xs text-ink-500">{c.contract_number}</span>
        </div>
      ),
    },
    {
      key: "vendor_name", header: "Vendor", sortable: true, className: CELL,
      render: (c) => <Link to={`/vendors/${c.vendor_id}`} onClick={(e) => e.stopPropagation()} title={c.vendor_name} className="block max-w-[130px] truncate text-ink-700 hover:text-brand-700 hover:underline 2xl:max-w-[200px]">{c.vendor_name}</Link>,
    },
    { key: "type", header: "Type", sortable: true, className: CELL, render: (c) => <Badge tone="neutral" size="xs"><span title={LABELS.contractType[c.type]}>{SHORT_CONTRACT_TYPE[c.type] ?? c.type}</span></Badge> },
    { key: "status", header: "Status", sortable: true, className: CELL, render: (c) => <Badge tone={TONES.contractStatus[c.status]} dot>{LABELS.contractStatus[c.status]}</Badge> },
    { key: "value", header: "Value", sortable: true, align: "right", className: CELL, render: (c) => <span className="tnum whitespace-nowrap font-medium text-ink-900">{fmtMoney(c.value, c.currency)}</span> },
    {
      key: "end_date", header: "Term", sortable: true, className: CELL,
      render: (c) => (
        <div className="tnum whitespace-nowrap text-xs leading-5">
          <p className="text-ink-500">{fmtDate(c.start_date, "MMM d, yyyy")} →</p>
          <p className="font-medium text-ink-800">{fmtDate(c.end_date, "MMM d, yyyy")}</p>
        </div>
      ),
    },
    {
      key: "days", header: "Days left", align: "right", className: CELL,
      render: (c) => (c.status === "terminated" ? <span className="text-ink-400">—</span> : <DaysLabel date={c.end_date} />),
    },
    {
      key: "auto_renew", header: "Renews", align: "center", className: CELL,
      render: (c) => (c.auto_renew ? <CheckCircle2 className="mx-auto h-4 w-4 text-success-600" aria-label="Auto-renews" /> : <span className="text-ink-300">—</span>),
    },
    {
      key: "owner", header: "Owner", className: CELL,
      render: (c) => (c.owner_name ? <span className="inline-flex max-w-[100px] items-center gap-1.5 text-ink-700" title={c.owner_name}><Avatar name={c.owner_name} size="xs" /><span className="truncate">{c.owner_name.split(" ")[0]}</span></span> : <span className="text-xs text-ink-400">Unassigned</span>),
    },
    {
      key: "pending_obligations", header: "Open obl.", align: "center", className: CELL,
      render: (c) => (c.pending_obligations ? <span title={`${c.pending_obligations} pending obligations`} className="tnum inline-flex min-w-6 justify-center rounded-full bg-sky-50 px-1.5 text-xs font-semibold text-sky-700 ring-1 ring-inset ring-sky-200">{c.pending_obligations}</span> : <span className="tnum text-ink-300">0</span>),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Contracts"
        description="Contract register — terms, renewals and obligations across your vendor portfolio."
        actions={
          <>
            <Button variant="secondary" icon={Download} onClick={exportCsv}>Export CSV</Button>
            {canWrite && <Button icon={Plus} onClick={() => setCreating(true)}>New contract</Button>}
          </>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Active contracts" value={s ? s.active_count : "—"} icon={FileSignature} hint={s ? `${s.auto_renew} set to auto-renew` : " "} to="/contracts?status=active,expiring" />
        <Stat label="Total active value" value={s ? fmtMoney(s.active_value, "USD", true) : "—"} icon={Wallet} hint={s ? fmtMoney(s.active_value) : " "} />
        <Stat label="Expiring ≤ 90 days" value={s ? s.expiring_90 : "—"} icon={AlarmClock} tone={s && s.expiring_30 > 0 ? "danger" : s && s.expiring_90 > 0 ? "warning" : undefined} hint={s ? `${s.expiring_30} within 30 days` : " "} to="/contracts?expiring_within=90" />
        <Stat label="Pending obligations" value={s ? s.pending_obligations : "—"} icon={ListChecks} tone={s && s.overdue_obligations > 0 ? "warning" : undefined} hint={s ? (s.overdue_obligations ? `${s.overdue_obligations} past due` : "None past due") : " "} />
      </div>

      <Card padded={false}>
        <div className="space-y-3 border-b border-ink-200 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <FilterChips options={chips} value={preset} onChange={applyPreset} />
            {list.isFetching && !list.isLoading && <RefreshCw className="h-3.5 w-3.5 animate-spin text-ink-400" aria-label="Refreshing" />}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput value={search} onChange={setSearch} placeholder="Search title, number or vendor…" className="w-full sm:w-72" />
            <ToolbarSelect label="Status" value={status} onChange={(v) => p.set({ status: v })}>
              <option value="">All statuses</option>
              {STATUSES.map((st) => <option key={st} value={st}>{LABELS.contractStatus[st]}</option>)}
              {status && !STATUSES.includes(status as ContractStatus) && <option value={status}>{status.split(",").map((x) => LABELS.contractStatus[x] ?? x).join(" & ")}</option>}
            </ToolbarSelect>
            <ToolbarSelect label="Type" value={type} onChange={(v) => p.set({ type: v })}>
              <option value="">All types</option>
              {TYPES.map((t) => <option key={t} value={t}>{LABELS.contractType[t]}</option>)}
            </ToolbarSelect>
            <ToolbarSelect label="Vendor" value={vendorId} onChange={(v) => p.set({ vendor_id: v })} className="max-w-[220px]">
              <option value="">All vendors</option>
              {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </ToolbarSelect>
            <ToolbarSelect label="Owner" value={ownerId} onChange={(v) => p.set({ owner_id: v })}>
              <option value="">All owners</option>
              {users.filter((u) => u.role !== "auditor").map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </ToolbarSelect>
            {expiringWithin && preset !== "exp30" && preset !== "exp90" && (
              <Badge tone="warning">Ends within {expiringWithin} days</Badge>
            )}
            {hasFilters && <Button variant="ghost" size="sm" icon={X} onClick={clearFilters}>Clear</Button>}
          </div>
        </div>
        <DataTable
          columns={columns}
          rows={list.data?.data ?? []}
          loading={list.isLoading}
          sort={{ key: p.sort, dir: p.dir }}
          onSort={p.toggleSort}
          onRowClick={(c) => navigate(`/contracts/${c.id}`)}
          emptyTitle={hasFilters ? "No contracts match these filters" : "No contracts yet"}
          emptyDescription={hasFilters ? "Try widening the date window or clearing a filter." : canWrite ? "Create your first contract to start tracking renewals and obligations." : undefined}
        />
        {list.isError && <p className="border-t border-ink-200 px-4 py-3 text-sm text-danger-700">Could not load contracts. {String((list.error as Error).message)}</p>}
        <Pagination page={p.page} limit={p.limit} total={list.data?.total ?? 0} onPage={p.setPage} />
      </Card>

      <ContractFormModal open={creating} onClose={() => setCreating(false)} onSaved={(c) => navigate(`/contracts/${c.id}`)} />
    </div>
  );
}

