import { useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { addMonths, format, startOfMonth } from "date-fns";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, ArrowRight, Building2, CalendarClock, ChevronRight, ClipboardCheck, ClipboardList, FileWarning, Gauge, History, RefreshCw, ShieldAlert, Stamp, type LucideIcon } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { LABELS, TONES, fmtDate, fmtMoney, fmtNumber, fmtRelative, parseDate, riskTone, type Tone } from "@/lib/format";
import type { Tier } from "@/lib/types";
import { Avatar, Badge, Button, Card, DataTable, EmptyState, RiskScore, Skeleton, Stat, Tabs, cn, type Column } from "@/components/ui";
import {
  BRAND, ChartCard, ChartLegend, ChartTooltip, FINDING_STATUS_COLORS, FINDING_STATUS_ORDER, INK, MiniTable, PRIMARY, SURFACE, SegmentedBar, TIER_COLORS, TIER_ORDER,
  compactMoney, cursorFill, cursorLine, dotTick, gridProps, stackedShape, truncTick, withTopKey, xAxisProps, yAxisProps, type FindingStatusKey,
} from "@/components/charts";

interface Kpis {
  vendors_total: number; vendors_active: number; vendors_critical: number; vendors_onboarding: number; avg_residual_risk: number;
  findings_open: number; findings_critical_open: number; findings_overdue: number; findings_closed_30d: number;
  contracts_active: number; contracts_expiring_90: number; contracts_expiring_90_value: number; contract_value_active: number; spend_total: number;
  documents_expiring: number; documents_expired: number; assessments_in_progress: number; assessments_awaiting_review: number; assessments_overdue: number;
  reviews_overdue: number; approvals_pending: number; my_approvals_pending: number; approvals_to_decide: number;
}
interface TaskAssessment { id: number; title: string; status: string; due_date: string | null; vendor_name: string }
interface TaskFinding { id: number; title: string; severity: Tier; status: string; due_date: string | null; vendor_name: string }
interface TaskApproval { id: number; title: string; type: string; priority: string; created_at: string; requested_by_name: string }
interface Renewal { id: number; title: string; end_date: string; value: number; currency: string; auto_renew: number; vendor_name: string; vendor_id: number; days_to_end: number }
interface ExpiringDoc { id: number; name: string; type: string; expiry_date: string; status: string; vendor_name: string; vendor_id: number; days_to_expiry: number }
interface TopVendor { id: number; name: string; tier: Tier; category: string; residual_risk: number; inherent_risk: number; status: string; open_findings: number }
interface ActivityRow { id: number; actor_id: number | null; actor_name: string | null; action: string; entity_type: string; entity_id: number | null; summary: string; created_at: string }
interface DashboardData {
  generated_at: string;
  org_name: string;
  kpis: Kpis;
  risk_by_tier: { tier: Tier; count: number; avg_residual: number; spend: number }[];
  my_task_counts: { assessments: number; reviews: number; findings: number; approvals: number };
  findings_by_severity: { severity: Tier; status: FindingStatusKey; count: number }[];
  spend_by_category: { category: string; spend: number; vendors: number }[];
  upcoming_renewals: Renewal[];
  expiring_documents: ExpiringDoc[];
  top_risk_vendors: TopVendor[];
  my_tasks: { assessments: TaskAssessment[]; reviews: TaskAssessment[]; findings: TaskFinding[]; approvals: TaskApproval[] };
  recent_activity: ActivityRow[];
  assessment_trend: { month: string; completed: number; avg_score: number | null }[];
}

const STATUS_LABEL: Record<FindingStatusKey, string> = { open: "Open", in_remediation: "In remediation", risk_accepted: "Risk accepted", closed: "Closed" };

function greeting(d: Date) {
  const h = d.getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

function daysText(d: number | null | undefined, past = "overdue"): string {
  if (d == null) return "—";
  if (d === 0) return "today";
  if (d < 0) return `${-d}d ${past}`;
  return `in ${d}d`;
}

function dueTone(d: number | null): Tone {
  if (d == null) return "neutral";
  if (d < 0) return "danger";
  if (d <= 14) return "warning";
  return "neutral";
}

function daysFromNow(s: string | null): number | null {
  const d = parseDate(s);
  if (!d) return null;
  const a = new Date(); a.setHours(0, 0, 0, 0);
  const b = new Date(d); b.setHours(0, 0, 0, 0);
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

const ENTITY_PATH: Record<string, string> = { vendor: "/vendors", contract: "/contracts", assessment: "/assessments", finding: "/findings", approval: "/approvals" };
function shortTitle(title: string, vendor: string): string {
  return title.startsWith(vendor) && title.length > vendor.length + 3 ? title.slice(vendor.length).trim() : title;
}

function relTime(s: string): string {
  const d = parseDate(s);
  return d && d.getTime() > Date.now() ? "just now" : fmtRelative(s);
}

function entityHref(a: ActivityRow): string | null {
  if (a.entity_type === "document") return "/documents";
  const base = ENTITY_PATH[a.entity_type];
  return base && a.entity_id ? `${base}/${a.entity_id}` : null;
}

export default function DashboardPage() {
  const { user } = useAuth();
  const q = useQuery({ queryKey: ["dashboard"], queryFn: () => api.get<{ data: DashboardData }>("/api/dashboard").then((r) => r.data), placeholderData: (p) => p });
  const d = q.data;
  const now = new Date();
  const firstName = (user?.name ?? "").split(" ")[0];

  if (q.isError && !d) {
    return (
      <Card>
        <EmptyState icon={AlertTriangle} title="Couldn't load the dashboard" description={(q.error as Error)?.message} action={<Button variant="secondary" icon={RefreshCw} onClick={() => q.refetch()}>Try again</Button>} />
      </Card>
    );
  }

  const k = d?.kpis;
  const loading = !d;
  const fetching = q.isFetching && !q.isLoading;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-ink-900 tracking-tight">{greeting(now)}, {firstName || "there"}</h1>
          <p className="text-sm text-ink-500 mt-1">
            {format(now, "EEEE, MMMM d, yyyy")}
            <span className="mx-1.5 text-ink-300">·</span>
            {d?.org_name ?? "—"}
            {d && <><span className="mx-1.5 text-ink-300">·</span>Updated {format(new Date(d.generated_at), "HH:mm")}</>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/reports"><Button variant="ghost" size="sm" iconRight={ArrowRight}>Reports</Button></Link>
          <Button variant="secondary" size="sm" icon={RefreshCw} onClick={() => q.refetch()} disabled={q.isFetching} className={cn(q.isFetching && "[&>svg]:animate-spin")}>Refresh</Button>
        </div>
      </div>

      <div className={cn("grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6 gap-4 transition-opacity", fetching && "opacity-70")}>
        {loading || !k ? (
          Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-[104px] rounded-[var(--radius-card)]" />)
        ) : (
          <>
            <Stat label="Active vendors" value={fmtNumber(k.vendors_active)} icon={Building2} hint={`${k.vendors_critical} critical · ${k.vendors_onboarding} onboarding`} to="/vendors?status=active" />
            <Stat label="Avg residual risk" value={k.avg_residual_risk} tone={riskTone(k.avg_residual_risk)} icon={Gauge} hint="Active vendors · scale 0–100" to="/vendors?status=active&sort=residual_risk&dir=desc" />
            <Stat label="Open findings" value={fmtNumber(k.findings_open)} tone={k.findings_critical_open > 0 ? "danger" : undefined} icon={ShieldAlert} hint={`${k.findings_critical_open} critical, ${k.findings_overdue} overdue`} to="/findings?status=open,in_remediation" />
            <Stat label="Contracts ≤ 90d" value={fmtNumber(k.contracts_expiring_90)} tone={k.contracts_expiring_90 > 0 ? "warning" : undefined} icon={CalendarClock} hint={`${fmtMoney(k.contracts_expiring_90_value, "USD", true)} up for renewal`} to="/contracts?expiring_within=90" />
            <Stat label="Evidence alerts" value={fmtNumber(k.documents_expiring + k.documents_expired)} tone={k.documents_expired > 0 ? "danger" : k.documents_expiring > 0 ? "warning" : undefined} icon={FileWarning} hint={`${k.documents_expiring} expiring · ${k.documents_expired} expired`} to="/documents?status=expiring,expired" />
            <Stat label="Pending approvals" value={fmtNumber(k.approvals_pending)} icon={Stamp} hint={`${k.approvals_to_decide} awaiting your decision`} to="/approvals?status=pending" />
          </>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <RiskPosture data={d} fetching={fetching} />
        <FindingsBySeverity data={d} fetching={fetching} />
        <SpendByCategory data={d} fetching={fetching} />
        <AssessmentTrend data={d} fetching={fetching} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        <MyWork data={d} className="xl:col-span-7" userId={user?.id} />
        <TopRiskVendors data={d} className="xl:col-span-5" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
        <UpcomingRenewals data={d} />
        <ExpiringEvidence data={d} />
        <RecentActivity data={d} className="lg:col-span-2 xl:col-span-1" />
      </div>
    </div>
  );
}

function RiskPosture({ data, fetching }: { data?: DashboardData; fetching: boolean }) {
  const rows = useMemo(() => TIER_ORDER.map((t) => {
    const r = data?.risk_by_tier.find((x) => x.tier === t);
    return { tier: t, count: r?.count ?? 0, avg: r?.avg_residual ?? 0, spend: r?.spend ?? 0 };
  }), [data]);
  const total = rows.reduce((a, r) => a + r.count, 0);
  return (
    <ChartCard
      title="Risk posture"
      description={data ? `${total} vendors in scope by inherent risk tier` : undefined}
      loading={!data}
      fetching={fetching}
      empty={!!data && total === 0}
      height={220}
      action={<Link to="/vendors" className="text-xs font-medium text-brand-700 hover:underline">All vendors</Link>}
      table={<MiniTable headers={["Tier", "Vendors", "Share", "Avg residual", "Annual spend"]} align={["left", "right", "right", "right", "right"]} rows={rows.map((r) => [LABELS.tier[r.tier], r.count, `${total ? Math.round((r.count / total) * 100) : 0}%`, r.avg, fmtMoney(r.spend, "USD", true)])} />}
    >
      <SegmentedBar
        segments={rows.map((r) => ({ key: r.tier, label: LABELS.tier[r.tier], value: r.count, color: TIER_COLORS[r.tier], detail: `Avg residual ${r.avg} · ${fmtMoney(r.spend, "USD", true)} spend` }))}
        format={(v, s) => `${Math.round(s * 100)}%`}
      />
      <ChartLegend className="mt-3" items={rows.map((r) => ({ key: r.tier, label: LABELS.tier[r.tier], color: TIER_COLORS[r.tier] }))} />
      <div className="mt-4 -mx-1">
        <div className="grid grid-cols-[1fr_64px_120px_84px] gap-3 px-1 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-500 border-b border-ink-100">
          <span>Tier</span><span className="text-right">Vendors</span><span>Avg residual</span><span className="text-right">Spend</span>
        </div>
        <ul className="divide-y divide-ink-100">
          {rows.map((r) => (
            <li key={r.tier}>
              <Link to={`/vendors?tier=${r.tier}`} className="grid grid-cols-[1fr_64px_120px_84px] gap-3 items-center px-1 py-2 rounded hover:bg-ink-50 focus-ring">
                <span className="inline-flex items-center gap-2 text-sm text-ink-800 font-medium"><span className="h-2 w-2 rounded-full" style={{ background: TIER_COLORS[r.tier] }} />{LABELS.tier[r.tier]}</span>
                <span className="text-right text-sm tnum text-ink-900 font-semibold">{r.count}<span className="ml-1.5 text-xs font-normal text-ink-500">{total ? Math.round((r.count / total) * 100) : 0}%</span></span>
                <RiskScore value={r.avg} size="sm" />
                <span className="text-right text-sm tnum text-ink-600">{fmtMoney(r.spend, "USD", true)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </ChartCard>
  );
}

function FindingsBySeverity({ data, fetching }: { data?: DashboardData; fetching: boolean }) {
  const rows = useMemo(() => {
    const base = TIER_ORDER.map((sev) => {
      const r: Record<string, number | string> = { severity: sev, total: 0 };
      for (const s of FINDING_STATUS_ORDER) {
        const c = data?.findings_by_severity.find((x) => x.severity === sev && x.status === s)?.count ?? 0;
        r[s] = c;
        r.total = Number(r.total) + c;
      }
      return r;
    });
    return withTopKey(base, FINDING_STATUS_ORDER);
  }, [data]);
  const open = rows.reduce((a, r) => a + Number(r.open) + Number(r.in_remediation), 0);
  const total = rows.reduce((a, r) => a + Number(r.total), 0);
  const nav = useNavigate();
  return (
    <ChartCard
      title="Findings by severity"
      description={data ? `${open} open or in remediation of ${total} raised` : undefined}
      loading={!data}
      fetching={fetching}
      empty={!!data && total === 0}
      emptyTitle="No findings raised"
      height={220}
      action={<Link to="/findings" className="text-xs font-medium text-brand-700 hover:underline">All findings</Link>}
      legend={<ChartLegend items={FINDING_STATUS_ORDER.map((s) => ({ key: s, label: STATUS_LABEL[s], color: FINDING_STATUS_COLORS[s] }))} />}
      table={<MiniTable headers={["Severity", ...FINDING_STATUS_ORDER.map((s) => STATUS_LABEL[s]), "Total"]} align={["left", "right", "right", "right", "right", "right"]} rows={rows.map((r) => [LABELS.tier[String(r.severity)], ...FINDING_STATUS_ORDER.map((s) => r[s] as number), r.total as number])} />}
    >
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 36, bottom: 4, left: 0 }} barCategoryGap="28%">
          <CartesianGrid {...gridProps} horizontal={false} />
          <XAxis type="number" {...xAxisProps} allowDecimals={false} />
          <YAxis type="category" dataKey="severity" width={92} {...yAxisProps} tick={dotTick(2, (v) => TIER_COLORS[v as Tier], (v) => LABELS.tier[v])} />
          <Tooltip cursor={cursorFill} content={<ChartTooltip mark="square" labelFormatter={(l) => `${LABELS.tier[String(l)]} severity`} nameFormatter={(k) => STATUS_LABEL[k as FindingStatusKey]} footer={(r) => `${r?.total ?? 0} findings total`} />} />
          {FINDING_STATUS_ORDER.map((s) => (
            <Bar key={s} dataKey={s} stackId="a" fill={FINDING_STATUS_COLORS[s]} maxBarSize={24} shape={stackedShape(s, "__top", "vertical")} isAnimationActive={false} className="cursor-pointer" onClick={(p: { severity?: string }) => p.severity && nav(`/findings?severity=${p.severity}&status=${s}`)}>
              {s === "closed" && <LabelList dataKey="total" position="right" offset={8} fill={INK[700]} fontSize={12} fontWeight={600} />}
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

function SpendByCategory({ data, fetching }: { data?: DashboardData; fetching: boolean }) {
  const all = data?.spend_by_category ?? [];
  const top = all.slice(0, 8);
  const total = all.reduce((a, r) => a + r.spend, 0);
  const rest = all.length - top.length;
  const nav = useNavigate();
  return (
    <ChartCard
      title="Spend by category"
      description={data ? `Annual spend, active vendors · top ${top.length} of ${all.length} categories · ${fmtMoney(total, "USD", true)} total` : undefined}
      loading={!data}
      fetching={fetching}
      empty={!!data && top.length === 0}
      height={280}
      table={<MiniTable headers={["Category", "Vendors", "Annual spend", "Share"]} align={["left", "right", "right", "right"]} rows={all.map((r) => [r.category, r.vendors, fmtMoney(r.spend), `${total ? ((r.spend / total) * 100).toFixed(1) : 0}%`])} />}
      footer={rest > 0 ? <p className="text-xs text-ink-500">{rest} smaller {rest === 1 ? "category" : "categories"} ({fmtMoney(all.slice(8).reduce((a, r) => a + r.spend, 0), "USD", true)}) not shown — switch to table view for all.</p> : undefined}
    >
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={top} layout="vertical" margin={{ top: 0, right: 56, bottom: 0, left: 0 }} barCategoryGap="30%">
          <CartesianGrid {...gridProps} horizontal={false} />
          <XAxis type="number" {...xAxisProps} tickFormatter={compactMoney} />
          <YAxis type="category" dataKey="category" width={160} {...yAxisProps} tick={truncTick(24)} interval={0} />
          <Tooltip cursor={cursorFill} content={<ChartTooltip mark="square" valueFormatter={(v) => fmtMoney(v)} nameFormatter={() => "Annual spend"} footer={(r) => `${r?.vendors} active vendors · ${total ? ((Number(r?.spend) / total) * 100).toFixed(1) : 0}% of spend`} />} />
          <Bar dataKey="spend" fill={PRIMARY} radius={[0, 4, 4, 0]} maxBarSize={18} isAnimationActive={false} className="cursor-pointer" onClick={(p: { category?: string }) => p.category && nav(`/vendors?category=${encodeURIComponent(p.category)}`)}>
            <LabelList dataKey="spend" position="right" offset={8} formatter={(v: number) => compactMoney(v)} fill={INK[700]} fontSize={12} fontWeight={500} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

function AssessmentTrend({ data, fetching }: { data?: DashboardData; fetching: boolean }) {
  const rows = useMemo(() => {
    const start = startOfMonth(addMonths(new Date(), -11));
    return Array.from({ length: 12 }).map((_, i) => {
      const m = addMonths(start, i);
      const key = format(m, "yyyy-MM");
      const r = data?.assessment_trend.find((x) => x.month === key);
      return { month: key, label: format(m, "MMM"), full: format(m, "MMMM yyyy"), completed: r?.completed ?? 0, avg_score: r?.avg_score ?? null };
    });
  }, [data]);
  const completed = rows.reduce((a, r) => a + r.completed, 0);
  const scored = rows.filter((r) => r.avg_score != null);
  const weighted = completed ? rows.reduce((a, r) => a + (r.avg_score ?? 0) * r.completed, 0) / completed : 0;
  const last = scored[scored.length - 1];
  return (
    <ChartCard
      title="Assessment completion trend"
      description={data ? `${completed} completed in the last 12 months · weighted avg score ${weighted.toFixed(1)}` : undefined}
      loading={!data}
      fetching={fetching}
      empty={!!data && completed === 0}
      emptyTitle="No completed assessments"
      height={280}
      table={<MiniTable headers={["Month", "Completed", "Avg score"]} align={["left", "right", "right"]} rows={rows.map((r) => [r.full, r.completed, r.avg_score == null ? "—" : r.avg_score.toFixed(1)])} />}
    >
      <div className="flex items-baseline justify-between">
        <p className="text-xs font-medium text-ink-600">Average score <span className="text-ink-400 font-normal">(0–100)</span></p>
        {last && <p className="text-xs text-ink-500">Latest <span className="font-semibold text-ink-900 tnum">{last.avg_score?.toFixed(1)}</span> in {last.label}</p>}
      </div>
      <ResponsiveContainer width="100%" height={150}>
        <AreaChart data={rows} syncId="assess-trend" margin={{ top: 10, right: 12, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="scoreFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={PRIMARY} stopOpacity={0.14} />
              <stop offset="100%" stopColor={PRIMARY} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid {...gridProps} vertical={false} />
          <XAxis dataKey="label" {...xAxisProps} hide />
          <YAxis domain={[40, 100]} ticks={[40, 60, 80, 100]} width={36} {...yAxisProps} />
          <Tooltip cursor={cursorLine} content={<ChartTooltip labelFormatter={(_l, r) => String(r?.full ?? "")} nameFormatter={() => "Avg score"} valueFormatter={(v, _k, r) => (r?.avg_score == null ? "—" : v.toFixed(1))} footer={(r) => `${r?.completed ?? 0} completed`} />} />
          <Area type="monotone" dataKey="avg_score" stroke={PRIMARY} strokeWidth={2} fill="url(#scoreFill)" connectNulls dot={{ r: 4, fill: PRIMARY, stroke: SURFACE, strokeWidth: 2 }} activeDot={{ r: 5, fill: PRIMARY, stroke: SURFACE, strokeWidth: 2 }} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
      <p className="text-xs font-medium text-ink-600 mt-2">Completed per month</p>
      <ResponsiveContainer width="100%" height={110}>
        <BarChart data={rows} syncId="assess-trend" margin={{ top: 14, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid {...gridProps} vertical={false} />
          <XAxis dataKey="label" {...xAxisProps} interval={0} />
          <YAxis allowDecimals={false} width={36} {...yAxisProps} tickCount={3} />
          <Tooltip cursor={cursorFill} content={<ChartTooltip mark="square" labelFormatter={(_l, r) => String(r?.full ?? "")} nameFormatter={() => "Completed"} footer={(r) => (r?.avg_score == null ? "No score" : `Avg score ${Number(r.avg_score).toFixed(1)}`)} />} />
          <Bar dataKey="completed" fill={BRAND[400]} radius={[4, 4, 0, 0]} maxBarSize={20} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

type WorkTab = "assessments" | "reviews" | "findings" | "approvals";

function WorkRow({ to, icon: Icon, title, sub, right }: { to: string; icon: LucideIcon; title: ReactNode; sub: ReactNode; right: ReactNode }) {
  return (
    <li>
      <Link to={to} className="group flex items-center gap-3 px-5 py-3 hover:bg-ink-50 focus-ring">
        <span className="h-8 w-8 rounded-lg bg-ink-100 text-ink-500 flex items-center justify-center shrink-0 group-hover:bg-brand-50 group-hover:text-brand-600"><Icon className="h-4 w-4" /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-ink-900 truncate group-hover:text-brand-700">{title}</span>
          <span className="block text-xs text-ink-500 truncate mt-0.5">{sub}</span>
        </span>
        <span className="shrink-0 flex items-center gap-2">{right}</span>
        <ChevronRight className="h-4 w-4 text-ink-300 group-hover:text-ink-500 shrink-0" />
      </Link>
    </li>
  );
}

function DueBadge({ date }: { date: string | null }) {
  const dd = daysFromNow(date);
  if (dd == null) return <span className="text-xs text-ink-400">No due date</span>;
  const tone = dueTone(dd);
  return (
    <span className="text-right">
      <span className={cn("block text-xs font-medium tnum", tone === "danger" ? "text-danger-700" : tone === "warning" ? "text-warning-700" : "text-ink-700")}>{daysText(dd)}</span>
      <span className="block text-[11px] text-ink-400 tnum">{fmtDate(date, "MMM d")}</span>
    </span>
  );
}

function MyWork({ data, className, userId }: { data?: DashboardData; className?: string; userId?: number }) {
  const counts = data?.my_task_counts;
  const initial: WorkTab = counts ? (["assessments", "reviews", "findings", "approvals"] as WorkTab[]).find((t) => counts[t] > 0) ?? "assessments" : "assessments";
  const [picked, setPicked] = useState<WorkTab | null>(null);
  const tab = picked ?? initial;
  const t = data?.my_tasks;
  const viewAll: Record<WorkTab, string> = {
    assessments: `/assessments?assigned_to=${userId ?? ""}&status=not_started,in_progress`,
    reviews: "/assessments?status=submitted,under_review",
    findings: `/findings?owner_id=${userId ?? ""}&status=open,in_remediation`,
    approvals: "/approvals?status=pending&mine=true",
  };
  const empty: Record<WorkTab, string> = {
    assessments: "No assessments assigned to you",
    reviews: "No assessments waiting on your review",
    findings: "You don't own any open findings",
    approvals: "Nothing waiting for your decision",
  };
  let list: ReactNode = null;
  if (t) {
    if (tab === "assessments" || tab === "reviews") {
      const items = t[tab];
      list = items.length ? items.map((a) => (
        <WorkRow key={a.id} to={`/assessments/${a.id}`} icon={tab === "reviews" ? ClipboardCheck : ClipboardList} title={a.title} sub={a.vendor_name} right={<><Badge tone={TONES.assessmentStatus[a.status]} size="xs">{LABELS.assessmentStatus[a.status]}</Badge><DueBadge date={a.due_date} /></>} />
      )) : null;
    } else if (tab === "findings") {
      list = t.findings.length ? t.findings.map((f) => (
        <WorkRow key={f.id} to={`/findings/${f.id}`} icon={ShieldAlert} title={f.title} sub={f.vendor_name} right={<><Badge tone={TONES.tier[f.severity]} size="xs" dot>{LABELS.tier[f.severity]}</Badge><DueBadge date={f.due_date} /></>} />
      )) : null;
    } else {
      list = t.approvals.length ? t.approvals.map((a) => (
        <WorkRow key={a.id} to={`/approvals/${a.id}`} icon={Stamp} title={a.title} sub={`${LABELS.approvalType[a.type] ?? a.type} · requested by ${a.requested_by_name}`} right={<><Badge tone={TONES.priority[a.priority]} size="xs">{a.priority[0].toUpperCase() + a.priority.slice(1)}</Badge><span className="text-xs text-ink-500 w-16 text-right">{fmtRelative(a.created_at)}</span></>} />
      )) : null;
    }
  }
  return (
    <Card padded={false} className={cn("flex flex-col", className)}>
      <div className="flex items-start justify-between gap-4 px-5 pt-5">
        <div>
          <h3 className="text-sm font-semibold text-ink-900">My work</h3>
          <p className="text-xs text-ink-500 mt-0.5">Items that need your attention</p>
        </div>
        <Link to={viewAll[tab]} className="text-xs font-medium text-brand-700 hover:underline whitespace-nowrap">View all</Link>
      </div>
      <Tabs<WorkTab>
        className="px-3 mt-2"
        value={tab}
        onChange={setPicked}
        tabs={[
          { id: "assessments", label: "Assigned to me", count: counts?.assessments },
          { id: "reviews", label: "Reviews waiting", count: counts?.reviews },
          { id: "findings", label: "Findings I own", count: counts?.findings },
          { id: "approvals", label: "Approvals to decide", count: counts?.approvals },
        ]}
      />
      <div className="flex-1 min-h-[300px]">
        {!t ? (
          <div className="p-5 space-y-4">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="flex gap-3 items-center"><Skeleton className="h-8 w-8" /><div className="flex-1 space-y-1.5"><Skeleton className="h-3.5 w-2/3" /><Skeleton className="h-3 w-1/3" /></div></div>)}</div>
        ) : list ? (
          <ul className="divide-y divide-ink-100">{list}</ul>
        ) : (
          <EmptyState icon={ClipboardCheck} title={empty[tab]} description="You're all caught up here." />
        )}
      </div>
    </Card>
  );
}

function TopRiskVendors({ data, className }: { data?: DashboardData; className?: string }) {
  const cols: Column<TopVendor>[] = [
    { key: "name", header: "Vendor", render: (v) => <span className="block min-w-0"><span className="block font-medium text-ink-900 truncate max-w-[180px]">{v.name}</span><span className="block text-xs text-ink-500 truncate max-w-[180px]">{v.category}</span></span> },
    { key: "tier", header: "Tier", render: (v) => <Badge tone={TONES.tier[v.tier]} dot size="xs">{LABELS.tier[v.tier]}</Badge> },
    { key: "risk", header: "Residual", render: (v) => <RiskScore value={v.residual_risk} size="sm" /> },
    { key: "findings", header: "Open", align: "right", render: (v) => <span className={cn("tnum font-medium", v.open_findings > 0 ? "text-danger-700" : "text-ink-400")}>{v.open_findings}</span> },
  ];
  return (
    <Card padded={false} className={cn("flex flex-col", className)}>
      <div className="flex items-start justify-between gap-4 px-5 pt-5 pb-3">
        <div>
          <h3 className="text-sm font-semibold text-ink-900">Top risk vendors</h3>
          <p className="text-xs text-ink-500 mt-0.5">Highest residual risk, excluding terminated</p>
        </div>
        <Link to="/vendors?sort=residual_risk&dir=desc" className="text-xs font-medium text-brand-700 hover:underline whitespace-nowrap">View all</Link>
      </div>
      <div className="border-t border-ink-100">
        <DataTable columns={cols} rows={data?.top_risk_vendors ?? []} loading={!data} dense rowHref={(v) => `/vendors/${v.id}`} emptyTitle="No vendors yet" />
      </div>
    </Card>
  );
}

function ListCard({ title, description, action, loading, empty, children, className }: { title: string; description: string; action: ReactNode; loading: boolean; empty: ReactNode; children: ReactNode; className?: string }) {
  return (
    <Card padded={false} className={cn("flex flex-col", className)}>
      <div className="flex items-start justify-between gap-4 px-5 pt-5 pb-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-ink-900">{title}</h3>
          <p className="text-xs text-ink-500 mt-0.5">{description}</p>
        </div>
        {action}
      </div>
      <div className="border-t border-ink-100 flex-1">
        {loading ? <div className="p-5 space-y-4">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="space-y-1.5"><Skeleton className="h-3.5 w-3/4" /><Skeleton className="h-3 w-1/3" /></div>)}</div> : empty ?? children}
      </div>
    </Card>
  );
}

function UpcomingRenewals({ data }: { data?: DashboardData }) {
  const rows = data?.upcoming_renewals ?? [];
  return (
    <ListCard
      title="Upcoming renewals"
      description="Active contracts by nearest end date"
      action={<Link to="/contracts?expiring_within=90" className="text-xs font-medium text-brand-700 hover:underline whitespace-nowrap">Next 90 days</Link>}
      loading={!data}
      empty={data && !rows.length ? <EmptyState icon={CalendarClock} title="No upcoming renewals" /> : null}
    >
      <ul className="divide-y divide-ink-100">
        {rows.map((c) => (
          <li key={c.id}>
            <Link to={`/contracts/${c.id}`} className="group flex items-start gap-3 px-5 py-2.5 hover:bg-ink-50 focus-ring">
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-ink-900 truncate group-hover:text-brand-700" title={c.title}>{shortTitle(c.title, c.vendor_name)}</span>
                <span className="flex items-center gap-1.5 text-xs text-ink-500 mt-0.5 min-w-0">
                  <span className="truncate">{c.vendor_name}</span>
                  {c.auto_renew ? <Badge size="xs" tone="neutral">Auto-renew</Badge> : null}
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span className="block text-sm font-semibold text-ink-900 tnum">{c.value ? fmtMoney(c.value, c.currency || "USD", true) : "—"}</span>
                <span className="block text-[11px] tnum mt-0.5"><span className={cn("font-medium", c.days_to_end <= 30 ? "text-warning-700" : "text-ink-600")}>{daysText(c.days_to_end)}</span><span className="text-ink-400"> · {fmtDate(c.end_date, "MMM d, yyyy")}</span></span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </ListCard>
  );
}

function ExpiringEvidence({ data }: { data?: DashboardData }) {
  const rows = data?.expiring_documents ?? [];
  return (
    <ListCard
      title="Expiring evidence"
      description="Certificates and reports expired or expiring soon"
      action={<Link to="/documents?status=expiring,expired" className="text-xs font-medium text-brand-700 hover:underline whitespace-nowrap">View all</Link>}
      loading={!data}
      empty={data && !rows.length ? <EmptyState icon={FileWarning} title="All evidence is current" /> : null}
    >
      <ul className="divide-y divide-ink-100">
        {rows.map((doc) => (
          <li key={doc.id}>
            <Link to={`/vendors/${doc.vendor_id}?tab=documents`} className="group flex items-start gap-3 px-5 py-2.5 hover:bg-ink-50 focus-ring">
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-ink-900 truncate group-hover:text-brand-700">{doc.name}</span>
                <span className="block text-xs text-ink-500 truncate mt-0.5">{doc.vendor_name} · {LABELS.documentType[doc.type] ?? doc.type}</span>
              </span>
              <span className="shrink-0 text-right">
                <Badge size="xs" tone={TONES.documentStatus[doc.status]} dot>{LABELS.documentStatus[doc.status]}</Badge>
                <span className="block text-[11px] tnum mt-1"><span className={cn("font-medium", doc.days_to_expiry < 0 ? "text-danger-700" : "text-warning-700")}>{daysText(doc.days_to_expiry, "ago")}</span><span className="text-ink-400"> · {fmtDate(doc.expiry_date, "MMM d")}</span></span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </ListCard>
  );
}

function RecentActivity({ data, className }: { data?: DashboardData; className?: string }) {
  const rows = (data?.recent_activity ?? []).slice(0, 8);
  return (
    <ListCard
      title="Recent activity"
      description="Latest changes across the program"
      className={className}
      action={<Link to="/audit-log" className="text-xs font-medium text-brand-700 hover:underline whitespace-nowrap">Audit log</Link>}
      loading={!data}
      empty={data && !rows.length ? <EmptyState icon={History} title="No activity yet" /> : null}
    >
      <ol className="px-5 py-3">
        {rows.map((a, i) => {
          const href = entityHref(a);
          const body = (
            <>
              <p className="text-sm text-ink-800 leading-5 line-clamp-2">{a.summary}</p>
              <p className="text-xs text-ink-500 mt-0.5">{a.actor_name ?? "System"} · <time dateTime={a.created_at} title={fmtDate(a.created_at, "MMM d, yyyy HH:mm")}>{relTime(a.created_at)}</time></p>
            </>
          );
          return (
            <li key={a.id} className="relative flex gap-3 pb-3 last:pb-0">
              {i < rows.length - 1 && <span className="absolute left-3 top-7 bottom-0 w-px bg-ink-200" aria-hidden />}
              <Avatar name={a.actor_name ?? "System"} size="sm" className="ring-2 ring-white relative" />
              <div className="min-w-0 flex-1">
                {href ? <Link to={href} className="block rounded hover:text-brand-700 focus-ring">{body}</Link> : body}
              </div>
            </li>
          );
        })}
      </ol>
    </ListCard>
  );
}

