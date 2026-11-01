import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api, qs } from "./api";
import type { User, Paged } from "./types";

export function useUsers() {
  return useQuery({ queryKey: ["users"], queryFn: () => api.get<{ data: User[] }>("/api/users").then((r) => r.data), staleTime: 5 * 60_000 });
}

export function useDebounce<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

/** URL-synced list state: q, page, sort, dir + arbitrary filters. */
export function useListParams(defaults: { sort?: string; dir?: "asc" | "desc"; limit?: number } = {}) {
  const [sp, setSp] = useSearchParams();
  const page = Number(sp.get("page") || 1);
  const q = sp.get("q") || "";
  const sort = sp.get("sort") || defaults.sort || "";
  const dir = (sp.get("dir") as "asc" | "desc") || defaults.dir || "asc";
  const limit = Number(sp.get("limit") || defaults.limit || 25);
  const set = useCallback((patch: Record<string, string | number | null | undefined>, resetPage = true) => {
    setSp((prev) => {
      const next = new URLSearchParams(prev);
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined || v === null || v === "") next.delete(k);
        else next.set(k, String(v));
      }
      if (resetPage && !("page" in patch)) next.delete("page");
      return next;
    }, { replace: true });
  }, [setSp]);
  const toggleSort = useCallback((key: string) => {
    if (sort === key) set({ dir: dir === "asc" ? "desc" : "asc" }, false);
    else set({ sort: key, dir: "asc" }, false);
  }, [sort, dir, set]);
  const get = useCallback((k: string) => sp.get(k) || "", [sp]);
  const all = useMemo(() => Object.fromEntries(sp.entries()), [sp]);
  return { page, q, sort, dir, limit, set, toggleSort, get, all, setPage: (p: number) => set({ page: p }, false) };
}

export function usePagedQuery<T>(key: string, endpoint: string, params: Record<string, unknown>) {
  return useQuery({
    queryKey: [key, params],
    queryFn: () => api.get<Paged<T>>(`${endpoint}${qs(params)}`),
    placeholderData: (prev) => prev,
  });
}
