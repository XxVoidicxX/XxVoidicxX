import { useMemo } from 'react';
import { addDays } from '@/lib/dates';
import { buildAlerts, buildTimeline, computeHealth, computeInsights } from '@/lib/engine';
import { formatMoney } from '@/lib/money';
import { useData, useToday } from './store';

export function useInsights() {
  const data = useData();
  const today = useToday();
  return useMemo(() => computeInsights(data, today), [data, today]);
}

export function useAlerts() {
  const data = useData();
  const today = useToday();
  return useMemo(() => buildAlerts(data, today), [data, today]);
}

export function useHealth() {
  const data = useData();
  const today = useToday();
  return useMemo(() => computeHealth(data, today), [data, today]);
}

export function useTimeline(start: string, end: string) {
  const data = useData();
  const today = useToday();
  return useMemo(() => buildTimeline(data, start, end, today), [data, start, end, today]);
}

export function useUpcoming(days = 30) {
  const today = useToday();
  return useTimeline(today, addDays(today, days - 1));
}

export function useMoney() {
  const { settings } = useData();
  return useMemo(() => {
    const fn = (amount: number, opts?: { compact?: boolean; whole?: boolean }) =>
      formatMoney(amount, settings.currency, settings.locale, opts);
    return fn;
  }, [settings.currency, settings.locale]);
}
