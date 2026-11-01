import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Bell,
  CalendarDays,
  ChartColumn,
  CircleCheck,
  Circle,
  CornerDownLeft,
  CreditCard,
  Download,
  FileSpreadsheet,
  FileText,
  History,
  LayoutDashboard,
  ListChecks,
  Package,
  Plus,
  Receipt,
  Search,
  Settings,
} from 'lucide-react';
import { useUI } from '@/app/ui';
import { Kbd, Monogram, cx, useToast } from '@/components/ui';
import { formatDate, relativeDays } from '@/lib/dates';
import { nextChargeDate } from '@/lib/engine';
import { categoryMeta, cycleMeta, documentTypeMeta, statusMeta } from '@/lib/meta';
import { ROUTES, refPath } from '@/lib/routes';
import { useMoney } from '@/store/selectors';
import { useData, useToday } from '@/store/store';
import { exportBackup, exportSubscriptionsCSV } from '@/features/settings/dataTransfer';
import './command.css';

const RECENT_KEY = 'keel:recent-pages';

interface PageDef {
  path: string;
  label: string;
  icon: ReactNode;
  keywords: string;
}

const PAGES: PageDef[] = [
  { path: ROUTES.dashboard, label: 'Overview', icon: <LayoutDashboard size={16} />, keywords: 'home dashboard summary' },
  { path: ROUTES.subscriptions, label: 'Subscriptions & bills', icon: <CreditCard size={16} />, keywords: 'recurring payments charges' },
  { path: ROUTES.documents, label: 'Documents & IDs', icon: <FileText size={16} />, keywords: 'passport license expiry renew' },
  { path: ROUTES.purchases, label: 'Purchases & warranties', icon: <Package size={16} />, keywords: 'returns receipts warranty' },
  { path: ROUTES.calendar, label: 'Calendar', icon: <CalendarDays size={16} />, keywords: 'schedule dates timeline' },
  { path: ROUTES.insights, label: 'Insights', icon: <ChartColumn size={16} />, keywords: 'spending savings forecast analytics' },
  { path: ROUTES.tasks, label: 'Tasks', icon: <ListChecks size={16} />, keywords: 'todo to-do reminders' },
  { path: ROUTES.settings, label: 'Settings', icon: <Settings size={16} />, keywords: 'preferences currency household backup import export' },
];

interface Command {
  id: string;
  group: string;
  title: string;
  subtitle?: string;
  meta?: string;
  icon: ReactNode;
  keywords?: string;
  run: () => void;
}

function score(query: string, text: string): number {
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  if (!q) return 1;
  if (t === q) return 100;
  if (t.startsWith(q)) return 80;
  const words = t.split(/[\s\-·&,'()/]+/);
  if (words.some((w) => w.startsWith(q))) return 60;
  const idx = t.indexOf(q);
  if (idx >= 0) return 40 - Math.min(idx, 20) / 2;
  const tokens = q.split(/\s+/).filter(Boolean);
  if (tokens.length > 1 && tokens.every((tok) => t.includes(tok))) return 30;
  let ti = 0;
  let gaps = 0;
  for (const ch of q) {
    const found = t.indexOf(ch, ti);
    if (found < 0) return 0;
    gaps += found - ti;
    ti = found + 1;
  }
  return q.length >= 3 && gaps <= q.length ? 18 - gaps : 0;
}

function readRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function useRecentPages(): string[] {
  const location = useLocation();
  const [recent, setRecent] = useState<string[]>(readRecent);
  useEffect(() => {
    const path = location.pathname;
    if (!PAGES.some((p) => p.path === path)) return;
    setRecent((prev) => {
      const next = [path, ...prev.filter((p) => p !== path)].slice(0, 5);
      try {
        localStorage.setItem(RECENT_KEY, JSON.stringify(next));
      } catch {
        return next;
      }
      return next;
    });
  }, [location.pathname]);
  return recent;
}

export function CommandPalette() {
  const { paletteOpen, setPaletteOpen } = useUI();
  const recent = useRecentPages();
  if (!paletteOpen) return null;
  return <Palette onClose={() => setPaletteOpen(false)} recent={recent} />;
}

function Palette({ onClose, recent }: { onClose: () => void; recent: string[] }) {
  const data = useData();
  const today = useToday();
  const money = useMoney();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const { openEditor, setNotificationsOpen } = useUI();
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const locale = data.settings.locale;

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    inputRef.current?.focus();
    return () => {
      document.body.style.overflow = prevOverflow;
      prev?.focus?.();
    };
  }, []);

  const go = (path: string) => {
    onClose();
    navigate(path);
  };

  const actions: Command[] = useMemo(
    () => [
      { id: 'a:sub', group: 'Actions', title: 'Add subscription', icon: <Plus size={16} />, keywords: 'new create streaming', run: () => openEditor({ kind: 'subscription' }) },
      { id: 'a:bill', group: 'Actions', title: 'Add bill', icon: <Receipt size={16} />, keywords: 'new create utility rent', run: () => openEditor({ kind: 'subscription', defaults: { kind: 'bill' } }) },
      { id: 'a:doc', group: 'Actions', title: 'Add document', icon: <FileText size={16} />, keywords: 'new create passport id license', run: () => openEditor({ kind: 'document' }) },
      { id: 'a:buy', group: 'Actions', title: 'Add purchase', icon: <Package size={16} />, keywords: 'new create warranty receipt', run: () => openEditor({ kind: 'purchase' }) },
      { id: 'a:task', group: 'Actions', title: 'Add task', icon: <ListChecks size={16} />, keywords: 'new create todo reminder', run: () => openEditor({ kind: 'task' }) },
      {
        id: 'a:export',
        group: 'Actions',
        title: 'Export backup',
        subtitle: 'Download all your data as JSON',
        icon: <Download size={16} />,
        keywords: 'save download json data',
        run: () => toast({ title: 'Backup downloaded', description: exportBackup(data) }),
      },
      {
        id: 'a:csv',
        group: 'Actions',
        title: 'Export subscriptions to CSV',
        icon: <FileSpreadsheet size={16} />,
        keywords: 'spreadsheet excel download',
        run: () => toast({ title: 'Spreadsheet downloaded', description: exportSubscriptionsCSV(data) }),
      },
      { id: 'a:notif', group: 'Actions', title: 'Show notifications', icon: <Bell size={16} />, keywords: 'alerts bell', run: () => setNotificationsOpen(true) },
    ],
    [openEditor, setNotificationsOpen, toast, data],
  );

  const pages: Command[] = useMemo(
    () =>
      PAGES.map((p) => ({
        id: `p:${p.path}`,
        group: 'Pages',
        title: `Go to ${p.label}`,
        icon: p.icon,
        keywords: `${p.label} ${p.keywords}`,
        meta: p.path === location.pathname ? 'Current' : undefined,
        run: () => go(p.path),
      })),
    [location.pathname],
  );

  const items: Command[] = useMemo(() => {
    const out: Command[] = [];
    for (const s of data.subscriptions) {
      const next = nextChargeDate(s, today);
      out.push({
        id: `s:${s.id}`,
        group: s.kind === 'bill' ? 'Bills' : 'Subscriptions',
        title: s.name,
        subtitle: `${money(s.amount)} ${cycleMeta(s.cycle).short} · ${s.status === 'active' || s.status === 'trial' ? (next ? `next ${formatDate(next, 'short', locale)}` : statusMeta(s.status).label) : statusMeta(s.status).label}`,
        icon: <Monogram name={s.name} color={categoryMeta(s.category).color} size={24} />,
        keywords: `${categoryMeta(s.category).label} ${s.owner ?? ''} ${s.paymentMethod ?? ''} ${s.status}`,
        run: () => go(refPath({ kind: 'subscription', id: s.id })),
      });
    }
    for (const d of data.documents) {
      out.push({
        id: `d:${d.id}`,
        group: 'Documents',
        title: d.holder && !d.name.includes(d.holder) && d.holder !== 'Shared' ? `${d.name} — ${d.holder}` : d.name,
        subtitle: d.expiresOn ? `${documentTypeMeta(d.type).label} · expires ${formatDate(d.expiresOn, 'medium', locale)}` : documentTypeMeta(d.type).label,
        icon: <FileText size={16} />,
        keywords: `${documentTypeMeta(d.type).label} ${d.holder} ${d.issuer ?? ''}`,
        run: () => go(refPath({ kind: 'document', id: d.id })),
      });
    }
    for (const p of data.purchases) {
      out.push({
        id: `b:${p.id}`,
        group: 'Purchases',
        title: p.item,
        subtitle: [p.brand, p.retailer, money(p.price)].filter(Boolean).join(' · '),
        icon: <Package size={16} />,
        keywords: `${p.brand ?? ''} ${p.retailer ?? ''} ${p.serial ?? ''}`,
        run: () => go(refPath({ kind: 'purchase', id: p.id })),
      });
    }
    for (const t of data.tasks) {
      out.push({
        id: `t:${t.id}`,
        group: 'Tasks',
        title: t.title,
        subtitle: t.done ? 'Done' : t.dueDate ? `Due ${relativeDays(t.dueDate, today).toLowerCase()}` : 'No due date',
        icon: t.done ? <CircleCheck size={16} /> : <Circle size={16} />,
        keywords: t.notes ?? '',
        run: () => openEditor({ kind: 'task', id: t.id }),
      });
    }
    return out;
  }, [data, today, money, locale, openEditor]);

  const groups = useMemo<{ name: string; items: Command[] }[]>(() => {
    const q = query.trim();
    if (!q) {
      const quick = ['a:sub', 'a:doc', 'a:task', 'a:export'].map((id) => actions.find((a) => a.id === id)).filter((a): a is Command => !!a);
      const recentCmds = recent
        .filter((p) => p !== location.pathname)
        .map((p) => pages.find((c) => c.id === `p:${p}`))
        .filter((c): c is Command => !!c)
        .map((c) => ({ ...c, group: 'Recent pages', icon: <History size={16} /> }));
      const fallback = recentCmds.length ? recentCmds : pages.filter((p) => p.id !== `p:${location.pathname}`).slice(0, 4).map((c) => ({ ...c, group: 'Jump to' }));
      return [
        { name: 'Quick actions', items: quick },
        { name: fallback[0]?.group ?? 'Jump to', items: fallback.slice(0, 4) },
      ].filter((g) => g.items.length);
    }
    const all = [...actions, ...pages, ...items];
    const scored = all
      .map((c) => ({ c, s: Math.max(score(q, c.title), score(q, c.keywords ?? '') * 0.6, score(q, c.subtitle ?? '') * 0.4) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s);
    const order = ['Subscriptions', 'Bills', 'Documents', 'Purchases', 'Tasks', 'Pages', 'Actions'];
    const map = new Map<string, { c: Command; s: number }[]>();
    for (const x of scored) {
      const list = map.get(x.c.group) ?? [];
      if (list.length < 6) list.push(x);
      map.set(x.c.group, list);
    }
    return [...map.entries()]
      .sort((a, b) => b[1][0].s - a[1][0].s || order.indexOf(a[0]) - order.indexOf(b[0]))
      .map(([name, list]) => ({ name, items: list.map((x) => x.c) }));
  }, [query, actions, pages, items, recent, location.pathname]);

  const flat: Command[] = groups.flatMap((g) => g.items);

  useEffect(() => setActiveIdx(0), [query]);

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${activeIdx}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIdx]);

  const run = (c: Command | undefined) => {
    if (!c) return;
    onClose();
    c.run();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => (flat.length ? (i + 1) % flat.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => (flat.length ? (i - 1 + flat.length) % flat.length : 0));
    } else if (e.key === 'Home' && !query) {
      e.preventDefault();
      setActiveIdx(0);
    } else if (e.key === 'End' && !query) {
      e.preventDefault();
      setActiveIdx(flat.length - 1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      run(flat[activeIdx]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onClose();
    } else if (e.key === 'Tab') {
      e.preventDefault();
    }
  };

  const activeId = flat[activeIdx] ? `cmd-${flat[activeIdx].id}` : undefined;
  let idx = -1;

  return createPortal(
    <div className="overlay overlay-center cmd-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="cmd" role="dialog" aria-modal="true" aria-label="Search and commands" onKeyDown={onKeyDown}>
        <div className="cmd-search">
          <Search size={18} aria-hidden />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search subscriptions, documents, tasks, or type a command…"
            role="combobox"
            aria-expanded="true"
            aria-controls="cmd-list"
            aria-activedescendant={activeId}
            aria-autocomplete="list"
            aria-label="Search or run a command"
            autoComplete="off"
            spellCheck={false}
          />
          <button type="button" className="cmd-esc" onClick={onClose} aria-label="Close">
            Esc
          </button>
        </div>
        <div className="cmd-list" id="cmd-list" role="listbox" ref={listRef} aria-label="Results">
          {flat.length === 0 ? (
            <div className="cmd-empty">
              <p className="cmd-empty-title">No matches for "{query}"</p>
              <p className="cmd-empty-desc">Try a name, a category like "streaming", or a person.</p>
            </div>
          ) : (
            groups.map((g) => (
              <div key={g.name} className="cmd-group" role="group" aria-labelledby={`cmd-g-${g.name}`}>
                <p className="cmd-group-title" id={`cmd-g-${g.name}`}>
                  {g.name}
                </p>
                {g.items.map((c) => {
                  idx += 1;
                  const i = idx;
                  return (
                    <div
                      key={c.id + g.name}
                      id={`cmd-${c.id}`}
                      data-idx={i}
                      role="option"
                      aria-selected={i === activeIdx}
                      className={cx('cmd-item', i === activeIdx && 'is-active')}
                      onMouseMove={() => i !== activeIdx && setActiveIdx(i)}
                      onClick={() => run(c)}
                    >
                      <span className="cmd-item-icon">{c.icon}</span>
                      <span className="cmd-item-text">
                        <span className="cmd-item-title truncate">{c.title}</span>
                        {c.subtitle && <span className="cmd-item-sub truncate">{c.subtitle}</span>}
                      </span>
                      {c.meta && <span className="cmd-item-meta">{c.meta}</span>}
                      <span className="cmd-item-enter" aria-hidden>
                        {g.name === 'Actions' || g.name === 'Quick actions' ? <CornerDownLeft size={14} /> : <ArrowRight size={14} />}
                      </span>
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>
        <div className="cmd-foot" aria-hidden>
          <span>
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> to navigate
          </span>
          <span>
            <Kbd>↵</Kbd> to open
          </span>
          <span>
            <Kbd>Esc</Kbd> to close
          </span>
          <span className="cmd-foot-count">{query ? `${flat.length} result${flat.length === 1 ? '' : 's'}` : ''}</span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
