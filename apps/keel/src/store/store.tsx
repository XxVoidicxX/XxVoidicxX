import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, type ReactNode } from 'react';
import { todayISO } from '@/lib/dates';
import { nowStamp, uid } from '@/lib/id';
import { emptyData, sampleData } from '@/lib/sample';
import type { AppData, DocumentItem, Purchase, Settings, Subscription, Task } from '@/lib/types';
import { loadData, saveData } from './persistence';

type CollectionKey = 'subscriptions' | 'documents' | 'purchases' | 'tasks';
type ItemOf<K extends CollectionKey> = AppData[K][number];

type Action =
  | { type: 'upsert'; key: CollectionKey; item: ItemOf<CollectionKey> }
  | { type: 'remove'; key: CollectionKey; id: string }
  | { type: 'restore'; key: CollectionKey; item: ItemOf<CollectionKey>; index: number }
  | { type: 'settings'; patch: Partial<Settings> }
  | { type: 'dismiss'; key: string }
  | { type: 'undismissAll' }
  | { type: 'replace'; data: AppData };

function reducer(state: AppData, action: Action): AppData {
  switch (action.type) {
    case 'upsert': {
      const list = state[action.key] as ItemOf<CollectionKey>[];
      const idx = list.findIndex((x) => x.id === action.item.id);
      const next = idx === -1 ? [...list, action.item] : list.map((x, i) => (i === idx ? action.item : x));
      return { ...state, [action.key]: next };
    }
    case 'remove': {
      const list = state[action.key] as ItemOf<CollectionKey>[];
      const next: AppData = { ...state, [action.key]: list.filter((x) => x.id !== action.id) };
      if (action.key !== 'tasks') {
        next.tasks = next.tasks.map((t) => (t.link?.id === action.id ? { ...t, link: undefined } : t));
      }
      return next;
    }
    case 'restore': {
      const list = [...(state[action.key] as ItemOf<CollectionKey>[])];
      if (list.some((x) => x.id === action.item.id)) return state;
      list.splice(Math.min(action.index, list.length), 0, action.item);
      return { ...state, [action.key]: list };
    }
    case 'settings':
      return { ...state, settings: { ...state.settings, ...action.patch } };
    case 'dismiss':
      if (state.dismissedAlerts.some((d) => d.key === action.key)) return state;
      return { ...state, dismissedAlerts: [...state.dismissedAlerts, { key: action.key, at: nowStamp() }] };
    case 'undismissAll':
      return { ...state, dismissedAlerts: [] };
    case 'replace':
      return action.data;
  }
}

export interface RemovedSnapshot {
  key: CollectionKey;
  item: ItemOf<CollectionKey>;
  index: number;
}

export interface Actions {
  saveSubscription(input: Omit<Subscription, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Subscription;
  saveDocument(input: Omit<DocumentItem, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): DocumentItem;
  savePurchase(input: Omit<Purchase, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Purchase;
  saveTask(input: Omit<Task, 'id' | 'createdAt'> & { id?: string }): Task;
  toggleTask(id: string): void;
  remove(key: CollectionKey, id: string): RemovedSnapshot | null;
  restore(snapshot: RemovedSnapshot): void;
  updateSettings(patch: Partial<Settings>): void;
  dismissAlert(key: string): void;
  restoreAlerts(): void;
  replaceAll(data: AppData): void;
  loadSample(): void;
  resetAll(): void;
}

interface StoreValue {
  data: AppData;
  today: string;
  actions: Actions;
}

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ children, initial }: { children: ReactNode; initial?: AppData }) {
  const [data, dispatch] = useReducer(reducer, undefined, () => initial ?? loadData());
  const dataRef = useRef(data);
  dataRef.current = data;

  useEffect(() => {
    saveData(data);
  }, [data]);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'keel:data') dispatch({ type: 'replace', data: loadData() });
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const today = todayISO();

  const upsert = useCallback(
    <T extends { id?: string; createdAt?: string }>(key: CollectionKey, prefix: string, input: T, touch = true) => {
      const existing = input.id
        ? (dataRef.current[key] as ItemOf<CollectionKey>[]).find((x) => x.id === input.id)
        : undefined;
      const stamp = nowStamp();
      const item = {
        ...(existing ?? {}),
        ...input,
        id: input.id ?? uid(prefix),
        createdAt: existing?.createdAt ?? stamp,
        ...(touch ? { updatedAt: stamp } : {}),
      } as unknown as ItemOf<CollectionKey>;
      dispatch({ type: 'upsert', key, item });
      return item;
    },
    [],
  );

  const actions = useMemo<Actions>(
    () => ({
      saveSubscription: (input) => {
        const prev = input.id ? dataRef.current.subscriptions.find((s) => s.id === input.id) : undefined;
        let priceHistory = input.priceHistory ?? prev?.priceHistory ?? [];
        if (!prev && priceHistory.length === 0) priceHistory = [{ date: todayISO(), amount: input.amount }];
        if (prev && prev.amount !== input.amount) priceHistory = [...priceHistory, { date: todayISO(), amount: input.amount }];
        const cancelledOn =
          input.status === 'cancelled' ? input.cancelledOn ?? prev?.cancelledOn ?? todayISO() : undefined;
        return upsert('subscriptions', 'sub_', { ...input, priceHistory, cancelledOn }) as Subscription;
      },
      saveDocument: (input) => upsert('documents', 'doc_', input) as DocumentItem,
      savePurchase: (input) => upsert('purchases', 'buy_', input) as Purchase,
      saveTask: (input) => upsert('tasks', 'task_', input, false) as Task,
      toggleTask: (id) => {
        const t = dataRef.current.tasks.find((x) => x.id === id);
        if (!t) return;
        dispatch({
          type: 'upsert',
          key: 'tasks',
          item: { ...t, done: !t.done, doneAt: !t.done ? nowStamp() : undefined },
        });
      },
      remove: (key, id) => {
        const list = dataRef.current[key] as ItemOf<CollectionKey>[];
        const index = list.findIndex((x) => x.id === id);
        if (index === -1) return null;
        dispatch({ type: 'remove', key, id });
        return { key, item: list[index], index };
      },
      restore: (snap) => dispatch({ type: 'restore', key: snap.key, item: snap.item, index: snap.index }),
      updateSettings: (patch) => dispatch({ type: 'settings', patch }),
      dismissAlert: (key) => dispatch({ type: 'dismiss', key }),
      restoreAlerts: () => dispatch({ type: 'undismissAll' }),
      replaceAll: (next) => dispatch({ type: 'replace', data: next }),
      loadSample: () => dispatch({ type: 'replace', data: sampleData() }),
      resetAll: () => dispatch({ type: 'replace', data: emptyData() }),
    }),
    [upsert],
  );

  const value = useMemo(() => ({ data, today, actions }), [data, today, actions]);
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside <StoreProvider>');
  return ctx;
}

export function useData(): AppData {
  return useStore().data;
}

export function useToday(): string {
  return useStore().today;
}

export function useActions(): Actions {
  return useStore().actions;
}
