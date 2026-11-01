import type { Cycle, ISODate } from './types';

const DAY_MS = 86_400_000;

export function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function toISO(y: number, m: number, d: number): ISODate {
  return `${y}-${pad(m)}-${pad(d)}`;
}

export function parts(iso: ISODate): [number, number, number] {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return [y, m, d];
}

export function isValidISO(iso: string | undefined | null): iso is ISODate {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const [y, m, d] = parts(iso);
  return m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m);
}

export function todayISO(now: Date = new Date()): ISODate {
  return toISO(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

function toUTC(iso: ISODate): number {
  const [y, m, d] = parts(iso);
  return Date.UTC(y, m - 1, d);
}

function fromUTC(ms: number): ISODate {
  const dt = new Date(ms);
  return toISO(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function addDays(iso: ISODate, n: number): ISODate {
  return fromUTC(toUTC(iso) + n * DAY_MS);
}

export function addMonths(iso: ISODate, n: number, anchorDay?: number): ISODate {
  const [y, m, d] = parts(iso);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  const day = Math.min(anchorDay ?? d, daysInMonth(ny, nm));
  return toISO(ny, nm, day);
}

export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((toUTC(a) - toUTC(b)) / DAY_MS);
}

export function compareISO(a: ISODate, b: ISODate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function minISO(a: ISODate, b: ISODate): ISODate {
  return a < b ? a : b;
}

export function maxISO(a: ISODate, b: ISODate): ISODate {
  return a > b ? a : b;
}

export function weekday(iso: ISODate): number {
  return new Date(toUTC(iso)).getUTCDay();
}

export const CYCLE_MONTHS: Record<Exclude<Cycle, 'weekly'>, number> = {
  monthly: 1,
  quarterly: 3,
  semiannual: 6,
  yearly: 12,
};

export function stepCycle(anchor: ISODate, cycle: Cycle, k: number): ISODate {
  if (cycle === 'weekly') return addDays(anchor, 7 * k);
  return addMonths(anchor, CYCLE_MONTHS[cycle] * k, parts(anchor)[2]);
}

export function nextOccurrence(anchor: ISODate, cycle: Cycle, from: ISODate): ISODate {
  if (compareISO(anchor, from) >= 0) return anchor;
  let k: number;
  if (cycle === 'weekly') {
    k = Math.ceil(diffDays(from, anchor) / 7);
  } else {
    const [ay, am] = parts(anchor);
    const [fy, fm] = parts(from);
    const months = (fy - ay) * 12 + (fm - am);
    k = Math.max(0, Math.floor(months / CYCLE_MONTHS[cycle]));
  }
  let d = stepCycle(anchor, cycle, k);
  while (compareISO(d, from) < 0) {
    k += 1;
    d = stepCycle(anchor, cycle, k);
  }
  return d;
}

export function occurrencesBetween(
  anchor: ISODate,
  cycle: Cycle,
  start: ISODate,
  end: ISODate,
  limit = 400,
): ISODate[] {
  const out: ISODate[] = [];
  let d = nextOccurrence(anchor, cycle, start);
  let guard = 0;
  while (compareISO(d, end) <= 0 && guard < limit) {
    out.push(d);
    d = nextOccurrence(anchor, cycle, addDays(d, 1));
    guard += 1;
  }
  return out;
}

export function startOfMonth(iso: ISODate): ISODate {
  const [y, m] = parts(iso);
  return toISO(y, m, 1);
}

export function endOfMonth(iso: ISODate): ISODate {
  const [y, m] = parts(iso);
  return toISO(y, m, daysInMonth(y, m));
}

export function monthMatrix(iso: ISODate, weekStartsOn: 0 | 1 = 0): ISODate[][] {
  const first = startOfMonth(iso);
  const offset = (weekday(first) - weekStartsOn + 7) % 7;
  let cursor = addDays(first, -offset);
  const weeks: ISODate[][] = [];
  for (let w = 0; w < 6; w++) {
    const row: ISODate[] = [];
    for (let i = 0; i < 7; i++) {
      row.push(cursor);
      cursor = addDays(cursor, 1);
    }
    weeks.push(row);
  }
  return weeks;
}

function asDate(iso: ISODate): Date {
  return new Date(toUTC(iso));
}

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function fmt(locale: string, opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = locale + JSON.stringify(opts);
  let f = fmtCache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(locale, { ...opts, timeZone: 'UTC' });
    fmtCache.set(key, f);
  }
  return f;
}

export type DateStyle = 'short' | 'medium' | 'long' | 'monthYear' | 'month' | 'weekday' | 'dayMonth';

export function formatDate(iso: ISODate | undefined, style: DateStyle = 'medium', locale = 'en-US'): string {
  if (!iso || !isValidISO(iso)) return '—';
  const d = asDate(iso);
  switch (style) {
    case 'short':
      return fmt(locale, { month: 'short', day: 'numeric' }).format(d);
    case 'medium':
      return fmt(locale, { month: 'short', day: 'numeric', year: 'numeric' }).format(d);
    case 'long':
      return fmt(locale, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(d);
    case 'monthYear':
      return fmt(locale, { month: 'long', year: 'numeric' }).format(d);
    case 'month':
      return fmt(locale, { month: 'short' }).format(d);
    case 'weekday':
      return fmt(locale, { weekday: 'short' }).format(d);
    case 'dayMonth':
      return fmt(locale, { weekday: 'short', month: 'short', day: 'numeric' }).format(d);
  }
}

export function relativeDays(iso: ISODate, today: ISODate = todayISO()): string {
  const n = diffDays(iso, today);
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  if (n === -1) return 'Yesterday';
  if (n > 1 && n < 14) return `In ${n} days`;
  if (n < -1 && n > -14) return `${-n} days ago`;
  if (n >= 14 && n < 60) return `In ${Math.round(n / 7)} weeks`;
  if (n <= -14 && n > -60) return `${Math.round(-n / 7)} weeks ago`;
  if (n >= 60 && n < 730) return `In ${Math.round(n / 30.44)} months`;
  if (n <= -60 && n > -730) return `${Math.round(-n / 30.44)} months ago`;
  const years = Math.round((Math.abs(n) / 365.25) * 10) / 10;
  return n > 0 ? `In ${years} years` : `${years} years ago`;
}
