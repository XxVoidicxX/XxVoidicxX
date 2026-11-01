import type {
  CategoryId,
  Cycle,
  DocumentType,
  EventKind,
  Priority,
  PurchaseCategory,
  SubscriptionStatus,
  Usage,
} from './types';

export interface CategoryMeta {
  id: CategoryId;
  label: string;
  color: string;
  group: 'subscription' | 'bill';
}

export const CATEGORIES: CategoryMeta[] = [
  { id: 'streaming', label: 'Streaming & TV', color: '#2563eb', group: 'subscription' },
  { id: 'music', label: 'Music & Audio', color: '#7c3aed', group: 'subscription' },
  { id: 'software', label: 'Apps & Software', color: '#0891b2', group: 'subscription' },
  { id: 'cloud', label: 'Cloud Storage', color: '#0ea5e9', group: 'subscription' },
  { id: 'news', label: 'News & Reading', color: '#64748b', group: 'subscription' },
  { id: 'gaming', label: 'Gaming', color: '#c026d3', group: 'subscription' },
  { id: 'fitness', label: 'Health & Fitness', color: '#16a34a', group: 'subscription' },
  { id: 'education', label: 'Learning', color: '#ca8a04', group: 'subscription' },
  { id: 'shopping', label: 'Memberships', color: '#ea580c', group: 'subscription' },
  { id: 'utilities', label: 'Utilities', color: '#0d9488', group: 'bill' },
  { id: 'phone', label: 'Phone', color: '#4f46e5', group: 'bill' },
  { id: 'internet', label: 'Internet', color: '#0284c7', group: 'bill' },
  { id: 'insurance', label: 'Insurance', color: '#be123c', group: 'bill' },
  { id: 'housing', label: 'Rent & Housing', color: '#1e40af', group: 'bill' },
  { id: 'transport', label: 'Car & Transport', color: '#b45309', group: 'bill' },
  { id: 'finance', label: 'Loans & Finance', color: '#475569', group: 'bill' },
  { id: 'other', label: 'Other', color: '#94a3b8', group: 'subscription' },
];

const CATEGORY_MAP = new Map(CATEGORIES.map((c) => [c.id, c]));
export function categoryMeta(id: CategoryId): CategoryMeta {
  return CATEGORY_MAP.get(id) ?? CATEGORIES[CATEGORIES.length - 1];
}

export const CYCLES: { id: Cycle; label: string; short: string; adverb: string }[] = [
  { id: 'weekly', label: 'Weekly', short: '/wk', adverb: 'every week' },
  { id: 'monthly', label: 'Monthly', short: '/mo', adverb: 'every month' },
  { id: 'quarterly', label: 'Every 3 months', short: '/qtr', adverb: 'every 3 months' },
  { id: 'semiannual', label: 'Every 6 months', short: '/6mo', adverb: 'every 6 months' },
  { id: 'yearly', label: 'Yearly', short: '/yr', adverb: 'every year' },
];
export function cycleMeta(id: Cycle) {
  return CYCLES.find((c) => c.id === id) ?? CYCLES[1];
}

export const STATUSES: { id: SubscriptionStatus; label: string; tone: Tone }[] = [
  { id: 'active', label: 'Active', tone: 'success' },
  { id: 'trial', label: 'Free trial', tone: 'warning' },
  { id: 'paused', label: 'Paused', tone: 'neutral' },
  { id: 'cancelled', label: 'Cancelled', tone: 'muted' },
];
export function statusMeta(id: SubscriptionStatus) {
  return STATUSES.find((s) => s.id === id) ?? STATUSES[0];
}

export const USAGE: { id: Usage; label: string }[] = [
  { id: 'often', label: 'Use it often' },
  { id: 'sometimes', label: 'Use it sometimes' },
  { id: 'rarely', label: 'Barely use it' },
];

export const DOCUMENT_TYPES: { id: DocumentType; label: string; defaultLead: number }[] = [
  { id: 'passport', label: 'Passport', defaultLead: 180 },
  { id: 'drivers_license', label: "Driver's license", defaultLead: 60 },
  { id: 'national_id', label: 'ID card', defaultLead: 60 },
  { id: 'vehicle_registration', label: 'Vehicle registration', defaultLead: 30 },
  { id: 'insurance_policy', label: 'Insurance policy', defaultLead: 30 },
  { id: 'health_card', label: 'Health card', defaultLead: 30 },
  { id: 'visa', label: 'Visa / permit', defaultLead: 120 },
  { id: 'membership', label: 'Membership card', defaultLead: 14 },
  { id: 'professional_license', label: 'Professional license', defaultLead: 90 },
  { id: 'other', label: 'Other document', defaultLead: 30 },
];
export function documentTypeMeta(id: DocumentType) {
  return DOCUMENT_TYPES.find((d) => d.id === id) ?? DOCUMENT_TYPES[DOCUMENT_TYPES.length - 1];
}

export const PURCHASE_CATEGORIES: { id: PurchaseCategory; label: string }[] = [
  { id: 'electronics', label: 'Electronics' },
  { id: 'appliance', label: 'Home appliance' },
  { id: 'furniture', label: 'Furniture' },
  { id: 'clothing', label: 'Clothing & shoes' },
  { id: 'tools', label: 'Tools & garden' },
  { id: 'vehicle', label: 'Vehicle & parts' },
  { id: 'sports', label: 'Sports & outdoors' },
  { id: 'other', label: 'Other' },
];
export function purchaseCategoryMeta(id: PurchaseCategory) {
  return PURCHASE_CATEGORIES.find((c) => c.id === id) ?? PURCHASE_CATEGORIES[PURCHASE_CATEGORIES.length - 1];
}

export const PRIORITIES: { id: Priority; label: string }[] = [
  { id: 'high', label: 'High' },
  { id: 'normal', label: 'Normal' },
  { id: 'low', label: 'Low' },
];

export type Tone = 'brand' | 'success' | 'warning' | 'danger' | 'neutral' | 'muted' | 'info';

export const EVENT_KINDS: Record<EventKind, { label: string; tone: Tone }> = {
  charge: { label: 'Charge', tone: 'brand' },
  trial_end: { label: 'Trial ends', tone: 'warning' },
  doc_expiry: { label: 'Expires', tone: 'danger' },
  doc_renew_window: { label: 'Renewal window opens', tone: 'info' },
  return_deadline: { label: 'Return window closes', tone: 'warning' },
  warranty_end: { label: 'Warranty ends', tone: 'neutral' },
  task_due: { label: 'Task due', tone: 'info' },
};

export const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'INR', 'MXN', 'BRL', 'CHF', 'SEK', 'NZD'];
