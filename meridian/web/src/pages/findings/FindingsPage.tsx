import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AlarmClock, AlertOctagon, Plus, Search, ShieldAlert, Wrench, X } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useListParams, usePagedQuery, useUsers } from "@/lib/hooks";
import { fmtDate, LABELS, parseDate, TONES } from "@/lib/format";
import type { Finding, FindingStatus, Severity } from "@/lib/types";
import { Badge, Button, Card, DataTable, Input, PageHeader, Pagination, Select, Stat, type Column } from "@/components/ui";
import { DueCell, QuickChips, useCount, useDebouncedSearch, UserCell, useWritableUsers } from "@/components/assessments/common";
import { useVendorOptions } from "@/components/assessments/VendorPicker";
import { FindingFormModal } from "@/components/findings/FindingFormModal";

type View = "all" | "open" | "overdue" | "severe" | "mine" | "closed";
const STATUSES: FindingStatus[] = ["open", "in_remediation", "risk_accepted", "closed"];
const SEVERITIES: Severity[] = ["critical", "high", "medium", "low"];
const FILTER_KEYS = ["severity", "status", "vendor_id", "owner_id"] as const;

function ageDays(f: Finding) {
  const c = parseDate(f.created_at);
  if (!c) return null;
  const end = f.resolved_at ? parseDate(f.resolved_at) ?? new Date() : new Date();
  return Math.max(0, Math.floor((end.getTime() - c.getTime()) / 86_400_000));
}

export default function FindingsPage() {
  const { user, canWrite } = useAuth();
  const navigate = useNavigate();
  const lp = useListParams({ sort: "created_at", dir: "desc", limit: 25 });
  const users = useWritableUsers(useUsers().data);
  const vendors = useVendorOptions();
  const [search, setSearch] = useDebouncedSearch(lp.q, (v) => lp.set({ q: v }));
  const [createOpen, setCreateOpen] = useState(false);
  const view = (lp.get("view") || "all") as View;
  const newOpen = lp.get("new") === "1";
  const presetVendor = Number(lp.get("vendor")) || null;
  const createInitial = useMemo(() => (presetVendor ? { vendor_id: presetVendor } : undefined), [presetVendor]);

  const viewParams = useMemo<Record<string, string | number | undefined>>(() => {
    switch (view) {
      case "open": return { status: "open,in_remediation" };
      case "overdue": return { overdue: "true" };
      case "severe": return { severity: "critical,high", status: "open,in_remediation" };
      case "mine": return { owner_id: user?.id };
      case "closed": return { status: "closed,risk_accepted" };
      default: return {};
    }
  }, [view, user?.id]);

  const params = useMemo(() => {
    const p: Record<string, unknown> = { ...viewParams, q: lp.q, page: lp.page, limit: lp.limit, sort: lp.sort, dir: lp.dir };
    for (const k of FILTER_KEYS) if (lp.get(k)) p[k] = lp.get(k);
    return p;
  }, [viewParams, lp]);
  const { data, isLoading, isFetching } = usePagedQuery<Finding>("findings", "/api/findings", params);

  const kOpen = useCount("findings", "/api/findings", { status: "open,in_remediation" });
  const kCritical = useCount("findings", "/api/findings", { status: "open,in_remediation", severity: "critical" });
  const kOverdue = useCount("findings", "/api/findings", { overdue: "true" });
  const kRemediating = useCount("findings", "/api/findings", { status: "in_remediation" });
  const kSevere = useCount("findings", "/api/findings", { status: "open,in_remediation", severity: "critical,high" });
  const kMine = useCount("findings", "/api/findings", { status: "open,in_remediation", owner_id: user?.id });

  const hasFilters = FILTER_KEYS.some((k) => lp.get(k)) || !!lp.q;
  const clearFilters = () => { setSearch(""); lp.set({ q: null, severity: null, status: null, vendor_id: null, owner_id: null }); };

  const columns: Column<Finding>[] = [
    {
      key: "title", header: "Finding", sortable: true,
      render: (f) => (
        <div className="min-w-[180px] max-w-[220px]">
          <Link to={`/findings/${f.id}`} className="block font-medium text-ink-900 hover:text-brand-700 truncate" title={f.title}>{f.title}</Link>
          <div className="text-xs text-ink-500 truncate">{f.assessment_title ?? "Raised manually"}</div>
        </div>
      ),
    },
    {
      key: "vendor_name", header: "Vendor", sortable: true,
      render: (f) => (
        <Link to={`/vendors/${f.vendor_id}`} onClick={(e) => e.stopPropagation()} className="block text-ink-800 hover:text-brand-700 hover:underline truncate max-w-[150px]" title={f.vendor_name}>{f.vendor_name}</Link>
      ),
    },
    { key: "severity", header: "Severity", sortable: true, render: (f) => <Badge tone={TONES.tier[f.severity]}>{LABELS.tier[f.severity]}</Badge> },
    { key: "status", header: "Status", sortable: true, render: (f) => <Badge tone={TONES.findingStatus[f.status]} dot>{LABELS.findingStatus[f.status]}</Badge> },
    { key: "owner_name", header: "Owner", sortable: true, render: (f) => <span className="block max-w-[140px]"><UserCell name={f.owner_name} /></span> },
    { key: "due_date", header: "Due", sortable: true, render: (f) => <DueCell date={f.due_date} resolved={f.status === "closed" || f.status === "risk_accepted"} /> },
    {
      key: "age", header: "Age", align: "right",
      render: (f) => {
        const d = ageDays(f);
        const resolved = f.status === "closed" || f.status === "risk_accepted";
        return <span className={`tnum ${resolved ? "text-ink-400" : d != null && d > 90 ? "text-warning-700 font-medium" : "text-ink-700"}`} title={resolved ? "Days from raised to resolved" : "Days open"}>{d == null ? "—" : `${d}d`}</span>;
      },
    },
    { key: "created_at", header: "Created", sortable: true, render: (f) => <span className="tnum text-ink-600 whitespace-nowrap">{fmtDate(f.created_at, "MMM d, yy")}</span> },
  ];

  const chips = [
    { id: "all" as const, label: "All" },
    { id: "open" as const, label: "Open", count: kOpen.data },
    { id: "overdue" as const, label: "Overdue", count: kOverdue.data },
    { id: "severe" as const, label: "Critical & High", count: kSevere.data },
    { id: "mine" as const, label: "Mine", count: kMine.data },
    { id: "closed" as const, label: "Closed" },
  ];

  return (
    <>
      <PageHeader
        title="Findings"
        description="Control gaps raised from assessments and reviews, tracked through remediation."
        actions={canWrite && <Button icon={Plus} onClick={() => setCreateOpen(true)}>New finding</Button>}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Stat to="/findings?view=open" label="Open" value={kOpen.data ?? "—"} icon={ShieldAlert} tone="warning" hint="Open or in remediation" />
        <Stat to="/findings?view=open&severity=critical" label="Critical open" value={kCritical.data ?? "—"} icon={AlertOctagon} tone={kCritical.data ? "danger" : "success"} hint="Highest-severity unresolved gaps" />
        <Stat to="/findings?view=overdue&sort=due_date&dir=asc" label="Overdue" value={kOverdue.data ?? "—"} icon={AlarmClock} tone={kOverdue.data ? "danger" : "success"} hint="Past remediation due date" />
        <Stat to="/findings?status=in_remediation" label="In remediation" value={kRemediating.data ?? "—"} icon={Wrench} tone="info" hint="Vendor actively fixing" />
      </div>

      <Card padded={false}>
        <div className="px-4 pt-4 pb-3 space-y-3 border-b border-ink-200">
          <QuickChips options={chips} value={view} onChange={(v) => lp.set({ view: v === "all" ? null : v })} />
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[220px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-400 pointer-events-none" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search findings or vendors…" className="pl-9" aria-label="Search findings" />
            </div>
            <Select value={lp.get("severity")} onChange={(e) => lp.set({ severity: e.target.value })} className="w-36" aria-label="Severity">
              <option value="">All severities</option>
              {SEVERITIES.map((s) => <option key={s} value={s}>{LABELS.tier[s]}</option>)}
            </Select>
            <Select value={lp.get("status")} onChange={(e) => lp.set({ status: e.target.value })} className="w-40" aria-label="Status">
              <option value="">All statuses</option>
              {STATUSES.map((s) => <option key={s} value={s}>{LABELS.findingStatus[s]}</option>)}
            </Select>
            <Select value={lp.get("vendor_id")} onChange={(e) => lp.set({ vendor_id: e.target.value })} className="w-52" aria-label="Vendor">
              <option value="">All vendors</option>
              {vendors.data?.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </Select>
            <Select value={lp.get("owner_id")} onChange={(e) => lp.set({ owner_id: e.target.value })} className="w-44" aria-label="Owner">
              <option value="">All owners</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </Select>
            {hasFilters && <Button variant="ghost" size="sm" icon={X} onClick={clearFilters}>Clear</Button>}
            {isFetching && !isLoading && <span className="text-xs text-ink-400 ml-auto">Updating…</span>}
          </div>
        </div>
        <DataTable
          columns={columns}
          rows={data?.data ?? []}
          loading={isLoading}
          sort={lp.sort ? { key: lp.sort, dir: lp.dir } : undefined}
          onSort={lp.toggleSort}
          onRowClick={(f) => navigate(`/findings/${f.id}`)}
          emptyTitle={hasFilters || view !== "all" ? "No findings match your filters" : "No findings recorded"}
          emptyDescription={hasFilters || view !== "all" ? "Try adjusting the search or filters." : "Findings raised from assessments will appear here."}
        />
        {data && data.total > 0 && <Pagination page={lp.page} limit={lp.limit} total={data.total} onPage={lp.setPage} />}
      </Card>

      <FindingFormModal
        open={createOpen || (newOpen && canWrite)}
        initial={createInitial}
        onClose={() => { setCreateOpen(false); if (newOpen) lp.set({ new: null, vendor: null }, false); }}
        onSaved={(f) => navigate(`/findings/${f.id}`)}
      />
    </>
  );
}
