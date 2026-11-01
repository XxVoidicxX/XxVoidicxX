import {
  Award,
  BookUser,
  Car,
  FileText,
  Fingerprint,
  HeartPulse,
  IdCard,
  Plane,
  ShieldCheck,
  Ticket,
  type LucideIcon,
} from 'lucide-react';
import { addDays, addMonths, compareISO, diffDays } from '@/lib/dates';
import { documentStatus, renewalWindowStart, type DocStatus } from '@/lib/engine';
import type { Tone } from '@/lib/meta';
import type { DocumentItem, DocumentType, ISODate } from '@/lib/types';

export const DOC_ICONS: Record<DocumentType, LucideIcon> = {
  passport: BookUser,
  drivers_license: IdCard,
  national_id: Fingerprint,
  vehicle_registration: Car,
  insurance_policy: ShieldCheck,
  health_card: HeartPulse,
  visa: Plane,
  membership: Ticket,
  professional_license: Award,
  other: FileText,
};

export const DOC_STATUS: Record<DocStatus, { label: string; tone: Tone; rank: number }> = {
  expired: { label: 'Expired', tone: 'danger', rank: 0 },
  renew_now: { label: 'Renew now', tone: 'warning', rank: 1 },
  ok: { label: 'Valid', tone: 'success', rank: 2 },
  no_expiry: { label: 'No expiry', tone: 'muted', rank: 3 },
};

export function barTone(st: DocStatus): 'danger' | 'warning' | 'success' | 'brand' {
  if (st === 'expired') return 'danger';
  if (st === 'renew_now') return 'warning';
  return 'success';
}

export const TYPICAL_VALIDITY_MONTHS: Record<DocumentType, number> = {
  passport: 120,
  drivers_license: 60,
  national_id: 120,
  vehicle_registration: 12,
  insurance_policy: 12,
  health_card: 12,
  visa: 24,
  membership: 12,
  professional_license: 24,
  other: 12,
};

export function suggestedRenewalExpiry(d: DocumentItem, today: ISODate): ISODate {
  if (d.issuedOn && d.expiresOn && compareISO(d.expiresOn, d.issuedOn) > 0) {
    const days = diffDays(d.expiresOn, d.issuedOn);
    return addDays(today, days);
  }
  return addMonths(today, TYPICAL_VALIDITY_MONTHS[d.type]);
}

export function sortDocs(docs: DocumentItem[], today: ISODate): DocumentItem[] {
  return [...docs].sort((a, b) => {
    const ra = DOC_STATUS[documentStatus(a, today)].rank;
    const rb = DOC_STATUS[documentStatus(b, today)].rank;
    if (ra !== rb) return ra - rb;
    if (a.expiresOn && b.expiresOn) return compareISO(a.expiresOn, b.expiresOn);
    return a.name.localeCompare(b.name);
  });
}

export interface Validity {
  pct: number;
  caption: string;
  hasIssued: boolean;
}

export function validity(d: DocumentItem, today: ISODate): Validity | null {
  if (!d.expiresOn) return null;
  const left = diffDays(d.expiresOn, today);
  if (left < 0) return { pct: 100, caption: `Expired ${-left} day${left === -1 ? '' : 's'} ago`, hasIssued: !!d.issuedOn };
  const leftText = left === 0 ? 'Expires today' : `${left.toLocaleString()} day${left === 1 ? '' : 's'} left`;
  if (d.issuedOn && compareISO(d.expiresOn, d.issuedOn) > 0) {
    const span = diffDays(d.expiresOn, d.issuedOn);
    const used = Math.max(0, Math.min(span, diffDays(today, d.issuedOn)));
    const pct = (used / span) * 100;
    return { pct, caption: `${Math.round(pct)}% used · ${leftText}`, hasIssued: true };
  }
  const horizon = Math.max(365, d.renewalLeadDays * 2);
  const pct = Math.max(0, Math.min(100, (1 - left / horizon) * 100));
  return { pct, caption: leftText, hasIssued: false };
}

export function statusSentence(d: DocumentItem, today: ISODate): string {
  const st = documentStatus(d, today);
  if (st === 'no_expiry' || !d.expiresOn) return 'This document has no expiry date saved, so Keel won’t remind you about it.';
  const n = diffDays(d.expiresOn, today);
  if (st === 'expired') return `Expired ${-n} day${n === -1 ? '' : 's'} ago. Renew it as soon as you can.`;
  const win = renewalWindowStart(d);
  if (st === 'renew_now') {
    return n === 0
      ? 'Expires today. Renew it now.'
      : `Expires in ${n} day${n === 1 ? '' : 's'}. Now is a good time to start the renewal.`;
  }
  const until = win ? diffDays(win, today) : n;
  return `Valid for ${n.toLocaleString()} more days. Keel will nudge you ${until.toLocaleString()} days from now, when it’s time to renew.`;
}

export const RENEWAL_TIPS: Record<DocumentType, string[]> = {
  passport: [
    'Get two new passport photos that meet the current size and background rules.',
    'Find the renewal form for your country (for example, DS-82 for U.S. mail-in renewals).',
    'Check the current fee and accepted payment methods.',
    'Allow around 6–8 weeks for routine processing, longer in peak travel season.',
    'Keep your old passport until the new one arrives, unless asked to send it in.',
    'Check that upcoming trips don’t need more validity left than you’ll have.',
  ],
  drivers_license: [
    'Check whether you can renew online or need an in-person appointment.',
    'Book a licensing office appointment early — slots can fill up weeks ahead.',
    'Be ready for a vision test and a new photo.',
    'Bring proof of identity and address if your office asks for it.',
    'Check the renewal fee and any late-renewal penalties.',
  ],
  national_id: [
    'Find out which office handles renewals and whether you need an appointment.',
    'Prepare a recent photo and your current ID.',
    'Bring proof of address if it has changed.',
    'Ask how long the new card takes and whether you get a temporary document.',
  ],
  vehicle_registration: [
    'Check if an emissions test or safety inspection is due first.',
    'Have proof of current insurance ready.',
    'Look for the renewal notice and any outstanding tickets or tolls.',
    'Renew online if you can, and keep the new sticker or card in the car.',
  ],
  insurance_policy: [
    'Review what changed in your coverage, deductible and premium.',
    'Compare at least two other quotes before you auto-renew.',
    'Update drivers, vehicles, address or dependants if anything changed.',
    'Save the new policy documents and proof-of-insurance cards.',
  ],
  health_card: [
    'Check whether renewal happens automatically or needs a form.',
    'Confirm your address and contact details are current.',
    'Ask for a temporary card if you have appointments coming up.',
  ],
  visa: [
    'Check how early you’re allowed to apply for an extension or renewal.',
    'Gather supporting documents: passport, photos, proof of status or employment.',
    'Book any required biometrics or interview appointment.',
    'Keep copies of everything you submit and your application receipt.',
  ],
  membership: [
    'Decide if you still use it enough to renew.',
    'Look for renewal discounts or a cheaper tier.',
    'Turn off auto-renew if you’re leaving.',
  ],
  professional_license: [
    'Check how many continuing-education hours you still need.',
    'Gather certificates for completed courses.',
    'Submit the renewal and fee before the deadline to avoid a lapse.',
    'Update your employer once the renewed license is issued.',
  ],
  other: [
    'Find out who issues it and how renewals work.',
    'Note what you’ll need to bring or send.',
    'Set aside time for processing before it expires.',
  ],
};
