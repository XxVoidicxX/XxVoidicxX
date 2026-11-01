import { addDays, addMonths, todayISO } from './dates';
import { uid, nowStamp } from './id';
import type { AppData, DocumentItem, Purchase, Settings, Subscription, Task } from './types';

export const SCHEMA_VERSION = 1;

export function defaultSettings(): Settings {
  return {
    displayName: '',
    currency: 'USD',
    locale: 'en-US',
    reminderDays: 7,
    weekStartsOn: 0,
    householdMembers: ['Me'],
    onboarded: false,
  };
}

export function emptyData(): AppData {
  return {
    version: SCHEMA_VERSION,
    subscriptions: [],
    documents: [],
    purchases: [],
    tasks: [],
    settings: defaultSettings(),
    dismissedAlerts: [],
  };
}

export function sampleData(today: string = todayISO()): AppData {
  const stamp = nowStamp();
  const d = (n: number) => addDays(today, n);
  const m = (n: number, day?: number) => addMonths(today, n, day);

  const sub = (p: Partial<Subscription> & Pick<Subscription, 'name' | 'category' | 'amount' | 'cycle' | 'anchorDate'>): Subscription => ({
    id: uid('sub_'),
    kind: 'subscription',
    status: 'active',
    autopay: true,
    priceHistory: [{ date: p.anchorDate, amount: p.amount }],
    createdAt: stamp,
    updatedAt: stamp,
    ...p,
  });

  const subscriptions: Subscription[] = [
    sub({ name: 'Netflix', category: 'streaming', amount: 17.99, cycle: 'monthly', anchorDate: d(-361 + 3), usage: 'often', owner: 'Shared', paymentMethod: 'Visa •• 4821', url: 'https://netflix.com', cancelUrl: 'https://www.netflix.com/cancelplan', priceHistory: [{ date: d(-358), amount: 15.49 }, { date: d(-40), amount: 17.99 }] }),
    sub({ name: 'Disney+', category: 'streaming', amount: 13.99, cycle: 'monthly', anchorDate: d(-200 + 9), usage: 'sometimes', owner: 'Shared', paymentMethod: 'Visa •• 4821', annualPrice: 139.99 }),
    sub({ name: 'Max', category: 'streaming', amount: 16.99, cycle: 'monthly', anchorDate: d(-95 + 1), usage: 'rarely', owner: 'Alex', paymentMethod: 'Apple Pay' }),
    sub({ name: 'Spotify Family', category: 'music', amount: 19.99, cycle: 'monthly', anchorDate: d(-700 + 12), usage: 'often', owner: 'Shared', paymentMethod: 'Mastercard •• 1190', priceHistory: [{ date: d(-688), amount: 16.99 }, { date: d(-150), amount: 19.99 }] }),
    sub({ name: 'iCloud+ 2TB', category: 'cloud', amount: 9.99, cycle: 'monthly', anchorDate: d(-500 + 6), usage: 'often', owner: 'Alex', paymentMethod: 'Apple Pay' }),
    sub({ name: 'Google One', category: 'cloud', amount: 2.99, cycle: 'monthly', anchorDate: d(-300 + 18), usage: 'sometimes', owner: 'Sam', paymentMethod: 'Visa •• 4821', annualPrice: 29.99 }),
    sub({ name: 'Adobe Lightroom', category: 'software', amount: 11.99, cycle: 'monthly', anchorDate: d(-120 + 2), usage: 'sometimes', owner: 'Sam', paymentMethod: 'Mastercard •• 1190', annualPrice: 119.88 }),
    sub({ name: 'Xbox Game Pass', category: 'gaming', amount: 19.99, cycle: 'monthly', anchorDate: d(-60 + 22), usage: 'often', owner: 'Maya', paymentMethod: 'Visa •• 4821' }),
    sub({ name: 'Peloton App', category: 'fitness', amount: 24, cycle: 'monthly', anchorDate: d(-150 + 14), usage: 'rarely', owner: 'Alex', paymentMethod: 'Visa •• 4821' }),
    sub({ name: 'NYT Digital', category: 'news', amount: 25, cycle: 'quarterly', anchorDate: d(-80 + 10), usage: 'sometimes', owner: 'Sam', paymentMethod: 'Mastercard •• 1190' }),
    sub({ name: 'Amazon Prime', category: 'shopping', amount: 139, cycle: 'yearly', anchorDate: d(-365 + 45), usage: 'often', owner: 'Shared', paymentMethod: 'Visa •• 4821' }),
    sub({ name: 'Duolingo Super', category: 'education', amount: 12.99, cycle: 'monthly', anchorDate: d(-12), status: 'trial', trialEndsOn: d(2), usage: 'sometimes', owner: 'Maya', paymentMethod: 'Apple Pay', cancelUrl: 'https://support.duolingo.com' }),
    sub({ name: 'Headspace', category: 'fitness', amount: 69.99, cycle: 'yearly', anchorDate: d(-20), status: 'trial', trialEndsOn: d(10), usage: 'rarely', owner: 'Sam' }),
    sub({ name: 'Hulu', category: 'streaming', amount: 9.99, cycle: 'monthly', anchorDate: d(-400), status: 'cancelled', cancelledOn: d(-45), owner: 'Shared' }),
    sub({ name: 'Audible', category: 'music', amount: 14.95, cycle: 'monthly', anchorDate: d(-300), status: 'paused', owner: 'Alex', notes: 'Paused for 3 months — resumes automatically.' }),

    sub({ kind: 'bill', name: 'Rent', category: 'housing', amount: 1850, cycle: 'monthly', anchorDate: m(-14, 1), autopay: false, owner: 'Shared', paymentMethod: 'Bank transfer', notes: 'Landlord: Parkside Property Mgmt' }),
    sub({ kind: 'bill', name: 'Electric — City Power', category: 'utilities', amount: 96.4, cycle: 'monthly', anchorDate: d(-300 + 4), owner: 'Shared', paymentMethod: 'Checking •• 0042' }),
    sub({ kind: 'bill', name: 'Fiber Internet', category: 'internet', amount: 70, cycle: 'monthly', anchorDate: d(-500 + 16), owner: 'Shared', paymentMethod: 'Checking •• 0042', priceHistory: [{ date: d(-500), amount: 55 }, { date: d(-30), amount: 70 }] }),
    sub({ kind: 'bill', name: 'Mobile plan (3 lines)', category: 'phone', amount: 120, cycle: 'monthly', anchorDate: d(-400 + 20), owner: 'Shared', paymentMethod: 'Visa •• 4821' }),
    sub({ kind: 'bill', name: 'Car insurance', category: 'insurance', amount: 612, cycle: 'semiannual', anchorDate: d(-180 + 26), owner: 'Alex', paymentMethod: 'Checking •• 0042', autopay: false }),
    sub({ kind: 'bill', name: "Renter's insurance", category: 'insurance', amount: 168, cycle: 'yearly', anchorDate: d(-365 + 70), owner: 'Shared', paymentMethod: 'Visa •• 4821' }),
    sub({ kind: 'bill', name: 'Car loan', category: 'transport', amount: 389, cycle: 'monthly', anchorDate: d(-600 + 8), owner: 'Alex', paymentMethod: 'Checking •• 0042' }),
    sub({ kind: 'bill', name: 'Gym membership', category: 'fitness', amount: 45, cycle: 'monthly', anchorDate: d(-250 + 5), owner: 'Sam', paymentMethod: 'Mastercard •• 1190', usage: 'often' }),
  ];

  const doc = (p: Partial<DocumentItem> & Pick<DocumentItem, 'type' | 'name' | 'holder'>): DocumentItem => ({
    id: uid('doc_'),
    renewalLeadDays: 30,
    createdAt: stamp,
    updatedAt: stamp,
    ...p,
  });

  const documents: DocumentItem[] = [
    doc({ type: 'passport', name: 'Passport', holder: 'Alex', issuer: 'U.S. Department of State', numberLast4: '7731', issuedOn: d(-3650 + 120), expiresOn: d(120), renewalLeadDays: 180, storedAt: 'Home safe' }),
    doc({ type: 'passport', name: 'Passport', holder: 'Maya', issuer: 'U.S. Department of State', numberLast4: '2208', issuedOn: d(-1825 + 400), expiresOn: d(400), renewalLeadDays: 180, storedAt: 'Home safe', notes: 'Child passports are only valid for 5 years.' }),
    doc({ type: 'drivers_license', name: "Driver's license", holder: 'Sam', issuer: 'State DMV', numberLast4: '5590', expiresOn: d(-6), renewalLeadDays: 60, storedAt: 'Wallet' }),
    doc({ type: 'drivers_license', name: "Driver's license", holder: 'Alex', issuer: 'State DMV', numberLast4: '1184', expiresOn: d(900), renewalLeadDays: 60, storedAt: 'Wallet' }),
    doc({ type: 'vehicle_registration', name: 'Honda Civic registration', holder: 'Alex', issuer: 'State DMV', expiresOn: d(21), renewalLeadDays: 30, storedAt: 'Glovebox' }),
    doc({ type: 'insurance_policy', name: 'Health insurance card', holder: 'Sam', issuer: 'BlueCross', numberLast4: '0917', expiresOn: d(62), renewalLeadDays: 45, notes: 'Open enrollment window — compare plans.' }),
    doc({ type: 'membership', name: 'Costco membership', holder: 'Shared', issuer: 'Costco', numberLast4: '3321', expiresOn: d(210), renewalLeadDays: 14 }),
    doc({ type: 'professional_license', name: 'Nursing license (RN)', holder: 'Sam', issuer: 'State Board of Nursing', numberLast4: '8842', expiresOn: d(340), renewalLeadDays: 90, notes: '24 CE hours required before renewal.' }),
    doc({ type: 'health_card', name: 'Vaccination record', holder: 'Maya', storedAt: 'Filing cabinet — Medical' }),
  ];

  const buy = (p: Partial<Purchase> & Pick<Purchase, 'item' | 'category' | 'price' | 'purchaseDate'>): Purchase => ({
    id: uid('buy_'),
    returnDays: 30,
    warrantyMonths: 12,
    createdAt: stamp,
    updatedAt: stamp,
    ...p,
  });

  const purchases: Purchase[] = [
    buy({ item: 'Noise-cancelling headphones', brand: 'Sony WH-1000XM6', category: 'electronics', retailer: 'Best Buy', price: 399.99, purchaseDate: d(-12), returnDays: 15, warrantyMonths: 12, serial: 'SN-4471-AX', receiptLocation: 'Email — Best Buy order #88213' }),
    buy({ item: 'Running shoes', brand: 'Brooks Ghost 17', category: 'clothing', retailer: 'REI', price: 149.95, purchaseDate: d(-25), returnDays: 30, warrantyMonths: 0, notes: 'REI members get 1 year to return.' }),
    buy({ item: 'Laptop', brand: 'MacBook Air 15"', category: 'electronics', retailer: 'Apple Store', price: 1499, purchaseDate: d(-340), returnDays: 14, warrantyMonths: 12, extendedWarrantyMonths: 24, serial: 'C02XK3JHMD6T', receiptLocation: 'Apple account' }),
    buy({ item: 'Washing machine', brand: 'LG WM4000', category: 'appliance', retailer: 'Home Depot', price: 899, purchaseDate: d(-350), returnDays: 30, warrantyMonths: 12, serial: '204KWAB0921', receiptLocation: 'Filing cabinet — Home' }),
    buy({ item: 'Standing desk', brand: 'Uplift V2', category: 'furniture', retailer: 'Uplift Desk', price: 749, purchaseDate: d(-500), returnDays: 30, warrantyMonths: 84 }),
    buy({ item: 'Cordless drill', brand: 'DeWalt 20V', category: 'tools', retailer: 'Lowe\'s', price: 179, purchaseDate: d(-800), returnDays: 90, warrantyMonths: 36 }),
    buy({ item: 'Air fryer', brand: 'Ninja AF101', category: 'appliance', retailer: 'Target', price: 119.99, purchaseDate: d(-5), returnDays: 90, warrantyMonths: 12 }),
    buy({ item: 'Kids bike', brand: 'Trek Precaliber 20', category: 'sports', retailer: 'Local bike shop', price: 329, purchaseDate: d(-40), returnDays: 0, warrantyMonths: 24 }),
  ];

  const task = (p: Partial<Task> & Pick<Task, 'title'>): Task => ({
    id: uid('task_'),
    done: false,
    priority: 'normal',
    createdAt: stamp,
    ...p,
  });

  const tasks: Task[] = [
    task({ title: "Book DMV appointment for Sam's license", dueDate: d(-1), priority: 'high', link: { kind: 'document', id: documents[2].id } }),
    task({ title: 'Cancel Duolingo trial or keep it?', dueDate: d(1), priority: 'high', link: { kind: 'subscription', id: subscriptions[11].id } }),
    task({ title: 'Decide whether to keep the Sony headphones', dueDate: d(2), link: { kind: 'purchase', id: purchases[0].id } }),
    task({ title: 'Renew Honda registration online', dueDate: d(14), link: { kind: 'document', id: documents[4].id } }),
    task({ title: 'Get passport photos for Alex', dueDate: d(20), priority: 'low', link: { kind: 'document', id: documents[0].id } }),
    task({ title: 'Call internet provider about price increase', dueDate: d(5), link: { kind: 'subscription', id: subscriptions[17].id } }),
    task({ title: 'Compare health plans during open enrollment', dueDate: d(30), priority: 'normal', link: { kind: 'document', id: documents[5].id } }),
    task({ title: 'Upload washer receipt', done: true, doneAt: stamp, priority: 'low', link: { kind: 'purchase', id: purchases[3].id } }),
  ];

  return {
    version: SCHEMA_VERSION,
    subscriptions,
    documents,
    purchases,
    tasks,
    settings: {
      ...defaultSettings(),
      displayName: 'Alex',
      householdMembers: ['Alex', 'Sam', 'Maya', 'Shared'],
      monthlyBudget: 3600,
      onboarded: true,
    },
    dismissedAlerts: [],
  };
}
