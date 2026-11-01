import { useState, type ReactNode } from "react";
import { BarChart3, Table2, BarChartBig } from "lucide-react";
import { Card, EmptyState, Skeleton, cn } from "@/components/ui";

export interface ChartCardProps {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  legend?: ReactNode;
  loading?: boolean;
  fetching?: boolean;
  empty?: boolean;
  emptyTitle?: ReactNode;
  emptyDescription?: ReactNode;
  height?: number;
  table?: ReactNode;
  footer?: ReactNode;
  className?: string;
  children: ReactNode;
}

export function ChartCard({ title, description, action, legend, loading, fetching, empty, emptyTitle = "No data yet", emptyDescription, height = 260, table, footer, className, children }: ChartCardProps) {
  const [view, setView] = useState<"chart" | "table">("chart");
  const toggle = table ? (
    <div className="inline-flex rounded-md border border-ink-200 p-0.5 bg-ink-50 print:hidden" role="group" aria-label="Chart view">
      <button type="button" onClick={() => setView("chart")} aria-pressed={view === "chart"} title="Chart view" className={cn("h-6 w-7 inline-flex items-center justify-center rounded focus-ring", view === "chart" ? "bg-white text-brand-700 shadow-sm" : "text-ink-500 hover:text-ink-800")}>
        <BarChart3 className="h-3.5 w-3.5" />
      </button>
      <button type="button" onClick={() => setView("table")} aria-pressed={view === "table"} title="Table view" className={cn("h-6 w-7 inline-flex items-center justify-center rounded focus-ring", view === "table" ? "bg-white text-brand-700 shadow-sm" : "text-ink-500 hover:text-ink-800")}>
        <Table2 className="h-3.5 w-3.5" />
      </button>
    </div>
  ) : null;
  return (
    <Card className={cn("flex flex-col break-inside-avoid", className)}>
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-ink-900 leading-5">{title}</h3>
          {description && <p className="text-xs text-ink-500 mt-0.5">{description}</p>}
        </div>
        {(action || toggle) && <div className="shrink-0 flex items-center gap-2">{action}{toggle}</div>}
      </div>
      {loading ? (
        <div style={{ minHeight: height }} className="flex flex-col gap-3">
          <Skeleton className="h-3 w-40" />
          <Skeleton className="flex-1 w-full" />
        </div>
      ) : empty ? (
        <div style={{ minHeight: height }} className="flex items-center justify-center">
          <EmptyState icon={BarChartBig} title={emptyTitle} description={emptyDescription} className="py-6" />
        </div>
      ) : (
        <div className={cn("flex-1 flex flex-col transition-opacity", fetching && "opacity-60")}>
          {legend && view === "chart" && <div className="mb-3">{legend}</div>}
          {view === "chart" ? <div style={{ minHeight: height }} className="flex-1">{children}</div> : <div className="-mx-5 border-t border-ink-100 overflow-auto" style={{ maxHeight: Math.max(height + 40, 240) }}>{table}</div>}
          {footer && <div className="mt-3">{footer}</div>}
        </div>
      )}
    </Card>
  );
}

export function MiniTable({ headers, rows, align }: { headers: ReactNode[]; rows: ReactNode[][]; align?: ("left" | "right")[] }) {
  return (
    <table className="w-full text-xs">
      <thead className="sticky top-0 bg-ink-50">
        <tr className="border-b border-ink-200">
          {headers.map((h, i) => <th key={i} className={cn("px-5 py-2 font-semibold uppercase tracking-wide text-[11px] text-ink-500 whitespace-nowrap", align?.[i] === "right" ? "text-right" : "text-left")}>{h}</th>)}
        </tr>
      </thead>
      <tbody className="divide-y divide-ink-100">
        {rows.map((r, i) => (
          <tr key={i}>
            {r.map((c, j) => <td key={j} className={cn("px-5 py-2 text-ink-700", align?.[j] === "right" ? "text-right tnum" : "text-left")}>{c}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
