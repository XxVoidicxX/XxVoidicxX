import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  BadgeCheck,
  CalendarClock,
  ChartColumn,
  CircleSlash,
  CreditCard,
  Hourglass,
  Layers,
  PiggyBank,
  Plus,
  Receipt,
  TrendingUp,
  Users,
  Wallet,
} from 'lucide-react';
import { useUI } from '@/app/ui';
import { Button, Card, CardHeader, EmptyState, Monogram, PageHeader, Progress, StatCard, cx, useConfirm, useToast } from '@/components/ui';
import { formatDate, relativeDays } from '@/lib/dates';
import type { Opportunity } from '@/lib/engine';
import { categoryMeta } from '@/lib/meta';
import { toYearly } from '@/lib/money';
import { refPath } from '@/lib/routes';
import type { Subscription } from '@/lib/types';
import { useInsights, useMoney } from '@/store/selectors';
import { useActions, useData, useToday } from '@/store/store';
import { ForecastChart, SERIES, peakInfo } from './ForecastChart';
import { WhatIf } from './WhatIf';
import './insights.css';

const HIDDEN_KEY = 'keel:insights-hidden';
const OPPS_PREVIEW = 5;

const KIND_META: Record<Opportunity['kind'], { icon: typeof PiggyBank; label: string; tone: string }> = {
  unused: { icon: CircleSlash, label: 'Barely used', tone: 'danger' },
  annual: { icon: CalendarClock, label: 'Billing', tone: 'brand' },
  overlap: { icon: Layers, label: 'Overlap', tone: 'violet' },
  trial: { icon: Hourglass, label: 'Free trial', tone: 'warning' },
  price_increase: { icon: TrendingUp, label: 'Price rise', tone: 'warning' },
};

const OWNER_COLORS = ['#2058eb', '#0d9488', '#7c3aed', '#ea580c', '#be123c', '#0891b2', '#ca8a04', '#64748b'];

function readHidden(): Set<string> {
  try {
    const raw = sessionStorage.getItem(HIDDEN_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function writeHidden(set: Set<string>) {
  try {
    sessionStorage.setItem(HIDDEN_KEY, JSON.stringify([...set]));
  } catch {
    return;
  }
}

export function InsightsPage() {
  const data = useData();
  const today = useToday();
  const insights = useInsights();
  const money = useMoney();
  const actions = useActions();
  const toast = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const { openEditor } = useUI();
  const [hidden, setHidden] = useState<Set<string>>(readHidden);
  const [expanded, setExpanded] = useState(false);
  const locale = data.settings.locale;

  const subById = useMemo(() => new Map(data.subscriptions.map((s) => [s.id, s])), [data.subscriptions]);
  const visible = insights.opportunities.filter((o) => !hidden.has(o.key));
  const hiddenCount = insights.opportunities.length - visible.length;

  const potential = useMemo(() => {
    const counted = new Set<string>();
    let total = 0;
    for (const o of visible) {
      if (o.kind === 'trial' || o.kind === 'overlap') continue;
      if (counted.has(o.refIds[0])) continue;
      counted.add(o.refIds[0]);
      total += o.yearlySavings;
    }
    return total;
  }, [visible]);

  const peak = useMemo(() => peakInfo(insights.forecast, data.subscriptions), [insights.forecast, data.subscriptions]);

  const hide = (key: string) => {
    const next = new Set(hidden);
    next.add(key);
    setHidden(next);
    writeHidden(next);
  };
  const showAll = () => {
    setHidden(new Set());
    writeHidden(new Set());
  };

  const cancelSub = async (s: Subscription) => {
    const ok = await confirm({
      title: `Mark ${s.name} as cancelled?`,
      description:
        s.cancelUrl || s.url
          ? `Keel will stop counting it. Remember to cancel with ${s.name} too, otherwise you'll still be charged.`
          : `Keel will stop counting it in your totals. Remember to cancel with the provider as well.`,
      confirmLabel: 'Mark as cancelled',
      danger: true,
    });
    if (!ok) return;
    const prevStatus = s.status;
    actions.saveSubscription({ ...s, status: 'cancelled' });
    toast({
      title: `${s.name} marked as cancelled`,
      description: `That's ${money(toYearly(s.amount, s.cycle))} a year you won't be paying.`,
      action: { label: 'Undo', onClick: () => actions.saveSubscription({ ...s, status: prevStatus, cancelledOn: undefined }) },
    });
  };

  const detailFor = (o: Opportunity): string => {
    const s = subById.get(o.refIds[0]);
    if (o.kind === 'unused') return `You marked it as barely used. It costs ${money(o.yearlySavings)} a year.`;
    if (o.kind === 'trial' && s?.trialEndsOn) {
      return `Converts to paid on ${formatDate(s.trialEndsOn, 'medium', locale)} (${relativeDays(s.trialEndsOn, today).toLowerCase()}). Cancel before then if you don't want it.`;
    }
    if (o.kind === 'annual' && s?.annualPrice) return `The yearly plan is ${money(s.annualPrice)} instead of ${money(s.annualPrice + o.yearlySavings)} paying ${s.cycle}.`;
    if (o.kind === 'price_increase' && s) {
      const hist = [...s.priceHistory].sort((a, b) => a.date.localeCompare(b.date));
      if (hist.length >= 2) return `Went from ${money(hist[0].amount)} to ${money(hist[hist.length - 1].amount)}. Ask for a loyalty rate or look for a cheaper plan.`;
    }
    return o.detail;
  };

  if (data.subscriptions.length === 0) {
    return (
      <>
        <PageHeader title="Insights" description="Where your money goes, what's coming, and where you could save." />
        <Card>
          <EmptyState
            icon={<ChartColumn size={22} />}
            title="Nothing to analyse yet"
            description="Add your subscriptions and regular bills and Keel will forecast the next 12 months and spot ways to save."
            action={
              <Button variant="primary" icon={<Plus size={16} />} onClick={() => openEditor({ kind: 'subscription' })}>
                Add a subscription
              </Button>
            }
          />
        </Card>
      </>
    );
  }

  const totalMonthly = insights.monthly;
  const subsShare = totalMonthly > 0 ? (insights.subscriptionsMonthly / totalMonthly) * 100 : 0;
  const budget = data.settings.monthlyBudget;
  const trials = data.subscriptions.filter((s) => s.status === 'trial');
  const subsCount = data.subscriptions.filter((s) => s.status === 'active' && s.kind === 'subscription').length;
  const billsCount = data.subscriptions.filter((s) => s.status === 'active' && s.kind === 'bill').length;

  return (
    <div className="ins-page">
      <PageHeader
        title="Insights"
        description="Where your money goes, what's coming over the next year, and where you could save."
      />

      <div className="grid grid-4 ins-stats">
        <StatCard
          label="Monthly spend"
          value={money(totalMonthly)}
          icon={<Wallet size={16} />}
          hint={budget ? `${Math.round((totalMonthly / budget) * 100)}% of your ${money(budget, { whole: true })} budget` : `${insights.activeCount} active subscriptions & bills`}
          footer={budget ? <Progress value={totalMonthly} max={budget} size="sm" tone={totalMonthly > budget ? 'danger' : totalMonthly > budget * 0.9 ? 'warning' : 'brand'} label="Share of monthly budget" /> : undefined}
        />
        <StatCard
          label="Yearly spend"
          value={money(insights.yearly, { whole: true })}
          icon={<Receipt size={16} />}
          hint={`About ${money(insights.yearly / 365)} a day`}
        />
        <StatCard
          label="Subscriptions vs bills"
          value={
            <span className="ins-split-value">
              {Math.round(subsShare)}%<span className="ins-split-sep">/</span>
              {Math.round(100 - subsShare)}%
            </span>
          }
          icon={<CreditCard size={16} />}
          footer={
            <div className="ins-split">
              <div className="ins-split-bar" aria-hidden>
                <span style={{ width: `${subsShare}%`, background: SERIES.subscriptions.color }} />
                <span style={{ width: `${100 - subsShare}%`, background: SERIES.bills.color }} />
              </div>
              <div className="ins-split-legend">
                <span>
                  <i style={{ background: SERIES.subscriptions.color }} />
                  {subsCount} subs · {money(insights.subscriptionsMonthly, { whole: true })}/mo
                </span>
                <span>
                  <i style={{ background: SERIES.bills.color }} />
                  {billsCount} bills · {money(insights.billsMonthly, { whole: true })}/mo
                </span>
              </div>
            </div>
          }
        />
        <StatCard
          label="Trial exposure"
          value={
            <>
              {money(insights.trialExposure)}
              <span className="ins-unit">/mo</span>
            </>
          }
          icon={<Hourglass size={16} />}
          tone={insights.trialCount ? 'warning' : 'neutral'}
          hint={
            insights.trialCount
              ? `${insights.trialCount} free trial${insights.trialCount === 1 ? '' : 's'} will start charging unless cancelled`
              : 'No free trials running right now'
          }
          onClick={trials.length === 1 ? () => navigate(refPath({ kind: 'subscription', id: trials[0].id })) : undefined}
        />
      </div>

      <div className="ins-row ins-row-savings">
        <Card padded={false} className="ins-opps">
          <div className="ins-hero">
            <div className="ins-hero-icon" aria-hidden>
              <PiggyBank size={22} />
            </div>
            <div className="ins-hero-text">
              <p className="ins-hero-label">Potential savings</p>
              <p className="ins-hero-value tabular">
                {money(potential, { whole: true })}
                <span>/year</span>
              </p>
              <p className="ins-hero-sub">
                {visible.length
                  ? `From ${visible.length} opportunit${visible.length === 1 ? 'y' : 'ies'} below — that's ${money(potential / 12, { whole: true })} a month.`
                  : 'No savings opportunities right now.'}
                {insights.cancelledSavingsYearly > 0 && ` You're already saving ${money(insights.cancelledSavingsYearly, { whole: true })}/yr from cancellations.`}
              </p>
            </div>
          </div>
          <div className="ins-opps-head">
            <h2 className="card-title">Savings opportunities</h2>
            {hiddenCount > 0 && (
              <button type="button" className="ins-linkbtn" onClick={showAll}>
                Show {hiddenCount} hidden
              </button>
            )}
          </div>
          {visible.length === 0 ? (
            <EmptyState
              compact
              icon={<BadgeCheck size={22} />}
              title="You're paying only for what you use"
              description="Mark how often you use each subscription and Keel will flag the ones worth cancelling."
              action={
                <Button variant="secondary" onClick={() => navigate('/subscriptions')}>
                  Review subscriptions
                </Button>
              }
            />
          ) : (
            <ul className="ins-opps-list">
              {(expanded ? visible : visible.slice(0, OPPS_PREVIEW)).map((o) => {
                const meta = KIND_META[o.kind];
                const Icon = meta.icon;
                const subs = o.refIds.map((id) => subById.get(id)).filter((s): s is Subscription => !!s);
                const first = subs[0];
                return (
                  <li key={o.key} className="ins-opp">
                    <span className={cx('ins-opp-icon', `is-${meta.tone}`)} aria-hidden>
                      <Icon size={16} />
                    </span>
                    <div className="ins-opp-main">
                      <div className="ins-opp-top">
                        <p className="ins-opp-title">{o.title}</p>
                        <p className="ins-opp-amt tabular">
                          {o.kind === 'overlap' || o.kind === 'trial' ? 'up to ' : ''}
                          <strong>{money(o.yearlySavings, { whole: o.yearlySavings >= 100 })}</strong>/yr
                        </p>
                      </div>
                      <p className="ins-opp-detail">{detailFor(o)}</p>
                      <div className="ins-opp-actions">
                        {subs.length > 1 ? (
                          subs.map((s) => (
                            <button key={s.id} type="button" className="ins-chip" onClick={() => navigate(refPath({ kind: 'subscription', id: s.id }))}>
                              <Monogram name={s.name} color={categoryMeta(s.category).color} size={18} />
                              {s.name}
                            </button>
                          ))
                        ) : first ? (
                          <Button size="sm" variant="secondary" iconRight={<ArrowRight size={14} />} onClick={() => navigate(refPath({ kind: 'subscription', id: first.id }))} aria-label={`Open ${first.name}`}>
                            Open<span className="ins-hide-sm"> {first.name}</span>
                          </Button>
                        ) : null}
                        {(o.kind === 'unused' || o.kind === 'trial') && first && (
                          <Button size="sm" variant="subtle" onClick={() => cancelSub(first)}>
                            {o.kind === 'trial' ? 'Cancel trial' : 'Cancel it'}
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => hide(o.key)}>
                          Not now
                        </Button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {visible.length > OPPS_PREVIEW && (
            <div className="ins-opps-more">
              <Button variant="ghost" size="sm" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded}>
                {expanded ? 'Show fewer' : `Show ${visible.length - OPPS_PREVIEW} more opportunit${visible.length - OPPS_PREVIEW === 1 ? 'y' : 'ies'}`}
              </Button>
            </div>
          )}
        </Card>
        <WhatIf subscriptions={data.subscriptions} />
      </div>

      <Card className="ins-forecast">
        <CardHeader
          icon={<ChartColumn size={16} />}
          title="Next 12 months"
          subtitle={peak ? `${money(peak.total, { whole: true })} expected in total · about ${money(peak.avg, { whole: true })} a month` : undefined}
          actions={
            <div className="ins-legend" aria-label="Legend">
              <span>
                <i style={{ background: SERIES.subscriptions.color }} />
                Subscriptions
              </span>
              <span>
                <i style={{ background: SERIES.bills.color }} />
                Bills
              </span>
            </div>
          }
        />
        <ForecastChart forecast={insights.forecast} subscriptions={data.subscriptions} locale={locale} />
        {peak && peak.peak.total > 0 && (
          <div className="ins-callout">
            <TrendingUp size={16} aria-hidden />
            <p>
              <strong>{formatDate(peak.peak.month, 'monthYear', locale)}</strong> is your most expensive month at{' '}
              <strong>{money(peak.peak.total, { whole: true })}</strong>
              {peak.avg > 0 && peak.peak.total > peak.avg * 1.05 && <>, {money(peak.peak.total - peak.avg, { whole: true })} above average</>}
              {peak.extras.length > 0 && (
                <>
                  {' '}
                  — {peak.extras.slice(0, 3).map((e) => `${e.name} (${money(e.amount, { whole: true })})`).join(', ')} renew{peak.extras.length === 1 ? 's' : ''} then.
                </>
              )}
              {peak.extras.length === 0 && '.'}
            </p>
          </div>
        )}
      </Card>

      <div className="ins-row ins-row-split">
        <Card>
          <CardHeader icon={<Layers size={16} />} title="Spending by category" subtitle="Active subscriptions and bills, per month" />
          {insights.byCategory.length === 0 ? (
            <EmptyState compact title="No active spending" />
          ) : (
            <ul className="ins-bars">
              {insights.byCategory.map((c) => {
                const pct = totalMonthly > 0 ? (c.monthly / totalMonthly) * 100 : 0;
                const maxCat = insights.byCategory[0].monthly || 1;
                return (
                  <li key={c.category} className="ins-barrow">
                    <div className="ins-barrow-label">
                      <i style={{ background: c.color }} aria-hidden />
                      <span className="truncate">{c.label}</span>
                      <span className="ins-barrow-count">{c.count}</span>
                    </div>
                    <div className="ins-barrow-track" aria-hidden>
                      <span style={{ width: `${(c.monthly / maxCat) * 100}%`, background: c.color }} />
                    </div>
                    <div className="ins-barrow-value tabular">
                      <strong>{money(c.monthly, { whole: c.monthly >= 1000 })}</strong>
                      <span>{pct < 1 ? '<1' : Math.round(pct)}%</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
        <Card>
          <CardHeader icon={<Users size={16} />} title="By household member" subtitle="Who each subscription or bill belongs to" />
          {insights.byOwner.length === 0 ? (
            <EmptyState compact title="No active spending" />
          ) : (
            <>
              <div className="ins-owner-bar" aria-hidden>
                {insights.byOwner.map((o, i) => (
                  <span key={o.owner} style={{ width: `${(o.monthly / (totalMonthly || 1)) * 100}%`, background: OWNER_COLORS[i % OWNER_COLORS.length] }} />
                ))}
              </div>
              <ul className="ins-owners">
                {insights.byOwner.map((o, i) => {
                  const color = OWNER_COLORS[i % OWNER_COLORS.length];
                  const count = data.subscriptions.filter((s) => s.status === 'active' && (s.owner?.trim() || 'Shared') === o.owner).length;
                  return (
                    <li key={o.owner} className="ins-owner">
                      <Monogram name={o.owner} color={color} size={30} />
                      <div className="ins-owner-main">
                        <span className="ins-owner-name">{o.owner}</span>
                        <span className="ins-owner-sub">
                          {count} item{count === 1 ? '' : 's'} · {money(o.monthly * 12, { whole: true })}/yr
                        </span>
                      </div>
                      <div className="ins-barrow-value tabular">
                        <strong>{money(o.monthly)}</strong>
                        <span>{Math.round((o.monthly / (totalMonthly || 1)) * 100)}%</span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
