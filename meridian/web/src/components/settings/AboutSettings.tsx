import { useQueries, useQuery } from "@tanstack/react-query";
import { CheckCircle2, KeyRound, RefreshCw, XCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { Avatar, Badge, Button, Card, CardHeader, DescriptionList, Skeleton } from "@/components/ui";
import { api } from "@/lib/api";
import { useUsers } from "@/lib/hooks";
import { fmtDateTime, fmtNumber } from "@/lib/format";
import pkg from "../../../package.json";
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from "./roles";
import { RoleBadge } from "./UsersSettings";

const COUNTS: { key: string; label: string; endpoint: string; to?: string }[] = [
  { key: "vendors", label: "Vendors", endpoint: "/api/vendors", to: "/vendors" },
  { key: "contracts", label: "Contracts", endpoint: "/api/contracts", to: "/contracts" },
  { key: "assessments", label: "Assessments", endpoint: "/api/assessments", to: "/assessments" },
  { key: "documents", label: "Documents", endpoint: "/api/documents", to: "/documents" },
  { key: "findings", label: "Findings", endpoint: "/api/findings", to: "/findings" },
  { key: "approvals", label: "Approvals", endpoint: "/api/approvals", to: "/approvals?tab=history" },
  { key: "activity", label: "Audit events", endpoint: "/api/activity", to: "/audit-log" },
];

interface Health { ok: boolean; service: string; time: string; latency: number }

export function AboutSettings() {
  const health = useQuery({
    queryKey: ["health"],
    queryFn: async (): Promise<Health> => {
      const t0 = performance.now();
      const r = await api.get<Omit<Health, "latency">>("/api/health");
      return { ...r, latency: Math.round(performance.now() - t0) };
    },
    refetchInterval: 30_000,
    retry: false,
  });
  const counts = useQueries({ queries: COUNTS.map((c) => ({ queryKey: ["about-count", c.key], queryFn: () => api.get<{ total: number }>(`${c.endpoint}?limit=1`).then((r) => r.total) })) });
  const templates = useQuery({ queryKey: ["assessment-templates", "list"], queryFn: () => api.get<{ data: unknown[] }>("/api/assessments/templates").then((r) => r.data) });
  const users = useUsers();
  const byEmail = new Map((users.data ?? []).map((u) => [u.email.toLowerCase(), u]));
  const up = health.data?.ok === true;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader title="Application" />
          <DescriptionList items={[
            { label: "Product", value: "Meridian · Third-Party Risk Management" },
            { label: "Version", value: <span className="font-mono text-xs">v{pkg.version}</span> },
            { label: "Web origin", value: <span className="font-mono text-xs">{window.location.host}</span> },
            { label: "API", value: <span className="font-mono text-xs">REST · same-origin /api</span> },
          ]} />
        </Card>
        <Card>
          <CardHeader title="API health" action={<Button variant="ghost" size="xs" icon={RefreshCw} loading={health.isFetching} onClick={() => health.refetch()}>Check</Button>} />
          {health.isLoading ? <Skeleton className="h-20" /> : (
            <>
              <div className="flex items-center gap-3 mb-4">
                <span className={up ? "h-10 w-10 rounded-full bg-success-50 text-success-600 flex items-center justify-center" : "h-10 w-10 rounded-full bg-danger-50 text-danger-600 flex items-center justify-center"}>
                  {up ? <CheckCircle2 className="h-5 w-5" /> : <XCircle className="h-5 w-5" />}
                </span>
                <div>
                  <p className="text-sm font-semibold text-ink-900">{up ? "All systems operational" : "API unreachable"}</p>
                  <p className="text-xs text-ink-500">{up ? `Responded in ${health.data!.latency} ms` : (health.error as Error | null)?.message ?? "No response"}</p>
                </div>
              </div>
              <DescriptionList items={[
                { label: "Service", value: <span className="font-mono text-xs">{health.data?.service ?? "—"}</span> },
                { label: "Server time", value: fmtDateTime(health.data?.time) },
              ]} />
            </>
          )}
        </Card>
      </div>
      <Card>
        <CardHeader title="Data summary" description="Record counts across the platform" />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {COUNTS.map((c, i) => (
            <Link key={c.key} to={c.to ?? "#"} className="rounded-lg border border-ink-200 px-3.5 py-3 hover:border-brand-200 hover:bg-brand-50/30 transition-colors focus-ring">
              <p className="text-xs font-medium uppercase tracking-wide text-ink-500">{c.label}</p>
              {counts[i].isLoading ? <Skeleton className="h-6 w-12 mt-1.5" /> : <p className="text-xl font-semibold text-ink-900 tnum mt-1">{fmtNumber(counts[i].data)}</p>}
            </Link>
          ))}
          <Link to="/settings?tab=users" className="rounded-lg border border-ink-200 px-3.5 py-3 hover:border-brand-200 hover:bg-brand-50/30 transition-colors focus-ring">
            <p className="text-xs font-medium uppercase tracking-wide text-ink-500">Users</p>
            {users.isLoading ? <Skeleton className="h-6 w-12 mt-1.5" /> : <p className="text-xl font-semibold text-ink-900 tnum mt-1">{fmtNumber(users.data?.length)}</p>}
          </Link>
          <Link to="/settings?tab=templates" className="rounded-lg border border-ink-200 px-3.5 py-3 hover:border-brand-200 hover:bg-brand-50/30 transition-colors focus-ring">
            <p className="text-xs font-medium uppercase tracking-wide text-ink-500">Templates</p>
            {templates.isLoading ? <Skeleton className="h-6 w-12 mt-1.5" /> : <p className="text-xl font-semibold text-ink-900 tnum mt-1">{fmtNumber(templates.data?.length)}</p>}
          </Link>
        </div>
      </Card>
      <Card padded={false}>
        <div className="p-5 pb-4">
          <h3 className="text-sm font-semibold text-ink-900 inline-flex items-center gap-2"><KeyRound className="h-4 w-4 text-ink-400" />Demo accounts</h3>
          <p className="text-sm text-ink-500 mt-0.5">All demo accounts share the password <code className="rounded bg-ink-100 px-1.5 py-0.5 font-mono text-xs text-ink-800">{DEMO_PASSWORD}</code></p>
        </div>
        <div className="overflow-x-auto border-t border-ink-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-ink-50/70 border-b border-ink-200 text-left">
                {["Account", "Email", "Role", "Use for", "Status"].map((h) => <th key={h} className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-ink-500">{h}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {DEMO_ACCOUNTS.map((a) => {
                const u = byEmail.get(a.email);
                return (
                  <tr key={a.email}>
                    <td className="px-4 py-2.5"><span className="inline-flex items-center gap-2 whitespace-nowrap"><Avatar name={a.name} size="sm" />{a.name}</span></td>
                    <td className="px-4 py-2.5 font-mono text-xs text-ink-600">{a.email}</td>
                    <td className="px-4 py-2.5"><RoleBadge role={u?.role ?? a.role} /></td>
                    <td className="px-4 py-2.5 text-ink-600">{a.note}</td>
                    <td className="px-4 py-2.5">{u ? (u.active ? <Badge tone="success" dot>Active</Badge> : <Badge dot>Inactive</Badge>) : <Badge tone="warning">Missing</Badge>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
