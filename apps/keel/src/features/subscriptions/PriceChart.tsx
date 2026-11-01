import { useEffect, useRef, useState } from 'react';
import { compareISO, diffDays, formatDate } from '@/lib/dates';
import type { ISODate, PricePoint } from '@/lib/types';

interface Props {
  history: PricePoint[];
  today: ISODate;
  locale: string;
  format: (n: number) => string;
}

const H = 112;
const PAD_X = 8;
const PAD_TOP = 14;
const PAD_BOTTOM = 14;

export function PriceChart({ history, today, locale, format }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(400);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => setWidth(Math.max(200, el.clientWidth));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const points = [...history].sort((a, b) => compareISO(a.date, b.date));
  if (points.length === 0) return null;

  const start = points[0].date;
  const lastDate = points[points.length - 1].date;
  const end = compareISO(today, lastDate) > 0 ? today : lastDate;
  const span = Math.max(1, diffDays(end, start));
  const amounts = points.map((p) => p.amount);
  let min = Math.min(...amounts);
  let max = Math.max(...amounts);
  if (max === min) {
    min = min * 0.8;
    max = max * 1.2 || 1;
  } else {
    const pad = (max - min) * 0.25;
    min = Math.max(0, min - pad);
    max = max + pad;
  }
  const x = (d: ISODate) => PAD_X + (diffDays(d, start) / span) * (width - PAD_X * 2);
  const y = (v: number) => PAD_TOP + (1 - (v - min) / (max - min)) * (H - PAD_TOP - PAD_BOTTOM);

  let d = `M ${x(points[0].date)} ${y(points[0].amount)}`;
  for (let i = 1; i < points.length; i++) {
    d += ` H ${x(points[i].date)} V ${y(points[i].amount)}`;
  }
  d += ` H ${x(end)}`;
  const area = `${d} V ${H - PAD_BOTTOM + 6} H ${x(points[0].date)} Z`;

  const hp = hover !== null ? points[hover] : null;
  const label = points
    .map((p) => `${formatDate(p.date, 'medium', locale)}: ${format(p.amount)}`)
    .join(', ');

  return (
    <div className="subs-chart" ref={wrapRef}>
      <svg
        width={width}
        height={H}
        viewBox={`0 0 ${width} ${H}`}
        role="img"
        aria-label={`Price history. ${label}`}
        onMouseLeave={() => setHover(null)}
      >
        <line x1={PAD_X} x2={width - PAD_X} y1={H - PAD_BOTTOM + 6} y2={H - PAD_BOTTOM + 6} className="subs-chart-axis" />
        <path d={area} className="subs-chart-area" />
        <path d={d} className="subs-chart-line" />
        {points.map((p, i) => (
          <g key={`${p.date}-${i}`}>
            <circle cx={x(p.date)} cy={y(p.amount)} r={hover === i ? 5.5 : 4} className="subs-chart-dot" />
            <circle
              cx={x(p.date)}
              cy={y(p.amount)}
              r={14}
              className="subs-chart-hit"
              onMouseEnter={() => setHover(i)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              tabIndex={0}
              aria-label={`${formatDate(p.date, 'medium', locale)}: ${format(p.amount)}`}
            />
          </g>
        ))}
      </svg>
      {hp && (
        <div
          className="subs-chart-tip"
          style={{
            left: Math.min(Math.max(x(hp.date), 60), width - 60),
            top: Math.max(0, y(hp.amount) - 44),
          }}
          aria-hidden
        >
          <strong className="tabular">{format(hp.amount)}</strong>
          <span>{formatDate(hp.date, 'medium', locale)}</span>
        </div>
      )}
      <div className="subs-chart-labels">
        <span>{formatDate(start, 'monthYear', locale)}</span>
        <span>Today</span>
      </div>
    </div>
  );
}
