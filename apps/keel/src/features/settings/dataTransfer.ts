import { todayISO } from '@/lib/dates';
import { nextChargeDate } from '@/lib/engine';
import { categoryMeta, cycleMeta, statusMeta } from '@/lib/meta';
import { round2, toMonthly, toYearly } from '@/lib/money';
import type { AppData } from '@/lib/types';

export function downloadFile(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportBackup(data: AppData): string {
  const name = `keel-backup-${todayISO()}.json`;
  downloadFile(name, JSON.stringify({ ...data, exportedAt: new Date().toISOString(), app: 'keel' }, null, 2), 'application/json');
  return name;
}

function csvCell(v: string | number | boolean | undefined | null): string {
  if (v === undefined || v === null) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function subscriptionsCSV(data: AppData): string {
  const today = todayISO();
  const header = [
    'Name',
    'Type',
    'Category',
    'Status',
    'Amount',
    'Currency',
    'Billing cycle',
    'Monthly equivalent',
    'Yearly equivalent',
    'Next charge',
    'Trial ends',
    'Autopay',
    'Payment method',
    'Owner',
    'Usage',
    'Website',
    'Notes',
  ];
  const rows = [...data.subscriptions]
    .sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name))
    .map((s) => [
      s.name,
      s.kind === 'bill' ? 'Bill' : 'Subscription',
      categoryMeta(s.category).label,
      statusMeta(s.status).label,
      s.amount.toFixed(2),
      data.settings.currency,
      cycleMeta(s.cycle).label,
      round2(toMonthly(s.amount, s.cycle)).toFixed(2),
      round2(toYearly(s.amount, s.cycle)).toFixed(2),
      nextChargeDate(s, today) ?? '',
      s.trialEndsOn ?? '',
      s.autopay ? 'Yes' : 'No',
      s.paymentMethod ?? '',
      s.owner ?? '',
      s.usage ?? '',
      s.url ?? '',
      s.notes ?? '',
    ]);
  return [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n');
}

export function exportSubscriptionsCSV(data: AppData): string {
  const name = `keel-subscriptions-${todayISO()}.csv`;
  downloadFile(name, '﻿' + subscriptionsCSV(data), 'text/csv;charset=utf-8');
  return name;
}
