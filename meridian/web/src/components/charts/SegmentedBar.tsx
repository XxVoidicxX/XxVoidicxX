import { useState, type ReactNode } from "react";
import { TooltipCard } from "./ChartTooltip";

export interface Segment {
  key: string;
  label: string;
  value: number;
  color: string;
  textColor?: string;
  detail?: ReactNode;
}

export function SegmentedBar({ segments, height = 28, format = (v) => String(v), ariaLabel }: { segments: Segment[]; height?: number; format?: (v: number, share: number) => string; ariaLabel?: string }) {
  const total = segments.reduce((a, s) => a + s.value, 0);
  const [hover, setHover] = useState<string | null>(null);
  const visible = segments.filter((s) => s.value > 0);
  if (!total) return <div className="rounded bg-ink-100" style={{ height }} />;
  const hovered = visible.find((s) => s.key === hover);
  const name = ariaLabel ?? visible.map((s) => `${s.label} ${s.value} (${Math.round((s.value / total) * 100)}%)`).join(", ");
  return (
    <div className="relative" role="img" aria-label={name}>
      <div className="flex w-full gap-[2px]" style={{ height }}>
        {visible.map((s) => {
          const share = s.value / total;
          const label = format(s.value, share);
          const fits = share * 100 >= label.length * 2.2 + 3;
          return (
            <div
              key={s.key}
              tabIndex={0}
              onMouseEnter={() => setHover(s.key)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(s.key)}
              onBlur={() => setHover(null)}
              className="relative flex items-center rounded-[4px] px-2 text-[11px] font-semibold outline-none transition-[filter] hover:brightness-110 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1"
              style={{ flexGrow: s.value, flexBasis: 0, background: s.color, color: s.textColor ?? "#ffffff", minWidth: 4 }}
            >
              {fits && <span className="truncate tnum">{label}</span>}
            </div>
          );
        })}
      </div>
      {hovered && (
        <div className="absolute z-10 left-1/2 -translate-x-1/2 pointer-events-none" style={{ top: height + 8 }}>
          <TooltipCard title={hovered.label} rows={[{ key: "v", label: `${Math.round((hovered.value / total) * 100)}% of total`, value: format(hovered.value, hovered.value / total), color: hovered.color, mark: "square" }]} footer={hovered.detail} />
        </div>
      )}
    </div>
  );
}
