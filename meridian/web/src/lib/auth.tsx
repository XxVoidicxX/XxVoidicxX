import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "./api";
import type { Role, User } from "./types";

interface AuthCtx {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  can: (...roles: Role[]) => boolean;
  canWrite: boolean;
}
const Ctx = createContext<AuthCtx | null>(null);
const WRITE_ROLES: Role[] = ["admin", "risk_analyst", "procurement", "vendor_owner"];

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    api.get<{ user: User }>("/api/auth/me").then((r) => setUser(r.user)).catch(() => setUser(null)).finally(() => setLoading(false));
    const onUnauth = () => setUser(null);
    window.addEventListener("meridian:unauthorized", onUnauth);
    return () => window.removeEventListener("meridian:unauthorized", onUnauth);
  }, []);
  const login = useCallback(async (email: string, password: string) => {
    const r = await api.post<{ user: User }>("/api/auth/login", { email, password });
    setUser(r.user);
  }, []);
  const logout = useCallback(async () => {
    await api.post("/api/auth/logout");
    setUser(null);
  }, []);
  const value = useMemo<AuthCtx>(() => ({
    user, loading, login, logout,
    can: (...roles: Role[]) => !!user && roles.includes(user.role),
    canWrite: !!user && WRITE_ROLES.includes(user.role),
  }), [user, loading, login, logout]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth outside AuthProvider");
  return c;
}
