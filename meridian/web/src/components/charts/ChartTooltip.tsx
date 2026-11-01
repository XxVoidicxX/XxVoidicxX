import type { ReactNode } from "react";

export interface TooltipRow {
  key: string;
  label: ReactNode;
  value: ReactNode;
  color?: string;
  mark?: "line" | "square";
}

export function TooltipCard({ title, rows, footer }: { title?: ReactNode; rows: TooltipRow[]; footer?: ReactNode }) {
  return (
    <div className="min-w-[160px] max-w-[280px] rounded-lg border border-ink-200 bg-white px-3 py-2.5 shadow-pop text-xs">
      {title != null && <p className="font-semibold text-ink-900 mb-1.5 leading-4">{title}</p>}
      <ul className="space-y-1">
        {rows.map((r) => (
          <li key={r.key} className="flex items-center gap-2">
            {r.color && (r.mark === "square"
              ? <span className="h-2.5 w-2.5 rounded-[3px] shrink-0" style={{ background: r.color }} />
              : <span className="h-0.5 w-3 rounded-full shrink-0" style={{ background: r.color }} />)}
            <span className="font-semibold text-ink-900 tnum">{r.value}</span>
            <span className="text-ink-500 truncate">{r.label}</span>
          </li>
        ))}
      </ul>
      {footer && <div className="mt-2 pt-2 border-t border-ink-100 text-ink-500">{footer}</div>}
    </div>
  );
}

interface RechartsPayloadItem {
  dataKey?: string | number;
  name?: string | number;
  value?: number | string;
  color?: string;
  fill?: string;
  stroke?: string;
  payload?: Record<string, unknown>;
}

export interface ChartTooltipProps {
  active?: boolean;
  label?: string | number;
  payload?: RechartsPayloadItem[];
  labelFormatter?: (label: string | number, row: Record<string, unknown> | undefined) => ReactNode;
  valueFormatter?: (value: number, key: string, row: Record<string, unknown> | undefined) => ReactNode;
  nameFormatter?: (key: string) => ReactNode;
  colorFor?: (key: string, row: Record<string, unknown> | undefined) => string | undefined;
  footer?: (row: Record<string, unknown> | undefined) => ReactNode;
  hideZero?: boolean;
  reverse?: boolean;
  mark?: "line" | "square";
}

export function ChartTooltip({ active, label, payload, labelFormatter, valueFormatter, nameFormatter, colorFor, footer, hideZero, reverse, mark = "line" }: ChartTooltipProps) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  let items = payload.filter((p) => !(hideZero && Number(p.value ?? 0) === 0));
  if (reverse) items = [...items].reverse();
  const rows: TooltipRow[] = items.map((p, i) => {
    const key = String(p.dataKey ?? p.name ?? i);
    return {
      key,
      label: nameFormatter ? nameFormatter(key) : String(p.name ?? key),
      value: valueFormatter ? valueFormatter(Number(p.value ?? 0), key, row) : String(p.value ?? "—"),
      color: colorFor?.(key, row) ?? p.color ?? p.fill ?? p.stroke,
      mark,
    };
  });
  return <TooltipCard title={labelFormatter ? labelFormatter(label ?? "", row) : label} rows={rows} footer={footer?.(row)} />;
}
