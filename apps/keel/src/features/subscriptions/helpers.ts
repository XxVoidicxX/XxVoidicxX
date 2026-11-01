import { addDays, compareISO, diffDays, nextOccurrence } from '@/lib/dates';
import { chargesBetween, nextChargeDate } from '@/lib/engine';
import { toMonthly, toYearly } from '@/lib/money';
import type { CategoryId, Cycle, ISODate, PricePoint, Subscription } from '@/lib/types';

export interface ServicePreset {
  name: string;
  category: CategoryId;
  amount: number;
  cycle: Cycle;
  url?: string;
  cancelUrl?: string;
  annualPrice?: number;
}

export const SERVICE_PRESETS: ServicePreset[] = [
  { name: 'Netflix', category: 'streaming', amount: 17.99, cycle: 'monthly', url: 'https://www.netflix.com', cancelUrl: 'https://www.netflix.com/cancelplan' },
  { name: 'Spotify', category: 'music', amount: 11.99, cycle: 'monthly', url: 'https://www.spotify.com', cancelUrl: 'https://www.spotify.com/account/subscription/' },
  { name: 'Disney+', category: 'streaming', amount: 15.99, cycle: 'monthly', url: 'https://www.disneyplus.com', annualPrice: 159.99 },
  { name: 'YouTube Premium', category: 'streaming', amount: 13.99, cycle: 'monthly', url: 'https://www.youtube.com/premium', cancelUrl: 'https://www.youtube.com/paid_memberships' },
  { name: 'iCloud+', category: 'cloud', amount: 2.99, cycle: 'monthly', url: 'https://www.icloud.com' },
  { name: 'Amazon Prime', category: 'shopping', amount: 139, cycle: 'yearly', url: 'https://www.amazon.com/prime', cancelUrl: 'https://www.amazon.com/mc' },
  { name: 'Xbox Game Pass', category: 'gaming', amount: 29.99, cycle: 'monthly', url: 'https://www.xbox.com/xbox-game-pass' },
  { name: 'ChatGPT Plus', category: 'software', amount: 20, cycle: 'monthly', url: 'https://chatgpt.com' },
  { name: 'Apple Music', category: 'music', amount: 10.99, cycle: 'monthly', url: 'https://music.apple.com' },
  { name: 'Max', category: 'streaming', amount: 16.99, cycle: 'monthly', url: 'https://www.max.com' },
  { name: 'Hulu', category: 'streaming', amount: 9.99, cycle: 'monthly', url: 'https://www.hulu.com', annualPrice: 99.99 },
  { name: 'Google One', category: 'cloud', amount: 1.99, cycle: 'monthly', url: 'https://one.google.com', annualPrice: 19.99 },
  { name: 'Microsoft 365', category: 'software', amount: 99.99, cycle: 'yearly', url: 'https://www.microsoft.com/microsoft-365' },
  { name: 'Adobe Creative Cloud', category: 'software', amount: 59.99, cycle: 'monthly', url: 'https://www.adobe.com/creativecloud.html' },
];

export function monthlyCost(s: Pick<Subscription, 'amount' | 'cycle'>): number {
  return toMonthly(s.amount, s.cycle);
}

export function yearlyCost(s: Pick<Subscription, 'amount' | 'cycle'>): number {
  return toYearly(s.amount, s.cycle);
}

export function isLive(s: Subscription): boolean {
  return s.status === 'active' || s.status === 'trial';
}

export function scheduleDate(s: Subscription, today: ISODate): ISODate {
  return nextChargeDate(s, today) ?? nextOccurrence(s.anchorDate, s.cycle, today);
}

export function upcomingCharges(s: Subscription, today: ISODate, count = 6): ISODate[] {
  return chargesBetween(s, today, addDays(today, 366 * 3)).slice(0, count);
}

export function sortedHistory(s: Subscription): PricePoint[] {
  return [...s.priceHistory].sort((a, b) => compareISO(a.date, b.date));
}

export function priceChange(s: Subscription): { pct: number; from: PricePoint } | null {
  const h = sortedHistory(s);
  if (h.length < 2) return null;
  const first = h[0];
  const last = h[h.length - 1];
  if (first.amount <= 0 || first.amount === last.amount) return null;
  return { pct: ((last.amount - first.amount) / first.amount) * 100, from: first };
}

export function trialDaysLeft(s: Subscription, today: ISODate): number | null {
  if (s.status !== 'trial' || !s.trialEndsOn) return null;
  return diffDays(s.trialEndsOn, today);
}

export function currencySymbol(currency: string, locale: string): string {
  try {
    const part = new Intl.NumberFormat(locale, { style: 'currency', currency })
      .formatToParts(0)
      .find((p) => p.type === 'currency');
    return part?.value ?? currency;
  } catch {
    return currency;
  }
}

export function normalizeUrl(input: string): string {
  const v = input.trim();
  if (!v) return '';
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(v) ? v : `https://${v}`;
}

export function isValidUrl(input: string): boolean {
  try {
    const u = new URL(normalizeUrl(input));
    return (u.protocol === 'http:' || u.protocol === 'https:') && u.hostname.includes('.');
  } catch {
    return false;
  }
}

export function hostOf(url: string): string {
  try {
    return new URL(normalizeUrl(url)).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}
