import { emptyData, SCHEMA_VERSION, defaultSettings } from '@/lib/sample';
import type { AppData } from '@/lib/types';

export const STORAGE_KEY = 'keel:data';

export function migrate(raw: unknown): AppData {
  const base = emptyData();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Partial<AppData>;
  return {
    version: SCHEMA_VERSION,
    subscriptions: Array.isArray(r.subscriptions)
      ? r.subscriptions.map((s) => ({ ...s, priceHistory: Array.isArray(s.priceHistory) ? s.priceHistory : [] }))
      : [],
    documents: Array.isArray(r.documents) ? r.documents : [],
    purchases: Array.isArray(r.purchases) ? r.purchases : [],
    tasks: Array.isArray(r.tasks) ? r.tasks : [],
    settings: { ...defaultSettings(), ...(r.settings ?? {}) },
    dismissedAlerts: Array.isArray(r.dismissedAlerts) ? r.dismissedAlerts : [],
  };
}

export function loadData(): AppData {
  try {
    const text = localStorage.getItem(STORAGE_KEY);
    if (!text) return emptyData();
    return migrate(JSON.parse(text));
  } catch {
    return emptyData();
  }
}

export function saveData(data: AppData): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function validateImport(raw: unknown): { ok: true; data: AppData } | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'That file is not a Keel backup.' };
  const r = raw as Record<string, unknown>;
  const lists = ['subscriptions', 'documents', 'purchases', 'tasks'];
  if (!lists.some((k) => Array.isArray(r[k]))) return { ok: false, error: 'No subscriptions, documents, purchases or tasks were found in that file.' };
  return { ok: true, data: migrate(raw) };
}
