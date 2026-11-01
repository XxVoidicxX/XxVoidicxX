import { useEffect, useMemo, useRef, useState } from 'react';
import { chargesBetween } from '@/lib/engine';
import { endOfMonth, formatDate } from '@/lib/dates';
import type { MonthForecast } from '@/lib/engine';
import type { Subscription } from '@/lib/types';
import { useMoney } from '@/store/selectors';

export const SERIES = {
  subscriptions: { label: 'Subscriptions', color: '#2058eb' },
  bills: { label: 'Bills', color: '#0d9488' },
} as const;

export function irregularCharges(month: string, subscriptions: Subscription[]) {
  const end = endOfMonth(month);
  return subscriptions
    .filter((s) => s.cycle !== 'monthly' && s.cycle !== 'weekly')
    .map((s) => ({ name: s.name, amount: chargesBetween(s, month, end).length * s.amount }))
    .filter((x) => x.amount > 0)
    .sort((a, b) => b.amount - a.amount);
}

function niceStep(max: number, ticks: number): number {
  const raw = max / ticks;
  const mag = Math.pow(10, Math.floor(Math.log10(raw || 1)));
  const n = raw / mag;
  const nice = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return nice * mag;
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(720);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setWidth(Math.round(w));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

function topBarPath(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.min(r, h, w / 2);
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}

export function ForecastChart({
  forecast,
  subscriptions,
  locale,
}: {
  forecast: MonthForecast[];
  subscriptions: Subscription[];
  locale: string;
}) {
  const money = useMoney();
  const [wrapRef, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const height = 260;
  const compact = width < 560;
  const pad = { top: 28, right: 8, bottom: 30, left: compact ? 44 : 56 };
  const innerW = Math.max(10, width - pad.left - pad.right);
  const innerH = height - pad.top - pad.bottom;

  const max = Math.max(1, ...forecast.map((m) => m.total));
  const step = niceStep(max, 4);
  const top = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= top + step / 2; v += step) ticks.push(v);
  const y = (v: number) => pad.top + innerH - (v / top) * innerH;
  const band = innerW / forecast.length;
  const barW = Math.max(8, Math.min(40, band * 0.56));
  const peakIdx = forecast.reduce((best, m, i) => (m.total > forecast[best].total ? i : best), 0);

  const drivers = useMemo(() => forecast.map((m) => irregularCharges(m.month, subscriptions).slice(0, 3)), [forecast, subscriptions]);

  const tip = active !== null ? forecast[active] : null;
  const tipX = active !== null ? pad.left + band * active + band / 2 : 0;
  const tipLeft = Math.min(Math.max(tipX, 110), width - 110);
  const avg = forecast.reduce((a, m) => a + m.total, 0) / Math.max(1, forecast.length);

  return (
    <div className="ins-chart" ref={wrapRef} onMouseLeave={() => setActive(null)}>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="group"
        aria-label="Forecast of charges for the next 12 months, stacked by subscriptions and bills"
        className="ins-chart-svg"
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.left} x2={width - pad.right} y1={y(t)} y2={y(t)} className={t === 0 ? 'ins-axis-base' : 'ins-grid'} />
            <text x={pad.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="ins-axis-label">
              {money(t, { compact: true, whole: true })}
            </text>
          </g>
        ))}
        <line x1={pad.left} x2={width - pad.right} y1={y(avg)} y2={y(avg)} className="ins-avg" />
        {!compact && (
          <text x={width - pad.right} y={y(avg) - 6} textAnchor="end" className="ins-avg-label">
            Avg {money(avg, { whole: true })}
          </text>
        )}
        {forecast.map((m, i) => {
          const x = pad.left + band * i + (band - barW) / 2;
          const billsH = (m.bills / top) * innerH;
          const subsH = (m.subscriptions / top) * innerH;
          const gap = billsH > 0 && subsH > 0 ? 2 : 0;
          const base = pad.top + innerH;
          const isActive = active === i;
          const dim = active !== null && !isActive;
          const label = `${formatDate(m.month, 'monthYear', locale)}: ${money(m.total)} total, ${money(m.subscriptions)} subscriptions, ${money(m.bills)} bills`;
          return (
            <g
              key={m.month}
              className="ins-bar"
              tabIndex={0}
              role="img"
              aria-label={label}
              onMouseEnter={() => setActive(i)}
              onFocus={() => setActive(i)}
              onBlur={() => setActive((a) => (a === i ? null : a))}
              opacity={dim ? 0.45 : 1}
            >
              <rect x={pad.left + band * i} y={pad.top} width={band} height={innerH} className={isActive ? 'ins-hit is-active' : 'ins-hit'} />
              {billsH > 0 &&
                (subsH > 0 ? (
                  <rect x={x} y={base - billsH} width={barW} height={billsH} fill={SERIES.bills.color} />
                ) : (
                  <path d={topBarPath(x, base - billsH, barW, billsH, 4)} fill={SERIES.bills.color} />
                ))}
              {subsH > 0 && <path d={topBarPath(x, base - billsH - gap - subsH, barW, Math.max(1, subsH), 4)} fill={SERIES.subscriptions.color} />}
              {i === peakIdx && m.total > 0 && (
                <text x={x + barW / 2} y={y(m.total) - 8} textAnchor="middle" className="ins-peak-label">
                  {compact ? '▲' : `Peak ${money(m.total, { whole: true })}`}
                </text>
              )}
              {(!compact || i % 2 === 0) && (
                <text x={pad.left + band * i + band / 2} y={height - 10} textAnchor="middle" className={i === peakIdx ? 'ins-axis-label is-strong' : 'ins-axis-label'}>
                  {formatDate(m.month, 'month', locale)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {tip && active !== null && (
        <div className="ins-tooltip" style={{ left: tipLeft, top: Math.max(4, y(tip.total) - 12) }} role="presentation">
          <p className="ins-tooltip-title">{formatDate(tip.month, 'monthYear', locale)}</p>
          <div className="ins-tooltip-row">
            <span className="ins-swatch" style={{ background: SERIES.subscriptions.color }} />
            <span>Subscriptions</span>
            <strong className="tabular">{money(tip.subscriptions)}</strong>
          </div>
          <div className="ins-tooltip-row">
            <span className="ins-swatch" style={{ background: SERIES.bills.color }} />
            <span>Bills</span>
            <strong className="tabular">{money(tip.bills)}</strong>
          </div>
          <div className="ins-tooltip-row is-total">
            <span />
            <span>Total</span>
            <strong className="tabular">{money(tip.total)}</strong>
          </div>
          {drivers[active].length > 0 && (
            <p className="ins-tooltip-note">Includes {drivers[active].map((d) => d.name).join(', ')}</p>
          )}
        </div>
      )}
      <table className="sr-only">
        <caption>Forecast by month</caption>
        <thead>
          <tr>
            <th>Month</th>
            <th>Subscriptions</th>
            <th>Bills</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          {forecast.map((m) => (
            <tr key={m.month}>
              <td>{formatDate(m.month, 'monthYear', locale)}</td>
              <td>{money(m.subscriptions)}</td>
              <td>{money(m.bills)}</td>
              <td>{money(m.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function peakInfo(forecast: MonthForecast[], subscriptions: Subscription[]) {
  if (!forecast.length) return null;
  const peak = forecast.reduce((best, m) => (m.total > best.total ? m : best), forecast[0]);
  const extras = irregularCharges(peak.month, subscriptions);
  const avg = forecast.reduce((a, m) => a + m.total, 0) / forecast.length;
  return { peak, extras, avg, total: forecast.reduce((a, m) => a + m.total, 0) };
}
