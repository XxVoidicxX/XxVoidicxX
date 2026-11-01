import {
  addDays,
  addMonths,
  compareISO,
  diffDays,
  endOfMonth,
  isValidISO,
  maxISO,
  nextOccurrence,
  occurrencesBetween,
  startOfMonth,
} from './dates';
import { categoryMeta, documentTypeMeta } from './meta';
import { round2, toMonthly, toYearly } from './money';
import type {
  AppData,
  CategoryId,
  DocumentItem,
  ISODate,
  Purchase,
  Severity,
  Subscription,
  TimelineEvent,
} from './types';

export function isBillable(s: Subscription): boolean {
  return s.status === 'active' || s.status === 'trial';
}

export function firstBillingDate(s: Subscription): ISODate {
  if (s.status === 'trial' && s.trialEndsOn && isValidISO(s.trialEndsOn)) {
    return maxISO(s.anchorDate, s.trialEndsOn);
  }
  return s.anchorDate;
}

export function nextChargeDate(s: Subscription, today: ISODate): ISODate | null {
  if (!isBillable(s)) return null;
  const first = firstBillingDate(s);
  if (s.status === 'trial' && s.trialEndsOn && compareISO(first, today) >= 0) return first;
  return nextOccurrence(s.anchorDate, s.cycle, maxISO(today, first));
}

export function chargesBetween(s: Subscription, start: ISODate, end: ISODate): ISODate[] {
  if (!isBillable(s)) return [];
  const first = firstBillingDate(s);
  const from = maxISO(start, first);
  if (compareISO(from, end) > 0) return [];
  if (s.status === 'trial' && s.trialEndsOn && compareISO(first, s.anchorDate) > 0) {
    const out: ISODate[] = [];
    if (compareISO(first, start) >= 0 && compareISO(first, end) <= 0) out.push(first);
    for (const d of occurrencesBetween(first, s.cycle, addDays(first, 1), end)) {
      if (compareISO(d, from) >= 0) out.push(d);
    }
    return out;
  }
  return occurrencesBetween(s.anchorDate, s.cycle, from, end);
}

export function returnDeadline(p: Purchase): ISODate | null {
  if (!p.returnDays || p.returnDays <= 0) return null;
  return addDays(p.purchaseDate, p.returnDays);
}

export function warrantyEnd(p: Purchase): ISODate | null {
  const months = (p.warrantyMonths || 0) + (p.extendedWarrantyMonths || 0);
  if (months <= 0) return null;
  return addMonths(p.purchaseDate, months);
}

export function renewalWindowStart(d: DocumentItem): ISODate | null {
  if (!d.expiresOn) return null;
  return addDays(d.expiresOn, -Math.max(0, d.renewalLeadDays));
}

export type DocStatus = 'expired' | 'renew_now' | 'ok' | 'no_expiry';

export function documentStatus(d: DocumentItem, today: ISODate): DocStatus {
  if (!d.expiresOn) return 'no_expiry';
  if (compareISO(d.expiresOn, today) < 0) return 'expired';
  const win = renewalWindowStart(d);
  if (win && compareISO(win, today) <= 0) return 'renew_now';
  return 'ok';
}

export type CoverageStatus = 'returnable' | 'under_warranty' | 'expired' | 'returned' | 'no_coverage';

export function purchaseStatus(p: Purchase, today: ISODate): CoverageStatus {
  if (p.returned) return 'returned';
  const rd = returnDeadline(p);
  if (rd && compareISO(rd, today) >= 0) return 'returnable';
  const we = warrantyEnd(p);
  if (we && compareISO(we, today) >= 0) return 'under_warranty';
  if (!rd && !we) return 'no_coverage';
  return 'expired';
}

function sev(daysAway: number, warnWithin: number, critWithin = 0): Severity {
  if (daysAway < critWithin) return 'critical';
  if (daysAway <= warnWithin) return 'warning';
  return 'info';
}

export function buildTimeline(data: AppData, start: ISODate, end: ISODate, today: ISODate): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  const inRange = (d: ISODate | null | undefined): d is ISODate =>
    !!d && compareISO(d, start) >= 0 && compareISO(d, end) <= 0;

  for (const s of data.subscriptions) {
    for (const d of chargesBetween(s, start, end)) {
      events.push({
        key: `charge:${s.id}:${d}`,
        kind: 'charge',
        date: d,
        title: s.name,
        subtitle: s.autopay ? `${categoryMeta(s.category).label} · Autopay` : `${categoryMeta(s.category).label} · Pay manually`,
        amount: s.amount,
        severity: !s.autopay ? sev(diffDays(d, today), 3) : 'info',
        ref: { kind: 'subscription', id: s.id },
      });
    }
    if (s.status === 'trial' && inRange(s.trialEndsOn)) {
      events.push({
        key: `trial:${s.id}:${s.trialEndsOn}`,
        kind: 'trial_end',
        date: s.trialEndsOn,
        title: `${s.name} trial ends`,
        subtitle: 'Cancel before this date to avoid being charged',
        amount: s.amount,
        severity: sev(diffDays(s.trialEndsOn, today), 7),
        ref: { kind: 'subscription', id: s.id },
      });
    }
  }

  for (const d of data.documents) {
    if (inRange(d.expiresOn)) {
      events.push({
        key: `doc:${d.id}:${d.expiresOn}`,
        kind: 'doc_expiry',
        date: d.expiresOn,
        title: `${d.name} expires`,
        subtitle: `${documentTypeMeta(d.type).label} · ${d.holder}`,
        severity: sev(diffDays(d.expiresOn, today), d.renewalLeadDays, 0),
        ref: { kind: 'document', id: d.id },
      });
    }
    const win = renewalWindowStart(d);
    if (inRange(win) && d.renewalLeadDays > 0) {
      events.push({
        key: `docwin:${d.id}:${win}`,
        kind: 'doc_renew_window',
        date: win,
        title: `Start renewing ${d.name}`,
        subtitle: `${d.renewalLeadDays} days before it expires`,
        severity: 'info',
        ref: { kind: 'document', id: d.id },
      });
    }
  }

  for (const p of data.purchases) {
    if (p.returned) continue;
    const rd = returnDeadline(p);
    if (inRange(rd)) {
      events.push({
        key: `return:${p.id}:${rd}`,
        kind: 'return_deadline',
        date: rd,
        title: `Last day to return ${p.item}`,
        subtitle: p.retailer ? `Bought at ${p.retailer}` : undefined,
        amount: p.price,
        severity: sev(diffDays(rd, today), 5),
        ref: { kind: 'purchase', id: p.id },
      });
    }
    const we = warrantyEnd(p);
    if (inRange(we)) {
      events.push({
        key: `warranty:${p.id}:${we}`,
        kind: 'warranty_end',
        date: we,
        title: `${p.item} warranty ends`,
        subtitle: p.brand,
        severity: sev(diffDays(we, today), 30),
        ref: { kind: 'purchase', id: p.id },
      });
    }
  }

  for (const t of data.tasks) {
    if (t.done || !inRange(t.dueDate)) continue;
    events.push({
      key: `task:${t.id}:${t.dueDate}`,
      kind: 'task_due',
      date: t.dueDate,
      title: t.title,
      subtitle: t.priority === 'high' ? 'High priority' : undefined,
      severity: sev(diffDays(t.dueDate, today), 1, 0),
      ref: { kind: 'task', id: t.id },
    });
  }

  return events.sort((a, b) => compareISO(a.date, b.date) || a.title.localeCompare(b.title));
}

export interface Alert {
  key: string;
  severity: Severity;
  title: string;
  detail: string;
  date?: ISODate;
  amount?: number;
  ref: TimelineEvent['ref'];
  action?: string;
}

const SEVERITY_RANK: Record<Severity, number> = { critical: 0, warning: 1, info: 2 };

export function buildAlerts(data: AppData, today: ISODate): Alert[] {
  const alerts: Alert[] = [];
  const lead = Math.max(1, data.settings.reminderDays);

  for (const s of data.subscriptions) {
    if (s.status === 'trial' && s.trialEndsOn) {
      const n = diffDays(s.trialEndsOn, today);
      if (n >= 0 && n <= Math.max(lead, 7)) {
        alerts.push({
          key: `trial:${s.id}:${s.trialEndsOn}`,
          severity: n <= 3 ? 'critical' : 'warning',
          title: `${s.name} trial ends ${n === 0 ? 'today' : n === 1 ? 'tomorrow' : `in ${n} days`}`,
          detail: `You'll be charged automatically unless you cancel.`,
          date: s.trialEndsOn,
          amount: s.amount,
          ref: { kind: 'subscription', id: s.id },
          action: 'Review trial',
        });
      }
    }
    if (s.status === 'active' && !s.autopay) {
      const next = nextChargeDate(s, today);
      if (next) {
        const n = diffDays(next, today);
        if (n >= 0 && n <= lead) {
          alerts.push({
            key: `manual:${s.id}:${next}`,
            severity: n <= 2 ? 'warning' : 'info',
            title: `Pay ${s.name} ${n === 0 ? 'today' : n === 1 ? 'tomorrow' : `in ${n} days`}`,
            detail: `This bill isn't on autopay.`,
            date: next,
            amount: s.amount,
            ref: { kind: 'subscription', id: s.id },
            action: 'Open bill',
          });
        }
      }
    }
    if (s.status === 'active' && s.priceHistory.length >= 2) {
      const sorted = [...s.priceHistory].sort((a, b) => compareISO(a.date, b.date));
      const last = sorted[sorted.length - 1];
      const prev = sorted[sorted.length - 2];
      const age = diffDays(today, last.date);
      if (last.amount > prev.amount && age >= 0 && age <= 60) {
        alerts.push({
          key: `price:${s.id}:${last.date}`,
          severity: 'info',
          title: `${s.name} raised its price`,
          detail: `Up ${Math.round(((last.amount - prev.amount) / prev.amount) * 100)}% since ${prev.date.slice(0, 7)}.`,
          date: last.date,
          amount: last.amount,
          ref: { kind: 'subscription', id: s.id },
          action: 'Review',
        });
      }
    }
  }

  for (const d of data.documents) {
    const st = documentStatus(d, today);
    if (st === 'expired' && d.expiresOn) {
      alerts.push({
        key: `docexp:${d.id}:${d.expiresOn}`,
        severity: 'critical',
        title: `${d.holder}'s ${d.name} has expired`,
        detail: `Expired ${-diffDays(d.expiresOn, today)} days ago.`,
        date: d.expiresOn,
        ref: { kind: 'document', id: d.id },
        action: 'Renew',
      });
    } else if (st === 'renew_now' && d.expiresOn) {
      const n = diffDays(d.expiresOn, today);
      alerts.push({
        key: `docrenew:${d.id}:${d.expiresOn}`,
        severity: n <= 14 ? 'critical' : 'warning',
        title: `Renew ${d.holder}'s ${d.name}`,
        detail: `Expires in ${n} days.`,
        date: d.expiresOn,
        ref: { kind: 'document', id: d.id },
        action: 'Start renewal',
      });
    }
  }

  for (const p of data.purchases) {
    if (p.returned) continue;
    const rd = returnDeadline(p);
    if (rd) {
      const n = diffDays(rd, today);
      if (n >= 0 && n <= 7) {
        alerts.push({
          key: `return:${p.id}:${rd}`,
          severity: n <= 2 ? 'critical' : 'warning',
          title: `Return window for ${p.item} closes ${n === 0 ? 'today' : n === 1 ? 'tomorrow' : `in ${n} days`}`,
          detail: p.retailer ? `Bought at ${p.retailer}.` : 'Decide if you are keeping it.',
          date: rd,
          amount: p.price,
          ref: { kind: 'purchase', id: p.id },
          action: 'Decide',
        });
      }
    }
    const we = warrantyEnd(p);
    if (we) {
      const n = diffDays(we, today);
      if (n >= 0 && n <= 30) {
        alerts.push({
          key: `warranty:${p.id}:${we}`,
          severity: 'info',
          title: `${p.item} warranty ends in ${n} days`,
          detail: 'Check it over now and file any claims while covered.',
          date: we,
          ref: { kind: 'purchase', id: p.id },
          action: 'View',
        });
      }
    }
  }

  for (const t of data.tasks) {
    if (t.done || !t.dueDate) continue;
    const n = diffDays(t.dueDate, today);
    if (n < 0) {
      alerts.push({
        key: `taskover:${t.id}:${t.dueDate}`,
        severity: 'warning',
        title: `Overdue: ${t.title}`,
        detail: `Was due ${-n} day${n === -1 ? '' : 's'} ago.`,
        date: t.dueDate,
        ref: { kind: 'task', id: t.id },
        action: 'Open task',
      });
    }
  }

  const dismissed = new Set(data.dismissedAlerts.map((d) => d.key));
  return alerts
    .filter((a) => !dismissed.has(a.key))
    .sort(
      (a, b) =>
        SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || compareISO(a.date ?? '9999', b.date ?? '9999'),
    );
}

export interface CategorySpend {
  category: CategoryId;
  label: string;
  color: string;
  monthly: number;
  count: number;
}

export interface MonthForecast {
  month: ISODate;
  total: number;
  subscriptions: number;
  bills: number;
}

export interface Opportunity {
  key: string;
  kind: 'unused' | 'annual' | 'overlap' | 'trial' | 'price_increase';
  title: string;
  detail: string;
  yearlySavings: number;
  refIds: string[];
}

export interface Insights {
  monthly: number;
  yearly: number;
  subscriptionsMonthly: number;
  billsMonthly: number;
  activeCount: number;
  trialCount: number;
  trialExposure: number;
  byCategory: CategorySpend[];
  byOwner: { owner: string; monthly: number }[];
  forecast: MonthForecast[];
  opportunities: Opportunity[];
  potentialSavings: number;
  next30: number;
  cancelledSavingsYearly: number;
}

export function computeInsights(data: AppData, today: ISODate): Insights {
  const active = data.subscriptions.filter((s) => s.status === 'active');
  const trials = data.subscriptions.filter((s) => s.status === 'trial');
  const monthlyOf = (s: Subscription) => toMonthly(s.amount, s.cycle);

  const monthly = active.reduce((a, s) => a + monthlyOf(s), 0);
  const subscriptionsMonthly = active.filter((s) => s.kind === 'subscription').reduce((a, s) => a + monthlyOf(s), 0);
  const billsMonthly = active.filter((s) => s.kind === 'bill').reduce((a, s) => a + monthlyOf(s), 0);

  const catMap = new Map<CategoryId, CategorySpend>();
  for (const s of active) {
    const m = categoryMeta(s.category);
    const cur = catMap.get(s.category) ?? { category: s.category, label: m.label, color: m.color, monthly: 0, count: 0 };
    cur.monthly += monthlyOf(s);
    cur.count += 1;
    catMap.set(s.category, cur);
  }
  const byCategory = [...catMap.values()].sort((a, b) => b.monthly - a.monthly);

  const ownerMap = new Map<string, number>();
  for (const s of active) {
    const o = s.owner?.trim() || 'Shared';
    ownerMap.set(o, (ownerMap.get(o) ?? 0) + monthlyOf(s));
  }
  const byOwner = [...ownerMap.entries()].map(([owner, m]) => ({ owner, monthly: m })).sort((a, b) => b.monthly - a.monthly);

  const forecast: MonthForecast[] = [];
  let cursor = startOfMonth(today);
  for (let i = 0; i < 12; i++) {
    const end = endOfMonth(cursor);
    let subs = 0;
    let bills = 0;
    for (const s of data.subscriptions) {
      const n = chargesBetween(s, cursor, end).length;
      if (!n) continue;
      if (s.kind === 'bill') bills += n * s.amount;
      else subs += n * s.amount;
    }
    forecast.push({ month: cursor, subscriptions: round2(subs), bills: round2(bills), total: round2(subs + bills) });
    cursor = addMonths(cursor, 1, 1);
  }

  const next30 = data.subscriptions.reduce(
    (a, s) => a + chargesBetween(s, today, addDays(today, 29)).length * s.amount,
    0,
  );

  const opportunities: Opportunity[] = [];
  for (const s of active) {
    if (s.usage === 'rarely') {
      opportunities.push({
        key: `unused:${s.id}`,
        kind: 'unused',
        title: `Cancel ${s.name}?`,
        detail: `You marked it as barely used. It costs ${round2(toYearly(s.amount, s.cycle))} a year.`,
        yearlySavings: round2(toYearly(s.amount, s.cycle)),
        refIds: [s.id],
      });
    }
    if (s.annualPrice && s.cycle !== 'yearly') {
      const diff = toYearly(s.amount, s.cycle) - s.annualPrice;
      if (diff > 0.5) {
        opportunities.push({
          key: `annual:${s.id}`,
          kind: 'annual',
          title: `Switch ${s.name} to annual billing`,
          detail: `Paying yearly is cheaper than paying ${s.cycle}.`,
          yearlySavings: round2(diff),
          refIds: [s.id],
        });
      }
    }
    if (s.priceHistory.length >= 2) {
      const sorted = [...s.priceHistory].sort((a, b) => compareISO(a.date, b.date));
      const first = sorted[0];
      const last = sorted[sorted.length - 1];
      if (last.amount > first.amount && s.usage !== 'rarely') {
        opportunities.push({
          key: `price:${s.id}`,
          kind: 'price_increase',
          title: `${s.name} costs more than when you joined`,
          detail: `Ask for a loyalty rate or look for a cheaper plan.`,
          yearlySavings: round2((last.amount - first.amount) * (toYearly(1, s.cycle))),
          refIds: [s.id],
        });
      }
    }
  }

  const overlapCats: CategoryId[] = ['streaming', 'music', 'cloud', 'news'];
  for (const cat of overlapCats) {
    const group = active.filter((s) => s.category === cat && s.usage !== 'rarely');
    if (group.length >= 2) {
      const cheapest = [...group].sort((a, b) => monthlyOf(a) - monthlyOf(b))[0];
      const names = group.map((g) => g.name);
      opportunities.push({
        key: `overlap:${cat}:${group.map((g) => g.id).sort().join(',')}`,
        kind: 'overlap',
        title: `${group.length} ${categoryMeta(cat).label.toLowerCase()} services overlap`,
        detail: `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}. Rotating them could save money.`,
        yearlySavings: round2(toYearly(cheapest.amount, cheapest.cycle)),
        refIds: group.map((g) => g.id),
      });
    }
  }

  for (const s of trials) {
    opportunities.push({
      key: `trial:${s.id}`,
      kind: 'trial',
      title: `Decide on the ${s.name} trial`,
      detail: s.trialEndsOn ? `Converts to paid on ${s.trialEndsOn}.` : 'Set an end date so you get reminded.',
      yearlySavings: round2(toYearly(s.amount, s.cycle)),
      refIds: [s.id],
    });
  }

  opportunities.sort((a, b) => b.yearlySavings - a.yearlySavings);
  const counted = new Set<string>();
  let potentialSavings = 0;
  for (const o of opportunities) {
    if (o.kind === 'trial' || o.kind === 'overlap') continue;
    const id = o.refIds[0];
    if (counted.has(id)) continue;
    counted.add(id);
    potentialSavings += o.yearlySavings;
  }

  const cancelledSavingsYearly = data.subscriptions
    .filter((s) => s.status === 'cancelled')
    .reduce((a, s) => a + toYearly(s.amount, s.cycle), 0);

  return {
    monthly: round2(monthly),
    yearly: round2(monthly * 12),
    subscriptionsMonthly: round2(subscriptionsMonthly),
    billsMonthly: round2(billsMonthly),
    activeCount: active.length,
    trialCount: trials.length,
    trialExposure: round2(trials.reduce((a, s) => a + monthlyOf(s), 0)),
    byCategory,
    byOwner,
    forecast,
    opportunities,
    potentialSavings: round2(potentialSavings),
    next30: round2(next30),
    cancelledSavingsYearly: round2(cancelledSavingsYearly),
  };
}

export interface HealthReport {
  score: number;
  grade: 'Excellent' | 'Good' | 'Needs attention' | 'At risk';
  factors: { label: string; impact: number; ok: boolean }[];
}

export function computeHealth(data: AppData, today: ISODate): HealthReport {
  const factors: HealthReport['factors'] = [];
  const expired = data.documents.filter((d) => documentStatus(d, today) === 'expired').length;
  const renewing = data.documents.filter((d) => documentStatus(d, today) === 'renew_now').length;
  const noExpiry = data.documents.filter((d) => !d.expiresOn && d.type !== 'other' && d.type !== 'membership').length;
  const overdue = data.tasks.filter((t) => !t.done && t.dueDate && compareISO(t.dueDate, today) < 0).length;
  const trialsSoon = data.subscriptions.filter(
    (s) => s.status === 'trial' && s.trialEndsOn && diffDays(s.trialEndsOn, today) <= 7 && diffDays(s.trialEndsOn, today) >= 0,
  ).length;
  const trialsNoDate = data.subscriptions.filter((s) => s.status === 'trial' && !s.trialEndsOn).length;
  const unused = data.subscriptions.filter((s) => s.status === 'active' && s.usage === 'rarely').length;
  const returnsSoon = data.purchases.filter((p) => {
    const rd = returnDeadline(p);
    return !p.returned && rd && diffDays(rd, today) >= 0 && diffDays(rd, today) <= 3;
  }).length;

  const add = (label: string, count: number, per: number, cap: number) => {
    const impact = Math.min(cap, count * per);
    factors.push({ label, impact: -impact, ok: count === 0 });
    return impact;
  };

  let penalty = 0;
  penalty += add(expired ? `${expired} expired document${expired > 1 ? 's' : ''}` : 'No expired documents', expired, 15, 30);
  penalty += add(renewing ? `${renewing} document${renewing > 1 ? 's' : ''} due for renewal` : 'Renewals under control', renewing, 6, 18);
  penalty += add(overdue ? `${overdue} overdue task${overdue > 1 ? 's' : ''}` : 'No overdue tasks', overdue, 5, 15);
  penalty += add(trialsSoon ? `${trialsSoon} trial${trialsSoon > 1 ? 's' : ''} ending this week` : 'No trials about to convert', trialsSoon, 6, 12);
  penalty += add(trialsNoDate ? `${trialsNoDate} trial${trialsNoDate > 1 ? 's' : ''} without an end date` : 'Every trial has an end date', trialsNoDate, 5, 10);
  penalty += add(unused ? `${unused} barely-used subscription${unused > 1 ? 's' : ''}` : 'Paying only for what you use', unused, 4, 12);
  penalty += add(returnsSoon ? `${returnsSoon} return window${returnsSoon > 1 ? 's' : ''} closing` : 'No return windows closing', returnsSoon, 4, 8);
  penalty += add(noExpiry ? `${noExpiry} document${noExpiry > 1 ? 's' : ''} missing an expiry date` : 'Every ID has an expiry date', noExpiry, 3, 9);

  const score = Math.max(0, Math.min(100, 100 - penalty));
  const grade: HealthReport['grade'] =
    score >= 90 ? 'Excellent' : score >= 75 ? 'Good' : score >= 55 ? 'Needs attention' : 'At risk';
  return { score, grade, factors };
}
