import type { TimelineEvent } from '@/lib/types';
import { addDays } from '@/lib/dates';
import { EVENT_KINDS } from '@/lib/meta';

const encoder = new TextEncoder();

function escapeText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

function fold(line: string): string {
  const out: string[] = [];
  let current = '';
  let bytes = 0;
  for (const ch of line) {
    const size = encoder.encode(ch).length;
    const limit = out.length === 0 ? 75 : 74;
    if (bytes + size > limit) {
      out.push(current);
      current = '';
      bytes = 0;
    }
    current += ch;
    bytes += size;
  }
  out.push(current);
  return out.join('\r\n ');
}

function icsDate(iso: string): string {
  return iso.replace(/-/g, '');
}

function stamp(now: Date): string {
  return now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

export function buildICS(
  events: TimelineEvent[],
  formatAmount: (n: number) => string,
  now: Date = new Date(),
): string {
  const dtstamp = stamp(now);
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Keel//Life admin calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Keel',
    'X-WR-CALDESC:Charges\\, renewals and deadlines from Keel',
  ];
  for (const e of events) {
    const summary =
      e.kind === 'charge' && e.amount !== undefined ? `${e.title}: ${formatAmount(e.amount)} charge` : e.title;
    const description = [
      EVENT_KINDS[e.kind].label,
      e.subtitle,
      e.amount !== undefined && e.kind !== 'warranty_end' ? `Amount: ${formatAmount(e.amount)}` : undefined,
      'Added from Keel',
    ]
      .filter(Boolean)
      .join('\n');
    lines.push(
      'BEGIN:VEVENT',
      `UID:${e.key.replace(/[^A-Za-z0-9-]/g, '-')}@keel.local`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART;VALUE=DATE:${icsDate(e.date)}`,
      `DTEND;VALUE=DATE:${icsDate(addDays(e.date, 1))}`,
      `SUMMARY:${escapeText(summary)}`,
      `DESCRIPTION:${escapeText(description)}`,
      'TRANSP:TRANSPARENT',
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}

export function downloadText(filename: string, text: string, type: string) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 1000);
}
