import { useMemo, useState } from 'react';
import { RotateCcw, WandSparkles } from 'lucide-react';
import { Button, Card, CardHeader, Checkbox, EmptyState, Monogram, Segmented, cx } from '@/components/ui';
import { categoryMeta, cycleMeta } from '@/lib/meta';
import { toMonthly } from '@/lib/money';
import type { Subscription } from '@/lib/types';
import { useMoney } from '@/store/selectors';

type Filter = 'all' | 'subscription' | 'bill';

export function WhatIf({ subscriptions }: { subscriptions: Subscription[] }) {
  const money = useMoney();
  const [off, setOff] = useState<Set<string>>(() => new Set());
  const [filter, setFilter] = useState<Filter>('subscription');

  const active = useMemo(
    () => subscriptions.filter((s) => s.status === 'active').sort((a, b) => toMonthly(b.amount, b.cycle) - toMonthly(a.amount, a.cycle)),
    [subscriptions],
  );
  const shown = active.filter((s) => filter === 'all' || s.kind === filter);
  const baseMonthly = active.reduce((a, s) => a + toMonthly(s.amount, s.cycle), 0);
  const savedMonthly = active.filter((s) => off.has(s.id)).reduce((a, s) => a + toMonthly(s.amount, s.cycle), 0);
  const newMonthly = baseMonthly - savedMonthly;
  const rarely = active.filter((s) => s.usage === 'rarely');

  const toggle = (id: string) =>
    setOff((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const pct = baseMonthly > 0 ? (savedMonthly / baseMonthly) * 100 : 0;

  return (
    <Card className="ins-whatif">
      <CardHeader
        icon={<WandSparkles size={16} />}
        title="What if I cancelled…"
        subtitle="Untick anything to see what you'd spend without it. Nothing is changed."
      />
      {active.length === 0 ? (
        <EmptyState compact title="No active subscriptions" description="Once you add subscriptions or bills you can try out cancelling them here." />
      ) : (
        <>
          <div className={cx('ins-whatif-summary', off.size > 0 && 'has-savings')} aria-live="polite">
            <div>
              <p className="ins-whatif-label">New monthly</p>
              <p className="ins-whatif-value tabular">{money(newMonthly)}</p>
              <p className="ins-whatif-sub tabular">was {money(baseMonthly)}</p>
            </div>
            <div>
              <p className="ins-whatif-label">New yearly</p>
              <p className="ins-whatif-value tabular">{money(newMonthly * 12, { whole: true })}</p>
              <p className="ins-whatif-sub tabular">was {money(baseMonthly * 12, { whole: true })}</p>
            </div>
            <div className="ins-whatif-save">
              <p className="ins-whatif-label">You'd save</p>
              <p className="ins-whatif-value tabular">{money(savedMonthly * 12, { whole: true })}<span>/yr</span></p>
              <p className="ins-whatif-sub tabular">{off.size} item{off.size === 1 ? '' : 's'} · {Math.round(pct)}% less</p>
            </div>
          </div>
          <div className="ins-whatif-tools">
            <Segmented<Filter>
              size="sm"
              ariaLabel="Show"
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'subscription', label: 'Subscriptions', count: active.filter((s) => s.kind === 'subscription').length },
                { value: 'bill', label: 'Bills', count: active.filter((s) => s.kind === 'bill').length },
                { value: 'all', label: 'All' },
              ]}
            />
            <div className="row">
              {rarely.length > 0 && (
                <Button size="sm" variant="subtle" onClick={() => setOff(new Set([...off, ...rarely.map((s) => s.id)]))}>
                  Drop barely used
                </Button>
              )}
              <Button size="sm" variant="ghost" icon={<RotateCcw size={14} />} onClick={() => setOff(new Set())} disabled={off.size === 0}>
                Reset
              </Button>
            </div>
          </div>
          <ul className="ins-whatif-list">
            {shown.map((s) => {
              const kept = !off.has(s.id);
              return (
                <li
                  key={s.id}
                  className={cx('ins-whatif-item', !kept && 'is-off')}
                  onClick={(e) => {
                    if (!(e.target as HTMLElement).closest('.checkbox')) toggle(s.id);
                  }}
                >
                  <Checkbox checked={kept} onChange={() => toggle(s.id)} ariaLabel={`Keep ${s.name}`} />
                  <Monogram name={s.name} color={categoryMeta(s.category).color} size={28} />
                  <div className="ins-whatif-name">
                    <span className="truncate">{s.name}</span>
                    <span className="ins-whatif-meta">
                      {s.cycle === 'monthly' ? categoryMeta(s.category).label : `${money(s.amount)} ${cycleMeta(s.cycle).short}`}
                      {s.usage === 'rarely' && <span className="ins-tag-warn">Barely used</span>}
                    </span>
                  </div>
                  <span className="ins-whatif-amt tabular">
                    {money(toMonthly(s.amount, s.cycle))}
                    <span>/mo</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Card>
  );
}
