import { Link } from 'react-router-dom';
import {
  AlarmClock,
  ArrowDownRight,
  ArrowUpRight,
  Ban,
  CalendarClock,
  ExternalLink,
  Lightbulb,
  Pause,
  Pencil,
  Play,
  RotateCcw,
  Trash2,
  Zap,
} from 'lucide-react';
import { Badge, Button, DescriptionList, Drawer, Monogram } from '@/components/ui';
import { formatDate, relativeDays } from '@/lib/dates';
import { categoryMeta, cycleMeta, statusMeta, USAGE } from '@/lib/meta';
import { refPath } from '@/lib/routes';
import { useData, useToday } from '@/store/store';
import { useMoney } from '@/store/selectors';
import type { Subscription } from '@/lib/types';
import { PriceChart } from './PriceChart';
import {
  hostOf,
  monthlyCost,
  normalizeUrl,
  priceChange,
  scheduleDate,
  sortedHistory,
  trialDaysLeft,
  upcomingCharges,
  yearlyCost,
} from './helpers';
import { useSubscriptionActions } from './useSubscriptionActions';

export function SubscriptionDrawer({ sub, onClose }: { sub: Subscription | null; onClose: () => void }) {
  return (
    <Drawer
      open={!!sub}
      onClose={onClose}
      width={520}
      title={sub?.name ?? ''}
      subtitle={sub ? `${categoryMeta(sub.category).label} · ${sub.kind === 'bill' ? 'Bill' : 'Subscription'}` : undefined}
      headerExtra={sub ? <Monogram name={sub.name} color={categoryMeta(sub.category).color} size={40} /> : undefined}
      footer={sub ? <DrawerFooter sub={sub} onClose={onClose} /> : undefined}
    >
      {sub && <DrawerBody sub={sub} />}
    </Drawer>
  );
}

function DrawerFooter({ sub, onClose }: { sub: Subscription; onClose: () => void }) {
  const cmd = useSubscriptionActions();
  return (
    <>
      <Button variant="ghost" icon={<Trash2 size={16} />} onClick={() => cmd.remove(sub, onClose)} className="subs-delete">
        Delete
      </Button>
      <span className="spacer" />
      <Button variant="primary" icon={<Pencil size={16} />} onClick={() => cmd.edit(sub)}>
        Edit
      </Button>
    </>
  );
}

function DrawerBody({ sub }: { sub: Subscription }) {
  const today = useToday();
  const money = useMoney();
  const { settings, tasks } = useData();
  const cmd = useSubscriptionActions();
  const locale = settings.locale;
  const st = statusMeta(sub.status);
  const cyc = cycleMeta(sub.cycle);
  const live = sub.status === 'active' || sub.status === 'trial';
  const next = live ? scheduleDate(sub, today) : null;
  const charges = upcomingCharges(sub, today, 6);
  const change = priceChange(sub);
  const history = sortedHistory(sub);
  const trialLeft = trialDaysLeft(sub, today);
  const annualSave = sub.annualPrice && sub.cycle !== 'yearly' ? yearlyCost(sub) - sub.annualPrice : 0;
  const linkedTasks = tasks.filter((t) => t.link?.kind === 'subscription' && t.link.id === sub.id);
  const usage = USAGE.find((u) => u.id === sub.usage)?.label;

  return (
    <div className="subs-drawer">
      <section className="subs-hero">
        <div className="subs-hero-amount">
          <span className="subs-hero-value tabular">{money(sub.amount)}</span>
          <span className="subs-hero-cycle">{cyc.adverb}</span>
        </div>
        <div className="subs-hero-badges">
          <Badge tone={st.tone} dot>
            {st.label}
          </Badge>
          {live && (
            <Badge tone={sub.autopay ? 'brand' : 'neutral'}>
              {sub.autopay ? <Zap size={12} aria-hidden /> : null}
              {sub.autopay ? 'Autopay' : 'Pay manually'}
            </Badge>
          )}
        </div>
        <p className="subs-hero-sub tabular">
          ≈ {money(monthlyCost(sub))}/month · {money(yearlyCost(sub))}/year
        </p>
      </section>

      {sub.status === 'trial' && (
        <div className={`subs-callout ${trialLeft !== null && trialLeft <= 3 ? 'is-danger' : 'is-warning'}`}>
          <AlarmClock size={18} aria-hidden />
          <div>
            {sub.trialEndsOn ? (
              <>
                <strong>
                  Trial ends {formatDate(sub.trialEndsOn, 'dayMonth', locale)} ({relativeDays(sub.trialEndsOn, today).toLowerCase()}).
                </strong>{' '}
                You'll be charged {money(sub.amount)} unless you cancel before then.
              </>
            ) : (
              <>
                <strong>No trial end date.</strong> Add one so Keel can remind you before it converts.
              </>
            )}
          </div>
        </div>
      )}

      {annualSave > 0.5 && live && (
        <div className="subs-callout is-info">
          <Lightbulb size={18} aria-hidden />
          <div>
            <strong>Switch to yearly billing and save {money(annualSave)} a year.</strong> The yearly plan is{' '}
            {money(sub.annualPrice ?? 0)} versus {money(yearlyCost(sub))} paying {cyc.label.toLowerCase()}.
          </div>
        </div>
      )}

      {sub.usage === 'rarely' && sub.status === 'active' && (
        <div className="subs-callout is-info">
          <Lightbulb size={18} aria-hidden />
          <div>
            <strong>You barely use this.</strong> Cancelling would free up {money(yearlyCost(sub))} a year.
          </div>
        </div>
      )}

      <div className="subs-quick" role="group" aria-label="Quick actions">
        {(sub.status === 'active' || sub.status === 'paused') && (
          <Button
            size="sm"
            icon={sub.status === 'paused' ? <Play size={15} /> : <Pause size={15} />}
            onClick={() => cmd.togglePause(sub)}
          >
            {sub.status === 'paused' ? 'Resume' : 'Pause'}
          </Button>
        )}
        {sub.status === 'cancelled' ? (
          <Button size="sm" icon={<RotateCcw size={15} />} onClick={() => cmd.reactivate(sub)}>
            Reactivate
          </Button>
        ) : (
          <Button size="sm" icon={<Ban size={15} />} onClick={() => void cmd.cancel(sub)}>
            Mark cancelled
          </Button>
        )}
        {sub.cancelUrl && sub.status !== 'cancelled' && (
          <a className="btn btn-secondary btn-sm" href={normalizeUrl(sub.cancelUrl)} target="_blank" rel="noreferrer noopener">
            <ExternalLink size={15} aria-hidden />
            Open cancellation page
          </a>
        )}
        <Button size="sm" icon={<CalendarClock size={15} />} onClick={() => cmd.remind(sub)}>
          Create reminder
        </Button>
      </div>

      <section className="subs-section">
        <h3 className="subs-section-title">Details</h3>
        <DescriptionList
          items={[
            {
              label: 'Next charge',
              value: next ? (
                <span>
                  {formatDate(next, 'dayMonth', locale)}{' '}
                  <span className="muted">· {relativeDays(next, today)}</span>
                </span>
              ) : (
                <span className="muted">{sub.status === 'paused' ? 'None while paused' : 'None, it is cancelled'}</span>
              ),
            },
            { label: 'Monthly cost', value: <span className="tabular">{money(monthlyCost(sub))}</span> },
            { label: 'Yearly cost', value: <span className="tabular">{money(yearlyCost(sub))}</span> },
            ...(sub.annualPrice ? [{ label: 'Yearly plan price', value: <span className="tabular">{money(sub.annualPrice)}</span> }] : []),
            { label: 'Payment method', value: sub.paymentMethod || <span className="muted">Not set</span> },
            { label: 'Autopay', value: sub.autopay ? 'On, charged automatically' : 'Off, you pay it yourself' },
            { label: 'Owner', value: sub.owner || <span className="muted">Not set</span> },
            { label: 'Usage', value: usage ?? <span className="muted">Not set</span> },
            ...(sub.status === 'trial'
              ? [{ label: 'Trial ends', value: sub.trialEndsOn ? formatDate(sub.trialEndsOn, 'medium', locale) : 'Not set' }]
              : []),
            ...(sub.cancelledOn ? [{ label: 'Cancelled on', value: formatDate(sub.cancelledOn, 'medium', locale) }] : []),
            ...(sub.url
              ? [
                  {
                    label: 'Website',
                    value: (
                      <a href={normalizeUrl(sub.url)} target="_blank" rel="noreferrer noopener" className="subs-link">
                        {hostOf(sub.url)} <ExternalLink size={13} aria-hidden />
                      </a>
                    ),
                  },
                ]
              : []),
            ...(sub.cancelUrl
              ? [
                  {
                    label: 'Cancellation page',
                    value: (
                      <a href={normalizeUrl(sub.cancelUrl)} target="_blank" rel="noreferrer noopener" className="subs-link">
                        {hostOf(sub.cancelUrl)} <ExternalLink size={13} aria-hidden />
                      </a>
                    ),
                  },
                ]
              : []),
          ]}
        />
        {sub.notes && <p className="subs-notes">{sub.notes}</p>}
      </section>

      <section className="subs-section">
        <div className="subs-section-head">
          <h3 className="subs-section-title">Price history</h3>
          {change && (
            <Badge tone={change.pct > 0 ? 'warning' : 'success'}>
              {change.pct > 0 ? <ArrowUpRight size={12} aria-hidden /> : <ArrowDownRight size={12} aria-hidden />}
              {change.pct > 0 ? '+' : ''}
              {change.pct.toFixed(0)}% since {formatDate(change.from.date, 'monthYear', locale)}
            </Badge>
          )}
        </div>
        {history.length >= 2 ? (
          <>
            <PriceChart history={history} today={today} locale={locale} format={(n) => money(n)} />
            <ul className="subs-history">
              {[...history].reverse().map((p, i, arr) => {
                const prev = arr[i + 1];
                const delta = prev && prev.amount > 0 ? ((p.amount - prev.amount) / prev.amount) * 100 : null;
                return (
                  <li key={`${p.date}-${i}`}>
                    <span className="muted">{formatDate(p.date, 'medium', locale)}</span>
                    <span className="tabular">
                      {money(p.amount)}
                      {delta !== null && delta !== 0 && (
                        <span className={delta > 0 ? 'subs-up' : 'subs-down'}>
                          {' '}
                          {delta > 0 ? '+' : ''}
                          {delta.toFixed(0)}%
                        </span>
                      )}
                      {delta === null && <span className="muted"> start</span>}
                    </span>
                  </li>
                );
              })}
            </ul>
          </>
        ) : (
          <p className="muted subs-empty-line">
            No price changes recorded{history[0] ? ` since ${formatDate(history[0].date, 'medium', locale)}` : ''}. When you
            change the amount, Keel keeps the old price here.
          </p>
        )}
      </section>

      <section className="subs-section">
        <div className="subs-section-head">
          <h3 className="subs-section-title">Upcoming charges</h3>
          {charges.length > 0 && (
            <span className="muted subs-small tabular">
              {money(charges.length * sub.amount)} over the next {charges.length}
            </span>
          )}
        </div>
        {charges.length > 0 ? (
          <ol className="subs-upcoming">
            {charges.map((d, i) => (
              <li key={d}>
                <span className="subs-upcoming-idx" aria-hidden>
                  {i + 1}
                </span>
                <span className="subs-upcoming-date">{formatDate(d, 'dayMonth', locale)}</span>
                <span className="muted subs-small">{relativeDays(d, today)}</span>
                <span className="spacer" />
                <span className="tabular">{money(sub.amount)}</span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="muted subs-empty-line">
            {sub.status === 'paused'
              ? 'Nothing scheduled while it is paused. Resume it to see upcoming charges.'
              : 'Nothing scheduled. It is marked as cancelled.'}
          </p>
        )}
      </section>

      <section className="subs-section">
        <div className="subs-section-head">
          <h3 className="subs-section-title">Reminders</h3>
          <Button size="sm" variant="ghost" icon={<CalendarClock size={15} />} onClick={() => cmd.remind(sub)}>
            Add
          </Button>
        </div>
        {linkedTasks.length > 0 ? (
          <ul className="subs-tasks">
            {linkedTasks.map((t) => (
              <li key={t.id} className={t.done ? 'is-done' : undefined}>
                <Link to={refPath({ kind: 'task', id: t.id })}>{t.title}</Link>
                <span className="muted subs-small">
                  {t.done ? 'Done' : t.dueDate ? `Due ${formatDate(t.dueDate, 'short', locale)}` : 'No due date'}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted subs-empty-line">No tasks linked yet. Add one to review it before it renews.</p>
        )}
      </section>
    </div>
  );
}
