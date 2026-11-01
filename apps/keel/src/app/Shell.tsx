import { useEffect, type ReactNode } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  Bell,
  CalendarDays,
  CheckSquare,
  CreditCard,
  FileText,
  LayoutDashboard,
  LineChart,
  Menu as MenuIcon,
  Package,
  Plus,
  Search,
  Settings as SettingsIcon,
  X,
} from 'lucide-react';
import { Button, Kbd, Menu, cx } from '@/components/ui';
import { ROUTES } from '@/lib/routes';
import { useAlerts } from '@/store/selectors';
import { useData } from '@/store/store';
import { useUI } from './ui';

const NAV = [
  { to: ROUTES.dashboard, label: 'Overview', icon: LayoutDashboard, end: true },
  { to: ROUTES.subscriptions, label: 'Subscriptions & bills', icon: CreditCard },
  { to: ROUTES.documents, label: 'Documents & IDs', icon: FileText },
  { to: ROUTES.purchases, label: 'Purchases & warranties', icon: Package },
  { to: ROUTES.calendar, label: 'Calendar', icon: CalendarDays },
  { to: ROUTES.insights, label: 'Insights', icon: LineChart },
  { to: ROUTES.tasks, label: 'Tasks', icon: CheckSquare },
];

export function Logo({ compact }: { compact?: boolean }) {
  return (
    <span className="logo">
      <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden>
        <rect width="32" height="32" rx="8" fill="var(--brand)" />
        <path d="M10 8.5v15M10 16.5l9.5-8M13.6 13.6l7.4 9.9" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </svg>
      {!compact && <span className="logo-word">Keel</span>}
    </span>
  );
}

function Sidebar() {
  const { tasks } = useData();
  const openTasks = tasks.filter((t) => !t.done).length;
  const { mobileNavOpen, setMobileNavOpen } = useUI();
  return (
    <>
      <div className={cx('sidebar-scrim', mobileNavOpen && 'is-open')} onClick={() => setMobileNavOpen(false)} aria-hidden />
      <nav className={cx('sidebar', mobileNavOpen && 'is-open')} aria-label="Main">
        <div className="sidebar-brand">
          <Logo />
          <button className="icon-close sidebar-close" onClick={() => setMobileNavOpen(false)} aria-label="Close menu">
            <X size={18} />
          </button>
        </div>
        <div className="sidebar-section">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => cx('nav-item', isActive && 'is-active')}>
              <n.icon size={18} strokeWidth={1.9} aria-hidden />
              <span className="nav-label">{n.label}</span>
              {n.to === ROUTES.tasks && openTasks > 0 && <span className="nav-count">{openTasks}</span>}
            </NavLink>
          ))}
        </div>
        <div className="sidebar-foot">
          <NavLink to={ROUTES.settings} className={({ isActive }) => cx('nav-item', isActive && 'is-active')}>
            <SettingsIcon size={18} strokeWidth={1.9} aria-hidden />
            <span className="nav-label">Settings</span>
          </NavLink>
          <div className="sidebar-note">
            <p className="sidebar-note-title">Private by design</p>
            <p className="sidebar-note-text">Everything stays on this device. No accounts, no tracking.</p>
          </div>
        </div>
      </nav>
    </>
  );
}

function Topbar() {
  const { openEditor, setPaletteOpen, setNotificationsOpen, setMobileNavOpen } = useUI();
  const alerts = useAlerts();
  const urgent = alerts.filter((a) => a.severity !== 'info').length;
  const { settings } = useData();
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
  const initials = (settings.displayName || 'You').slice(0, 1).toUpperCase();

  return (
    <header className="topbar">
      <Button variant="ghost" iconOnly icon={<MenuIcon size={20} />} className="topbar-menu" aria-label="Open menu" onClick={() => setMobileNavOpen(true)} />
      <span className="topbar-logo">
        <Logo compact />
      </span>
      <button type="button" className="topbar-search" onClick={() => setPaletteOpen(true)} aria-label="Search or jump to">
        <Search size={16} aria-hidden />
        <span className="topbar-search-text">Search or jump to…</span>
        <span className="topbar-search-kbd">
          <Kbd>{isMac ? '⌘' : 'Ctrl'}</Kbd>
          <Kbd>K</Kbd>
        </span>
      </button>
      <div className="spacer" />
      <Menu
        label="Add new"
        trigger={(p) => (
          <Button variant="primary" icon={<Plus size={16} />} {...p} className="topbar-add">
            <span className="hide-sm">Add new</span>
          </Button>
        )}
        items={[
          { label: 'Subscription or bill', icon: <CreditCard size={16} />, onSelect: () => openEditor({ kind: 'subscription' }) },
          { label: 'Document or ID', icon: <FileText size={16} />, onSelect: () => openEditor({ kind: 'document' }) },
          { label: 'Purchase or warranty', icon: <Package size={16} />, onSelect: () => openEditor({ kind: 'purchase' }) },
          { label: 'Task', icon: <CheckSquare size={16} />, onSelect: () => openEditor({ kind: 'task' }) },
        ]}
      />
      <button type="button" className="topbar-icon" aria-label={`Notifications${urgent ? `, ${urgent} need attention` : ''}`} onClick={() => setNotificationsOpen(true)}>
        <Bell size={19} strokeWidth={1.9} />
        {urgent > 0 && <span className="topbar-dot">{urgent > 9 ? '9+' : urgent}</span>}
      </button>
      <NavLink to={ROUTES.settings} className="avatar" aria-label="Your settings" title={settings.displayName || 'Settings'}>
        {initials}
      </NavLink>
    </header>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const { setPaletteOpen, setMobileNavOpen, paletteOpen } = useUI();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    setMobileNavOpen(false);
    window.scrollTo(0, 0);
  }, [location.pathname, setMobileNavOpen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen(!paletteOpen);
      } else if (!typing && e.key === '/' && !document.querySelector('[role="dialog"]')) {
        e.preventDefault();
        setPaletteOpen(true);
      } else if (!typing && e.altKey && /^[1-7]$/.test(e.key)) {
        navigate(NAV[Number(e.key) - 1].to);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setPaletteOpen, paletteOpen, navigate]);

  return (
    <div className="shell">
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      <Sidebar />
      <div className="shell-main">
        <Topbar />
        <main id="main" className="content" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}
