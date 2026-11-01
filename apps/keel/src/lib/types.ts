export type ISODate = string;

export type Cycle = 'weekly' | 'monthly' | 'quarterly' | 'semiannual' | 'yearly';

export type CategoryId =
  | 'streaming'
  | 'music'
  | 'software'
  | 'cloud'
  | 'news'
  | 'gaming'
  | 'fitness'
  | 'utilities'
  | 'phone'
  | 'internet'
  | 'insurance'
  | 'housing'
  | 'transport'
  | 'finance'
  | 'education'
  | 'shopping'
  | 'other';

export type SubscriptionStatus = 'active' | 'trial' | 'paused' | 'cancelled';
export type Usage = 'often' | 'sometimes' | 'rarely';
export type RecurringKind = 'subscription' | 'bill';

export interface PricePoint {
  date: ISODate;
  amount: number;
}

export interface Subscription {
  id: string;
  kind: RecurringKind;
  name: string;
  category: CategoryId;
  amount: number;
  cycle: Cycle;
  anchorDate: ISODate;
  status: SubscriptionStatus;
  trialEndsOn?: ISODate;
  autopay: boolean;
  paymentMethod?: string;
  owner?: string;
  usage?: Usage;
  url?: string;
  cancelUrl?: string;
  annualPrice?: number;
  notes?: string;
  priceHistory: PricePoint[];
  cancelledOn?: ISODate;
  createdAt: string;
  updatedAt: string;
}

export type DocumentType =
  | 'passport'
  | 'drivers_license'
  | 'national_id'
  | 'vehicle_registration'
  | 'insurance_policy'
  | 'health_card'
  | 'visa'
  | 'membership'
  | 'professional_license'
  | 'other';

export interface DocumentItem {
  id: string;
  type: DocumentType;
  name: string;
  holder: string;
  issuer?: string;
  numberLast4?: string;
  issuedOn?: ISODate;
  expiresOn?: ISODate;
  renewalLeadDays: number;
  storedAt?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export type PurchaseCategory =
  | 'electronics'
  | 'appliance'
  | 'furniture'
  | 'clothing'
  | 'tools'
  | 'vehicle'
  | 'sports'
  | 'other';

export interface Purchase {
  id: string;
  item: string;
  brand?: string;
  category: PurchaseCategory;
  retailer?: string;
  price: number;
  purchaseDate: ISODate;
  returnDays: number;
  warrantyMonths: number;
  extendedWarrantyMonths?: number;
  serial?: string;
  receiptLocation?: string;
  returned?: boolean;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export type Priority = 'low' | 'normal' | 'high';
export type LinkedKind = 'subscription' | 'document' | 'purchase';

export interface TaskLink {
  kind: LinkedKind;
  id: string;
}

export interface Task {
  id: string;
  title: string;
  dueDate?: ISODate;
  done: boolean;
  doneAt?: string;
  priority: Priority;
  link?: TaskLink;
  notes?: string;
  createdAt: string;
}

export interface Settings {
  displayName: string;
  currency: string;
  locale: string;
  reminderDays: number;
  weekStartsOn: 0 | 1;
  householdMembers: string[];
  monthlyBudget?: number;
  onboarded: boolean;
}

export interface DismissedAlert {
  key: string;
  at: string;
}

export interface AppData {
  version: number;
  subscriptions: Subscription[];
  documents: DocumentItem[];
  purchases: Purchase[];
  tasks: Task[];
  settings: Settings;
  dismissedAlerts: DismissedAlert[];
}

export type EventKind =
  | 'charge'
  | 'trial_end'
  | 'doc_expiry'
  | 'doc_renew_window'
  | 'return_deadline'
  | 'warranty_end'
  | 'task_due';

export type Severity = 'info' | 'warning' | 'critical';

export interface TimelineEvent {
  key: string;
  kind: EventKind;
  date: ISODate;
  title: string;
  subtitle?: string;
  amount?: number;
  severity: Severity;
  ref: { kind: LinkedKind | 'task'; id: string };
}
