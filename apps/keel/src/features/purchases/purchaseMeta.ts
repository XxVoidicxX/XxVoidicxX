import { Armchair, Bike, Car, Hammer, Laptop, Package, Shirt, WashingMachine, type LucideIcon } from 'lucide-react';
import { addMonths, compareISO, diffDays } from '@/lib/dates';
import { purchaseStatus, returnDeadline, warrantyEnd, type CoverageStatus } from '@/lib/engine';
import type { Tone } from '@/lib/meta';
import type { ISODate, Purchase, PurchaseCategory } from '@/lib/types';

export const PURCHASE_ICONS: Record<PurchaseCategory, LucideIcon> = {
  electronics: Laptop,
  appliance: WashingMachine,
  furniture: Armchair,
  clothing: Shirt,
  tools: Hammer,
  vehicle: Car,
  sports: Bike,
  other: Package,
};

export const COVERAGE_META: Record<CoverageStatus, { label: string; tone: Tone }> = {
  returnable: { label: 'Returnable', tone: 'brand' },
  under_warranty: { label: 'Under warranty', tone: 'success' },
  expired: { label: 'Expired', tone: 'muted' },
  returned: { label: 'Returned', tone: 'neutral' },
  no_coverage: { label: 'No coverage', tone: 'muted' },
};

export function coverageBadge(p: Purchase, today: ISODate): { label: string; tone: Tone } {
  const st = purchaseStatus(p, today);
  const base = COVERAGE_META[st];
  if (st === 'returnable') {
    const rd = returnDeadline(p);
    if (rd && diffDays(rd, today) <= 7) return { label: 'Return closing', tone: 'warning' };
  }
  if (st === 'under_warranty') {
    const we = warrantyEnd(p);
    if (we && diffDays(we, today) <= 30) return { label: 'Warranty ending', tone: 'warning' };
  }
  return base;
}

export function manufacturerEnd(p: Purchase): ISODate | null {
  return p.warrantyMonths > 0 ? addMonths(p.purchaseDate, p.warrantyMonths) : null;
}

export function nextDeadline(p: Purchase, today: ISODate): ISODate | null {
  if (p.returned) return null;
  const candidates = [returnDeadline(p), warrantyEnd(p)].filter((d): d is ISODate => !!d && compareISO(d, today) >= 0);
  candidates.sort(compareISO);
  return candidates[0] ?? null;
}

export function monthsLabel(n: number): string {
  if (n % 12 === 0 && n >= 12) return `${n / 12} year${n === 12 ? '' : 's'}`;
  return `${n} month${n === 1 ? '' : 's'}`;
}

export function statusSentence(p: Purchase, today: ISODate, fmt: (iso: ISODate) => string): string {
  const st = purchaseStatus(p, today);
  const rd = returnDeadline(p);
  const we = warrantyEnd(p);
  const days = (iso: ISODate) => {
    const n = diffDays(iso, today);
    return n === 0 ? 'today' : n === 1 ? 'tomorrow' : `in ${n} days`;
  };
  switch (st) {
    case 'returned':
      return 'You returned this item. Undo if you kept it after all.';
    case 'returnable':
      return `You can still return it — the window closes ${days(rd!)} (${fmt(rd!)}).${we ? ` Warranty runs until ${fmt(we)}.` : ''}`;
    case 'under_warranty':
      return `The return window has closed, but it’s under warranty until ${fmt(we!)} (${days(we!)}).`;
    case 'no_coverage':
      return 'No return window or warranty was recorded for this item.';
    case 'expired':
      return `Coverage ended${we ? ` on ${fmt(we)}` : rd ? ` on ${fmt(rd)}` : ''}. Some card issuers extend warranties — worth checking before paying for repairs.`;
  }
}

export async function copyText(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    const ok = await navigator.clipboard.writeText(text).then(
      () => true,
      () => false,
    );
    if (ok) return true;
  }
  return legacyCopy(text);
}

function legacyCopy(text: string): boolean {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  document.body.removeChild(ta);
  return ok;
}
