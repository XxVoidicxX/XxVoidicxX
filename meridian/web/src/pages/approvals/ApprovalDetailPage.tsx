import { useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Ban, CheckCircle2, Eye, FileQuestion, Lock, ShieldCheck, UserX, XCircle, type LucideIcon } from "lucide-react";
import { Avatar, Badge, Button, Card, CardHeader, DescriptionList, EmptyState, Modal, PageHeader, PageLoader, cn } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { LABELS, TONES, fmtDateTime, fmtRelative } from "@/lib/format";
import type { Role } from "@/lib/types";
import { DecisionModal, type Decision } from "@/components/approvals/DecisionModal";
import { CommentsThread } from "@/components/approvals/CommentsThread";
import { ApprovalTimeline } from "@/components/approvals/ApprovalTimeline";
import { EntitySummary } from "@/components/approvals/EntitySummary";
import { APPROVER_ROLES, PRIORITY_LABEL, ageHours, fmtDuration, invalidateAfterDecision, type ApprovalDetailRow } from "@/components/approvals/rules";

function Notice({ icon: Icon, tone, title, children }: { icon: LucideIcon; tone: "neutral" | "info" | "warning" | "success" | "danger"; title: ReactNode; children?: ReactNode }) {
  const cls = {
    neutral: "bg-ink-50 border-ink-200 text-ink-600",
    info: "bg-sky-50 border-sky-200 text-sky-700",
    warning: "bg-warning-50 border-amber-200 text-warning-700",
    success: "bg-success-50 border-emerald-200 text-success-700",
    danger: "bg-danger-50 border-red-200 text-danger-700",
  }[tone];
  return (
    <div className={cn("rounded-lg border p-3.5", cls)}>
      <div className="flex gap-2.5">
        <Icon className="h-4.5 w-4.5 shrink-0 mt-0.5" />
        <div className="min-w-0">
          <p className="text-sm font-semibold">{title}</p>
          {children && <div className="text-sm text-ink-600 mt-1">{children}</div>}
        </div>
      </div>
    </div>
  );
}

export default function ApprovalDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [decision, setDecision] = useState<Decision | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const q = useQuery({ queryKey: ["approvals", "detail", Number(id)], queryFn: () => api.get<{ data: ApprovalDetailRow }>(`/api/approvals/${id}`).then((r) => r.data), retry: (n, e) => !(e instanceof ApiError && e.status === 404) && n < 1 });

  const cancel = useMutation({
    mutationFn: () => api.post(`/api/approvals/${id}/cancel`),
    onSuccess: () => { toast("success", "Request cancelled", q.data?.title); setConfirmCancel(false); invalidateAfterDecision(qc, q.data?.entity_type); },
    onError: (e) => toast("error", "Could not cancel request", e instanceof ApiError ? e.message : undefined),
  });

  if (q.isLoading) return <PageLoader />;
  if (q.isError || !q.data) {
    const notFound = q.error instanceof ApiError && q.error.status === 404;
    return (
      <Card>
        <EmptyState icon={FileQuestion} title={notFound ? "Approval not found" : "Could not load approval"} description={notFound ? "It may have been removed, or the link is incorrect." : (q.error as Error | null)?.message} action={<Link to="/approvals"><Button variant="secondary" icon={ArrowLeft}>Back to approvals</Button></Link>} />
      </Card>
    );
  }

  const a = q.data;
  const roles: Role[] = a.approver_roles ?? APPROVER_ROLES[a.type] ?? [];
  const isRequester = a.requested_by === user?.id;
  const pending = a.status === "pending";
  const roleLabel = LABELS.role[user?.role ?? ""] ?? user?.role;
  const typeLabel = LABELS.approvalType[a.type];
  const approverList = roles.map((r) => LABELS.role[r]).join(" or ");
  const canCancel = pending && isRequester;

  let panel: ReactNode;
  if (a.can_decide) {
    panel = (
      <>
        <Notice icon={ShieldCheck} tone="info" title="Your decision is required">
          Your role ({roleLabel}) can decide {typeLabel.toLowerCase()} requests. Rejections require a reason.
        </Notice>
        <div className="grid grid-cols-2 gap-2 mt-4">
          <Button icon={CheckCircle2} onClick={() => setDecision("approved")} className="bg-success-600 hover:bg-success-700">Approve</Button>
          <Button variant="secondary" icon={XCircle} onClick={() => setDecision("rejected")} className="text-danger-700 hover:border-red-300 hover:bg-danger-50">Reject</Button>
        </div>
      </>
    );
  } else if (pending && isRequester) {
    panel = (
      <Notice icon={UserX} tone="warning" title="You raised this request">
        Segregation of duties prevents you from deciding your own request. It is awaiting a decision from a user with the {approverList} role.
      </Notice>
    );
  } else if (pending && user?.role === "auditor") {
    panel = <Notice icon={Eye} tone="neutral" title="Read-only access">Your role (Auditor) can review this request and its audit trail but cannot decide it.</Notice>;
  } else if (pending) {
    panel = (
      <Notice icon={Lock} tone="neutral" title="Awaiting another approver">
        Your role ({roleLabel}) cannot decide {typeLabel.toLowerCase()} requests. Only {approverList} users can approve it.
      </Notice>
    );
  } else if (a.status === "cancelled") {
    panel = <Notice icon={Ban} tone="neutral" title={`Cancelled on ${fmtDateTime(a.decided_at)}`}>The requester withdrew this request before a decision was made.</Notice>;
  } else {
    const approved = a.status === "approved";
    panel = (
      <Notice icon={approved ? CheckCircle2 : XCircle} tone={approved ? "success" : "danger"} title={`${approved ? "Approved" : "Rejected"} by ${a.approver_name ?? "an approver"}`}>
        <p className="text-xs text-ink-500">{fmtDateTime(a.decided_at)} · {fmtDuration(ageHours(a.created_at, a.decided_at))} after submission</p>
        {a.comment && <blockquote className="mt-2 border-l-2 border-current/30 pl-3 text-ink-700 whitespace-pre-wrap">{a.comment}</blockquote>}
      </Notice>
    );
  }

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Approvals", to: "/approvals" }, { label: `#${a.id}` }]}
        title={a.title}
        meta={
          <>
            <Badge tone="brand">{typeLabel}</Badge>
            <Badge tone={TONES.priority[a.priority]} dot>{PRIORITY_LABEL[a.priority]} priority</Badge>
            <Badge tone={TONES.approvalStatus[a.status]} dot>{LABELS.approvalStatus[a.status]}</Badge>
            <span className="inline-flex items-center gap-1.5 text-sm text-ink-500 ml-1">
              <Avatar name={a.requested_by_name} size="xs" />
              Requested by <span className="text-ink-800 font-medium">{a.requested_by_name}</span>
              <span title={fmtDateTime(a.created_at)}>{fmtRelative(a.created_at)}</span>
            </span>
            {a.decided_at && a.approver_name && (
              <span className="text-sm text-ink-500">· {a.status === "approved" ? "Approved" : "Rejected"} by <span className="text-ink-800 font-medium">{a.approver_name}</span> on {fmtDateTime(a.decided_at)}</span>
            )}
          </>
        }
        actions={canCancel ? <Button variant="secondary" icon={Ban} onClick={() => setConfirmCancel(true)}>Cancel request</Button> : undefined}
      />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6 min-w-0">
          <Card>
            <CardHeader title="Request" description={`Submitted ${fmtDateTime(a.created_at)}`} />
            {a.description ? <p className="text-sm text-ink-700 whitespace-pre-wrap leading-relaxed">{a.description}</p> : <p className="text-sm text-ink-400">No description was provided.</p>}
          </Card>
          <EntitySummary approval={a} />
          <CommentsThread entityType="approval" entityId={a.id} description="Questions and context between requester and approvers" />
        </div>
        <div className="space-y-6 min-w-0">
          <Card>
            <CardHeader title="Decision" />
            {panel}
            <DescriptionList cols={2} className="mt-5 pt-4 border-t border-ink-100" items={[
              { label: "Request ID", value: <span className="tnum">#{a.id}</span> },
              { label: pending ? "Waiting" : "Turnaround", value: <span className="tnum">{fmtDuration(pending ? ageHours(a.created_at) : ageHours(a.created_at, a.decided_at))}</span> },
              { label: "Approver roles", value: <div className="flex flex-wrap gap-1">{roles.map((r) => <Badge key={r} size="xs" tone={r === user?.role ? "brand" : "neutral"}>{LABELS.role[r]}</Badge>)}</div> },
              { label: "Vendor", value: a.vendor_name ? (a.vendor_id ? <Link to={`/vendors/${a.vendor_id}`} className="text-brand-700 hover:underline">{a.vendor_name}</Link> : a.vendor_name) : "—" },
            ]} />
          </Card>
          <ApprovalTimeline approval={a} />
        </div>
      </div>
      <DecisionModal approval={a} decision={decision} onClose={() => setDecision(null)} />
      <Modal
        open={confirmCancel}
        onClose={() => !cancel.isPending && setConfirmCancel(false)}
        title="Cancel this request?"
        description="The request will be withdrawn and the linked record returned to its previous state."
        size="sm"
        footer={<><Button variant="secondary" onClick={() => setConfirmCancel(false)} disabled={cancel.isPending}>Keep request</Button><Button variant="danger" icon={Ban} loading={cancel.isPending} onClick={() => cancel.mutate()}>Cancel request</Button></>}
      >
        <p className="text-sm text-ink-700"><span className="font-medium">{a.title}</span> will move to <Badge tone="neutral" size="xs">Cancelled</Badge>. This is recorded in the audit log.</p>
      </Modal>
    </>
  );
}
