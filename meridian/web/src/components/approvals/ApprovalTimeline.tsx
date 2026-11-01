import { useQuery } from "@tanstack/react-query";
import { Ban, CheckCircle2, Circle, MessageSquare, Send, XCircle, type LucideIcon } from "lucide-react";
import { Card, CardHeader, Skeleton, cn } from "@/components/ui";
import { api } from "@/lib/api";
import { fmtDateTime, fmtRelative, parseDate } from "@/lib/format";
import type { Activity } from "@/lib/types";
import type { ApprovalDetailRow } from "./rules";

interface Event { key: string; action: string; actor: string | null; summary: string; at: string }
const ICON: Record<string, { icon: LucideIcon; cls: string }> = {
  submit: { icon: Send, cls: "bg-brand-50 text-brand-600 ring-brand-200" },
  approve: { icon: CheckCircle2, cls: "bg-success-50 text-success-600 ring-emerald-200" },
  reject: { icon: XCircle, cls: "bg-danger-50 text-danger-600 ring-red-200" },
  cancel: { icon: Ban, cls: "bg-ink-100 text-ink-500 ring-ink-200" },
  comment: { icon: MessageSquare, cls: "bg-sky-50 text-sky-600 ring-sky-200" },
};

export function ApprovalTimeline({ approval }: { approval: ApprovalDetailRow }) {
  const q = useQuery({
    queryKey: ["activity", "approval", approval.id],
    queryFn: () => api.get<{ data: Activity[] }>(`/api/activity?entity_type=approval&entity_id=${approval.id}&limit=100`).then((r) => r.data),
  });
  const log = q.data ?? [];
  const events: Event[] = log.map((a) => ({ key: `a${a.id}`, action: a.action, actor: a.actor_name, summary: a.summary, at: a.created_at }));
  if (!log.some((a) => a.action === "submit")) events.push({ key: "submitted", action: "submit", actor: approval.requested_by_name ?? null, summary: "Submitted request for approval", at: approval.created_at });
  if (approval.decided_at && !log.some((a) => ["approve", "reject", "cancel"].includes(a.action))) {
    const action = approval.status === "approved" ? "approve" : approval.status === "rejected" ? "reject" : "cancel";
    events.push({ key: "decided", action, actor: approval.status === "cancelled" ? approval.requested_by_name ?? null : approval.approver_name ?? null, summary: approval.status === "cancelled" ? "Cancelled the request" : `${approval.status === "approved" ? "Approved" : "Rejected"} the request${approval.comment ? `: ${approval.comment}` : ""}`, at: approval.decided_at });
  }
  events.sort((a, b) => (parseDate(b.at)?.getTime() ?? 0) - (parseDate(a.at)?.getTime() ?? 0));

  return (
    <Card>
      <CardHeader title="Timeline" description="Audit events for this request" />
      {q.isLoading ? (
        <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-10" />)}</div>
      ) : (
        <ol className="relative">
          {events.map((e, i) => {
            const meta = ICON[e.action] ?? { icon: Circle, cls: "bg-ink-100 text-ink-500 ring-ink-200" };
            const Icon = meta.icon;
            return (
              <li key={e.key} className="relative flex gap-3 pb-4 last:pb-0">
                {i < events.length - 1 && <span className="absolute left-[13px] top-7 bottom-0 w-px bg-ink-200" aria-hidden />}
                <span className={cn("relative z-10 h-7 w-7 shrink-0 rounded-full ring-1 ring-inset flex items-center justify-center", meta.cls)}><Icon className="h-3.5 w-3.5" /></span>
                <div className="min-w-0 pt-0.5">
                  <p className="text-sm text-ink-800 break-words"><span className="font-medium text-ink-900">{e.actor ?? "System"}</span> <span className="text-ink-600">{e.summary.charAt(0).toLowerCase() + e.summary.slice(1)}</span></p>
                  <p className="text-xs text-ink-500 mt-0.5" title={fmtDateTime(e.at)}>{fmtRelative(e.at)} · {fmtDateTime(e.at)}</p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}
