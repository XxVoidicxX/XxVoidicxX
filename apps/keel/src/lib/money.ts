import type { Cycle } from './types';

const PER_YEAR: Record<Cycle, number> = {
  weekly: 52,
  monthly: 12,
  quarterly: 4,
  semiannual: 2,
  yearly: 1,
};

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function toYearly(amount: number, cycle: Cycle): number {
  return amount * PER_YEAR[cycle];
}

export function toMonthly(amount: number, cycle: Cycle): number {
  return toYearly(amount, cycle) / 12;
}

export function cyclesPerYear(cycle: Cycle): number {
  return PER_YEAR[cycle];
}

const cache = new Map<string, Intl.NumberFormat>();

export function formatMoney(
  amount: number,
  currency = 'USD',
  locale = 'en-US',
  opts: { compact?: boolean; whole?: boolean } = {},
): string {
  const key = `${locale}|${currency}|${opts.compact ? 1 : 0}|${opts.whole ? 1 : 0}`;
  let f = cache.get(key);
  if (!f) {
    try {
      f = new Intl.NumberFormat(locale, {
        style: 'currency',
        currency,
        notation: opts.compact ? 'compact' : 'standard',
        minimumFractionDigits: opts.whole ? 0 : 2,
        maximumFractionDigits: opts.whole ? 0 : 2,
      });
    } catch {
      f = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
    }
    cache.set(key, f);
  }
  return f.format(Number.isFinite(amount) ? amount : 0);
}

export function parseAmount(input: string): number | null {
  const cleaned = input.replace(/[^0-9.,-]/g, '').replace(/,(?=\d{3}(\D|$))/g, '').replace(',', '.');
  if (cleaned === '' || cleaned === '-' || cleaned === '.') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? round2(n) : null;
}
