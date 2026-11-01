import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarDays, CalendarPlus, ChevronLeft, ChevronRight, ChevronRight as Chevron, Plus, RotateCcw } from 'lucide-react';
import { Badge, Button, EmptyState, PageHeader, Segmented, cx, useToast } from '@/components/ui';
import { useUI } from '@/app/ui';
import { addDays, addMonths, compareISO, diffDays, formatDate, monthMatrix, relativeDays, startOfMonth } from '@/lib/dates';
import { buildTimeline } from '@/lib/engine';
import { refPath } from '@/lib/routes';
import type { Severity, TimelineEvent } from '@/lib/types';
import { useMoney, useTimeline } from '@/store/selectors';
import { useData, useToday } from '@/store/store';
import { KIND_GROUPS, KindIcon, kindClass, kindGroup, kindLabel, type KindGroup } from './kinds';
import { buildICS, downloadText } from './ics';
import './calendar.css';

type View = 'month' | 'agenda';
const VIEW_KEY = 'keel.calendar.view';
const AGENDA_DAYS = 60;
const SEV_RANK: Record<Severity, number> = { critical: 0, warning: 1, info: 2 };

function readView(): View {
  try {
    return localStorage.getItem(VIEW_KEY) === 'agenda' ? 'agenda' : 'month';
  } catch {
    return 'month';
  }
}

function writeView(v: View) {
  try {
    localStorage.setItem(VIEW_KEY, v);
  } catch {
    return;
  }
}

function groupByDate(events: TimelineEvent[]): Map<string, TimelineEvent[]> {
  const map = new Map<string, TimelineEvent[]>();
  for (const e of events) {
    const list = map.get(e.date) ?? [];
    list.push(e);
    map.set(e.date, list);
  }
  return map;
}

function cellOrder(a: TimelineEvent, b: TimelineEvent): number {
  const ac = a.kind === 'charge' ? 1 : 0;
  const bc = b.kind === 'charge' ? 1 : 0;
  return ac - bc || SEV_RANK[a.severity] - SEV_RANK[b.severity] || a.title.localeCompare(b.title);
}

function chargeTotal(list: TimelineEvent[]): number {
  return list.reduce((s, e) => s + (e.kind === 'charge' ? e.amount ?? 0 : 0), 0);
}

function dayHeading(iso: string, today: string, locale: string): string {
  const n = diffDays(iso, today);
  if (n === 0) return `Today · ${formatDate(iso, 'long', locale)}`;
  if (n === 1) return `Tomorrow · ${formatDate(iso, 'long', locale)}`;
  return formatDate(iso, 'long', locale);
}

export function CalendarPage() {
  const data = useData();
  const today = useToday();
  const money = useMoney();
  const toast = useToast();
  const { settings } = data;
  const locale = settings.locale;
  const [view, setViewState] = useState<View>(readView);
  const [cursor, setCursor] = useState(() => startOfMonth(today));
  const [selected, setSelected] = useState(today);
  const [hidden, setHidden] = useState<Set<KindGroup>>(() => new Set());

  const setView = (v: View) => {
    setViewState(v);
    writeView(v);
  };

  const weeks = useMemo(() => monthMatrix(cursor, settings.weekStartsOn), [cursor, settings.weekStartsOn]);
  const gridEvents = useTimeline(weeks[0][0], weeks[5][6]);
  const agendaEvents = useTimeline(today, addDays(today, AGENDA_DAYS - 1));
  const visible = (e: TimelineEvent) => !hidden.has(kindGroup(e.kind));

  const monthKey = cursor.slice(0, 7);
  const monthEvents = useMemo(() => gridEvents.filter((e) => e.date.startsWith(monthKey)), [gridEvents, monthKey]);
  const scopeEvents = view === 'month' ? monthEvents : agendaEvents;
  const counts = useMemo(() => {
    const c: Record<KindGroup, number> = { charges: 0, trials: 0, documents: 0, returns: 0, warranties: 0, tasks: 0 };
    for (const e of scopeEvents) c[kindGroup(e.kind)] += 1;
    return c;
  }, [scopeEvents]);

  const toggleGroup = (g: KindGroup) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(g)) next.delete(g);
      else next.add(g);
      return next;
    });
  };

  const goMonth = (n: number) => {
    const next = addMonths(cursor, n, 1);
    setCursor(next);
    setSelected(next.slice(0, 7) === today.slice(0, 7) ? today : next);
  };
  const goToday = () => {
    setCursor(startOfMonth(today));
    setSelected(today);
  };

  const exportICS = () => {
    const end = addDays(today, 365);
    const events = buildTimeline(data, today, end, today).filter(visible);
    if (events.length === 0) {
      toast({ title: 'Nothing to export', description: 'There are no events in the next 12 months for the filters you picked.', tone: 'warning' });
      return;
    }
    downloadText('keel-calendar.ics', buildICS(events, (n) => money(n)), 'text/calendar;charset=utf-8');
    toast({
      title: 'Calendar file downloaded',
      description: `${events.length} events for the next 12 months. Open the file to add them to Apple, Google or Outlook Calendar.`,
      tone: 'success',
    });
  };

  const visibleMonth = monthEvents.filter(visible);
  const monthCharges = visibleMonth.filter((e) => e.kind === 'charge');
  const monthDeadlines = visibleMonth.filter((e) => e.kind !== 'charge' && e.kind !== 'task_due').length;
  const monthTasks = visibleMonth.filter((e) => e.kind === 'task_due').length;
  const isCurrentMonth = monthKey === today.slice(0, 7);

  return (
    <div className="cal">
      <PageHeader
        title="Calendar"
        description="Every charge, renewal and deadline in one place."
        actions={
          <>
            <Segmented<View>
              ariaLabel="Calendar view"
              value={view}
              onChange={setView}
              options={[
                { value: 'month', label: 'Month' },
                { value: 'agenda', label: 'Agenda' },
              ]}
            />
            <Button icon={<CalendarPlus size={16} />} onClick={exportICS} title="Download the next 12 months as an .ics file">
              Add to my calendar
            </Button>
          </>
        }
      />

      <div className="cal-filters" role="group" aria-label="Show event types">
        {KIND_GROUPS.map((g) => {
          const on = !hidden.has(g.id);
          return (
            <button
              key={g.id}
              type="button"
              className={cx('cal-chip', `cal-kind-${g.id}`, on && 'is-on')}
              aria-pressed={on}
              onClick={() => toggleGroup(g.id)}
            >
              <span className="cal-chip-dot" aria-hidden />
              {g.label}
              <span className="cal-chip-count tabular">{counts[g.id]}</span>
            </button>
          );
        })}
        {hidden.size > 0 && (
          <button type="button" className="cal-reset" onClick={() => setHidden(new Set())}>
            <RotateCcw size={13} aria-hidden />
            Show all
          </button>
        )}
      </div>

      {view === 'month' ? (
        <>
          <div className="cal-toolbar">
            <div className="cal-nav">
              <Button variant="secondary" size="sm" iconOnly icon={<ChevronLeft size={16} />} aria-label="Previous month" onClick={() => goMonth(-1)} />
              <Button variant="secondary" size="sm" iconOnly icon={<ChevronRight size={16} />} aria-label="Next month" onClick={() => goMonth(1)} />
              <h2 className="cal-title" aria-live="polite">
                {formatDate(cursor, 'monthYear', locale)}
              </h2>
              <Button variant="ghost" size="sm" onClick={goToday} disabled={isCurrentMonth && selected === today}>
                Today
              </Button>
            </div>
            <dl className="cal-summary" aria-label={hidden.size ? 'Totals for the event types shown' : 'Totals for this month'}>
              <div>
                <dt>Charges</dt>
                <dd className="tabular">
                  {money(chargeTotal(monthCharges))}
                  <span className="cal-summary-sub"> · {monthCharges.length}</span>
                </dd>
              </div>
              <div>
                <dt>Deadlines</dt>
                <dd className="tabular">{monthDeadlines}</dd>
              </div>
              <div>
                <dt>Tasks due</dt>
                <dd className="tabular">{monthTasks}</dd>
              </div>
            </dl>
          </div>
          <div className="cal-layout">
            <MonthGrid
              weeks={weeks}
              cursor={cursor}
              today={today}
              selected={selected}
              locale={locale}
              byDay={groupByDate(gridEvents.filter(visible))}
              money={money}
              onSelect={(d) => {
                setSelected(d);
                if (d.slice(0, 7) !== monthKey) setCursor(startOfMonth(d));
              }}
            />
            <DayPanel
              date={selected}
              today={today}
              locale={locale}
              events={gridEvents.filter((e) => e.date === selected && visible(e)).sort(cellOrder)}
              allCount={gridEvents.filter((e) => e.date === selected).length}
              money={money}
            />
          </div>
        </>
      ) : (
        <Agenda events={agendaEvents.filter(visible)} today={today} locale={locale} money={money} filtered={hidden.size > 0} />
      )}
    </div>
  );
}

type MoneyFn = ReturnType<typeof useMoney>;

function chipTitle(e: TimelineEvent, money: MoneyFn): string {
  const amt = e.amount !== undefined && e.kind !== 'warranty_end' ? ` · ${money(e.amount)}` : '';
  return `${kindLabel(e.kind)}: ${e.title}${amt}${e.paid ? ' · Paid' : ''}`;
}

function MonthGrid({
  weeks,
  cursor,
  today,
  selected,
  locale,
  byDay,
  money,
  onSelect,
}: {
  weeks: string[][];
  cursor: string;
  today: string;
  selected: string;
  locale: string;
  byDay: Map<string, TimelineEvent[]>;
  money: MoneyFn;
  onSelect: (d: string) => void;
}) {
  const gridRef = useRef<HTMLDivElement>(null);
  const focusPending = useRef(false);
  const monthKey = cursor.slice(0, 7);

  useEffect(() => {
    if (!focusPending.current) return;
    focusPending.current = false;
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-date="${selected}"]`)?.focus();
  }, [selected, cursor]);

  const onKey = (e: KeyboardEvent<HTMLButtonElement>, d: string) => {
    const delta: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    let next: string | null = null;
    if (e.key in delta) next = addDays(d, delta[e.key]);
    else if (e.key === 'Home') next = weeks.find((w) => w.includes(d))?.[0] ?? null;
    else if (e.key === 'End') next = weeks.find((w) => w.includes(d))?.[6] ?? null;
    else if (e.key === 'PageUp') next = addMonths(d, -1);
    else if (e.key === 'PageDown') next = addMonths(d, 1);
    if (!next) return;
    e.preventDefault();
    focusPending.current = true;
    onSelect(next);
  };

  return (
    <div className="cal-month card" ref={gridRef}>
      <div className="cal-weekdays" aria-hidden>
        {weeks[0].map((d) => (
          <span key={d}>{formatDate(d, 'weekday', locale)}</span>
        ))}
      </div>
      <div className="cal-weeks">
        {weeks.map((week) => (
          <div className="cal-week" key={week[0]}>
            {week.map((d) => {
              const list = (byDay.get(d) ?? []).slice().sort(cellOrder);
              const total = chargeTotal(list);
              const out = !d.startsWith(monthKey);
              const isToday = d === today;
              const isSel = d === selected;
              const past = compareISO(d, today) < 0;
              const label = `${formatDate(d, 'long', locale)}${list.length ? `, ${list.length} event${list.length === 1 ? '' : 's'}` : ', nothing scheduled'}${total ? `, ${money(total)} in charges` : ''}`;
              return (
                <button
                  key={d}
                  type="button"
                  data-date={d}
                  className={cx('cal-day', out && 'is-out', isToday && 'is-today', isSel && 'is-selected', past && 'is-past')}
                  aria-pressed={isSel}
                  aria-label={label}
                  tabIndex={isSel ? 0 : -1}
                  onClick={() => onSelect(d)}
                  onKeyDown={(e) => onKey(e, d)}
                >
                  <span className="cal-day-top">
                    <span className="cal-day-num">{Number(d.slice(8, 10))}</span>
                    {total > 0 && <span className="cal-day-total tabular">{money(total, { whole: true })}</span>}
                  </span>
                  <span className="cal-chips" aria-hidden>
                    {list.slice(0, 3).map((e) => (
                      <span key={e.key} className={cx('cal-ev', kindClass(e.kind), e.paid && 'is-paid')} title={chipTitle(e, money)}>
                        <span className="cal-ev-text">
                          {e.paid ? '✓ ' : ''}
                          {e.title}
                        </span>
                      </span>
                    ))}
                    {list.length > 3 && (
                      <span className="cal-more" title={list.slice(3).map((e) => chipTitle(e, money)).join('\n')}>
                        +{list.length - 3} more
                      </span>
                    )}
                  </span>
                  <span className="cal-dots" aria-hidden>
                    {list.slice(0, 4).map((e) => (
                      <span key={e.key} className={cx('cal-dot', kindClass(e.kind))} />
                    ))}
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function EventRow({ e, money, locale }: { e: TimelineEvent; money: MoneyFn; locale: string }) {
  const navigate = useNavigate();
  return (
    <li>
      <button type="button" className={cx('cal-row', e.severity === 'critical' && 'is-critical')} onClick={() => navigate(refPath(e.ref))}>
        <KindIcon kind={e.kind} size={34} />
        <span className="cal-row-main">
          <span className="cal-row-title truncate">{e.title}</span>
          <span className="cal-row-sub truncate">
            <span className={cx('cal-row-kind', kindClass(e.kind))}>{kindLabel(e.kind)}</span>
            {e.subtitle ? ` · ${e.subtitle}` : ''}
          </span>
        </span>
        {e.paid && <Badge tone="success">Paid</Badge>}
        {e.amount !== undefined && e.kind !== 'warranty_end' && (
          <span className={cx('cal-row-amt tabular', e.kind !== 'charge' && 'is-soft')}>{money(e.amount)}</span>
        )}
        <Chevron size={16} className="cal-row-go" aria-hidden />
        <span className="sr-only">{`Open, ${formatDate(e.date, 'medium', locale)}`}</span>
      </button>
    </li>
  );
}

function DayPanel({
  date,
  today,
  locale,
  events,
  allCount,
  money,
}: {
  date: string;
  today: string;
  locale: string;
  events: TimelineEvent[];
  allCount: number;
  money: MoneyFn;
}) {
  const { openEditor } = useUI();
  const total = chargeTotal(events);
  const n = diffDays(date, today);
  return (
    <aside className="cal-panel card" aria-label={`Events on ${formatDate(date, 'long', locale)}`}>
      <div className="cal-panel-head">
        <div className="cal-panel-date" aria-hidden>
          <span className="cal-panel-month">{formatDate(date, 'month', locale)}</span>
          <span className="cal-panel-day">{Number(date.slice(8, 10))}</span>
        </div>
        <div className="cal-panel-heading">
          <h2 className="cal-panel-title">{formatDate(date, 'long', locale)}</h2>
          <p className="cal-panel-sub">
            {relativeDays(date, today)}
            {events.length ? ` · ${events.length} event${events.length === 1 ? '' : 's'}` : ''}
            {total ? ` · ${money(total)} in charges` : ''}
          </p>
        </div>
      </div>
      {events.length === 0 ? (
        <EmptyState
          compact
          icon={<CalendarDays size={20} />}
          title={allCount > 0 ? 'Hidden by filters' : 'Nothing scheduled'}
          description={
            allCount > 0
              ? `${allCount} event${allCount === 1 ? ' is' : 's are'} hidden by the filters above.`
              : n < 0
                ? 'Nothing was due on this day.'
                : 'No charges or deadlines on this day.'
          }
        />
      ) : (
        <ul className="cal-rows">
          {events.map((e) => (
            <EventRow key={e.key} e={e} money={money} locale={locale} />
          ))}
        </ul>
      )}
      {n >= 0 && (
        <div className="cal-panel-foot">
          <Button size="sm" variant="ghost" icon={<Plus size={14} />} onClick={() => openEditor({ kind: 'task', defaults: { dueDate: date } })}>
            Add a task for this day
          </Button>
        </div>
      )}
    </aside>
  );
}

function Agenda({ events, today, locale, money, filtered }: { events: TimelineEvent[]; today: string; locale: string; money: MoneyFn; filtered: boolean }) {
  const groups = useMemo(() => [...groupByDate(events).entries()], [events]);
  const total = chargeTotal(events);
  if (groups.length === 0) {
    return (
      <div className="card">
        <EmptyState
          icon={<CalendarDays size={22} />}
          title={filtered ? 'Nothing matches these filters' : 'A clear two months'}
          description={
            filtered
              ? 'Turn more event types back on to see them here.'
              : `No charges, renewals or deadlines in the next ${AGENDA_DAYS} days.`
          }
        />
      </div>
    );
  }
  return (
    <div className="cal-agenda card">
      <div className="cal-agenda-head">
        <p>
          Next {AGENDA_DAYS} days · <b>{events.length}</b> event{events.length === 1 ? '' : 's'}
          {total > 0 && (
            <>
              {' · '}
              <b className="tabular">{money(total)}</b> in charges
            </>
          )}
        </p>
      </div>
      {groups.map(([date, list]) => {
        const dayTotal = chargeTotal(list);
        return (
          <section key={date} className="cal-agenda-day" aria-label={formatDate(date, 'long', locale)}>
            <div className={cx('cal-agenda-date', date === today && 'is-today')}>
              <span className="cal-agenda-wd">{formatDate(date, 'weekday', locale)}</span>
              <span className="cal-agenda-num">{Number(date.slice(8, 10))}</span>
              <span className="cal-agenda-mo">{formatDate(date, 'month', locale)}</span>
            </div>
            <div className="cal-agenda-body">
              <div className="cal-agenda-label">
                <span className="cal-agenda-full">{dayHeading(date, today, locale)}</span>
                <span className="cal-agenda-short">{relativeDays(date, today)}</span>
                {diffDays(date, today) > 1 && <span className="cal-agenda-rel">{relativeDays(date, today)}</span>}
                <span className="spacer" />
                {dayTotal > 0 && <span className="cal-agenda-total tabular">{money(dayTotal)}</span>}
              </div>
              <ul className="cal-rows">
                {list.map((e) => (
                  <EventRow key={e.key} e={e} money={money} locale={locale} />
                ))}
              </ul>
            </div>
          </section>
        );
      })}
    </div>
  );
}
