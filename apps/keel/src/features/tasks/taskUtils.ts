import { addDays, addMonths, compareISO, diffDays, isValidISO, toISO, weekday } from '@/lib/dates';
import { categoryMeta } from '@/lib/meta';
import { refPath } from '@/lib/routes';
import type { AppData, ISODate, LinkedKind, Task, TaskLink } from '@/lib/types';

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const WEEKDAY_SHORT: Record<string, number> = {
  sun: 0,
  mon: 1,
  tue: 2,
  tues: 2,
  wed: 3,
  thu: 4,
  thur: 4,
  thurs: 4,
  fri: 5,
  sat: 6,
};

export interface ParsedTask {
  title: string;
  dueDate?: ISODate;
  matched?: string;
  unparsed?: string;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MONTH_RE = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const PREFIX = '(?:due\\s+|by\\s+|on\\s+|before\\s+)?';

function monthIndex(word: string): number {
  return MONTHS.indexOf(word.slice(0, 3).toLowerCase()) + 1;
}

function fullYear(y: string | undefined): number | null {
  if (!y) return null;
  const n = Number(y);
  return y.length <= 2 ? 2000 + n : n;
}

function resolveDate(today: ISODate, m: number, d: number, y: number | null): ISODate | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const year = y ?? Number(today.slice(0, 4));
  const iso = toISO(year, m, d);
  if (!isValidISO(iso) || Number(iso.slice(8, 10)) !== d) return null;
  if (y === null && compareISO(iso, today) < 0) {
    const next = toISO(year + 1, m, d);
    return isValidISO(next) ? next : null;
  }
  return iso;
}

const DATE_LIKE =
  /\b\d{4}-\d{1,2}-\d{1,2}\b|\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b|\b\d{1,2}(?:st|nd|rd|th)\b|\b(?:jan(?:uary)?|feb(?:ruary)?|march|apr(?:il)?|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b(?:\s+\d{1,2})?|\bnext\s+\w+day\b/i;

function nextWeekday(today: ISODate, target: number, forceNextWeek: boolean): ISODate {
  let delta = (target - weekday(today) + 7) % 7;
  if (delta === 0) delta = 7;
  if (forceNextWeek && delta < 7) delta += 7;
  return addDays(today, delta);
}

const NUMBER_WORDS: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};

export function parseQuickTask(input: string, today: ISODate, locale = 'en-US'): ParsedTask {
  const text = input.trim();
  const monthFirst = /^en-(US|CA|PH)$/i.test(locale) || locale.toLowerCase() === 'en';
  const rules: { re: RegExp; resolve: (m: RegExpMatchArray) => ISODate | null }[] = [
    {
      re: new RegExp(`\\b${PREFIX}(\\d{4})-(\\d{1,2})-(\\d{1,2})\\b`, 'i'),
      resolve: (m) => resolveDate(today, Number(m[2]), Number(m[3]), Number(m[1])),
    },
    {
      re: new RegExp(`\\b${PREFIX}(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MONTH_RE}\\.?(?:,?\\s+(\\d{4}))?\\b`, 'i'),
      resolve: (m) => resolveDate(today, monthIndex(m[2]), Number(m[1]), fullYear(m[3])),
    },
    {
      re: new RegExp(`\\b${PREFIX}${MONTH_RE}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?\\b`, 'i'),
      resolve: (m) => resolveDate(today, monthIndex(m[1]), Number(m[2]), fullYear(m[3])),
    },
    {
      re: new RegExp(`\\b${PREFIX}(\\d{1,2})/(\\d{1,2})(?:/(\\d{4}|\\d{2}))?\\b`, 'i'),
      resolve: (m) => {
        const a = Number(m[1]);
        const b = Number(m[2]);
        const y = fullYear(m[3]);
        if (a > 12 && b <= 12) return resolveDate(today, b, a, y);
        if (b > 12 && a <= 12) return resolveDate(today, a, b, y);
        return monthFirst ? resolveDate(today, a, b, y) : resolveDate(today, b, a, y);
      },
    },
    { re: /\b(?:due\s+|by\s+|on\s+)?(today|tonight)\b/i, resolve: () => today },
    { re: /\b(?:due\s+|by\s+|on\s+)?(tomorrow|tmrw|tmr)\b/i, resolve: () => addDays(today, 1) },
    { re: /\b(?:due\s+|by\s+)?next\s+week\b/i, resolve: () => addDays(today, 7) },
    { re: /\b(?:due\s+|by\s+)?next\s+month\b/i, resolve: () => addMonths(today, 1) },
    {
      re: /\bin\s+(\d{1,3}|a|an|one|two|three|four|five|six|seven|eight|nine|ten)\s+(day|days|week|weeks|month|months)\b/i,
      resolve: (m) => {
        const raw = m[1].toLowerCase();
        const n = NUMBER_WORDS[raw] ?? Number(raw);
        if (!Number.isFinite(n) || n <= 0) return null;
        const unit = m[2].toLowerCase();
        if (unit.startsWith('day')) return addDays(today, n);
        if (unit.startsWith('week')) return addDays(today, n * 7);
        return addMonths(today, n);
      },
    },
    {
      re: /\b(?:due\s+|by\s+|on\s+)?(next\s+|this\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i,
      resolve: (m) => {
        const word = m[2].toLowerCase();
        const idx = WEEKDAYS.indexOf(word);
        const target = idx >= 0 ? idx : WEEKDAY_SHORT[word];
        if (target === undefined) return null;
        return nextWeekday(today, target, (m[1] ?? '').toLowerCase().startsWith('next'));
      },
    },
    {
      re: /\b(?:due\s+|by\s+|on\s+|(next\s+|this\s+))(sun|mon|tues|tue|wed|thurs|thur|thu|fri|sat)\b/i,
      resolve: (m) => {
        const target = WEEKDAY_SHORT[m[2].toLowerCase()];
        if (target === undefined) return null;
        return nextWeekday(today, target, (m[1] ?? '').toLowerCase().startsWith('next'));
      },
    },
  ];
  for (const rule of rules) {
    const m = text.match(rule.re);
    if (!m || m.index === undefined) continue;
    const due = rule.resolve(m);
    if (!due) continue;
    const title = (text.slice(0, m.index) + text.slice(m.index + m[0].length)).replace(/\s{2,}/g, ' ').replace(/\s+([,.;:!?])/g, '$1').trim();
    return { title: title || text, dueDate: due, matched: m[0].trim() };
  }
  const loose = text.match(DATE_LIKE);
  return loose ? { title: text, unparsed: loose[0].trim() } : { title: text };
}

export type TaskGroupId = 'overdue' | 'today' | 'week' | 'later' | 'none' | 'done';

export const GROUP_LABELS: Record<TaskGroupId, string> = {
  overdue: 'Overdue',
  today: 'Today',
  week: 'This week',
  later: 'Later',
  none: 'No date',
  done: 'Completed',
};

export function taskGroup(t: Task, today: ISODate): TaskGroupId {
  if (t.done) return 'done';
  if (!t.dueDate) return 'none';
  const n = diffDays(t.dueDate, today);
  if (n < 0) return 'overdue';
  if (n === 0) return 'today';
  if (n <= 7) return 'week';
  return 'later';
}

const PRIORITY_RANK = { high: 0, normal: 1, low: 2 } as const;

export function compareTasks(a: Task, b: Task): number {
  if (a.dueDate && b.dueDate) {
    const c = compareISO(a.dueDate, b.dueDate);
    if (c !== 0) return c;
  } else if (a.dueDate || b.dueDate) {
    return a.dueDate ? -1 : 1;
  }
  return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || a.title.localeCompare(b.title);
}

export interface ResolvedLink {
  kind: LinkedKind;
  id: string;
  name: string;
  kindLabel: string;
  color?: string;
  path: string;
}

export function resolveLink(data: AppData, link: TaskLink | undefined): ResolvedLink | null {
  if (!link) return null;
  const path = refPath({ kind: link.kind, id: link.id });
  if (link.kind === 'subscription') {
    const s = data.subscriptions.find((x) => x.id === link.id);
    if (!s) return null;
    return { ...link, name: s.name, kindLabel: s.kind === 'bill' ? 'Bill' : 'Subscription', color: categoryMeta(s.category).color, path };
  }
  if (link.kind === 'document') {
    const d = data.documents.find((x) => x.id === link.id);
    if (!d) return null;
    const name = d.holder && d.holder !== 'Shared' && !d.name.includes(d.holder) ? `${d.holder}'s ${d.name}` : d.name;
    return { ...link, name, kindLabel: 'Document', path };
  }
  const p = data.purchases.find((x) => x.id === link.id);
  if (!p) return null;
  return { ...link, name: p.item, kindLabel: 'Purchase', path };
}

export function encodeLink(link: TaskLink | undefined): string {
  return link ? `${link.kind}:${link.id}` : '';
}

export function decodeLink(value: string): TaskLink | undefined {
  const i = value.indexOf(':');
  if (i < 0) return undefined;
  const kind = value.slice(0, i) as LinkedKind;
  if (kind !== 'subscription' && kind !== 'document' && kind !== 'purchase') return undefined;
  return { kind, id: value.slice(i + 1) };
}
