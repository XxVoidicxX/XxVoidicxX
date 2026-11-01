import { useLayoutEffect, useRef, useState } from 'react';
import { cx } from '@/components/ui';
import { formatDate } from '@/lib/dates';
import type { MonthForecast } from '@/lib/engine';

type MoneyFn = (amount: number, opts?: { compact?: boolean; whole?: boolean }) => string;

function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      setWidth(Math.round(w));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

export function healthTone(score: number): 'success' | 'brand' | 'warning' | 'danger' {
  if (score >= 90) return 'success';
  if (score >= 75) return 'brand';
  if (score >= 55) return 'warning';
  return 'danger';
}

export function HealthRing({ score, size = 52 }: { score: number; size?: number }) {
  const stroke = 6;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score)) / 100;
  return (
    <svg className={cx('dash-ring', `dash-ring-${healthTone(score)}`)} width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="dash-ring-track" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${c * pct} ${c}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        className="dash-ring-value"
      />
    </svg>
  );
}

export interface DonutSlice {
  key: string;
  label: string;
  color: string;
  value: number;
  count: number;
}

export function CategoryDonut({
  slices,
  money,
  onSelect,
}: {
  slices: DonutSlice[];
  money: MoneyFn;
  onSelect: (key: string) => void;
}) {
  const [active, setActive] = useState<string | null>(null);
  const total = slices.reduce((a, s) => a + s.value, 0);
  const size = 168;
  const stroke = 22;
  const r = (size - stroke) / 2 - 4;
  const c = 2 * Math.PI * r;
  const gap = slices.length > 1 ? 2.5 : 0;
  const current = slices.find((s) => s.key === active);
  let offset = 0;

  return (
    <div className="dash-donut">
      <div className="dash-donut-figure">
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={stroke} />
          {slices.map((s) => {
            const len = total > 0 ? (s.value / total) * c : 0;
            const seg = (
              <circle
                key={s.key}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={s.color}
                strokeWidth={active === s.key ? stroke + 6 : stroke}
                strokeDasharray={`${Math.max(0, len - gap)} ${c}`}
                strokeDashoffset={-offset}
                transform={`rotate(-90 ${size / 2} ${size / 2})`}
                className={cx('dash-donut-seg', active && active !== s.key && 'is-dim')}
                onMouseEnter={() => setActive(s.key)}
                onMouseLeave={() => setActive(null)}
                onClick={() => onSelect(s.key)}
              />
            );
            offset += len;
            return seg;
          })}
        </svg>
        <div className="dash-donut-center">
          <span className="dash-donut-value tabular">{money(current ? current.value : total)}</span>
          <span className="dash-donut-label truncate">{current ? current.label : 'per month'}</span>
        </div>
      </div>
      <ul className="dash-legend">
        {slices.map((s) => (
          <li key={s.key}>
            <button
              type="button"
              className={cx('dash-legend-item', active === s.key && 'is-active')}
              onMouseEnter={() => setActive(s.key)}
              onMouseLeave={() => setActive(null)}
              onFocus={() => setActive(s.key)}
              onBlur={() => setActive(null)}
              onClick={() => onSelect(s.key)}
            >
              <span className="dash-legend-dot" style={{ background: s.color }} aria-hidden />
              <span className="dash-legend-label truncate">{s.label}</span>
              <span className="dash-legend-pct tabular">{total > 0 ? Math.round((s.value / total) * 100) : 0}%</span>
              <span className="dash-legend-amt tabular">{money(s.value)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function niceStep(max: number, ticks: number): number {
  const rough = max / ticks;
  if (rough <= 0) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(rough)));
  for (const m of [1, 2, 2.5, 5, 10]) {
    if (m * pow >= rough) return m * pow;
  }
  return 10 * pow;
}

function topRoundedRect(x: number, y: number, w: number, h: number, r: number): string {
  if (h <= 0) return '';
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}

export function ForecastChart({ data, money, locale }: { data: MonthForecast[]; money: MoneyFn; locale: string }) {
  const [wrapRef, width] = useElementWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const height = 236;
  const padL = 46;
  const padR = 4;
  const padT = 10;
  const padB = 26;
  const innerW = Math.max(0, width - padL - padR);
  const innerH = height - padT - padB;
  const max = Math.max(1, ...data.map((d) => d.total));
  const step = niceStep(max, 3);
  const top = Math.max(step, Math.ceil(max / step) * step);
  const ticks: number[] = [];
  for (let v = 0; v <= top + 0.001; v += step) ticks.push(v);
  const band = data.length ? innerW / data.length : 0;
  const barW = Math.max(6, Math.min(30, band * 0.58));
  const y = (v: number) => padT + innerH - (v / top) * innerH;
  const narrow = width < 460;

  const yearTotal = data.reduce((acc, d) => acc + d.total, 0);
  const peak = data.reduce<MonthForecast | null>((m, d) => (!m || d.total > m.total ? d : m), null);
  const summary = `Projected charges for the next 12 months: ${money(yearTotal)} in total${
    peak ? `, highest in ${formatDate(peak.month, 'monthYear', locale)} at ${money(peak.total)}` : ''
  }. Full figures are in the table that follows.`;

  const a = active !== null ? data[active] : null;
  const ax = active !== null ? padL + band * active + band / 2 : 0;

  return (
    <div className="dash-fc" ref={wrapRef}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={summary}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={padL} x2={width - padR} y1={y(t)} y2={y(t)} className={t === 0 ? 'dash-fc-base' : 'dash-fc-grid'} />
              <text x={padL - 8} y={y(t)} dy="0.32em" textAnchor="end" className="dash-fc-axis">
                {money(t, { compact: true, whole: true })}
              </text>
            </g>
          ))}
          {data.map((d, i) => {
            const x = padL + band * i + (band - barW) / 2;
            const billsH = (d.bills / top) * innerH;
            const subsH = (d.subscriptions / top) * innerH;
            const gap = billsH > 0 && subsH > 0 ? 2 : 0;
            const base = padT + innerH;
            const billsTop = base - billsH;
            const dim = active !== null && active !== i;
            return (
              <g key={d.month} className={cx('dash-fc-col', dim && 'is-dim')}>
                {subsH > 0 ? (
                  <>
                    <rect x={x} y={billsTop} width={barW} height={Math.max(0, billsH)} className="dash-fc-bills" />
                    <path d={topRoundedRect(x, billsTop - gap - subsH, barW, Math.max(0, subsH), 4)} className="dash-fc-subs" />
                  </>
                ) : (
                  <path d={topRoundedRect(x, billsTop, barW, billsH, 4)} className="dash-fc-bills" />
                )}
                {(!narrow || i % 2 === 0) && (
                  <text x={padL + band * i + band / 2} y={height - 8} textAnchor="middle" className={cx('dash-fc-axis', i === 0 && 'is-now')}>
                    {formatDate(d.month, 'month', locale)}
                  </text>
                )}
              </g>
            );
          })}
          <g>
            {data.map((d, i) => (
              <rect
                key={d.month}
                className="dash-fc-hit"
                x={padL + band * i}
                y={padT}
                width={band}
                height={innerH}
                onMouseEnter={() => setActive(i)}
                onMouseLeave={() => setActive(null)}
              />
            ))}
          </g>
        </svg>
      )}
      <div className="sr-only">
        <table>
          <caption>Projected charges by month</caption>
          <thead>
            <tr>
              <th scope="col">Month</th>
              <th scope="col">Subscriptions</th>
              <th scope="col">Bills</th>
              <th scope="col">Total</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.month}>
                <th scope="row">{formatDate(d.month, 'monthYear', locale)}</th>
                <td>{money(d.subscriptions)}</td>
                <td>{money(d.bills)}</td>
                <td>{money(d.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {a && (
        <div
          className={cx('dash-tip', active === 0 && 'is-start', active === data.length - 1 && 'is-end')}
          style={{ left: ax, top: Math.max(0, y(a.total) - 10) }}
          role="presentation"
        >
          <p className="dash-tip-title">{formatDate(a.month, 'monthYear', locale)}</p>
          <p className="dash-tip-row">
            <span className="dash-key dash-key-subs" aria-hidden />
            Subscriptions <b className="tabular">{money(a.subscriptions)}</b>
          </p>
          <p className="dash-tip-row">
            <span className="dash-key dash-key-bills" aria-hidden />
            Bills <b className="tabular">{money(a.bills)}</b>
          </p>
          <p className="dash-tip-total">
            Total <b className="tabular">{money(a.total)}</b>
          </p>
        </div>
      )}
    </div>
  );
}
