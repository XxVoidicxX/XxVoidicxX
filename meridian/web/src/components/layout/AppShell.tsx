import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LayoutDashboard, Building2, FileText, ClipboardCheck, FolderOpen, AlertTriangle, CheckSquare, BarChart3, History, Settings, Search, Bell, LogOut, ChevronDown, Menu, X, Command } from "lucide-react";
import clsx from "clsx";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { LABELS, fmtRelative } from "@/lib/format";
import type { Notification } from "@/lib/types";
import { Avatar, Badge } from "@/components/ui";
import { CommandPalette } from "./CommandPalette";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/vendors", label: "Vendors", icon: Building2 },
  { to: "/contracts", label: "Contracts", icon: FileText },
  { to: "/assessments", label: "Assessments", icon: ClipboardCheck },
  { to: "/documents", label: "Documents", icon: FolderOpen },
  { to: "/findings", label: "Findings", icon: AlertTriangle },
  { to: "/approvals", label: "Approvals", icon: CheckSquare, badge: "approvals" },
  { to: "/reports", label: "Reports", icon: BarChart3 },
  { to: "/audit-log", label: "Audit Log", icon: History },
  { to: "/settings", label: "Settings", icon: Settings },
];

export function AppShell() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const qc = useQueryClient();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const userRef = useRef<HTMLDivElement>(null);

  const notifications = useQuery({ queryKey: ["notifications"], queryFn: () => api.get<{ data: Notification[]; unread: number }>("/api/notifications"), refetchInterval: 30_000 });
  const pendingApprovals = useQuery({ queryKey: ["approvals-badge"], queryFn: () => api.get<{ total: number }>("/api/approvals?status=pending&mine=true&limit=1"), refetchInterval: 60_000 });

  useEffect(() => { setMobileOpen(false); setNotifOpen(false); setUserOpen(false); }, [loc.pathname]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPaletteOpen((o) => !o); } };
    const onClick = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false);
      if (userRef.current && !userRef.current.contains(e.target as Node)) setUserOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("mousedown", onClick); };
  }, []);

  const markAll = async () => { await api.post("/api/notifications/read-all"); qc.invalidateQueries({ queryKey: ["notifications"] }); };
  const openNotif = async (n: Notification) => {
    if (!n.read) { await api.post(`/api/notifications/${n.id}/read`); qc.invalidateQueries({ queryKey: ["notifications"] }); }
    setNotifOpen(false);
    if (n.link) nav(n.link);
  };

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2.5 px-5 h-16 border-b border-ink-200">
        <span className="h-8 w-8 rounded-lg bg-brand-700 text-white flex items-center justify-center shadow-sm">
          <svg viewBox="0 0 32 32" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M8 22V10l8 7 8-7v12" /></svg>
        </span>
        <div className="leading-tight">
          <p className="text-[15px] font-semibold text-ink-900 tracking-tight">Meridian</p>
          <p className="text-[11px] text-ink-500 -mt-0.5">Third-Party Risk</p>
        </div>
        <button className="ml-auto lg:hidden text-ink-500" onClick={() => setMobileOpen(false)} aria-label="Close menu"><X className="h-5 w-5" /></button>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5" aria-label="Primary">
        {NAV.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => clsx("group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors", isActive ? "bg-brand-50 text-brand-700" : "text-ink-600 hover:bg-ink-100 hover:text-ink-900")}>
            {({ isActive }) => (
              <>
                <item.icon className={clsx("h-4.5 w-4.5 shrink-0", isActive ? "text-brand-600" : "text-ink-400 group-hover:text-ink-600")} />
                <span className="flex-1">{item.label}</span>
                {item.badge === "approvals" && (pendingApprovals.data?.total ?? 0) > 0 && <span className="rounded-full bg-brand-600 text-white text-[11px] font-semibold px-1.5 min-w-[20px] text-center tnum">{pendingApprovals.data!.total}</span>}
              </>
            )}
          </NavLink>
        ))}
      </nav>
      <div className="px-5 py-4 border-t border-ink-200 text-[11px] text-ink-400">
        <p>Meridian TPRM v0.1</p>
        <p className="mt-0.5">© 2026 Meridian Corp</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-full flex">
      <aside className="hidden lg:flex lg:w-60 lg:flex-col lg:fixed lg:inset-y-0 bg-white border-r border-ink-200 z-30">{sidebar}</aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-ink-900/40" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 bg-white shadow-pop">{sidebar}</aside>
        </div>
      )}
      <div className="flex-1 lg:pl-60 flex flex-col min-w-0">
        <header className="sticky top-0 z-20 h-16 bg-white/95 backdrop-blur border-b border-ink-200 flex items-center gap-3 px-4 sm:px-6">
          <button className="lg:hidden text-ink-600 p-1 rounded-md hover:bg-ink-100" onClick={() => setMobileOpen(true)} aria-label="Open menu"><Menu className="h-5 w-5" /></button>
          <button onClick={() => setPaletteOpen(true)} className="flex-1 max-w-xl flex items-center gap-2 h-9 rounded-md border border-ink-200 bg-ink-50 px-3 text-sm text-ink-500 hover:border-ink-300 hover:bg-white transition-colors focus-ring">
            <Search className="h-4 w-4" />
            <span className="flex-1 text-left">Search vendors, contracts, findings…</span>
            <kbd className="hidden sm:inline-flex items-center gap-0.5 rounded border border-ink-200 bg-white px-1.5 text-[11px] text-ink-500 font-medium"><Command className="h-3 w-3" />K</kbd>
          </button>
          <div className="ml-auto flex items-center gap-1">
            <div className="relative" ref={notifRef}>
              <button onClick={() => setNotifOpen((o) => !o)} className="relative p-2 rounded-md text-ink-500 hover:bg-ink-100 hover:text-ink-800 focus-ring" aria-label="Notifications">
                <Bell className="h-5 w-5" />
                {(notifications.data?.unread ?? 0) > 0 && <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-danger-600 ring-2 ring-white" />}
              </button>
              {notifOpen && (
                <div className="absolute right-0 mt-2 w-96 max-w-[calc(100vw-2rem)] rounded-xl border border-ink-200 bg-white shadow-pop animate-fade-in overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-ink-100">
                    <p className="text-sm font-semibold text-ink-900">Notifications</p>
                    {(notifications.data?.unread ?? 0) > 0 && <button onClick={markAll} className="text-xs text-brand-700 hover:underline">Mark all read</button>}
                  </div>
                  <ul className="max-h-96 overflow-y-auto divide-y divide-ink-100">
                    {notifications.data?.data.length ? notifications.data.data.map((n) => (
                      <li key={n.id}>
                        <button onClick={() => openNotif(n)} className={clsx("w-full text-left px-4 py-3 hover:bg-ink-50 flex gap-3", !n.read && "bg-brand-50/40")}>
                          <span className={clsx("mt-1.5 h-2 w-2 rounded-full shrink-0", n.read ? "bg-transparent" : "bg-brand-600")} />
                          <span className="min-w-0">
                            <p className="text-sm font-medium text-ink-900 truncate">{n.title}</p>
                            {n.body && <p className="text-xs text-ink-500 mt-0.5 line-clamp-2">{n.body}</p>}
                            <p className="text-[11px] text-ink-400 mt-1">{fmtRelative(n.created_at)}</p>
                          </span>
                        </button>
                      </li>
                    )) : <li className="px-4 py-8 text-center text-sm text-ink-500">You're all caught up.</li>}
                  </ul>
                </div>
              )}
            </div>
            <div className="relative" ref={userRef}>
              <button onClick={() => setUserOpen((o) => !o)} className="flex items-center gap-2 pl-2 pr-1.5 py-1 rounded-md hover:bg-ink-100 focus-ring">
                <Avatar name={user?.name} size="md" />
                <span className="hidden sm:block text-left leading-tight">
                  <span className="block text-sm font-medium text-ink-900">{user?.name}</span>
                  <span className="block text-[11px] text-ink-500">{LABELS.role[user?.role ?? ""]}</span>
                </span>
                <ChevronDown className="h-4 w-4 text-ink-400" />
              </button>
              {userOpen && (
                <div className="absolute right-0 mt-2 w-64 rounded-xl border border-ink-200 bg-white shadow-pop animate-fade-in p-1.5">
                  <div className="px-3 py-2.5">
                    <p className="text-sm font-medium text-ink-900">{user?.name}</p>
                    <p className="text-xs text-ink-500 truncate">{user?.email}</p>
                    <div className="mt-2"><Badge tone="brand">{LABELS.role[user?.role ?? ""]}</Badge></div>
                  </div>
                  <hr className="border-ink-100 my-1" />
                  <button onClick={() => logout().then(() => nav("/login"))} className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-ink-700 hover:bg-ink-100"><LogOut className="h-4 w-4" />Sign out</button>
                </div>
              )}
            </div>
          </div>
        </header>
        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6 max-w-[1600px] w-full mx-auto">
          <Outlet />
        </main>
      </div>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}
