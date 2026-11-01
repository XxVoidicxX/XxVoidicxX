import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  CalendarClock,
  CalendarDays,
  CircleAlert,
  CircleCheck,
  CircleCheckBig,
  Circle,
  CreditCard,
  FileText,
  Package,
  FileWarning,
  Info,
  ListChecks,
  PieChart,
  PiggyBank,
  Plus,
  ShieldAlert,
  TriangleAlert,
  Undo2,
  Wallet,
  X,
  BarChart3,
  CalendarRange,
} from 'lucide-react';
import { Badge, Button, Card, CardHeader, Checkbox, EmptyState, Progress, StatCard, cx, useToast } from '@/components/ui';
import { useUI } from '@/app/ui';
import { compareISO, diffDays, formatDate, relativeDays } from '@/lib/dates';
import { documentStatus, returnDeadline, warrantyEnd, type Alert } from '@/lib/engine';
import { ROUTES, refPath } from '@/lib/routes';
import type { Severity, Task, TimelineEvent } from '@/lib/types';
import type { Tone } from '@/lib/meta';
import { useAlerts, useHealth, useInsights, useMoney, useUpcoming } from '@/store/selectors';
import { useActions, useData, useToday } from '@/store/store';
import { KindIcon } from '@/features/calendar/kinds';
import { attentionText, countAlerts, useDismissWithUndo } from '@/features/notifications/alertHelpers';
import { useSubscriptionActions } from '@/features/subscriptions/useSubscriptionActions';
import { CategoryDonut, ForecastChart, HealthRing, healthTone, type DonutSlice } from './charts';
import './dashboard.css';

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return 'Good evening';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function dayLabel(iso: string, today: string, locale: string): string {
  const n = diffDays(iso, today);
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  return formatDate(iso, 'dayMonth', locale);
}

const SEVERITY_ICON: Record<Severity, typeof Info> = {
  critical: CircleAlert,
  warning: TriangleAlert,
  info: Info,
};

export function DashboardPage() {
  const data = useData();
  const today = useToday();
  const insights = useInsights();
  const alerts = useAlerts();
  const health = useHealth();
  const upcoming30 = useUpcoming(30);
  const money = useMoney();
  const navigate = useNavigate();
  const { settings } = data;
  const locale = settings.locale;

  const counts = countAlerts(alerts);
  const charges30 = upcoming30.filter((e) => e.kind === 'charge');
  const nextCharge = charges30[0];
  const weekCharges = charges30.filter((e) => diffDays(e.date, today) < 7).reduce((s, e) => s + (e.amount ?? 0), 0);
  const name = settings.displayName.trim();

  const isEmpty = data.subscriptions.length + data.documents.length + data.purchases.length + data.tasks.length === 0;
  const chargesLine = weekCharges > 0 ? ` ${money(weekCharges)} in charges are due in the next 7 days.` : '';
  const summary = isEmpty
    ? 'Keel is ready. Add a few things below and it will start keeping an eye on them for you.'
    : counts.total === 0
      ? `Nothing needs your attention right now.${chargesLine || ' Everything is on track.'}`
      : `${attentionText(counts)}.${chargesLine}`;

  if (isEmpty) {
    return (
      <div className="dash">
        <header className="dash-hero">
          <div className="dash-hero-text">
            <p className="dash-hero-date">{formatDate(today, 'long', locale)}</p>
            <h1 className="dash-hero-title">
              {name ? `Welcome, ${name}` : 'Welcome to Keel'}
            </h1>
            <p className="dash-hero-summary">{summary}</p>
          </div>
        </header>
        <GettingStarted />
      </div>
    );
  }

  return (
    <div className="dash">
      <header className="dash-hero">
        <div className="dash-hero-text">
          <p className="dash-hero-date">{formatDate(today, 'long', locale)}</p>
          <h1 className="dash-hero-title">
            {greeting()}
            {name ? `, ${name}` : ''}
          </h1>
          <p className="dash-hero-summary">{summary}</p>
        </div>
        <div className="dash-hero-actions">
          <Button icon={<CalendarDays size={16} />} onClick={() => navigate(ROUTES.calendar)}>
            Open calendar
          </Button>
        </div>
      </header>

      <section className="dash-grid" aria-label="Overview">
        <div className="dash-kpi">
          <MonthlyStat monthly={insights.monthly} yearly={insights.yearly} count={insights.activeCount} budget={settings.monthlyBudget} money={money} onClick={() => navigate(ROUTES.subscriptions)} />
        </div>
        <div className="dash-kpi">
          <StatCard
            label="Due next 30 days"
            value={money(insights.next30)}
            icon={<CalendarClock size={16} />}
            tone="neutral"
            hint={
              nextCharge
                ? `${charges30.length} charge${charges30.length === 1 ? '' : 's'} · next ${nextCharge.title} ${relativeDays(nextCharge.date, today).toLowerCase()}`
                : 'No charges scheduled'
            }
            onClick={() => navigate(ROUTES.calendar)}
          />
        </div>
        <div className="dash-kpi">
          <StatCard
            label="Potential yearly savings"
            value={money(insights.potentialSavings, { whole: true })}
            icon={<PiggyBank size={16} />}
            tone="success"
            hint={
              insights.opportunities.length
                ? `${insights.opportunities.length} idea${insights.opportunities.length === 1 ? '' : 's'} to review in Insights`
                : 'No savings ideas right now'
            }
            footer={
              <span className="dash-stat-link">
                See how <ArrowRight size={14} aria-hidden />
              </span>
            }
            onClick={() => navigate(ROUTES.insights)}
          />
        </div>
        <div className="dash-kpi">
          <HealthStat score={health.score} grade={health.grade} factors={health.factors} />
        </div>

        <div className="dash-span-7 dash-attention-cell">
          <AttentionCard alerts={alerts} locale={locale} money={money} />
        </div>
        <div className="dash-span-5">
          <ComingUpCard events={upcoming30.filter((e) => diffDays(e.date, today) < 14)} today={today} locale={locale} money={money} />
        </div>

        <div className="dash-span-6 dash-chart-cell">
          <SpendingCard money={money} />
        </div>
        <div className="dash-span-6 dash-chart-cell">
          <Card className="dash-card-fill">
            <CardHeader
              icon={<BarChart3 size={16} />}
              title="12-month forecast"
              subtitle={`${money(insights.forecast.reduce((s, f) => s + f.total, 0), { whole: true })} projected over the next year`}
              actions={
                <div className="dash-keys" aria-hidden>
                  <span>
                    <span className="dash-key dash-key-subs" />
                    Subscriptions
                  </span>
                  <span>
                    <span className="dash-key dash-key-bills" />
                    Bills
                  </span>
                </div>
              }
            />
            {insights.forecast.some((f) => f.total > 0) ? (
              <ForecastChart data={insights.forecast} money={money} locale={locale} />
            ) : (
              <EmptyState compact icon={<BarChart3 size={20} />} title="No charges to forecast" description="Add a subscription or bill to see what the year ahead looks like." />
            )}
          </Card>
        </div>

        <div className="dash-span-6">
          <ExpiringCard today={today} locale={locale} />
        </div>
        <div className="dash-span-6">
          <TasksCard today={today} locale={locale} />
        </div>
      </section>
    </div>
  );
}

type MoneyFn = ReturnType<typeof useMoney>;

function MonthlyStat({
  monthly,
  yearly,
  count,
  budget,
  money,
  onClick,
}: {
  monthly: number;
  yearly: number;
  count: number;
  budget?: number;
  money: MoneyFn;
  onClick: () => void;
}) {
  const pct = budget && budget > 0 ? Math.round((monthly / budget) * 100) : null;
  const tone = pct === null ? 'brand' : pct > 100 ? 'danger' : pct >= 85 ? 'warning' : 'brand';
  return (
    <StatCard
      label="Monthly recurring"
      value={money(monthly)}
      icon={<Wallet size={16} />}
      tone="brand"
      hint={`${money(yearly, { whole: true })} a year · ${count} active`}
      footer={
        budget && pct !== null ? (
          <div className="dash-budget">
            <Progress value={monthly} max={budget} tone={tone} size="sm" label="Share of monthly budget used" />
            <span className={cx('dash-budget-text', pct > 100 && 'is-over')}>
              {pct > 100 ? `${money(monthly - budget, { whole: true })} over your ${money(budget, { whole: true })} budget` : `${pct}% of ${money(budget, { whole: true })} budget`}
            </span>
          </div>
        ) : undefined
      }
      onClick={onClick}
    />
  );
}

function HealthStat({ score, grade, factors }: { score: number; grade: string; factors: { label: string; impact: number; ok: boolean }[] }) {
  const worst = [...factors].filter((f) => !f.ok).sort((a, b) => a.impact - b.impact)[0];
  const tone = healthTone(score);
  return (
    <div className="card stat dash-health">
      <div className="stat-top">
        <span className="stat-label">
          Life admin score
        </span>
        <span className={cx('badge', `badge-${tone === 'brand' ? 'brand' : tone}`)}>{grade}</span>
      </div>
      <div className="dash-health-body">
        <div className="dash-health-ring">
          <HealthRing score={score} />
        </div>
        <div className="stat-value tabular">
          {score}
          <span className="dash-health-max">/100</span>
        </div>
      </div>
      <div className="stat-hint truncate" title={worst?.label}>
        {worst ? `Main issue: ${worst.label.toLowerCase()}` : 'Everything is in good shape'}
      </div>
      <p className="dash-health-explain">Out of 100: how on top of renewals, trials, returns and tasks you are.</p>
    </div>
  );
}

const SEVERITY_LABEL: Record<Severity, string> = { critical: 'Urgent', warning: 'Soon', info: 'Heads up' };

function AttentionCard({ alerts, locale, money }: { alerts: Alert[]; locale: string; money: MoneyFn }) {
  const navigate = useNavigate();
  const actions = useActions();
  const { setNotificationsOpen } = useUI();
  const dismiss = useDismissWithUndo();
  const cmd = useSubscriptionActions();
  const { subscriptions, dismissedAlerts } = useData();
  const shown = alerts.slice(0, 5);
  const counts = countAlerts(alerts);
  const dismissedCount = dismissedAlerts.length;

  const paidTarget = (a: Alert) => {
    const m = /^manual:(.+):(\d{4}-\d{2}-\d{2})$/.exec(a.key);
    if (!m) return null;
    const sub = subscriptions.find((x) => x.id === m[1]);
    return sub ? { sub, date: m[2] } : null;
  };

  return (
    <Card className="dash-card-fill">
      <CardHeader
        icon={<CircleAlert size={16} />}
        title="Needs attention"
        subtitle={
          alerts.length
            ? attentionText(counts, true)
            : 'Trials, renewals and deadlines that need a decision'
        }
        actions={
          alerts.length > 0 ? (
            <Button size="sm" variant="ghost" iconRight={<ArrowRight size={14} />} onClick={() => setNotificationsOpen(true)}>
              View all
            </Button>
          ) : undefined
        }
      />
      {shown.length === 0 ? (
        <div className="dash-clear">
          <span className="dash-clear-icon" aria-hidden>
            <CircleCheckBig size={26} />
          </span>
          <p className="dash-clear-title">You're all caught up</p>
          <p className="dash-clear-desc">Nothing needs a decision right now. Trials, renewals and return windows will show up here before they matter.</p>
          <div className="dash-clear-actions">
            <Button size="sm" variant="secondary" icon={<CalendarDays size={14} />} onClick={() => navigate(ROUTES.calendar)}>
              See what's coming
            </Button>
            {dismissedCount > 0 && (
              <Button size="sm" variant="ghost" onClick={() => actions.restoreAlerts()}>
                Show {dismissedCount} dismissed
              </Button>
            )}
          </div>
        </div>
      ) : (
        <ul className="dash-alerts">
          {shown.map((a) => {
            const Icon = SEVERITY_ICON[a.severity];
            const pay = paidTarget(a);
            return (
              <li key={a.key} className={cx('dash-alert', `dash-sev-${a.severity}`)}>
                <span className="dash-alert-icon" aria-hidden>
                  <Icon size={16} />
                </span>
                <div className="dash-alert-main">
                  <p className="dash-alert-title">
                    <span className="sr-only">{SEVERITY_LABEL[a.severity]}: </span>
                    {a.title}
                  </p>
                  <p className="dash-alert-detail">
                    {a.detail.replace(/\.$/, '')}
                    {a.date && (
                      <span className="dash-alert-date">
                        {' · '}
                        {formatDate(a.date, 'short', locale)}
                      </span>
                    )}
                  </p>
                </div>
                {a.amount !== undefined && <span className="dash-alert-amt tabular">{money(a.amount)}</span>}
                <div className="dash-alert-actions">
                  {pay && (
                    <Button size="sm" variant="secondary" icon={<CircleCheck size={14} />} onClick={() => cmd.markPaid(pay.sub, pay.date, true)}>
                      Mark paid
                    </Button>
                  )}
                  <Button size="sm" variant={a.severity === 'critical' ? 'primary' : pay ? 'ghost' : 'secondary'} onClick={() => navigate(refPath(a.ref))}>
                    {a.action ?? 'Open'}
                  </Button>
                  <button type="button" className="dash-icon-btn" aria-label={`Dismiss: ${a.title}`} title="Dismiss" onClick={() => dismiss(a)}>
                    <X size={15} />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {alerts.length > shown.length && (
        <button type="button" className="dash-more" onClick={() => setNotificationsOpen(true)}>
          {alerts.length - shown.length} more in notifications
          <ArrowRight size={14} aria-hidden />
        </button>
      )}
    </Card>
  );
}

function ComingUpCard({ events, today, locale, money }: { events: TimelineEvent[]; today: string; locale: string; money: MoneyFn }) {
  const navigate = useNavigate();
  const groups = useMemo(() => {
    const map = new Map<string, TimelineEvent[]>();
    for (const e of events) {
      const list = map.get(e.date) ?? [];
      list.push(e);
      map.set(e.date, list);
    }
    return [...map.entries()];
  }, [events]);
  const total = events.reduce((s, e) => s + (e.kind === 'charge' ? e.amount ?? 0 : 0), 0);

  return (
    <Card className="dash-card-fill">
      <CardHeader
        icon={<CalendarRange size={16} />}
        title="Coming up"
        subtitle={events.length ? `Next 14 days · ${money(total)} in charges` : 'Next 14 days'}
        actions={
          <Button size="sm" variant="ghost" iconRight={<ArrowRight size={14} />} onClick={() => navigate(ROUTES.calendar)}>
            Calendar
          </Button>
        }
      />
      {groups.length === 0 ? (
        <EmptyState compact icon={<CalendarDays size={20} />} title="A quiet two weeks" description="No charges, renewals or deadlines in the next 14 days." />
      ) : (
        <div className="dash-timeline">
          {groups.map(([date, list]) => {
            const dayTotal = list.reduce((s, e) => s + (e.kind === 'charge' ? e.amount ?? 0 : 0), 0);
            const n = diffDays(date, today);
            return (
              <section key={date} className="dash-day" aria-label={dayLabel(date, today, locale)}>
                <div className="dash-day-head">
                  <span className={cx('dash-day-label', n === 0 && 'is-today')}>{dayLabel(date, today, locale)}</span>
                  {n > 1 && <span className="dash-day-rel">{relativeDays(date, today)}</span>}
                  <span className="spacer" />
                  {dayTotal > 0 && <span className="dash-day-total tabular">{money(dayTotal)}</span>}
                </div>
                <ul className="dash-events">
                  {list.map((e) => (
                    <li key={e.key}>
                      <button type="button" className="dash-event" onClick={() => navigate(refPath(e.ref))}>
                        <KindIcon kind={e.kind} size={30} />
                        <span className="dash-event-main">
                          <span className="dash-event-title truncate">{e.title}</span>
                          {e.subtitle && <span className="dash-event-sub truncate">{e.subtitle}</span>}
                        </span>
                        {e.paid && <Badge tone="success">Paid</Badge>}
                        {e.amount !== undefined && e.kind !== 'warranty_end' && (
                          <span className={cx('dash-event-amt tabular', e.kind !== 'charge' && 'is-soft')}>{money(e.amount)}</span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function SpendingCard({ money }: { money: MoneyFn }) {
  const insights = useInsights();
  const navigate = useNavigate();
  const slices = useMemo<DonutSlice[]>(() => {
    const top: DonutSlice[] = insights.byCategory.slice(0, 6).map((c) => ({ key: c.category as string, label: c.label, color: c.color, value: c.monthly, count: c.count }));
    const rest = insights.byCategory.slice(6);
    if (rest.length) {
      top.push({
        key: 'rest',
        label: `Other (${rest.length})`,
        color: 'var(--text-4)',
        value: rest.reduce((s, c) => s + c.monthly, 0),
        count: rest.reduce((s, c) => s + c.count, 0),
      });
    }
    return top;
  }, [insights.byCategory]);

  return (
    <Card className="dash-card-fill">
      <CardHeader
        icon={<PieChart size={16} />}
        title="Spending by category"
        subtitle="Monthly equivalent of everything active"
        actions={
          <Button size="sm" variant="ghost" iconRight={<ArrowRight size={14} />} onClick={() => navigate(ROUTES.subscriptions)}>
            Details
          </Button>
        }
      />
      {slices.length === 0 ? (
        <EmptyState
          compact
          icon={<PieChart size={20} />}
          title="No spending yet"
          description="Add your subscriptions and bills to see where the money goes."
          action={
            <Button size="sm" variant="primary" icon={<Plus size={14} />} onClick={() => navigate(ROUTES.subscriptions)}>
              Add a subscription
            </Button>
          }
        />
      ) : (
        <CategoryDonut slices={slices} money={money} onSelect={() => navigate(ROUTES.subscriptions)} />
      )}
    </Card>
  );
}

interface ExpiringItem {
  key: string;
  date: string;
  title: string;
  sub: string;
  badge: string;
  tone: Tone;
  icon: 'doc' | 'return' | 'warranty';
  path: string;
}

function ExpiringCard({ today, locale }: { today: string; locale: string }) {
  const { documents, purchases } = useData();
  const navigate = useNavigate();
  const items = useMemo(() => {
    const out: ExpiringItem[] = [];
    for (const d of documents) {
      const st = documentStatus(d, today);
      if ((st === 'expired' || st === 'renew_now') && d.expiresOn) {
        out.push({
          key: `d:${d.id}`,
          date: d.expiresOn,
          title: d.holder && d.holder !== 'Shared' ? `${d.holder}'s ${d.name}` : d.name,
          sub: st === 'expired' ? `Expired ${formatDate(d.expiresOn, 'medium', locale)}` : `Expires ${formatDate(d.expiresOn, 'medium', locale)}`,
          badge: st === 'expired' ? 'Expired' : 'Renew now',
          tone: st === 'expired' ? 'danger' : 'warning',
          icon: 'doc',
          path: refPath({ kind: 'document', id: d.id }),
        });
      }
    }
    for (const p of purchases) {
      if (p.returned) continue;
      const rd = returnDeadline(p);
      if (rd && diffDays(rd, today) >= 0 && diffDays(rd, today) <= 14) {
        out.push({
          key: `r:${p.id}`,
          date: rd,
          title: p.item,
          sub: `Return by ${formatDate(rd, 'medium', locale)}${p.retailer ? ` · ${p.retailer}` : ''}`,
          badge: 'Return window',
          tone: diffDays(rd, today) <= 3 ? 'danger' : 'warning',
          icon: 'return',
          path: refPath({ kind: 'purchase', id: p.id }),
        });
      }
      const we = warrantyEnd(p);
      if (we && diffDays(we, today) >= 0 && diffDays(we, today) <= 60) {
        out.push({
          key: `w:${p.id}`,
          date: we,
          title: p.item,
          sub: `Warranty ends ${formatDate(we, 'medium', locale)}${p.brand ? ` · ${p.brand}` : ''}`,
          badge: 'Warranty',
          tone: 'neutral',
          icon: 'warranty',
          path: refPath({ kind: 'purchase', id: p.id }),
        });
      }
    }
    return out.sort((a, b) => compareISO(a.date, b.date));
  }, [documents, purchases, today, locale]);
  const shown = items.slice(0, 6);
  const ICON = { doc: FileWarning, return: Undo2, warranty: ShieldAlert };

  return (
    <Card className="dash-card-fill">
      <CardHeader
        icon={<FileWarning size={16} />}
        title="Expiring soon"
        subtitle={items.length ? `${items.length} item${items.length === 1 ? '' : 's'} to keep an eye on` : 'IDs, return windows and warranties'}
        actions={
          <Button size="sm" variant="ghost" iconRight={<ArrowRight size={14} />} onClick={() => navigate(ROUTES.documents)}>
            Documents
          </Button>
        }
      />
      {shown.length === 0 ? (
        <EmptyState compact icon={<CircleCheckBig size={20} />} title="Nothing expiring soon" description="Your IDs are current and no return windows or warranties are about to close." />
      ) : (
        <ul className="dash-list">
          {shown.map((it) => {
            const Icon = ICON[it.icon];
            const n = diffDays(it.date, today);
            return (
              <li key={it.key}>
                <button type="button" className="dash-list-row" onClick={() => navigate(it.path)}>
                  <span className={cx('dash-list-icon', `tone-${it.tone === 'neutral' ? 'neutral' : it.tone}`)} aria-hidden>
                    <Icon size={15} />
                  </span>
                  <span className="dash-list-main">
                    <span className="dash-list-title truncate">{it.title}</span>
                    <span className="dash-list-sub truncate">{it.sub}</span>
                  </span>
                  <span className="dash-list-end">
                    <Badge tone={it.tone}>{it.badge}</Badge>
                    <span className={cx('dash-list-rel', n < 0 && 'is-late')}>{relativeDays(it.date, today)}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {items.length > shown.length && (
        <button type="button" className="dash-more" onClick={() => navigate(ROUTES.documents)}>
          {items.length - shown.length} more
          <ArrowRight size={14} aria-hidden />
        </button>
      )}
    </Card>
  );
}

function sortTasks(a: Task, b: Task): number {
  if (a.dueDate && b.dueDate) return compareISO(a.dueDate, b.dueDate) || (a.priority === 'high' ? -1 : b.priority === 'high' ? 1 : 0);
  if (a.dueDate) return -1;
  if (b.dueDate) return 1;
  return a.title.localeCompare(b.title);
}

function TasksCard({ today, locale }: { today: string; locale: string }) {
  const { tasks } = useData();
  const actions = useActions();
  const { openEditor } = useUI();
  const navigate = useNavigate();
  const toast = useToast();
  const open = useMemo(() => tasks.filter((t) => !t.done).sort(sortTasks), [tasks]);
  const shown = open.slice(0, 6);
  const overdue = open.filter((t) => t.dueDate && compareISO(t.dueDate, today) < 0).length;

  const complete = (t: Task) => {
    actions.toggleTask(t.id);
    toast({
      title: 'Task completed',
      description: t.title,
      tone: 'success',
      action: { label: 'Undo', onClick: () => actions.toggleTask(t.id) },
    });
  };

  return (
    <Card className="dash-card-fill">
      <CardHeader
        icon={<ListChecks size={16} />}
        title="Open tasks"
        subtitle={open.length ? `${open.length} open${overdue ? ` · ${overdue} overdue` : ''}` : 'Your to-dos for life admin'}
        actions={
          <>
            <Button size="sm" variant="ghost" iconOnly icon={<Plus size={16} />} aria-label="Add task" title="Add task" onClick={() => openEditor({ kind: 'task' })} />
            <Button size="sm" variant="ghost" iconRight={<ArrowRight size={14} />} onClick={() => navigate(ROUTES.tasks)}>
              All tasks
            </Button>
          </>
        }
      />
      {shown.length === 0 ? (
        <EmptyState
          compact
          icon={<CircleCheckBig size={20} />}
          title="No open tasks"
          description="Add a reminder like 'Book DMV appointment' and link it to a document or bill."
          action={
            <Button size="sm" variant="primary" icon={<Plus size={14} />} onClick={() => openEditor({ kind: 'task' })}>
              Add a task
            </Button>
          }
        />
      ) : (
        <ul className="dash-tasks">
          {shown.map((t) => {
            const n = t.dueDate ? diffDays(t.dueDate, today) : null;
            return (
              <li key={t.id} className="dash-task">
                <Checkbox checked={false} onChange={() => complete(t)} ariaLabel={`Mark "${t.title}" as done`} />
                <button type="button" className="dash-task-main" onClick={() => navigate(refPath({ kind: 'task', id: t.id }))}>
                  <span className="dash-task-title truncate">{t.title}</span>
                  <span className="dash-task-meta">
                    {t.priority === 'high' && <span className="dash-task-flag">High priority</span>}
                    {t.dueDate ? (
                      <span className={cx(n !== null && n < 0 && 'is-late', n === 0 && 'is-today')}>
                        {n !== null && n < 0 ? `Overdue · ${formatDate(t.dueDate, 'short', locale)}` : `${relativeDays(t.dueDate, today)} · ${formatDate(t.dueDate, 'short', locale)}`}
                      </span>
                    ) : (
                      <span>No due date</span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {open.length > shown.length && (
        <button type="button" className="dash-more" onClick={() => navigate(ROUTES.tasks)}>
          {open.length - shown.length} more tasks
          <ArrowRight size={14} aria-hidden />
        </button>
      )}
    </Card>
  );
}


function GettingStarted() {
  const { openEditor } = useUI();
  const actions = useActions();
  const toast = useToast();
  const { tasks } = useData();
  const steps = [
    {
      key: 'subscription',
      icon: CreditCard,
      title: 'Add a subscription or bill',
      desc: 'Streaming, phone, rent, insurance. Keel warns you before trials convert and bills come due.',
      cta: 'Add a subscription',
      onClick: () => openEditor({ kind: 'subscription' }),
      done: false,
    },
    {
      key: 'document',
      icon: FileText,
      title: 'Add an ID or document',
      desc: 'Passports, licenses, registrations. Get reminded early enough to renew without a rush.',
      cta: 'Add an ID',
      onClick: () => openEditor({ kind: 'document' }),
      done: false,
    },
    {
      key: 'purchase',
      icon: Package,
      title: 'Add a purchase',
      desc: 'Keep return windows and warranty end dates in one place, with the receipt location.',
      cta: 'Add a purchase',
      onClick: () => openEditor({ kind: 'purchase' }),
      done: false,
    },
    {
      key: 'task',
      icon: ListChecks,
      title: 'Add a to-do',
      desc: 'Anything else on your mind, like booking a DMV appointment.',
      cta: 'Add a task',
      onClick: () => openEditor({ kind: 'task' }),
      done: tasks.length > 0,
    },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  const examples = [
    { icon: CircleAlert, tone: 'dash-sev-critical', title: 'Streaming trial ends in 2 days', sub: 'Cancel now or it charges $15.99' },
    { icon: FileWarning, tone: 'dash-sev-warning', title: "Renew Sam's passport", sub: 'Expires in 9 weeks · processing takes 6' },
    { icon: Undo2, tone: 'dash-sev-warning', title: 'Return window closes Friday', sub: 'Headphones from Best Buy · $199.99' },
  ];

  return (
    <section className="dash-grid dash-start" aria-label="Getting started">
      <div className="dash-span-8">
        <Card className="dash-card-fill dash-start-card">
          <CardHeader icon={<Plus size={16} />} title="Start with what is on your mind" subtitle="Add one thing at a time. You can always change it later." />
          <ul className="dash-start-steps">
            {steps.slice(0, 3).map((st) => (
              <li key={st.key}>
                <button type="button" className="dash-start-step" onClick={st.onClick}>
                  <span className="dash-start-icon" aria-hidden>
                    <st.icon size={20} />
                  </span>
                  <span className="dash-start-title">{st.title}</span>
                  <span className="dash-start-desc">{st.desc}</span>
                  <span className="dash-start-cta">
                    {st.cta} <ArrowRight size={14} aria-hidden />
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <div className="dash-start-foot">
            <span className="muted">Just looking around?</span>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                actions.loadSample();
                toast({ title: 'Sample household loaded', description: 'Erase it from Settings whenever you are ready.' });
              }}
            >
              Explore with sample data
            </Button>
          </div>
        </Card>
      </div>
      <div className="dash-span-4">
        <div className="card stat dash-health dash-start-score">
          <div className="stat-top">
            <span className="stat-label">Life admin score</span>
            <span className="badge badge-neutral">
              {doneCount} of {steps.length}
            </span>
          </div>
          <p className="dash-start-score-title">Add your first items</p>
          <p className="dash-health-explain">Your score appears once Keel has something to look after.</p>
          <ul className="dash-checklist">
            {steps.map((st) => (
              <li key={st.key}>
                <button type="button" className={cx('dash-check', st.done && 'is-done')} onClick={st.onClick}>
                  {st.done ? <CircleCheck size={18} aria-hidden /> : <Circle size={18} aria-hidden />}
                  <span>{st.title}</span>
                  <span className="sr-only">{st.done ? '(done)' : '(not done yet)'}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="dash-span-12">
        <Card className="dash-start-preview">
          <CardHeader icon={<CircleAlert size={16} />} title="What Keel will flag for you" subtitle="Examples of the reminders that show up here once you add your things" />
          <ul className="dash-start-examples" aria-label="Example reminders">
            {examples.map((ex) => (
              <li key={ex.title} className={cx('dash-start-example', ex.tone)}>
                <span className="dash-alert-icon" aria-hidden>
                  <ex.icon size={16} />
                </span>
                <span className="dash-start-example-text">
                  <span className="dash-start-example-title">{ex.title}</span>
                  <span className="dash-start-example-sub">{ex.sub}</span>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </section>
  );
}
