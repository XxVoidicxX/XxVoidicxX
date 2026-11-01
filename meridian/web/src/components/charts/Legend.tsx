import type { ReactNode } from "react";
import { cn } from "@/components/ui";

export interface LegendItem {
  key: string;
  label: ReactNode;
  color: string;
  mark?: "square" | "line" | "dot";
  value?: ReactNode;
}

export function ChartLegend({ items, className }: { items: LegendItem[]; className?: string }) {
  return (
    <ul className={cn("flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-ink-600", className)}>
      {items.map((it) => (
        <li key={it.key} className="inline-flex items-center gap-1.5">
          <LegendSwatch color={it.color} mark={it.mark} />
          <span>{it.label}</span>
          {it.value != null && <span className="font-medium text-ink-900 tnum">{it.value}</span>}
        </li>
      ))}
    </ul>
  );
}

export function LegendSwatch({ color, mark = "square" }: { color: string; mark?: "square" | "line" | "dot" }) {
  if (mark === "line") return <span className="h-0.5 w-3.5 rounded-full shrink-0" style={{ background: color }} />;
  if (mark === "dot") return <span className="h-2 w-2 rounded-full shrink-0" style={{ background: color }} />;
  return <span className="h-2.5 w-2.5 rounded-[3px] shrink-0" style={{ background: color }} />;
}
