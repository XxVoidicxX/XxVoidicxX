import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  AlarmClock,
  Ban,
  CalendarClock,
  CalendarDays,
  Hand,
  MoreHorizontal,
  Pause,
  Pencil,
  PiggyBank,
  Play,
  Plus,
  Receipt,
  RotateCcw,
  Trash2,
  Wallet,
  Zap,
} from 'lucide-react';
import { useUI } from '@/app/ui';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Menu,
  Monogram,
  PageHeader,
  SearchInput,
  Segmented,
  Select,
  StatCard,
  cx,
  type MenuItem,
} from '@/components/ui';
import { compareISO, diffDays, formatDate, relativeDays } from '@/lib/dates';
import { CATEGORIES, categoryMeta, cycleMeta, statusMeta } from '@/lib/meta';
import type { CategoryId, Subscription } from '@/lib/types';
import { useInsights, useMoney } from '@/store/selectors';
import { useData, useToday } from '@/store/store';
import { SubscriptionDrawer } from './SubscriptionDrawer';
import { isLive, monthlyCost, scheduleDate } from './helpers';
import { useSubscriptionActions } from './useSubscriptionActions';
import './subscriptions.css';

type Filter = 'all' | 'subscription' | 'bill' | 'trial' | 'inactive';
type SortKey = 'next' | 'cost' | 'name' | 'recent';
const UNASSIGNED = '__none__';

const SORTS: { id: SortKey; label: string }[] = [
  { id: 'next', label: 'Next charge' },
  { id: 'cost', label: 'Cost: high to low' },
  { id: 'name', label: 'Name' },
  { id: 'recent', label: 'Recently added' },
];

function matchesFilter(s: Subscription, f: Filter): boolean {
  switch (f) {
    case 'all':
      return true;
    case 'subscription':
    case 'bill':
      return s.kind === f;
    case 'trial':
      return s.status === 'trial';
    case 'inactive':
      return !isLive(s);
  }
}

export function SubscriptionsPage() {
  const { subscriptions, settings } = useData();
  const today = useToday();
  const money = useMoney();
  const insights = useInsights();
  const { openEditor } = useUI();
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [category, setCategory] = useState<CategoryId | ''>('');
  const [owner, setOwner] = useState('');
  const [sort, setSort] = useState<SortKey>('next');

  const openId = params.get('open');
  const openSub = openId ? subscriptions.find((s) => s.id === openId) ?? null : null;

  const openDrawer = useCallback(
    (id: string) => {
      setParams((p) => {
        const n = new URLSearchParams(p);
        n.set('open', id);
        return n;
      });
    },
    [setParams],
  );
  const closeDrawer = useCallback(() => {
    setParams(
      (p) => {
        const n = new URLSearchParams(p);
        n.delete('open');
        return n;
      },
      { replace: true },
    );
  }, [setParams]);

  const nextOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of subscriptions) m.set(s.id, scheduleDate(s, today));
    return m;
  }, [subscriptions, today]);

  const counts = useMemo(
    () => ({
      all: subscriptions.length,
      subscription: subscriptions.filter((s) => s.kind === 'subscription').length,
      bill: subscriptions.filter((s) => s.kind === 'bill').length,
      trial: subscriptions.filter((s) => s.status === 'trial').length,
      inactive: subscriptions.filter((s) => !isLive(s)).length,
    }),
    [subscriptions],
  );

  const categoryOptions = useMemo(() => {
    const c = new Map<CategoryId, number>();
    for (const s of subscriptions) c.set(s.category, (c.get(s.category) ?? 0) + 1);
    return CATEGORIES.filter((x) => c.has(x.id)).map((x) => ({ ...x, count: c.get(x.id) ?? 0 }));
  }, [subscriptions]);

  const ownerOptions = useMemo(() => {
    const set = new Set(settings.householdMembers);
    for (const s of subscriptions) if (s.owner?.trim()) set.add(s.owner.trim());
    return [...set];
  }, [subscriptions, settings.householdMembers]);
  const hasUnassigned = subscriptions.some((s) => !s.owner?.trim());

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = subscriptions.filter((s) => {
      if (!matchesFilter(s, filter)) return false;
      if (category && s.category !== category) return false;
      if (owner === UNASSIGNED ? !!s.owner?.trim() : owner && s.owner?.trim() !== owner) return false;
      if (!q) return true;
      return [s.name, categoryMeta(s.category).label, s.owner, s.paymentMethod, s.notes]
        .filter(Boolean)
        .some((v) => (v as string).toLowerCase().includes(q));
    });
    const cmp = (a: Subscription, b: Subscription) => {
      switch (sort) {
        case 'next':
          return compareISO(nextOf.get(a.id) ?? '', nextOf.get(b.id) ?? '') || a.name.localeCompare(b.name);
        case 'cost':
          return monthlyCost(b) - monthlyCost(a);
        case 'name':
          return a.name.localeCompare(b.name);
        case 'recent':
          return b.createdAt.localeCompare(a.createdAt) || a.name.localeCompare(b.name);
      }
    };
    return [...list].sort(cmp);
  }, [subscriptions, filter, category, owner, query, sort, nextOf]);

  const live = filtered.filter(isLive);
  const inactive = filtered.filter((s) => !isLive(s));
  const liveMonthly = live.filter((s) => s.status === 'active').reduce((a, s) => a + monthlyCost(s), 0);
  const filtersOn = !!query || filter !== 'all' || !!category || !!owner;

  const clearFilters = () => {
    setQuery('');
    setFilter('all');
    setCategory('');
    setOwner('');
  };

  const nextUp = useMemo(() => {
    let best: Subscription | null = null;
    for (const s of subscriptions) {
      if (!isLive(s)) continue;
      if (!best || compareISO(nextOf.get(s.id) ?? '', nextOf.get(best.id) ?? '') < 0) best = s;
    }
    return best;
  }, [subscriptions, nextOf]);

  const soonTrials = subscriptions.filter((s) => {
    if (s.status !== 'trial' || !s.trialEndsOn) return false;
    const n = diffDays(s.trialEndsOn, today);
    return n >= 0 && n <= 14;
  });
  const pausedCount = subscriptions.filter((s) => s.status === 'paused').length;
  const cancelledCount = subscriptions.filter((s) => s.status === 'cancelled').length;

  const add = () => openEditor({ kind: 'subscription' });

  return (
    <div className="subs-page">
      <PageHeader
        title="Subscriptions & bills"
        description="Everything that charges you on repeat, and what it really costs per month and per year."
        actions={
          <Button variant="primary" icon={<Plus size={16} />} onClick={add}>
            Add
          </Button>
        }
      />

      {subscriptions.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Receipt size={22} />}
            title="No subscriptions or bills yet"
            description="Add your streaming services, phone plan, rent and anything else that charges you regularly. Keel will total them up and warn you before charges and trial endings."
            action={
              <Button variant="primary" icon={<Plus size={16} />} onClick={add}>
                Add your first one
              </Button>
            }
          />
        </Card>
      ) : (
        <>
          <div className="subs-stats">
            <StatCard
              label="Monthly total"
              value={money(insights.monthly)}
              icon={<Wallet size={16} />}
              hint={`${money(insights.subscriptionsMonthly, { whole: true })} subs · ${money(insights.billsMonthly, { whole: true })} bills`}
            />
            <StatCard
              label="Yearly total"
              value={money(insights.yearly, { whole: true })}
              icon={<CalendarDays size={16} />}
              hint="At today's prices"
            />
            <StatCard
              label="Active"
              value={insights.activeCount}
              icon={<Zap size={16} />}
              tone="success"
              hint={
                [
                  insights.trialCount ? `${insights.trialCount} on trial` : null,
                  pausedCount + cancelledCount ? `${pausedCount + cancelledCount} inactive` : null,
                ]
                  .filter(Boolean)
                  .join(' · ') || 'Nothing paused or cancelled'
              }
            />
            <StatCard
              label="Next charge"
              value={<span className="subs-stat-name truncate">{nextUp ? nextUp.name : 'None'}</span>}
              icon={<CalendarClock size={16} />}
              tone="neutral"
              hint={
                nextUp
                  ? `${money(nextUp.amount)} · ${relativeDays(nextOf.get(nextUp.id) ?? today, today)}`
                  : 'Nothing scheduled'
              }
              onClick={nextUp ? () => openDrawer(nextUp.id) : undefined}
            />
            <StatCard
              label="Trials ending soon"
              value={soonTrials.length}
              icon={<AlarmClock size={16} />}
              tone={soonTrials.length ? 'warning' : 'neutral'}
              hint={
                soonTrials.length
                  ? `${money(soonTrials.reduce((a, s) => a + s.amount, 0))} if kept`
                  : 'None in the next 2 weeks'
              }
              onClick={counts.trial ? () => setFilter('trial') : undefined}
            />
          </div>

          <div className="toolbar subs-toolbar">
            <SearchInput value={query} onChange={setQuery} placeholder="Search by name, owner, card…" ariaLabel="Search subscriptions and bills" />
            <Select value={category} onChange={(e) => setCategory(e.target.value as CategoryId | '')} aria-label="Category" className="subs-select">
              <option value="">All categories</option>
              {categoryOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label} ({c.count})
                </option>
              ))}
            </Select>
            <Select value={owner} onChange={(e) => setOwner(e.target.value)} aria-label="Owner" className="subs-select">
              <option value="">Everyone</option>
              {ownerOptions.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
              {hasUnassigned && <option value={UNASSIGNED}>No owner</option>}
            </Select>
            <Select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="Sort by" className="subs-select">
              {SORTS.map((s) => (
                <option key={s.id} value={s.id}>
                  Sort: {s.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="subs-filter-row">
            <Segmented<Filter>
              ariaLabel="Show"
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'all', label: 'All', count: counts.all },
                { value: 'subscription', label: 'Subscriptions', count: counts.subscription },
                { value: 'bill', label: 'Bills', count: counts.bill },
                { value: 'trial', label: 'Trials', count: counts.trial },
                { value: 'inactive', label: 'Paused & cancelled', count: counts.inactive },
              ]}
            />
            {filtersOn && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                Clear filters
              </Button>
            )}
          </div>

          {filtered.length === 0 ? (
            <Card>
              <EmptyState
                compact
                icon={<Receipt size={20} />}
                title="Nothing matches these filters"
                description="Try a different search or show everything again."
                action={<Button onClick={clearFilters}>Clear filters</Button>}
              />
            </Card>
          ) : (
            <div className="subs-groups">
              {live.length > 0 && (
                <SubsGroup
                  items={live}
                  nextOf={nextOf}
                  onOpen={openDrawer}
                  footer={
                    <>
                      <span>
                        {live.length} {live.length === 1 ? 'item' : 'items'}
                      </span>
                      <span className="tabular">
                        <strong>{money(liveMonthly)}</strong>
                        <span className="muted">/mo active</span>
                      </span>
                    </>
                  }
                />
              )}
              {inactive.length > 0 && (
                <section className="subs-inactive" aria-labelledby="subs-inactive-title">
                  <div className="subs-inactive-head">
                    <div>
                      <h2 id="subs-inactive-title" className="subs-group-title">
                        Paused & cancelled
                      </h2>
                      <p className="muted subs-small">Not counted in your totals.</p>
                    </div>
                    {insights.cancelledSavingsYearly > 0 && (
                      <div className="subs-savings">
                        <PiggyBank size={18} aria-hidden />
                        <span>
                          You've saved <strong className="tabular">{money(insights.cancelledSavingsYearly)}/yr</strong> by cancelling
                        </span>
                      </div>
                    )}
                  </div>
                  <SubsGroup items={inactive} nextOf={nextOf} onOpen={openDrawer} muted />
                </section>
              )}
            </div>
          )}
        </>
      )}

      <SubscriptionDrawer sub={openSub} onClose={closeDrawer} />
    </div>
  );
}

function SubsGroup({
  items,
  nextOf,
  onOpen,
  footer,
  muted,
}: {
  items: Subscription[];
  nextOf: Map<string, string>;
  onOpen: (id: string) => void;
  footer?: ReactNode;
  muted?: boolean;
}) {
  const today = useToday();
  const money = useMoney();
  const { settings } = useData();
  const locale = settings.locale;

  return (
    <Card padded={false} className={cx('subs-card', muted && 'is-muted')}>
      <div className="table-wrap subs-table-wrap">
        <table className="table subs-table">
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col" className="subs-col-status">
                Status
              </th>
              <th scope="col" className="subs-col-owner">
                Owner
              </th>
              <th scope="col" className="subs-col-cycle">
                Cycle
              </th>
              <th scope="col" className="num subs-col-amount">
                Amount
              </th>
              <th scope="col" className="subs-col-next">
                {muted ? 'Ended / paused' : 'Next charge'}
              </th>
              <th scope="col" className="subs-col-pay">
                <span className="sr-only">Payment</span>
              </th>
              <th scope="col" className="subs-col-menu">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((s) => {
              const cat = categoryMeta(s.category);
              const st = statusMeta(s.status);
              const next = nextOf.get(s.id) ?? s.anchorDate;
              const soon = isLive(s) && diffDays(next, today) <= 3;
              return (
                <tr
                  key={s.id}
                  className="is-clickable"
                  onClick={() => onOpen(s.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && e.target === e.currentTarget) onOpen(s.id);
                  }}
                  tabIndex={0}
                  aria-label={`${s.name}, ${money(s.amount)} ${cycleMeta(s.cycle).adverb}. Open details`}
                >
                  <td>
                    <div className="subs-name">
                      <Monogram name={s.name} color={cat.color} size={34} />
                      <div className="subs-name-text">
                        <span className="subs-name-title truncate">{s.name}</span>
                        <span className="subs-cat">
                          <span className="subs-cat-dot" style={{ background: cat.color }} aria-hidden />
                          {cat.label}
                          {s.kind === 'bill' && <span className="subs-kind">Bill</span>}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td>
                    <Badge tone={st.tone} dot>
                      {st.label}
                    </Badge>
                  </td>
                  <td className="subs-col-owner">{s.owner || <span className="muted">—</span>}</td>
                  <td className="subs-col-cycle muted">{cycleMeta(s.cycle).label}</td>
                  <td className="num">
                    <div className="subs-amount">{money(s.amount)}</div>
                    {s.cycle !== 'monthly' && <div className="subs-permo">≈ {money(monthlyCost(s))}/mo</div>}
                  </td>
                  <td>
                    {isLive(s) ? (
                      <div className="subs-next">
                        <span>{formatDate(next, 'dayMonth', locale)}</span>
                        <span className={cx('subs-rel', soon && 'is-soon')}>
                          {s.status === 'trial' ? 'Trial ends · ' : ''}
                          {relativeDays(next, today)}
                        </span>
                      </div>
                    ) : s.status === 'cancelled' ? (
                      <div className="subs-next">
                        <span>{s.cancelledOn ? formatDate(s.cancelledOn, 'medium', locale) : '—'}</span>
                        <span className="subs-rel">Saving {money(monthlyCost(s))}/mo</span>
                      </div>
                    ) : (
                      <span className="muted">Paused</span>
                    )}
                  </td>
                  <td className="subs-col-pay">
                    {isLive(s) &&
                      (s.autopay ? (
                        <span className="subs-pay is-auto" title="Autopay on">
                          <Zap size={15} aria-label="Autopay on" />
                        </span>
                      ) : (
                        <span className="subs-pay is-manual" title="Pay manually">
                          <Hand size={15} aria-label="Pay manually" />
                        </span>
                      ))}
                  </td>
                  <td className="subs-col-menu" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                    <RowMenu sub={s} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <ul className="subs-mobile-list">
        {items.map((s) => {
          const cat = categoryMeta(s.category);
          const st = statusMeta(s.status);
          const next = nextOf.get(s.id) ?? s.anchorDate;
          const soon = isLive(s) && diffDays(next, today) <= 3;
          return (
            <li key={s.id}>
              <button type="button" className="subs-mrow" onClick={() => onOpen(s.id)}>
                <Monogram name={s.name} color={cat.color} size={38} />
                <span className="subs-mrow-main">
                  <span className="subs-mrow-title">
                    <span className="truncate">{s.name}</span>
                    {s.status !== 'active' && (
                      <Badge tone={st.tone} dot>
                        {st.label}
                      </Badge>
                    )}
                  </span>
                  <span className="subs-mrow-sub truncate">
                    {cat.label}
                    {s.owner ? ` · ${s.owner}` : ''}
                  </span>
                </span>
                <span className="subs-mrow-end">
                  <span className="subs-amount tabular">
                    {money(s.amount)}
                    <span className="subs-mrow-cycle">{cycleMeta(s.cycle).short}</span>
                  </span>
                  <span className={cx('subs-rel', soon && 'is-soon')}>
                    {isLive(s)
                      ? relativeDays(next, today)
                      : s.status === 'cancelled'
                        ? s.cancelledOn
                          ? `Ended ${relativeDays(s.cancelledOn, today).toLowerCase()}`
                          : 'No more charges'
                        : 'No charges'}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {footer && <div className="subs-card-foot">{footer}</div>}
    </Card>
  );
}

function RowMenu({ sub }: { sub: Subscription }) {
  const cmd = useSubscriptionActions();
  const items: (MenuItem | 'divider')[] = [{ label: 'Edit', icon: <Pencil size={15} />, onSelect: () => cmd.edit(sub) }];
  if (sub.status === 'active' || sub.status === 'paused') {
    items.push({
      label: sub.status === 'paused' ? 'Resume' : 'Pause',
      icon: sub.status === 'paused' ? <Play size={15} /> : <Pause size={15} />,
      onSelect: () => cmd.togglePause(sub),
    });
  }
  items.push(
    sub.status === 'cancelled'
      ? { label: 'Reactivate', icon: <RotateCcw size={15} />, onSelect: () => cmd.reactivate(sub) }
      : { label: 'Mark cancelled', icon: <Ban size={15} />, onSelect: () => void cmd.cancel(sub) },
  );
  items.push({ label: 'Create reminder', icon: <CalendarClock size={15} />, onSelect: () => cmd.remind(sub) });
  items.push('divider', { label: 'Delete', icon: <Trash2 size={15} />, danger: true, onSelect: () => cmd.remove(sub) });
  return (
    <Menu
      label={`Actions for ${sub.name}`}
      items={items}
      trigger={(p) => (
        <button type="button" className="subs-menu-btn" aria-label={`More actions for ${sub.name}`} {...p}>
          <MoreHorizontal size={18} />
        </button>
      )}
    />
  );
}
