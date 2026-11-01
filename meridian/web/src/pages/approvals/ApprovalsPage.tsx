import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Clock, Hourglass, Inbox, Search, Send, X, XCircle } from "lucide-react";
import { Avatar, Badge, Button, Card, DataTable, Input, PageHeader, Pagination, Select, Stat, Tabs, type Column } from "@/components/ui";
import { api, qs } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useDebounce, useListParams, usePagedQuery } from "@/lib/hooks";
import { LABELS, TONES, fmtDateTime, fmtRelative } from "@/lib/format";
import { DecisionModal, type Decision } from "@/components/approvals/DecisionModal";
import { APPROVAL_TYPES, APPROVER_ROLES, PRIORITIES, PRIORITY_LABEL, TYPE_SHORT, ageHours, firstLine, fmtDuration, type ApprovalRow } from "@/components/approvals/rules";

type TabId = "inbox" | "pending" | "mine" | "history";
const TAB_IDS: TabId[] = ["inbox", "pending", "mine", "history"];

function useTotal(key: string, params: Record<string, unknown>) {
  return useQuery({ queryKey: ["approvals", "kpi", key, params], queryFn: () => api.get<{ total: number }>(`/api/approvals${qs({ ...params, limit: 1 })}`).then((r) => r.total) });
}

export default function ApprovalsPage() {
  const { user } = useAuth();
  const nav = useNavigate();
  const lp = useListParams({ sort: "created_at", dir: "desc" });
  const rawTab = lp.get("tab") as TabId;
  const tab: TabId = TAB_IDS.includes(rawTab) ? rawTab : "inbox";
  const [search, setSearch] = useState(lp.q);
  const q = useDebounce(search, 300);
  const type = lp.get("type");
  const priority = lp.get("priority");
  const [deciding, setDeciding] = useState<{ row: ApprovalRow; decision: Decision } | null>(null);

  const thirtyDaysAgo = useMemo(() => new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10), []);
  const myTypes = useMemo(() => APPROVAL_TYPES.filter((t) => user && APPROVER_ROLES[t].includes(user.role)), [user]);
  const kInbox = useTotal("inbox", { status: "pending", mine: "true" });
  const kUrgent = useTotal("urgent", { status: "pending", priority: "urgent,high" });
  const kPending = useTotal("pending", { status: "pending" });
  const kMinePending = useTotal("mine-pending", { status: "pending", requested_by: user?.id });
  const kMine = useTotal("mine", { requested_by: user?.id });
  const kDecided = useTotal("decided", { status: "approved,rejected", decided_from: thirtyDaysAgo });

  const tabParams: Record<TabId, Record<string, unknown>> = {
    inbox: { status: "pending", mine: "true" },
    pending: { status: "pending" },
    mine: { requested_by: user?.id },
    history: { status: "approved,rejected,cancelled" },
  };
  const params = { ...tabParams[tab], q: q || undefined, type: type || undefined, priority: priority || undefined, page: lp.page, limit: lp.limit, sort: lp.sort, dir: lp.dir };
  const list = usePagedQuery<ApprovalRow>("approvals", "/api/approvals", params);
  const rows = list.data?.data ?? [];

  const setTab = (t: TabId) => lp.set({ tab: t === "inbox" ? null : t, sort: t === "history" ? "decided_at" : null, dir: t === "history" ? "desc" : null });
  const onSearch = (v: string) => { setSearch(v); lp.set({ q: v || null }); };
  const hasFilters = !!(q || type || priority);

  const columns: Column<ApprovalRow>[] = [
    {
      key: "title", header: "Request", render: (r) => (
        <div className="min-w-0 max-w-[14rem] 2xl:max-w-[22rem]">
          <p className="font-medium text-ink-900 truncate">{r.title}</p>
          {firstLine(r.description) && <p className="text-xs text-ink-500 truncate mt-0.5">{firstLine(r.description)}</p>}
        </div>
      ),
    },
    { key: "type", header: "Type", sortable: true, render: (r) => <span title={LABELS.approvalType[r.type]}><Badge tone="brand">{TYPE_SHORT[r.type]}</Badge></span> },
    {
      key: "vendor", header: "Vendor", render: (r) => r.vendor_name
        ? (r.vendor_id ? <Link to={`/vendors/${r.vendor_id}`} onClick={(e) => e.stopPropagation()} className="block max-w-[9rem] 2xl:max-w-[14rem] truncate text-brand-700 hover:underline" title={r.vendor_name}>{r.vendor_name}</Link> : <span className="block max-w-[9rem] 2xl:max-w-[14rem] truncate">{r.vendor_name}</span>)
        : <span className="text-ink-400">—</span>,
    },
    { key: "priority", header: "Priority", sortable: true, render: (r) => <Badge tone={TONES.priority[r.priority]} dot>{PRIORITY_LABEL[r.priority]}</Badge> },
    {
      key: "requested_by", header: "Requested by", render: (r) => (
        <div className="flex items-center gap-2 whitespace-nowrap">
          <Avatar name={r.requested_by_name} size="sm" />
          <div className="leading-tight">
            <p className="text-ink-800">{r.requested_by_name}{r.requested_by === user?.id && <span className="text-ink-400"> (you)</span>}</p>
            <p className="text-xs text-ink-500" title={fmtDateTime(r.created_at)}>{fmtRelative(r.created_at)}</p>
          </div>
        </div>
      ),
    },
    tab === "history"
      ? {
          key: "decided_at", header: "Decided", sortable: true, render: (r) => (
            <div className="whitespace-nowrap leading-tight">
              <p className="text-ink-800">{r.approver_name ?? (r.status === "cancelled" ? "Cancelled" : "—")}</p>
              <p className="text-xs text-ink-500" title={fmtDateTime(r.decided_at)}>{fmtRelative(r.decided_at)} · {fmtDuration(ageHours(r.created_at, r.decided_at))}</p>
            </div>
          ),
        }
      : {
          key: "created_at", header: "Age", sortable: true, align: "right", render: (r) => {
            const h = r.status === "pending" ? ageHours(r.created_at) : ageHours(r.created_at, r.decided_at);
            const stale = r.status === "pending" && (h ?? 0) > 72;
            return <span className={stale ? "inline-flex items-center gap-1 font-medium text-warning-700 tnum" : "text-ink-600 tnum"}>{stale && <Clock className="h-3.5 w-3.5" />}{fmtDuration(h)}</span>;
          },
        },
  ];
  if (tab === "mine" || tab === "history") columns.splice(columns.length - 1, 0, { key: "status", header: "Status", sortable: true, render: (r) => <Badge tone={TONES.approvalStatus[r.status]} dot>{LABELS.approvalStatus[r.status]}</Badge> });
  if (tab === "inbox") {
    columns.push({
      key: "actions", header: <span className="sr-only">Actions</span>, align: "right", render: (r) => r.requested_by === user?.id
        ? <span className="text-xs text-ink-400 whitespace-nowrap" title="Segregation of duties: you cannot decide your own request">Your request</span>
        : (
          <div className="flex justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
            <Button size="xs" variant="secondary" icon={CheckCircle2} className="text-success-700" onClick={() => setDeciding({ row: r, decision: "approved" })}>Approve</Button>
            <Button size="xs" variant="secondary" icon={XCircle} className="text-danger-700" onClick={() => setDeciding({ row: r, decision: "rejected" })}>Reject</Button>
          </div>
        ),
    });
  }

  const emptyCopy: Record<TabId, { title: string; description: string }> = {
    inbox: myTypes.length
      ? { title: "Inbox zero", description: "There are no pending requests waiting on your role." }
      : { title: "Nothing to decide", description: `Your role (${LABELS.role[user?.role ?? ""] ?? "—"}) does not approve any request types.` },
    pending: { title: "No pending requests", description: "Every request has been decided." },
    mine: { title: "You haven't raised any requests", description: "Requests you submit for onboarding, contracts or risk acceptance appear here." },
    history: { title: "No decided requests", description: "Approved, rejected and cancelled requests appear here." },
  };

  return (
    <>
      <PageHeader
        title="Approvals"
        description={myTypes.length ? `You can decide ${myTypes.map((t) => LABELS.approvalType[t]).join(", ")} requests.` : "Track requests you have raised and their decisions."}
      />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Stat label="Awaiting my role" value={kInbox.data ?? "—"} icon={Inbox} tone={(kInbox.data ?? 0) > 0 ? "brand" : undefined} hint={myTypes.length ? "Pending in your inbox" : "Your role doesn't approve"} />
        <Stat label="Urgent / high pending" value={kUrgent.data ?? "—"} icon={AlertTriangle} tone={(kUrgent.data ?? 0) > 0 ? "danger" : undefined} hint={`of ${kPending.data ?? "—"} pending overall`} />
        <Stat label="My requests pending" value={kMinePending.data ?? "—"} icon={Hourglass} tone={(kMinePending.data ?? 0) > 0 ? "warning" : undefined} hint={`${kMine.data ?? "—"} raised in total`} />
        <Stat label="Decided · last 30 days" value={kDecided.data ?? "—"} icon={CheckCircle2} tone="success" hint="Approved or rejected" />
      </div>
      <Card padded={false}>
        <div className="px-4 pt-1">
          <Tabs<TabId>
            value={tab}
            onChange={setTab}
            tabs={[
              { id: "inbox", label: "Inbox", count: kInbox.data },
              { id: "pending", label: "All pending", count: kPending.data },
              { id: "mine", label: "My requests", count: kMine.data },
              { id: "history", label: "History" },
            ]}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-ink-200">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-400" />
            <Input value={search} onChange={(e) => onSearch(e.target.value)} placeholder="Search requests…" className="pl-9" aria-label="Search requests" />
          </div>
          <Select value={type} onChange={(e) => lp.set({ type: e.target.value || null })} className="!w-48 shrink-0" aria-label="Filter by type">
            <option value="">All types</option>
            {APPROVAL_TYPES.map((t) => <option key={t} value={t}>{LABELS.approvalType[t]}</option>)}
          </Select>
          <Select value={priority} onChange={(e) => lp.set({ priority: e.target.value || null })} className="!w-40 shrink-0" aria-label="Filter by priority">
            <option value="">All priorities</option>
            {PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
          </Select>
          {hasFilters && <Button variant="ghost" size="sm" icon={X} onClick={() => { setSearch(""); lp.set({ q: null, type: null, priority: null }); }}>Clear</Button>}
          {tab === "mine" && <span className="ml-auto inline-flex items-center gap-1.5 text-xs text-ink-500"><Send className="h-3.5 w-3.5" />Requests you raised</span>}
        </div>
        <DataTable<ApprovalRow>
          columns={columns}
          rows={rows}
          loading={list.isLoading}
          sort={{ key: lp.sort, dir: lp.dir }}
          onSort={lp.toggleSort}
          onRowClick={(r) => nav(`/approvals/${r.id}`)}
          emptyTitle={hasFilters ? "No requests match your filters" : emptyCopy[tab].title}
          emptyDescription={hasFilters ? "Try clearing filters or searching for something else." : emptyCopy[tab].description}
        />
        {(list.data?.total ?? 0) > 0 && <Pagination page={lp.page} limit={lp.limit} total={list.data?.total ?? 0} onPage={lp.setPage} />}
      </Card>
      <DecisionModal approval={deciding?.row ?? null} decision={deciding?.decision ?? null} onClose={() => setDeciding(null)} />
    </>
  );
}
