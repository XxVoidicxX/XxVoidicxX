import { addDays, addMonths, compareISO, diffDays, weekday } from '@/lib/dates';
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
}

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

export function parseQuickTask(input: string, today: ISODate): ParsedTask {
  const text = input.trim();
  const rules: { re: RegExp; resolve: (m: RegExpMatchArray) => ISODate | null }[] = [
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
  return { title: text };
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
