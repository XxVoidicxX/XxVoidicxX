import { cx } from '@/components/ui';
import { addDays, compareISO, diffDays, formatDate, maxISO, relativeDays } from '@/lib/dates';
import { returnDeadline, warrantyEnd } from '@/lib/engine';
import type { ISODate, Purchase } from '@/lib/types';
import { manufacturerEnd } from './purchaseMeta';

export function monthYear(iso: ISODate, locale: string): string {
  return `${formatDate(iso, 'month', locale)} ${iso.slice(0, 4)}`;
}

interface Scale {
  start: ISODate;
  total: number;
  pos: (iso: ISODate) => number;
}

function makeScale(p: Purchase, today: ISODate): Scale {
  const rd = returnDeadline(p);
  const we = warrantyEnd(p);
  const start = p.purchaseDate;
  let end = maxISO(maxISO(rd ?? start, we ?? start), today);
  if (diffDays(end, start) < 30) end = addDays(start, 30);
  if (compareISO(today, end) >= 0) end = addDays(end, Math.max(3, Math.round(diffDays(end, start) * 0.04)));
  const total = Math.max(1, diffDays(end, start));
  return { start, total, pos: (iso) => Math.max(0, Math.min(100, (diffDays(iso, start) / total) * 100)) };
}

function Lane({
  kind,
  end,
  midpoint,
  scale,
  today,
  muted,
}: {
  kind: 'return' | 'warranty';
  end: ISODate | null;
  midpoint?: ISODate | null;
  scale: Scale;
  today: ISODate;
  muted: boolean;
}) {
  if (!end) return <span className="buy-lane buy-lane-none" />;
  const pEnd = Math.max(1.5, scale.pos(end));
  const pToday = scale.pos(today);
  const active = !muted && compareISO(end, today) >= 0;
  const pMid = midpoint && compareISO(midpoint, end) < 0 ? scale.pos(midpoint) : null;
  return (
    <span className={cx('buy-lane', `buy-lane-${kind}`, !active && 'is-past')}>
      <span className="buy-lane-fill" style={{ width: `${pEnd}%` }} />
      {active && (
        <span
          className="buy-lane-left"
          style={{ left: `${Math.min(pToday, pEnd)}%`, width: `${Math.max(0, pEnd - pToday)}%` }}
        />
      )}
      {pMid !== null && <span className="buy-lane-split" style={{ left: `${pMid}%` }} />}
    </span>
  );
}

export function CoverageMini({ p, today, locale }: { p: Purchase; today: ISODate; locale: string }) {
  const scale = makeScale(p, today);
  const rd = returnDeadline(p);
  const we = warrantyEnd(p);
  const muted = !!p.returned;
  const pToday = scale.pos(today);
  const parts = [
    rd ? `${compareISO(rd, today) >= 0 ? 'Return by' : 'Return closed'} ${formatDate(rd, 'short', locale)}` : 'No returns',
    we ? `${compareISO(we, today) >= 0 ? 'Warranty to' : 'Warranty ended'} ${monthYear(we, locale)}` : 'No warranty',
  ];
  const summary = p.returned ? 'Returned' : parts.join(' · ');
  return (
    <div className="buy-mini" title={summary}>
      <div className="buy-mini-lanes" aria-hidden>
        <span className="buy-mini-label">Return</span>
        <Lane kind="return" end={rd} scale={scale} today={today} muted={muted} />
        <span className="buy-mini-label">Warranty</span>
        <Lane kind="warranty" end={we} scale={scale} today={today} muted={muted} />
        <span className="buy-today" style={{ left: `calc(58px + (100% - 58px) * ${pToday / 100})` }} />
      </div>
      <span className="buy-mini-text">{summary}</span>
    </div>
  );
}

export function CoverageTimeline({ p, today, locale }: { p: Purchase; today: ISODate; locale: string }) {
  const scale = makeScale(p, today);
  const rd = returnDeadline(p);
  const we = warrantyEnd(p);
  const mfg = manufacturerEnd(p);
  const muted = !!p.returned;
  const pToday = scale.pos(today);
  const align = pToday < 12 ? 'start' : pToday > 88 ? 'end' : 'center';
  const endISO = addDays(scale.start, scale.total);
  const rel = (iso: ISODate) => relativeDays(iso, today);

  return (
    <div className="buy-tl">
      <div className="buy-tl-grid">
        <span />
        <div className="buy-tl-today-row">
          <span className={cx('buy-tl-today-label', `is-${align}`)} style={{ left: `${pToday}%` }}>
            Today
          </span>
        </div>

        <span className="buy-tl-label">Return</span>
        <div className="buy-tl-lane-wrap">
          <Lane kind="return" end={rd} scale={scale} today={today} muted={muted} />
          <span className="buy-tl-marker" style={{ left: `${pToday}%` }} />
        </div>

        <span className="buy-tl-label">Warranty</span>
        <div className="buy-tl-lane-wrap">
          <Lane kind="warranty" end={we} midpoint={p.extendedWarrantyMonths ? mfg : null} scale={scale} today={today} muted={muted} />
          <span className="buy-tl-marker" style={{ left: `${pToday}%` }} />
        </div>

        <span />
        <div className="buy-tl-axis">
          <span>{formatDate(p.purchaseDate, 'medium', locale)}</span>
          <span>{formatDate(endISO, 'medium', locale)}</span>
        </div>
      </div>

      <dl className="buy-tl-legend">
        <div>
          <dt>
            <span className="buy-key buy-key-return" aria-hidden /> Return window
          </dt>
          <dd>
            {rd ? (
              <>
                <strong>{formatDate(rd, 'medium', locale)}</strong>
                <span>
                  {p.returnDays} days · {compareISO(rd, today) >= 0 ? rel(rd) : `closed ${rel(rd).toLowerCase()}`}
                </span>
              </>
            ) : (
              <strong>No returns</strong>
            )}
          </dd>
        </div>
        <div>
          <dt>
            <span className="buy-key buy-key-warranty" aria-hidden /> Warranty
          </dt>
          <dd>
            {we ? (
              <>
                <strong>{formatDate(we, 'medium', locale)}</strong>
                <span>
                  {p.extendedWarrantyMonths && mfg
                    ? `Manufacturer to ${monthYear(mfg, locale)}, then extended`
                    : compareISO(we, today) >= 0
                      ? rel(we)
                      : `ended ${rel(we).toLowerCase()}`}
                </span>
              </>
            ) : (
              <strong>No warranty</strong>
            )}
          </dd>
        </div>
      </dl>
    </div>
  );
}
