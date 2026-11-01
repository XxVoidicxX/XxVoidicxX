import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AlarmClock, CheckCircle2, ClipboardCheck, Hourglass, Plus, Search, X } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useListParams, usePagedQuery, useUsers } from "@/lib/hooks";
import { LABELS, TONES } from "@/lib/format";
import type { Assessment, AssessmentStatus } from "@/lib/types";
import { Avatar, Badge, Button, Card, DataTable, Input, PageHeader, Pagination, Select, Stat, type Column } from "@/components/ui";
import { DueCell, fmtScore, ProgressBar, QuickChips, RATING_TEXT, TierBadge, useCount, useDebouncedSearch, useWritableUsers } from "@/components/assessments/common";
import { NewAssessmentModal, useTemplates } from "@/components/assessments/NewAssessmentModal";

type View = "all" | "mine" | "review" | "overdue" | "completed";
const STATUSES: AssessmentStatus[] = ["not_started", "in_progress", "submitted", "under_review", "completed"];
const FILTER_KEYS = ["status", "template_id", "assigned_to", "risk_rating"] as const;

function shortTitle(a: Assessment) {
  const suffix = ` — ${a.vendor_name}`;
  return a.vendor_name && a.title.endsWith(suffix) && a.title.length > suffix.length ? a.title.slice(0, -suffix.length) : a.title;
}

function ninetyDaysAgo() {
  const d = new Date();
  d.setDate(d.getDate() - 90);
  return d.toISOString().slice(0, 10);
}

export default function AssessmentsPage() {
  const { user, canWrite } = useAuth();
  const navigate = useNavigate();
  const lp = useListParams({ sort: "created_at", dir: "desc", limit: 25 });
  const templates = useTemplates();
  const users = useWritableUsers(useUsers().data);
  const [search, setSearch] = useDebouncedSearch(lp.q, (v) => lp.set({ q: v }));
  const newOpen = lp.get("new") === "1";
  const defaultVendor = Number(lp.get("vendor")) || null;
  const [modalOpen, setModalOpen] = useState(false);
  const view = (lp.get("view") || "all") as View;
  const since = useMemo(ninetyDaysAgo, []);

  const viewParams = useMemo<Record<string, string | number | undefined>>(() => {
    switch (view) {
      case "mine": return { assigned_to: user?.id };
      case "review": return { status: "submitted,under_review" };
      case "overdue": return { overdue: "true" };
      case "completed": return { status: "completed" };
      default: return {};
    }
  }, [view, user?.id]);

  const params = useMemo(() => {
    const p: Record<string, unknown> = { ...viewParams, q: lp.q, page: lp.page, limit: lp.limit, sort: lp.sort, dir: lp.dir };
    for (const k of FILTER_KEYS) if (lp.get(k)) p[k] = lp.get(k);
    return p;
  }, [viewParams, lp]);

  const { data, isLoading, isFetching } = usePagedQuery<Assessment>("assessments", "/api/assessments", params);

  const kInProgress = useCount("assessments", "/api/assessments", { status: "in_progress" });
  const kReview = useCount("assessments", "/api/assessments", { status: "submitted,under_review" });
  const kOverdue = useCount("assessments", "/api/assessments", { overdue: "true" });
  const kDone = useCount("assessments", "/api/assessments", { status: "completed", completed_from: since });
  const kMine = useCount("assessments", "/api/assessments", { assigned_to: user?.id, status: "not_started,in_progress" });

  const hasFilters = FILTER_KEYS.some((k) => lp.get(k)) || !!lp.q;
  const clearFilters = () => { setSearch(""); lp.set({ q: null, status: null, template_id: null, assigned_to: null, risk_rating: null }); };

  const columns: Column<Assessment>[] = [
    {
      key: "title", header: "Assessment", sortable: true,
      render: (a) => (
        <div className="min-w-[180px] max-w-[230px]">
          <Link to={`/assessments/${a.id}`} className="block font-medium text-ink-900 hover:text-brand-700 truncate" title={a.title}>{shortTitle(a)}</Link>
          <div className="text-xs text-ink-500 truncate">{a.framework ?? a.template_name}</div>
        </div>
      ),
    },
    {
      key: "vendor_name", header: "Vendor", sortable: true,
      render: (a) => (
        <div className="flex items-center gap-2 min-w-[150px]">
          <Link to={`/vendors/${a.vendor_id}`} onClick={(e) => e.stopPropagation()} className="text-ink-800 hover:text-brand-700 hover:underline truncate max-w-[140px]" title={a.vendor_name}>{a.vendor_name}</Link>
          <TierBadge tier={a.vendor_tier} size="xs" />
        </div>
      ),
    },
    { key: "status", header: "Status", sortable: true, render: (a) => <Badge tone={TONES.assessmentStatus[a.status]} dot>{LABELS.assessmentStatus[a.status]}</Badge> },
    {
      key: "progress", header: "Progress", sortable: true,
      render: (a) => {
        const total = a.question_count ?? 0;
        const done = a.answered_count ?? 0;
        return (
          <div className="w-20" title={`${total ? Math.round((done / total) * 100) : 0}% answered`}>
            <div className="text-xs mb-1 text-ink-600 tnum">{done}/{total}</div>
            <ProgressBar value={done} max={total} />
          </div>
        );
      },
    },
    { key: "score", header: "Score", sortable: true, align: "right", render: (a) => <span className={`tnum font-semibold ${a.risk_rating ? RATING_TEXT[a.risk_rating] : "text-ink-400"}`}>{fmtScore(a.score)}</span> },
    { key: "risk_rating", header: "Rating", sortable: true, render: (a) => a.risk_rating ? <Badge tone={TONES.tier[a.risk_rating]}>{LABELS.tier[a.risk_rating]}</Badge> : <span className="text-ink-400">—</span> },
    { key: "assignee_name", header: "Assignee", sortable: true, align: "center", render: (a) => a.assignee_name ? <Avatar name={a.assignee_name} size="sm" /> : <span className="text-ink-400">—</span> },
    { key: "due_date", header: "Due", sortable: true, render: (a) => <DueCell date={a.due_date} resolved={a.status === "completed"} /> },
  ];

  const chips = [
    { id: "all" as const, label: "All" },
    { id: "mine" as const, label: "Assigned to me", count: kMine.data },
    { id: "review" as const, label: "Awaiting review", count: kReview.data },
    { id: "overdue" as const, label: "Overdue", count: kOverdue.data },
    { id: "completed" as const, label: "Completed" },
  ];

  return (
    <>
      <PageHeader
        title="Assessments"
        description="Due-diligence questionnaires that measure each vendor's control posture."
        actions={canWrite && <Button icon={Plus} onClick={() => setModalOpen(true)}>New assessment</Button>}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Stat to="/assessments?status=in_progress" label="In progress" value={kInProgress.data ?? "—"} icon={Hourglass} tone="info" hint="Questionnaires being answered" />
        <Stat to="/assessments?view=review" label="Awaiting review" value={kReview.data ?? "—"} icon={ClipboardCheck} tone="brand" hint="Submitted or under review" />
        <Stat to="/assessments?view=overdue" label="Overdue" value={kOverdue.data ?? "—"} icon={AlarmClock} tone={kOverdue.data ? "danger" : "success"} hint="Past due date, not completed" />
        <Stat to="/assessments?view=completed&sort=completed_at&dir=desc" label="Completed · 90d" value={kDone.data ?? "—"} icon={CheckCircle2} tone="success" hint="Reviews closed recently" />
      </div>

      <Card padded={false}>
        <div className="px-4 pt-4 pb-3 space-y-3 border-b border-ink-200">
          <QuickChips options={chips} value={view} onChange={(v) => lp.set({ view: v === "all" ? null : v })} />
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[220px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-400 pointer-events-none" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search assessments or vendors…" className="pl-9" aria-label="Search assessments" />
            </div>
            <Select value={lp.get("status")} onChange={(e) => lp.set({ status: e.target.value })} className="w-40" aria-label="Status">
              <option value="">All statuses</option>
              {STATUSES.map((s) => <option key={s} value={s}>{LABELS.assessmentStatus[s]}</option>)}
            </Select>
            <Select value={lp.get("template_id")} onChange={(e) => lp.set({ template_id: e.target.value })} className="w-56" aria-label="Template">
              <option value="">All templates</option>
              {templates.data?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
            <Select value={lp.get("assigned_to")} onChange={(e) => lp.set({ assigned_to: e.target.value })} className="w-44" aria-label="Assignee">
              <option value="">All assignees</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </Select>
            <Select value={lp.get("risk_rating")} onChange={(e) => lp.set({ risk_rating: e.target.value })} className="w-36" aria-label="Rating">
              <option value="">All ratings</option>
              {["critical", "high", "medium", "low"].map((r) => <option key={r} value={r}>{LABELS.tier[r]}</option>)}
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
          onRowClick={(a) => navigate(`/assessments/${a.id}`)}
          emptyTitle={hasFilters || view !== "all" ? "No assessments match your filters" : "No assessments yet"}
          emptyDescription={hasFilters || view !== "all" ? "Try adjusting the search or filters." : canWrite ? "Create an assessment to start evaluating a vendor." : undefined}
        />
        {data && data.total > 0 && <Pagination page={lp.page} limit={lp.limit} total={data.total} onPage={lp.setPage} />}
      </Card>

      <NewAssessmentModal open={modalOpen || (newOpen && canWrite)} defaultVendorId={defaultVendor} onClose={() => { setModalOpen(false); if (newOpen) lp.set({ new: null, vendor: null }, false); }} />
    </>
  );
}
