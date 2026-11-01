import { describe, expect, it } from 'vitest';
import { buildAlerts, buildTimeline, chargesBetween, computeHealth, computeInsights, nextChargeDate } from './engine';
import { emptyData, sampleData } from './sample';
import type { Subscription } from './types';

const base: Subscription = {
  id: 's1',
  kind: 'subscription',
  name: 'Test',
  category: 'streaming',
  amount: 10,
  cycle: 'monthly',
  anchorDate: '2026-01-15',
  status: 'active',
  autopay: true,
  priceHistory: [],
  createdAt: '',
  updatedAt: '',
};

describe('engine', () => {
  it('charges trials only after they end', () => {
    const s: Subscription = { ...base, status: 'trial', anchorDate: '2026-10-20', trialEndsOn: '2026-11-03' };
    expect(nextChargeDate(s, '2026-11-01')).toBe('2026-11-03');
    expect(chargesBetween(s, '2026-10-01', '2026-12-31')).toEqual(['2026-11-03', '2026-12-03']);
  });
  it('does not charge cancelled or paused subscriptions', () => {
    expect(chargesBetween({ ...base, status: 'cancelled' }, '2026-01-01', '2026-12-31')).toEqual([]);
    expect(nextChargeDate({ ...base, status: 'paused' }, '2026-01-01')).toBeNull();
  });
  it('computes insights over sample data', () => {
    const today = '2026-11-01';
    const ins = computeInsights(sampleData(today), today);
    expect(ins.monthly).toBeGreaterThan(2500);
    expect(ins.forecast).toHaveLength(12);
    expect(ins.opportunities.length).toBeGreaterThan(3);
    expect(ins.potentialSavings).toBeGreaterThan(0);
  });
  it('raises alerts and lowers health for sample problems', () => {
    const today = '2026-11-01';
    const data = sampleData(today);
    const alerts = buildAlerts(data, today);
    expect(alerts[0].severity).toBe('critical');
    expect(alerts.some((a) => a.title.includes('trial'))).toBe(true);
    expect(computeHealth(data, today).score).toBeLessThan(90);
    expect(computeHealth(emptyData(), today).score).toBe(100);
  });
  it('builds a sorted timeline', () => {
    const today = '2026-11-01';
    const ev = buildTimeline(sampleData(today), today, '2026-11-30', today);
    expect(ev.length).toBeGreaterThan(10);
    for (let i = 1; i < ev.length; i++) expect(ev[i - 1].date <= ev[i].date).toBe(true);
  });
});
