import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { addMonths, format, startOfMonth } from "date-fns";
import { Bar, BarChart, CartesianGrid, Cell, LabelList, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, BadgeCheck, Building2, ClipboardCheck, Download, FileSignature, Globe2, Grid3x3, Layers, Printer, RefreshCw, ShieldAlert, Stamp, Wallet, type LucideIcon } from "lucide-react";
import { api } from "@/lib/api";
import { LABELS, TONES, fmtDate, fmtMoney, fmtNumber, parseDate } from "@/lib/format";
import type { Tier } from "@/lib/types";
import { Badge, Button, Card, DataTable, EmptyState, RiskScore, Skeleton, cn, type Column } from "@/components/ui";
import {
  BRAND, CATEGORICAL, ChartCard, ChartLegend, ChartTooltip, INK, PRIMARY, PRIMARY_SOFT, RISK_BAND_LABEL, TIER_COLORS, TIER_ORDER,
  compactMoney, cursorFill, dotTick, niceTicks, twoLineTick, downloadCsv, gridProps, ratingColor, riskBand, sequential, stackedShape, truncTick, withTopKey, xAxisProps, yAxisProps, type CsvCell,
} from "@/components/charts";

interface ReportsData {
  generated_at: string;
  org_name: string;
  spend_total_active: number;
  vendors_active: number;
  risk_by_category: { category: string; vendors: number; avg_inherent: number; avg_residual: number; spend: number }[];
  tier_matrix: { tier: Tier; status: string; count: number }[];
  findings_aging: { severity: Tier; d0_30: number; d31_60: number; d61_90: number; d90_plus: number }[];
  findings_mttr: { severity: Tier; resolved: number; avg_days: number | null }[];
  contract_pipeline: { month: string; contracts: number; value: number }[];
  contracts_by_type: { type: string; count: number; value: number }[];
  assessment_scores: { id: number; title: string; score: number; risk_rating: Tier | null; completed_at: string | null; vendor_name: string; tier: Tier; framework: string | null }[];
  compliance_coverage: { tier: Tier; vendors: number; assessed_12m: number; with_valid_cert: number; with_dpa: number }[];
  spend_concentration: { id: number; name: string; category: string; tier: Tier; annual_spend: number; residual_risk: number }[];
  country_exposure: { country: string | null; vendors: number; spend: number; avg_risk: number }[];
  approvals_sla: { type: string; total: number; approved: number; rejected: number; pending: number; cancelled: number; avg_hours: number | null; max_hours: number | null; pending_age_hours: number | null }[];
}

const SECTIONS: { id: string; label: string; icon: LucideIcon }[] = [
  { id: "risk-by-category", label: "Risk by category", icon: Layers },
  { id: "tier-status", label: "Tier × status", icon: Grid3x3 },
  { id: "findings", label: "Findings", icon: ShieldAlert },
  { id: "contracts", label: "Contract pipeline", icon: FileSignature },
  { id: "compliance", label: "Compliance coverage", icon: BadgeCheck },
  { id: "spend", label: "Spend concentration", icon: Wallet },
  { id: "assessments", label: "Assessment scores", icon: ClipboardCheck },
  { id: "approvals", label: "Approval SLAs", icon: Stamp },
];

const STATUS_ORDER = ["prospect", "onboarding", "active", "under_review", "offboarding", "terminated"];
const AGING_BUCKETS = [
  { key: "d0_30", label: "0–30 days" },
  { key: "d31_60", label: "31–60 days" },
  { key: "d61_90", label: "61–90 days" },
  { key: "d90_plus", label: "90+ days" },
] as const;
const TYPE_ORDER = ["saas", "msa", "services", "sow", "nda", "dpa"];
const COVERAGE = [
  { key: "assessed", label: "Assessed in last 12 months", color: CATEGORICAL[0] },
  { key: "cert", label: "Valid SOC 2 / ISO 27001", color: CATEGORICAL[1] },
  { key: "dpa", label: "DPA in force", color: CATEGORICAL[2] },
] as const;

const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);
const stamp = () => format(new Date(), "yyyy-MM-dd");
const typeColor = (t: string) => {
  const i = TYPE_ORDER.indexOf(t);
  return i >= 0 && i < CATEGORICAL.length ? CATEGORICAL[i] : INK[400];
};
function hours(h: number | null | undefined): string {
  if (h == null) return "—";
  if (h < 48) return `${h.toFixed(1)} h`;
  return `${(h / 24).toFixed(1)} d`;
}

type SortDir = "asc" | "desc";
type SortCol<T> = Column<T> & { sortValue?: (r: T) => number | string | null };
function useSorted<T>(rows: T[], cols: SortCol<T>[], initial: { key: string; dir: SortDir }) {
  const [sort, setSort] = useState(initial);
  const sorted = useMemo(() => {
    const col = cols.find((c) => c.key === sort.key);
    if (!col?.sortValue) return rows;
    const get = col.sortValue;
    return [...rows].sort((a, b) => {
      const va = get(a), vb = get(b);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      const c = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb));
      return sort.dir === "asc" ? c : -c;
    });
  }, [rows, cols, sort]);
  const onSort = useCallback((key: string) => setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" })), []);
  return { sorted, sort, onSort };
}

function SortTable<T extends { id: number | string }>({ cols, sorted, sort, onSort, rowHref, emptyTitle }: { cols: SortCol<T>[]; sorted: T[]; sort: { key: string; dir: SortDir }; onSort: (k: string) => void; rowHref?: (r: T) => string; emptyTitle?: string }) {
  return <DataTable columns={cols.map((c) => ({ ...c, sortable: !!c.sortValue }))} rows={sorted} sort={sort} onSort={onSort} dense rowHref={rowHref} emptyTitle={emptyTitle ?? "No data"} />;
}

export default function ReportsPage() {
  const q = useQuery({ queryKey: ["reports"], queryFn: () => api.get<{ data: ReportsData }>("/api/reports").then((r) => r.data), placeholderData: (p) => p });
  const d = q.data;
  const [active, setActive] = useState(SECTIONS[0].id);

  useEffect(() => {
    if (!d) return;
    const els = SECTIONS.map((s) => document.getElementById(s.id)).filter((e): e is HTMLElement => !!e);
    const io = new IntersectionObserver((entries) => {
      const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (vis[0]) setActive(vis[0].target.id);
    }, { rootMargin: "-80px 0px -55% 0px", threshold: 0 });
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, [d]);

  const go = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    window.history.replaceState(null, "", `#${id}`);
    setActive(id);
  };

  if (q.isError && !d) {
    return <Card><EmptyState icon={AlertTriangle} title="Couldn't load reports" description={(q.error as Error)?.message} action={<Button variant="secondary" icon={RefreshCw} onClick={() => q.refetch()}>Try again</Button>} /></Card>;
  }

  const asOf = d ? new Date(d.generated_at) : null;
  const fetching = q.isFetching && !q.isLoading;

  return (
    <div className="report-root animate-fade-in">
      <style>{`
        @media print {
          @page { size: A4 landscape; margin: 12mm; }
          .report-root { background: #fff; }
          .report-root, .report-root * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .report-root .shadow-card { box-shadow: none !important; }
          .report-rail { display: none !important; }
          .report-grid { display: block !important; }
          .report-section { break-before: page; padding-top: 0 !important; }
          .report-section:first-of-type { break-before: auto; }
          .report-root .break-inside-avoid, .report-root tr { break-inside: avoid; }
          .report-print-only { display: block !important; }
        }
        .report-print-only { display: none; }
      `}</style>

      <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-700">{d?.org_name ?? "Meridian"} · Third-party risk program</p>
          <h1 className="text-xl font-semibold text-ink-900 tracking-tight mt-1">Risk & compliance reports</h1>
          <p className="text-sm text-ink-500 mt-1">
            {asOf ? <>As of <time dateTime={d?.generated_at} className="font-medium text-ink-700">{format(asOf, "MMMM d, yyyy 'at' HH:mm")}</time> · live data, recalculated on refresh</> : <span className="skeleton rounded-md h-4 w-72 inline-block align-middle" />}
          </p>
        </div>
        <div className="flex items-center gap-2 print:hidden">
          <Button variant="secondary" size="sm" icon={RefreshCw} onClick={() => q.refetch()} disabled={q.isFetching} className={cn(q.isFetching && "[&>svg]:animate-spin")}>Refresh</Button>
          <Button variant="secondary" size="sm" icon={Printer} onClick={() => window.print()} disabled={!d}>Print</Button>
        </div>
      </div>

      <Headline data={d} />

      <div className="report-grid grid grid-cols-1 lg:grid-cols-[200px_minmax(0,1fr)] gap-6 mt-6">
        <aside className="report-rail print:hidden">
          <nav className="lg:sticky lg:top-20 flex lg:flex-col gap-1 overflow-x-auto lg:overflow-visible pb-2 lg:pb-0" aria-label="Report sections">
            <p className="hidden lg:block px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-400">Sections</p>
            {SECTIONS.map((s, i) => (
              <a key={s.id} href={`#${s.id}`} onClick={(e) => { e.preventDefault(); go(s.id); }} aria-current={active === s.id ? "true" : undefined}
                className={cn("flex items-center gap-2.5 rounded-md px-3 py-2 text-sm whitespace-nowrap transition-colors focus-ring", active === s.id ? "bg-brand-50 text-brand-700 font-medium" : "text-ink-600 hover:bg-ink-100 hover:text-ink-900")}>
                <span className={cn("text-[11px] tnum w-4", active === s.id ? "text-brand-500" : "text-ink-400")}>{i + 1}</span>
                <s.icon className="h-4 w-4 shrink-0" />
                {s.label}
              </a>
            ))}
          </nav>
        </aside>

        <div className={cn("min-w-0 space-y-10 transition-opacity", fetching && "opacity-60")}>
          <RiskByCategory data={d} />
          <TierStatus data={d} />
          <Findings data={d} />
          <ContractPipeline data={d} />
          <Compliance data={d} />
          <SpendConcentration data={d} />
          <AssessmentScores data={d} />
          <ApprovalSla data={d} />
          <p className="text-xs text-ink-400 pt-2 border-t border-ink-200">
            Generated {asOf ? format(asOf, "MMM d, yyyy HH:mm") : "—"} · Vendor counts exclude terminated vendors unless stated · Spend and coverage figures use active vendors only.
          </p>
        </div>
      </div>
    </div>
  );
}

function Headline({ data }: { data?: ReportsData }) {
  if (!data) return <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-[84px]" />)}</div>;
  const inScope = data.risk_by_category.reduce((a, r) => a + r.vendors, 0);
  const wResidual = inScope ? Math.round(data.risk_by_category.reduce((a, r) => a + r.avg_residual * r.vendors, 0) / inScope) : 0;
  const wInherent = inScope ? Math.round(data.risk_by_category.reduce((a, r) => a + r.avg_inherent * r.vendors, 0) / inScope) : 0;
  const openFindings = data.findings_aging.reduce((a, r) => a + r.d0_30 + r.d31_60 + r.d61_90 + r.d90_plus, 0);
  const aged = data.findings_aging.reduce((a, r) => a + r.d90_plus, 0);
  const pipeCount = data.contract_pipeline.reduce((a, r) => a + r.contracts, 0);
  const pipeValue = data.contract_pipeline.reduce((a, r) => a + r.value, 0);
  const items: { label: string; value: ReactNode; sub: ReactNode; icon: LucideIcon }[] = [
    { label: "Active vendors", value: fmtNumber(data.vendors_active), sub: `${inScope} in scope incl. pipeline`, icon: Building2 },
    { label: "Annual spend", value: fmtMoney(data.spend_total_active, "USD", true), sub: "Active vendors", icon: Wallet },
    { label: "Avg residual risk", value: wResidual, sub: `Down ${Math.max(0, wInherent - wResidual)} pts from inherent ${wInherent}`, icon: Layers },
    { label: "Open findings", value: fmtNumber(openFindings), sub: `${aged} older than 90 days`, icon: ShieldAlert },
    { label: "Renewals, next 12 mo", value: fmtNumber(pipeCount), sub: `${fmtMoney(pipeValue, "USD", true)} contract value`, icon: FileSignature },
  ];
  return (
    <Card padded={false} className="overflow-hidden">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-px bg-ink-100">
      {items.map((it, i) => (
        <div key={it.label} className={cn("px-5 py-4 bg-white", i === 4 && "col-span-2 lg:col-span-1")}>
          <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-ink-500"><it.icon className="h-3.5 w-3.5 text-ink-400" />{it.label}</p>
          <p className="mt-1.5 text-2xl font-semibold tracking-tight text-ink-900">{it.value}</p>
          <p className="text-xs text-ink-500 mt-0.5">{it.sub}</p>
        </div>
      ))}
      </div>
    </Card>
  );
}

function Section({ id, index, title, description, onExport, children }: { id: string; index: number; title: string; description: string; onExport?: () => void; children: ReactNode }) {
  return (
    <section id={id} data-report-section className="report-section scroll-mt-24 space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3 pb-3 border-b border-ink-200">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-400 tnum">Section {index}</p>
          <h2 className="text-base font-semibold text-ink-900 mt-0.5">{title}</h2>
          <p className="text-sm text-ink-500 mt-0.5 max-w-3xl">{description}</p>
        </div>
        {onExport && <Button variant="secondary" size="sm" icon={Download} onClick={onExport} className="print:hidden">Export CSV</Button>}
      </div>
      {children}
    </section>
  );
}

function TableCard({ title, description, children, className }: { title: string; description?: string; children: ReactNode; className?: string }) {
  return (
    <Card padded={false} className={cn("break-inside-avoid overflow-hidden", className)}>
      <div className="px-5 pt-4 pb-3">
        <h3 className="text-sm font-semibold text-ink-900">{title}</h3>
        {description && <p className="text-xs text-ink-500 mt-0.5">{description}</p>}
      </div>
      <div className="border-t border-ink-100">{children}</div>
    </Card>
  );
}

function RiskByCategory({ data }: { data?: ReportsData }) {
  const rows = useMemo(() => (data?.risk_by_category ?? []).map((r) => ({ ...r, id: r.category, reduction: r.avg_inherent - r.avg_residual })), [data]);
  type Row = (typeof rows)[number];
  const cols = useMemo<SortCol<Row>[]>(() => [
    { key: "category", header: "Category", sortValue: (r) => r.category, render: (r) => <span className="font-medium text-ink-900">{r.category}</span> },
    { key: "vendors", header: "Vendors", align: "right", sortValue: (r) => r.vendors, render: (r) => <span className="tnum">{r.vendors}</span> },
    { key: "avg_inherent", header: "Avg inherent", align: "right", sortValue: (r) => r.avg_inherent, render: (r) => <span className="tnum text-ink-600">{r.avg_inherent}</span> },
    { key: "avg_residual", header: "Avg residual", sortValue: (r) => r.avg_residual, render: (r) => <RiskScore value={r.avg_residual} size="sm" /> },
    { key: "reduction", header: "Reduction", align: "right", sortValue: (r) => r.reduction, render: (r) => <span className={cn("tnum", r.reduction > 0 ? "text-success-700" : "text-ink-500")}>{r.reduction > 0 ? `−${r.reduction}` : "0"}</span> },
    { key: "spend", header: "Annual spend", align: "right", sortValue: (r) => r.spend, render: (r) => <span className="tnum">{fmtMoney(r.spend)}</span> },
  ], []);
  const t = useSorted(rows, cols, { key: "avg_residual", dir: "desc" });
  const exportCsv = () => downloadCsv(`meridian-risk-by-category-${stamp()}`, ["Category", "Vendors", "Avg inherent risk", "Avg residual risk", "Reduction", "Annual spend (USD)"], t.sorted.map((r) => [r.category, r.vendors, r.avg_inherent, r.avg_residual, r.reduction, r.spend]));
  const h = Math.max(240, rows.length * 38 + 40);
  return (
    <Section id="risk-by-category" index={1} title="Risk by category" description="Average inherent risk (before controls) against residual risk (after assessment results and open findings) for each vendor category. The gap is the risk reduction delivered by the program." onExport={data ? exportCsv : undefined}>
      <ChartCard
        title="Inherent vs residual risk"
        description="Average score per category, 0–100 · sorted by residual risk"
        loading={!data}
        empty={!!data && !rows.length}
        height={h}
        legend={<ChartLegend items={[{ key: "i", label: "Avg inherent risk", color: PRIMARY_SOFT }, { key: "r", label: "Avg residual risk", color: BRAND[800] }]} />}
      >
        <ResponsiveContainer width="100%" height={h}>
          <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 40, bottom: 0, left: 0 }} barGap={2} barCategoryGap="22%">
            <CartesianGrid {...gridProps} horizontal={false} />
            <XAxis type="number" domain={[0, 100]} ticks={[0, 20, 40, 60, 80, 100]} {...xAxisProps} />
            <YAxis type="category" dataKey="category" width={180} {...yAxisProps} tick={truncTick(26)} interval={0} />
            <Tooltip cursor={cursorFill} content={<ChartTooltip mark="square" nameFormatter={(k) => (k === "avg_inherent" ? "Avg inherent" : "Avg residual")} footer={(r) => `${r?.vendors} vendors · ${fmtMoney(Number(r?.spend), "USD", true)} spend`} />} />
            <Bar dataKey="avg_inherent" fill={PRIMARY_SOFT} radius={[0, 4, 4, 0]} maxBarSize={12} isAnimationActive={false} />
            <Bar dataKey="avg_residual" fill={BRAND[800]} radius={[0, 4, 4, 0]} maxBarSize={12} isAnimationActive={false}>
              <LabelList dataKey="avg_residual" position="right" offset={6} fill={INK[700]} fontSize={11} fontWeight={600} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
      <TableCard title="Category detail" description="Vendors in scope (excludes terminated)">
        {data ? <SortTable cols={cols} {...t} /> : <Skeleton className="h-48 m-5" />}
      </TableCard>
    </Section>
  );
}

function TierStatus({ data }: { data?: ReportsData }) {
  const statuses = useMemo(() => {
    const present = new Set((data?.tier_matrix ?? []).map((r) => r.status));
    return STATUS_ORDER.filter((s) => present.has(s) || ["prospect", "onboarding", "active", "under_review"].includes(s));
  }, [data]);
  const grid = useMemo(() => TIER_ORDER.map((tier) => {
    const cells = statuses.map((s) => data?.tier_matrix.find((r) => r.tier === tier && r.status === s)?.count ?? 0);
    return { tier, cells, total: cells.reduce((a, b) => a + b, 0) };
  }), [data, statuses]);
  const colTotals = statuses.map((_, i) => grid.reduce((a, r) => a + r.cells[i], 0));
  const grand = colTotals.reduce((a, b) => a + b, 0);
  const max = Math.max(1, ...grid.flatMap((r) => r.cells));
  const exportCsv = () => downloadCsv(`meridian-tier-status-matrix-${stamp()}`, ["Tier", ...statuses.map((s) => LABELS.vendorStatus[s]), "Total"], [...grid.map((r) => [LABELS.tier[r.tier], ...r.cells, r.total] as CsvCell[]), ["Total", ...colTotals, grand]]);
  const legendSteps = [0.1, 0.3, 0.5, 0.7, 0.9, 1].map((t) => sequential(t * max, max).bg);
  return (
    <Section id="tier-status" index={2} title="Tier × status matrix" description="Every vendor on record by inherent risk tier and lifecycle status, including terminated. Darker cells hold more vendors; select a cell to open the matching vendor list." onExport={data ? exportCsv : undefined}>
      <Card className="break-inside-avoid">
        {!data ? <Skeleton className="h-64" /> : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full border-separate" style={{ borderSpacing: 3 }}>
                <thead>
                  <tr>
                    <th className="w-32" />
                    {statuses.map((s) => <th key={s} className="px-2 pb-2 text-xs font-semibold text-ink-600 text-center whitespace-nowrap">{LABELS.vendorStatus[s]}</th>)}
                    <th className="px-2 pb-2 text-xs font-semibold text-ink-900 text-center w-20">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {grid.map((r) => (
                    <tr key={r.tier}>
                      <th scope="row" className="pr-3 text-left">
                        <span className="inline-flex items-center gap-2 text-sm font-medium text-ink-800"><span className="h-2 w-2 rounded-full" style={{ background: TIER_COLORS[r.tier] }} />{LABELS.tier[r.tier]}</span>
                      </th>
                      {r.cells.map((c, i) => {
                        const { bg, fg } = sequential(c, max);
                        const label = `${LABELS.tier[r.tier]} · ${LABELS.vendorStatus[statuses[i]]}: ${c} vendor${c === 1 ? "" : "s"}`;
                        return (
                          <td key={i} className="p-0">
                            {c > 0 ? (
                              <Link to={`/vendors?tier=${r.tier}&status=${statuses[i]}`} title={label} aria-label={label} className="flex h-14 items-center justify-center rounded-md text-base font-semibold tnum transition-[filter,box-shadow] hover:brightness-95 hover:ring-2 hover:ring-brand-500/40 focus-ring" style={{ background: bg, color: fg }}>{c}</Link>
                            ) : (
                              <span title={label} className="flex h-14 items-center justify-center rounded-md text-sm" style={{ background: bg, color: fg }}>–</span>
                            )}
                          </td>
                        );
                      })}
                      <td className="text-center text-sm font-semibold text-ink-900 tnum bg-ink-50 rounded-md">{r.total}</td>
                    </tr>
                  ))}
                  <tr>
                    <th scope="row" className="pr-3 pt-1 text-left text-sm font-semibold text-ink-900">Total</th>
                    {colTotals.map((c, i) => <td key={i} className="h-10 text-center text-sm font-semibold text-ink-900 tnum bg-ink-50 rounded-md">{c}</td>)}
                    <td className="text-center text-sm font-bold text-ink-900 tnum bg-ink-100 rounded-md">{grand}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-ink-500">
              <span className="inline-flex items-center gap-2">
                Fewer
                <span className="inline-flex gap-[2px]">{legendSteps.map((c, i) => <span key={i} className="h-2.5 w-6 rounded-[3px]" style={{ background: c }} />)}</span>
                More <span className="text-ink-400">(max {max} per cell)</span>
              </span>
              <span>{grid[0].total} critical-tier vendors · {grid[0].cells[statuses.indexOf("active")] ?? 0} active</span>
            </div>
          </>
        )}
      </Card>
    </Section>
  );
}

function Findings({ data }: { data?: ReportsData }) {
  const aging = useMemo(() => withTopKey(AGING_BUCKETS.map((b) => {
    const r: Record<string, string | number> = { bucket: b.label, total: 0 };
    for (const t of TIER_ORDER) {
      const v = Number(data?.findings_aging.find((x) => x.severity === t)?.[b.key] ?? 0);
      r[t] = v;
      r.total = Number(r.total) + v;
    }
    return r;
  }), TIER_ORDER), [data]);
  const mttr = useMemo(() => TIER_ORDER.map((t) => {
    const r = data?.findings_mttr.find((x) => x.severity === t);
    return { severity: t, resolved: r?.resolved ?? 0, avg_days: r?.avg_days ?? 0 };
  }), [data]);
  const table = TIER_ORDER.map((t) => {
    const a = data?.findings_aging.find((x) => x.severity === t);
    const m = mttr.find((x) => x.severity === t)!;
    const open = a ? a.d0_30 + a.d31_60 + a.d61_90 + a.d90_plus : 0;
    return { id: t, severity: t, d0_30: a?.d0_30 ?? 0, d31_60: a?.d31_60 ?? 0, d61_90: a?.d61_90 ?? 0, d90_plus: a?.d90_plus ?? 0, open, resolved: m.resolved, mttr: m.avg_days };
  });
  const openTotal = table.reduce((a, r) => a + r.open, 0);
  const mttrTicks = niceTicks(Math.max(...mttr.map((r) => r.avg_days)), 4);
  const resolvedTotal = table.reduce((a, r) => a + r.resolved, 0);
  const wMttr = resolvedTotal ? table.reduce((a, r) => a + r.mttr * r.resolved, 0) / resolvedTotal : 0;
  const exportCsv = () => downloadCsv(`meridian-findings-aging-${stamp()}`, ["Severity", "Open 0-30d", "Open 31-60d", "Open 61-90d", "Open 90+d", "Open total", "Resolved", "MTTR (days)"], table.map((r) => [LABELS.tier[r.severity], r.d0_30, r.d31_60, r.d61_90, r.d90_plus, r.open, r.resolved, r.mttr]));
  const cols: Column<(typeof table)[number]>[] = [
    { key: "severity", header: "Severity", render: (r) => <Badge tone={TONES.tier[r.severity]} dot size="xs">{LABELS.tier[r.severity]}</Badge> },
    ...AGING_BUCKETS.map((b) => ({ key: b.key, header: b.label, align: "right" as const, render: (r: (typeof table)[number]) => <span className={cn("tnum", r[b.key] === 0 ? "text-ink-300" : b.key === "d90_plus" ? "text-danger-700 font-semibold" : "text-ink-700")}>{r[b.key]}</span> })),
    { key: "open", header: "Open total", align: "right", render: (r) => <span className="tnum font-semibold text-ink-900">{r.open}</span> },
    { key: "resolved", header: "Resolved", align: "right", render: (r) => <span className="tnum">{r.resolved}</span> },
    { key: "mttr", header: "MTTR", align: "right", render: (r) => <span className="tnum">{r.resolved ? `${r.mttr.toFixed(1)} d` : "—"}</span> },
  ];
  return (
    <Section id="findings" index={3} title="Findings aging & remediation" description="Open findings (open or in remediation) by age since raised, and mean time to resolve (MTTR) for findings that have been closed or risk-accepted." onExport={data ? exportCsv : undefined}>
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
        <ChartCard
          className="xl:col-span-3"
          title="Open findings by age"
          description={data ? `${openTotal} open · ${table.reduce((a, r) => a + r.d90_plus, 0)} older than 90 days` : undefined}
          loading={!data}
          empty={!!data && openTotal === 0}
          emptyTitle="No open findings"
          height={260}
          legend={<ChartLegend items={TIER_ORDER.map((t) => ({ key: t, label: LABELS.tier[t], color: TIER_COLORS[t] }))} />}
        >
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={aging} margin={{ top: 20, right: 8, bottom: 0, left: 0 }} barCategoryGap="34%">
              <CartesianGrid {...gridProps} vertical={false} />
              <XAxis dataKey="bucket" {...xAxisProps} />
              <YAxis allowDecimals={false} width={32} {...yAxisProps} />
              <Tooltip cursor={cursorFill} content={<ChartTooltip mark="square" reverse labelFormatter={(l) => `Open ${l}`} nameFormatter={(k) => LABELS.tier[k]} footer={(r) => `${r?.total ?? 0} findings`} />} />
              {TIER_ORDER.map((t) => (
                <Bar key={t} dataKey={t} stackId="s" fill={TIER_COLORS[t]} maxBarSize={56} shape={stackedShape(t, "__top", "horizontal")} isAnimationActive={false}>
                  {t === "low" && <LabelList dataKey="total" position="top" offset={6} fill={INK[700]} fontSize={12} fontWeight={600} />}
                </Bar>
              ))}
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard
          className="xl:col-span-2"
          title="Mean time to resolve"
          description={data ? `${resolvedTotal} resolved · ${wMttr.toFixed(1)} days weighted average` : undefined}
          loading={!data}
          empty={!!data && resolvedTotal === 0}
          emptyTitle="Nothing resolved yet"
          height={260}
        >
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={mttr} layout="vertical" margin={{ top: 4, right: 48, bottom: 0, left: 0 }} barCategoryGap="34%">
              <CartesianGrid {...gridProps} horizontal={false} />
              <XAxis type="number" {...xAxisProps} domain={[0, mttrTicks[mttrTicks.length - 1]]} ticks={mttrTicks} tickFormatter={(v: number) => `${v}d`} />
              <YAxis type="category" dataKey="severity" width={92} {...yAxisProps} tick={dotTick(2, (v) => TIER_COLORS[v as Tier], (v) => LABELS.tier[v])} />
              <Tooltip cursor={cursorFill} content={<ChartTooltip mark="square" labelFormatter={(l) => `${LABELS.tier[String(l)]} severity`} nameFormatter={() => "Avg days to resolve"} valueFormatter={(v) => `${v.toFixed(1)} d`} footer={(r) => `${r?.resolved ?? 0} findings resolved`} />} />
              <Bar dataKey="avg_days" fill={PRIMARY} radius={[0, 4, 4, 0]} maxBarSize={20} isAnimationActive={false}>
                <LabelList dataKey="avg_days" position="right" offset={8} formatter={(v: number) => `${Number(v).toFixed(1)} d`} fill={INK[700]} fontSize={12} fontWeight={600} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
      <TableCard title="Aging and MTTR by severity">
        {data ? <DataTable columns={cols} rows={table} dense /> : <Skeleton className="h-40 m-5" />}
      </TableCard>
    </Section>
  );
}

function ContractPipeline({ data }: { data?: ReportsData }) {
  const [metric, setMetric] = useState<"value" | "contracts">("value");
  const months = useMemo(() => {
    const start = startOfMonth(new Date());
    return Array.from({ length: 12 }).map((_, i) => {
      const m = addMonths(start, i);
      const key = format(m, "yyyy-MM");
      const r = data?.contract_pipeline.find((x) => x.month === key);
      return { id: key, month: key, label: i === 0 || m.getMonth() === 0 ? `${format(m, "MMM")}|${format(m, "yyyy")}` : format(m, "MMM"), full: format(m, "MMMM yyyy"), contracts: r?.contracts ?? 0, value: r?.value ?? 0 };
    });
  }, [data]);
  const types = useMemo(() => [...(data?.contracts_by_type ?? [])].sort((a, b) => {
    const ia = TYPE_ORDER.indexOf(a.type), ib = TYPE_ORDER.indexOf(b.type);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  }), [data]);
  const totalContracts = types.reduce((a, r) => a + r.count, 0);
  const totalValue = types.reduce((a, r) => a + r.value, 0);
  const pipeCount = months.reduce((a, r) => a + r.contracts, 0);
  const pipeValue = months.reduce((a, r) => a + r.value, 0);
  const peak = months.reduce((a, r) => (r[metric] > a[metric] ? r : a), months[0]);
  const exportCsv = () => downloadCsv(`meridian-contract-pipeline-${stamp()}`, ["Month", "Contracts ending", "Value ending (USD)"], months.map((r) => [r.month, r.contracts, r.value]));
  const exportTypes = () => downloadCsv(`meridian-contracts-by-type-${stamp()}`, ["Type", "Active contracts", "Total value (USD)"], types.map((r) => [LABELS.contractType[r.type] ?? r.type, r.count, r.value]));
  const toggle = (
    <div className="inline-flex rounded-md border border-ink-200 p-0.5 bg-ink-50 text-xs print:hidden" role="group" aria-label="Metric">
      {(["value", "contracts"] as const).map((m) => (
        <button key={m} type="button" onClick={() => setMetric(m)} aria-pressed={metric === m} className={cn("h-6 px-2.5 rounded font-medium focus-ring", metric === m ? "bg-white text-brand-700 shadow-sm" : "text-ink-500 hover:text-ink-800")}>{m === "value" ? "Value" : "Count"}</button>
      ))}
    </div>
  );
  return (
    <Section id="contracts" index={4} title="Contract pipeline" description="Active contracts reaching their end date over the next 12 months, and the mix of the active contract portfolio by agreement type." onExport={data ? exportCsv : undefined}>
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
        <ChartCard
          className="xl:col-span-3"
          title={metric === "value" ? "Contract value ending per month" : "Contracts ending per month"}
          description={data ? `${pipeCount} contracts · ${fmtMoney(pipeValue, "USD", true)} ending in the next 12 months${peak && peak[metric] > 0 ? ` · peak ${peak.full}` : ""}` : undefined}
          action={toggle}
          loading={!data}
          empty={!!data && pipeCount === 0}
          emptyTitle="No contracts ending in the next 12 months"
          height={280}
        >
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={months} margin={{ top: 22, right: 8, bottom: 0, left: 0 }} barCategoryGap="28%">
              <CartesianGrid {...gridProps} vertical={false} />
              <XAxis dataKey="label" {...xAxisProps} interval={0} height={40} tick={twoLineTick()} />
              <YAxis width={metric === "value" ? 52 : 32} allowDecimals={false} {...yAxisProps} tickFormatter={metric === "value" ? compactMoney : undefined} />
              <Tooltip cursor={cursorFill} content={<ChartTooltip mark="square" labelFormatter={(_l, r) => String(r?.full ?? "")} nameFormatter={() => (metric === "value" ? "Contract value" : "Contracts")} valueFormatter={(v) => (metric === "value" ? fmtMoney(v) : fmtNumber(v))} footer={(r) => (metric === "value" ? `${r?.contracts ?? 0} contracts` : fmtMoney(Number(r?.value ?? 0)))} />} />
              <Bar dataKey={metric} fill={PRIMARY} radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false}>
                <LabelList dataKey={metric} position="top" offset={6} fill={INK[700]} fontSize={11} fontWeight={600} formatter={(v: number) => (peak && v === peak[metric] && v > 0 ? (metric === "value" ? compactMoney(v) : String(v)) : "")} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <ChartCard
          className="xl:col-span-2"
          title="Active portfolio by type"
          description={data ? `${totalContracts} active contracts · ${fmtMoney(totalValue, "USD", true)} total value` : undefined}
          action={data ? <Button variant="ghost" size="xs" icon={Download} onClick={exportTypes} className="print:hidden">CSV</Button> : undefined}
          loading={!data}
          empty={!!data && totalContracts === 0}
          height={280}
        >
          <div className="flex flex-col sm:flex-row xl:flex-col 2xl:flex-row items-center gap-4">
            <div className="relative h-[180px] w-[180px] shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={types} dataKey="count" nameKey="type" innerRadius={58} outerRadius={86} paddingAngle={2} cornerRadius={3} stroke="none" startAngle={90} endAngle={-270} isAnimationActive={false}>
                    {types.map((t) => <Cell key={t.type} fill={typeColor(t.type)} />)}
                  </Pie>
                  <Tooltip content={<ChartTooltip mark="square" labelFormatter={(_l, r) => LABELS.contractType[String(r?.type)] ?? String(r?.type)} nameFormatter={() => "Contracts"} colorFor={(_k, r) => typeColor(String(r?.type))} footer={(r) => `${pct(Number(r?.count), totalContracts)}% of contracts · ${fmtMoney(Number(r?.value ?? 0), "USD", true)}`} />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-2xl font-semibold text-ink-900">{totalContracts}</span>
                <span className="text-[11px] text-ink-500">contracts</span>
              </div>
            </div>
            <ul className="w-full min-w-0 space-y-1.5">
              {types.map((t) => (
                <li key={t.type} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 text-xs">
                  <span className="inline-flex items-center gap-2 min-w-0 text-ink-700"><span className="h-2.5 w-2.5 rounded-[3px] shrink-0" style={{ background: typeColor(t.type) }} /><span className="truncate">{LABELS.contractType[t.type] ?? t.type}</span></span>
                  <span className="tnum text-ink-900 font-semibold text-right">{t.count}<span className="ml-1 font-normal text-ink-400">{pct(t.count, totalContracts)}%</span></span>
                  <span className="tnum text-ink-600 text-right w-16">{t.value ? fmtMoney(t.value, "USD", true) : "—"}</span>
                </li>
              ))}
            </ul>
          </div>
        </ChartCard>
      </div>
      <TableCard title="Monthly pipeline" description="Active and expiring contracts by end month">
        {data ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead><tr className="border-b border-ink-200 bg-ink-50/70">
                <th className="pl-5 pr-2 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-ink-500">Metric</th>
                {months.map((m) => <th key={m.month} className="px-1.5 py-2.5 text-right text-[11px] font-semibold text-ink-500 whitespace-nowrap">{format(parseDate(m.month + "-01") ?? new Date(), "MMM yy")}</th>)}
                <th className="pl-2 pr-5 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide text-ink-700">Total</th>
              </tr></thead>
              <tbody className="divide-y divide-ink-100">
                <tr><td className="pl-5 pr-2 py-2 text-ink-700 font-medium whitespace-nowrap">Contracts</td>{months.map((m) => <td key={m.month} className={cn("px-1.5 py-2 text-right tnum", m.contracts ? "text-ink-800" : "text-ink-300")}>{m.contracts}</td>)}<td className="pl-2 pr-5 py-2 text-right tnum font-semibold text-ink-900">{pipeCount}</td></tr>
                <tr><td className="pl-5 pr-2 py-2 text-ink-700 font-medium whitespace-nowrap">Value</td>{months.map((m) => <td key={m.month} className={cn("px-1.5 py-2 text-right tnum whitespace-nowrap", m.value ? "text-ink-800" : "text-ink-300")}>{m.value ? compactMoney(m.value) : "–"}</td>)}<td className="pl-2 pr-5 py-2 text-right tnum font-semibold text-ink-900 whitespace-nowrap">{fmtMoney(pipeValue, "USD", true)}</td></tr>
              </tbody>
            </table>
          </div>
        ) : <Skeleton className="h-24 m-5" />}
      </TableCard>
    </Section>
  );
}

function Compliance({ data }: { data?: ReportsData }) {
  const rows = useMemo(() => TIER_ORDER.map((t) => {
    const r = data?.compliance_coverage.find((x) => x.tier === t);
    const v = r?.vendors ?? 0;
    return { id: t, tier: t, vendors: v, assessed_n: r?.assessed_12m ?? 0, cert_n: r?.with_valid_cert ?? 0, dpa_n: r?.with_dpa ?? 0, assessed: pct(r?.assessed_12m ?? 0, v), cert: pct(r?.with_valid_cert ?? 0, v), dpa: pct(r?.with_dpa ?? 0, v) };
  }).filter((r) => r.vendors > 0), [data]);
  const exportCsv = () => downloadCsv(`meridian-compliance-coverage-${stamp()}`, ["Tier", "Active vendors", "Assessed in 12m", "% assessed", "Valid SOC2/ISO cert", "% cert", "DPA in force", "% DPA"], rows.map((r) => [LABELS.tier[r.tier], r.vendors, r.assessed_n, r.assessed, r.cert_n, r.cert, r.dpa_n, r.dpa]));
  const h = Math.max(220, rows.length * 78 + 30);
  const cell = (n: number, p: number) => (
    <span className="inline-flex items-center justify-end gap-2 w-full">
      <span className="h-1.5 w-16 rounded-full bg-ink-100 overflow-hidden hidden sm:block"><span className="block h-full rounded-full" style={{ width: `${p}%`, background: p >= 80 ? TIER_COLORS.low : p >= 50 ? TIER_COLORS.high : TIER_COLORS.critical }} /></span>
      <span className="tnum font-semibold text-ink-900 w-10 text-right">{p}%</span>
      <span className="tnum text-ink-400 text-xs w-10">{n}</span>
    </span>
  );
  const cols: Column<(typeof rows)[number]>[] = [
    { key: "tier", header: "Tier", render: (r) => <Badge tone={TONES.tier[r.tier]} dot size="xs">{LABELS.tier[r.tier]}</Badge> },
    { key: "vendors", header: "Active vendors", align: "right", render: (r) => <span className="tnum">{r.vendors}</span> },
    { key: "assessed", header: "Assessed ≤12 mo", align: "right", render: (r) => cell(r.assessed_n, r.assessed) },
    { key: "cert", header: "SOC 2 / ISO cert", align: "right", render: (r) => cell(r.cert_n, r.cert) },
    { key: "dpa", header: "DPA in force", align: "right", render: (r) => cell(r.dpa_n, r.dpa) },
  ];
  return (
    <Section id="compliance" index={5} title="Compliance coverage" description="Share of active vendors in each tier with a completed assessment in the last 12 months, a valid SOC 2 or ISO 27001 certificate on file, and an active data processing agreement." onExport={data ? exportCsv : undefined}>
      <ChartCard
        title="Coverage by tier"
        description="Percent of active vendors in tier"
        loading={!data}
        empty={!!data && !rows.length}
        height={h}
        legend={<ChartLegend items={COVERAGE.map((c) => ({ key: c.key, label: c.label, color: c.color }))} />}
      >
        <ResponsiveContainer width="100%" height={h}>
          <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 48, bottom: 0, left: 0 }} barGap={2} barCategoryGap="20%">
            <CartesianGrid {...gridProps} horizontal={false} />
            <XAxis type="number" domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickFormatter={(v: number) => `${v}%`} {...xAxisProps} />
            <YAxis type="category" dataKey="tier" width={92} {...yAxisProps} tick={dotTick(2, (v) => TIER_COLORS[v as Tier], (v) => LABELS.tier[v])} />
            <Tooltip cursor={cursorFill} content={<ChartTooltip mark="square" labelFormatter={(l, r) => `${LABELS.tier[String(l)]} tier · ${r?.vendors} vendors`} nameFormatter={(k) => COVERAGE.find((c) => c.key === k)?.label ?? k} valueFormatter={(v, k, r) => `${v}% (${r?.[`${k}_n`]})`} />} />
            {COVERAGE.map((c) => (
              <Bar key={c.key} dataKey={c.key} fill={c.color} radius={[0, 4, 4, 0]} maxBarSize={14} isAnimationActive={false}>
                <LabelList dataKey={c.key} position="right" offset={6} formatter={(v: number) => `${v}%`} fill={INK[700]} fontSize={11} fontWeight={600} />
              </Bar>
            ))}
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
      <TableCard title="Coverage detail" description="Percent of tier, with vendor counts">
        {data ? <DataTable columns={cols} rows={rows} dense /> : <Skeleton className="h-40 m-5" />}
      </TableCard>
    </Section>
  );
}

function SpendConcentration({ data }: { data?: ReportsData }) {
  const top = useMemo(() => (data?.spend_concentration ?? []).map((v) => ({ ...v, band: riskBand(v.residual_risk) })), [data]);
  const total = data?.spend_total_active ?? 0;
  const topSpend = top.reduce((a, r) => a + r.annual_spend, 0);
  const severe = top.filter((r) => r.residual_risk >= 60);
  const severeSpend = severe.reduce((a, r) => a + r.annual_spend, 0);
  const countries = useMemo(() => (data?.country_exposure ?? []).map((c) => ({ ...c, id: c.country ?? "Unknown", country: c.country ?? "Unknown" })), [data]);
  type CRow = (typeof countries)[number];
  const ccols = useMemo<SortCol<CRow>[]>(() => [
    { key: "country", header: "Country", sortValue: (r) => r.country, render: (r) => <span className="inline-flex items-center gap-2 font-medium text-ink-900"><Globe2 className="h-3.5 w-3.5 text-ink-400" />{r.country}</span> },
    { key: "vendors", header: "Vendors", align: "right", sortValue: (r) => r.vendors, render: (r) => <span className="tnum">{r.vendors}</span> },
    { key: "spend", header: "Spend", sortValue: (r) => r.spend, render: (r) => (
      <span className="inline-flex items-center gap-2 w-full">
        <span className="h-1.5 w-20 rounded-full bg-ink-100 overflow-hidden"><span className="block h-full rounded-full" style={{ width: `${pct(r.spend, total)}%`, background: PRIMARY }} /></span>
        <span className="tnum text-ink-800 w-14 text-right">{fmtMoney(r.spend, "USD", true)}</span>
        <span className="tnum text-ink-400 text-xs w-8 text-right">{pct(r.spend, total)}%</span>
      </span>
    ) },
    { key: "avg_risk", header: "Avg residual", sortValue: (r) => r.avg_risk, render: (r) => <RiskScore value={r.avg_risk} size="sm" /> },
  ], [total]);
  const ct = useSorted(countries, ccols, { key: "spend", dir: "desc" });
  const exportCsv = () => downloadCsv(`meridian-spend-concentration-${stamp()}`, ["Rank", "Vendor", "Category", "Tier", "Annual spend (USD)", "Share of active spend %", "Residual risk"], top.map((r, i) => [i + 1, r.name, r.category, LABELS.tier[r.tier], r.annual_spend, total ? ((r.annual_spend / total) * 100).toFixed(1) : 0, r.residual_risk]));
  const exportCountries = () => downloadCsv(`meridian-country-exposure-${stamp()}`, ["Country", "Active vendors", "Annual spend (USD)", "Share %", "Avg residual risk"], ct.sorted.map((r) => [r.country, r.vendors, r.spend, pct(r.spend, total), r.avg_risk]));
  const bands = (["critical", "high", "medium", "low"] as Tier[]).filter((b) => top.some((r) => r.band === b));
  const h = Math.max(240, top.length * 34 + 30);
  return (
    <Section id="spend" index={6} title="Spend concentration" description="The ten largest active vendors by annual spend, colored by residual risk band, and where spend sits geographically. Large spend with elevated residual risk is the concentration to watch." onExport={data ? exportCsv : undefined}>
      <div className="grid grid-cols-1 2xl:grid-cols-12 gap-4">
        <ChartCard
          className="2xl:col-span-7"
          title="Top 10 vendors by annual spend"
          description={data ? `${pct(topSpend, total)}% of active spend · ${severe.length} with residual risk ≥ 60 (${fmtMoney(severeSpend, "USD", true)})` : undefined}
          loading={!data}
          empty={!!data && !top.length}
          height={h}
          legend={<ChartLegend items={bands.map((b) => ({ key: b, label: `Residual ${RISK_BAND_LABEL[b].toLowerCase()}`, color: TIER_COLORS[b] }))} />}
        >
          <ResponsiveContainer width="100%" height={h}>
            <BarChart data={top} layout="vertical" margin={{ top: 0, right: 64, bottom: 0, left: 0 }} barCategoryGap="26%">
              <CartesianGrid {...gridProps} horizontal={false} />
              <XAxis type="number" {...xAxisProps} tickFormatter={compactMoney} />
              <YAxis type="category" dataKey="name" width={170} {...yAxisProps} tick={truncTick(24)} interval={0} />
              <Tooltip cursor={cursorFill} content={<ChartTooltip mark="square" nameFormatter={() => "Annual spend"} valueFormatter={(v) => fmtMoney(v)} colorFor={(_k, r) => TIER_COLORS[(r?.band as Tier) ?? "low"]} footer={(r) => `${r?.category} · ${LABELS.tier[String(r?.tier)]} tier · residual risk ${r?.residual_risk} · ${total ? ((Number(r?.annual_spend) / total) * 100).toFixed(1) : 0}% of spend`} />} />
              <Bar dataKey="annual_spend" radius={[0, 4, 4, 0]} maxBarSize={18} isAnimationActive={false}>
                {top.map((r) => <Cell key={r.id} fill={TIER_COLORS[r.band]} />)}
                <LabelList dataKey="annual_spend" position="right" offset={8} formatter={(v: number) => compactMoney(v)} fill={INK[700]} fontSize={12} fontWeight={500} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
        <Card padded={false} className="2xl:col-span-5 break-inside-avoid overflow-hidden">
          <div className="px-5 pt-4 pb-3 flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-ink-900">Country exposure</h3>
              <p className="text-xs text-ink-500 mt-0.5">Active vendors by headquarters country</p>
            </div>
            {data && <Button variant="ghost" size="xs" icon={Download} onClick={exportCountries} className="print:hidden">CSV</Button>}
          </div>
          <div className="border-t border-ink-100">{data ? <SortTable cols={ccols} {...ct} emptyTitle="No active vendors" /> : <Skeleton className="h-48 m-5" />}</div>
        </Card>
      </div>
    </Section>
  );
}

function AssessmentScores({ data }: { data?: ReportsData }) {
  const rows = data?.assessment_scores ?? [];
  type Row = ReportsData["assessment_scores"][number];
  const cols = useMemo<SortCol<Row>[]>(() => [
    { key: "title", header: "Assessment", sortValue: (r) => r.title, render: (r) => <span className="block min-w-0"><span className="block font-medium text-ink-900 truncate max-w-[230px] hover:text-brand-700" title={r.title}>{r.title.endsWith(` — ${r.vendor_name}`) ? r.title.slice(0, -(r.vendor_name.length + 3)) : r.title}</span><span className="block text-xs text-ink-500 truncate max-w-[230px]">{r.framework ?? "—"}</span></span> },
    { key: "vendor", header: "Vendor", sortValue: (r) => r.vendor_name, render: (r) => <span className="text-ink-700">{r.vendor_name}</span> },
    { key: "tier", header: "Tier", sortValue: (r) => TIER_ORDER.indexOf(r.tier), render: (r) => <Badge tone={TONES.tier[r.tier]} dot size="xs">{LABELS.tier[r.tier]}</Badge> },
    { key: "score", header: "Score", sortValue: (r) => r.score, render: (r) => (
      <span className="inline-flex items-center gap-2">
        <span className="h-2 w-16 rounded-full bg-ink-100 overflow-hidden"><span className="block h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, r.score))}%`, background: ratingColor(r.score) }} /></span>
        <span className="tnum font-semibold text-ink-900 w-10">{r.score.toFixed(1)}</span>
      </span>
    ) },
    { key: "rating", header: "Rating", sortValue: (r) => (r.risk_rating ? TIER_ORDER.indexOf(r.risk_rating) : null), render: (r) => (r.risk_rating ? <Badge tone={TONES.tier[r.risk_rating]} size="xs">{LABELS.tier[r.risk_rating]}</Badge> : <span className="text-ink-400">—</span>) },
    { key: "completed", header: "Completed", align: "right", sortValue: (r) => r.completed_at ?? "", render: (r) => <span className="tnum text-ink-600 whitespace-nowrap">{fmtDate(r.completed_at, "MMM d, yyyy")}</span> },
  ], []);
  const t = useSorted(rows, cols, { key: "score", dir: "asc" });
  const avg = rows.length ? rows.reduce((a, r) => a + r.score, 0) / rows.length : 0;
  const below70 = rows.filter((r) => r.score < 70).length;
  const exportCsv = () => downloadCsv(`meridian-assessment-scores-${stamp()}`, ["Assessment ID", "Assessment", "Framework", "Vendor", "Vendor tier", "Score", "Risk rating", "Completed"], t.sorted.map((r) => [r.id, r.title, r.framework, r.vendor_name, LABELS.tier[r.tier], r.score, r.risk_rating ? LABELS.tier[r.risk_rating] : "", r.completed_at ? fmtDate(r.completed_at, "yyyy-MM-dd") : ""]));
  return (
    <Section id="assessments" index={7} title="Assessment scores" description="The 25 lowest-scoring completed assessments. Score is the weighted share of controls answered yes (partial counts half); rating thresholds are low ≥ 85, medium ≥ 70, high ≥ 50, otherwise critical." onExport={data ? exportCsv : undefined}>
      <TableCard title="Lowest-scoring completed assessments" description={data ? `${rows.length} assessments · mean score ${avg.toFixed(1)} · ${below70} below 70 (high or critical risk)` : undefined}>
        {data ? <SortTable cols={cols} {...t} rowHref={(r) => `/assessments/${r.id}`} emptyTitle="No completed assessments" /> : <Skeleton className="h-64 m-5" />}
      </TableCard>
    </Section>
  );
}

function ApprovalSla({ data }: { data?: ReportsData }) {
  const rows = useMemo(() => (data?.approvals_sla ?? []).map((r) => ({ ...r, id: r.type, decided: r.approved + r.rejected, rate: r.approved + r.rejected ? Math.round((r.approved / (r.approved + r.rejected)) * 100) : null })), [data]);
  type Row = (typeof rows)[number];
  const maxH = Math.max(1, ...rows.map((r) => r.avg_hours ?? 0), ...rows.map((r) => r.pending_age_hours ?? 0));
  const cols = useMemo<SortCol<Row>[]>(() => [
    { key: "type", header: "Request type", sortValue: (r) => LABELS.approvalType[r.type] ?? r.type, render: (r) => <span className="font-medium text-ink-900 whitespace-nowrap">{LABELS.approvalType[r.type] ?? r.type}</span> },
    { key: "total", header: "Total", align: "right", sortValue: (r) => r.total, render: (r) => <span className="tnum">{r.total}</span> },
    { key: "approved", header: "Approved", align: "right", sortValue: (r) => r.approved, render: (r) => <span className="tnum"><span className="text-success-700">{r.approved}</span>{r.rate != null && <span className="ml-1.5 text-xs text-ink-400">{r.rate}%</span>}</span> },
    { key: "rejected", header: "Rejected", align: "right", sortValue: (r) => r.rejected, render: (r) => <span className={cn("tnum", r.rejected ? "text-danger-700" : "text-ink-400")}>{r.rejected}</span> },
    { key: "pending", header: "Pending", align: "right", sortValue: (r) => r.pending, render: (r) => <span className={cn("tnum", r.pending ? "text-warning-700 font-semibold" : "text-ink-400")}>{r.pending}</span> },
    { key: "avg_hours", header: "Avg to decision", sortValue: (r) => r.avg_hours, render: (r) => (
      <span className="inline-flex items-center gap-2">
        <span className="h-1.5 w-16 rounded-full bg-ink-100 overflow-hidden"><span className="block h-full rounded-full" style={{ width: `${((r.avg_hours ?? 0) / maxH) * 100}%`, background: PRIMARY }} /></span>
        <span className="tnum text-ink-900 font-semibold w-12 whitespace-nowrap">{hours(r.avg_hours)}</span>
      </span>
    ) },
    { key: "max_hours", header: "Slowest", align: "right", sortValue: (r) => r.max_hours, render: (r) => <span className="tnum text-ink-600">{hours(r.max_hours)}</span> },
    { key: "pending_age_hours", header: "Pending age", align: "right", sortValue: (r) => r.pending_age_hours, render: (r) => <span className={cn("tnum", (r.pending_age_hours ?? 0) > 72 ? "text-warning-700 font-medium" : "text-ink-600")}>{hours(r.pending_age_hours)}</span> },
  ], [maxH]);
  const t = useSorted(rows, cols, { key: "total", dir: "desc" });
  const decided = rows.reduce((a, r) => a + r.decided, 0);
  const pending = rows.reduce((a, r) => a + r.pending, 0);
  const wAvg = decided ? rows.reduce((a, r) => a + (r.avg_hours ?? 0) * r.decided, 0) / decided : null;
  const exportCsv = () => downloadCsv(`meridian-approval-slas-${stamp()}`, ["Request type", "Total", "Approved", "Rejected", "Pending", "Cancelled", "Approval rate %", "Avg hours to decision", "Slowest decision (hours)", "Avg pending age (hours)"], t.sorted.map((r) => [LABELS.approvalType[r.type] ?? r.type, r.total, r.approved, r.rejected, r.pending, r.cancelled, r.rate, r.avg_hours, r.max_hours, r.pending_age_hours]));
  return (
    <Section id="approvals" index={8} title="Approval SLAs" description="Turnaround on governance approvals by request type: time from request to decision for decided items, and how long open requests have been waiting." onExport={data ? exportCsv : undefined}>
      <TableCard title="Decision turnaround by request type" description={data ? `${decided} decided · ${pending} pending · ${wAvg == null ? "no decisions yet" : `${hours(wAvg)} weighted average to decision`}` : undefined}>
        {data ? <SortTable cols={cols} {...t} emptyTitle="No approval requests yet" /> : <Skeleton className="h-40 m-5" />}
      </TableCard>
    </Section>
  );
}
