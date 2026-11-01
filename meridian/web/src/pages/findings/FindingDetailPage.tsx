import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2, ClipboardList, Clock, Edit3, ExternalLink, FileText, Hourglass, Play, RotateCcw, ShieldCheck, ShieldQuestion, XCircle } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { daysUntil, fmtDate, fmtRelative, LABELS, parseDate, TONES } from "@/lib/format";
import type { Approval, Finding, FindingDetail, FindingStatus } from "@/lib/types";
import { Badge, Button, Card, CardHeader, cn, DescriptionList, EmptyState, Field, Modal, PageHeader, PageLoader, Textarea } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { ActivityTimeline, CommentsThread, NotFoundState, parseQuestionRef, slaInfo, TierBadge, UserCell } from "@/components/assessments/common";
import { FindingFormModal } from "@/components/findings/FindingFormModal";
import { HeaderActions } from "@/components/contracts/shared";

function SlaCard({ f }: { f: FindingDetail }) {
  const resolved = f.status === "closed" || f.status === "risk_accepted";
  const accepted = f.status === "risk_accepted";
  const sla = slaInfo(f.due_date, resolved ? f.resolved_at ?? f.created_at : null, f.created_at, f.status);
  const created = parseDate(f.created_at);
  const due = parseDate(f.due_date);
  const end = resolved ? parseDate(f.resolved_at) ?? new Date() : new Date();
  const span = created && due ? due.getTime() - created.getTime() : 0;
  const elapsed = created ? end.getTime() - created.getTime() : 0;
  const pct = span > 0 ? Math.min(100, Math.max(0, (elapsed / span) * 100)) : 100;
  const d = daysUntil(f.due_date);
  const overdue = !resolved && d != null && d < 0;
  const bar = accepted ? "bg-sky-500" : resolved ? "bg-success-600" : overdue ? "bg-danger-600" : pct > 75 ? "bg-warning-600" : "bg-brand-500";
  const big = resolved ? sla.label : d == null ? "No due date" : overdue ? `${Math.abs(d)} days overdue` : d === 0 ? "Due today" : `${d} days left`;
  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-ink-500">{accepted ? "Outcome" : "Remediation SLA"}</p>
          <p className={cn("mt-1.5 text-xl font-semibold tracking-tight tnum", accepted ? "text-sky-700" : resolved ? "text-success-700" : overdue ? "text-danger-700" : d != null && d <= 7 ? "text-warning-700" : "text-ink-900")}>{big}</p>
        </div>
        <span className={cn("h-9 w-9 rounded-lg flex items-center justify-center shrink-0", accepted ? "bg-sky-50 text-sky-600" : resolved ? "bg-success-50 text-success-600" : overdue ? "bg-danger-50 text-danger-600" : "bg-brand-50 text-brand-600")}>{accepted ? <ShieldCheck className="h-4.5 w-4.5" /> : resolved ? <CheckCircle2 className="h-4.5 w-4.5" /> : <Clock className="h-4.5 w-4.5" />}</span>
      </div>
      {due && (
        <>
          <div className="mt-4 h-2 rounded-full bg-ink-100 overflow-hidden"><div className={cn("h-full rounded-full", bar)} style={{ width: `${pct}%` }} /></div>
          <div className="mt-1.5 flex justify-between text-xs text-ink-500 tnum"><span>Raised {fmtDate(f.created_at, "MMM d")}</span><span>Due {fmtDate(f.due_date, "MMM d, yyyy")}</span></div>
        </>
      )}
    </Card>
  );
}

function ApprovalRow({ a }: { a: Approval }) {
  return (
    <Link to={`/approvals/${a.id}`} className="flex items-start justify-between gap-3 rounded-md px-2 py-2 -mx-2 hover:bg-ink-50 transition-colors">
      <div className="min-w-0">
        <p className="text-sm font-medium text-ink-800 truncate">{LABELS.approvalType[a.type]}</p>
        <p className="text-xs text-ink-500 mt-0.5">Requested by {a.requested_by_name ?? "—"} · {fmtRelative(a.created_at)}</p>
      </div>
      <Badge tone={TONES.approvalStatus[a.status]} dot>{LABELS.approvalStatus[a.status]}</Badge>
    </Link>
  );
}

export default function FindingDetailPage() {
  const id = Number(useParams().id);
  const { canWrite, can } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const key = ["finding", id];
  const q = useQuery({ queryKey: key, queryFn: () => api.get<{ data: FindingDetail }>(`/api/findings/${id}`).then((r) => r.data), enabled: Number.isFinite(id), retry: (n, e) => !(e instanceof ApiError && e.status === 404) && n < 1 });
  const f = q.data;
  const [editOpen, setEditOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [closeNote, setCloseNote] = useState("");
  const [raOpen, setRaOpen] = useState(false);
  const [justification, setJustification] = useState("");
  const [planEditing, setPlanEditing] = useState(false);
  const [plan, setPlan] = useState("");

  const refresh = (vendorId?: number) => {
    qc.invalidateQueries({ queryKey: key });
    qc.invalidateQueries({ queryKey: ["findings"] });
    qc.invalidateQueries({ queryKey: ["comments", "finding", id] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
    if (vendorId) qc.invalidateQueries({ queryKey: ["vendor", vendorId] });
    if (f?.assessment_id) qc.invalidateQueries({ queryKey: ["assessment", f.assessment_id] });
  };

  const transition = useMutation({
    mutationFn: async ({ status, note }: { status: FindingStatus; note?: string }) => {
      const r = await api.patch<{ data: Finding }>(`/api/findings/${id}`, { status });
      if (note?.trim()) await api.post("/api/comments", { entity_type: "finding", entity_id: id, body: note.trim() });
      return r;
    },
    onSuccess: (r, v) => {
      setCloseOpen(false); setCloseNote("");
      refresh(r.data.vendor_id);
      const msg: Record<FindingStatus, string> = { open: "Finding reopened", in_remediation: "Remediation started", closed: "Finding closed", risk_accepted: "Risk accepted" };
      toast("success", msg[v.status], v.status === "closed" ? "Vendor residual risk recalculated." : undefined);
    },
    onError: (e: Error) => toast("error", "Status change failed", e.message),
  });
  const savePlan = useMutation({
    mutationFn: () => api.patch<{ data: Finding }>(`/api/findings/${id}`, { remediation_plan: plan.trim() || null }),
    onSuccess: () => { setPlanEditing(false); refresh(); toast("success", "Remediation plan saved"); },
    onError: (e: Error) => toast("error", "Could not save plan", e.message),
  });
  const requestRa = useMutation({
    mutationFn: () => api.post<{ data: Finding; approval_id: number }>(`/api/findings/${id}/request-risk-acceptance`, { justification: justification.trim() }),
    onSuccess: (r) => {
      setRaOpen(false); setJustification("");
      refresh();
      qc.invalidateQueries({ queryKey: ["approvals"] });
      toast("success", "Risk acceptance requested", `Approval #${r.approval_id} sent to administrators.`);
    },
    onError: (e: Error) => toast("error", "Request failed", e.message),
  });

  if (!Number.isFinite(id) || (q.error instanceof ApiError && q.error.status === 404)) return <NotFoundState what="Finding" backTo="/findings" backLabel="Back to findings" />;
  if (q.isLoading) return <PageLoader />;
  if (q.error || !f) return <Card><EmptyState icon={AlertCircle} title="Could not load finding" description={(q.error as Error | null)?.message} action={<Button variant="secondary" onClick={() => q.refetch()}>Try again</Button>} /></Card>;

  const resolved = f.status === "closed" || f.status === "risk_accepted";
  const sla = slaInfo(f.due_date, resolved ? f.resolved_at ?? f.created_at : null, f.created_at, f.status);
  const accepted = f.status === "risk_accepted";
  const qRef = f.assessment_id ? parseQuestionRef(f.description) : null;
  const raApprovals = f.approvals.filter((a) => a.type === "risk_acceptance");
  const pending = raApprovals.find((a) => a.status === "pending");
  const latest = raApprovals[0];
  const created = parseDate(f.created_at);
  const age = created ? Math.max(0, Math.floor(((resolved ? parseDate(f.resolved_at) ?? new Date() : new Date()).getTime() - created.getTime()) / 86_400_000)) : null;
  const busy = transition.isPending;
  const jLen = justification.trim().length;

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Findings", to: "/findings" }, { label: `F-${String(f.id).padStart(4, "0")}` }]}
        title={<span className="block break-words [overflow-wrap:anywhere]">{f.title}</span>}
        documentTitle={f.title}
        meta={
          <>
            <Badge tone={TONES.tier[f.severity]}>{LABELS.tier[f.severity]} severity</Badge>
            <Badge tone={TONES.findingStatus[f.status]} dot>{LABELS.findingStatus[f.status]}</Badge>
            <Badge tone={sla.tone}><Clock className="h-3 w-3" />{sla.label}</Badge>
            <span className="text-ink-300">|</span>
            <Link to={`/vendors/${f.vendor_id}`} className="text-sm font-medium text-ink-700 hover:text-brand-700 hover:underline">{f.vendor_name}</Link>
            <TierBadge tier={f.vendor_tier} size="xs" suffix="tier" />
          </>
        }
        actions={canWrite && (
          <HeaderActions>
            <Button variant="secondary" icon={Edit3} onClick={() => setEditOpen(true)}>Edit</Button>
            {(f.status === "open" || f.status === "in_remediation") && (
              <Button variant="secondary" icon={ShieldQuestion} onClick={() => setRaOpen(true)} disabled={!!pending} title={pending ? "A risk acceptance request is already pending" : undefined}>Request risk acceptance</Button>
            )}
            {f.status === "open" && (
              <>
                <Button variant="secondary" icon={CheckCircle2} onClick={() => setCloseOpen(true)}>Close</Button>
                <Button icon={Play} loading={busy && transition.variables?.status === "in_remediation"} disabled={busy} onClick={() => transition.mutate({ status: "in_remediation" })}>Start remediation</Button>
              </>
            )}
            {f.status === "in_remediation" && <Button icon={CheckCircle2} onClick={() => setCloseOpen(true)}>Close</Button>}
            {resolved && <Button icon={RotateCcw} loading={busy} onClick={() => transition.mutate({ status: "open" })}>Reopen</Button>}
          </HeaderActions>
        )}
      />

      {pending && (
        <div className="mb-5 flex items-start gap-3 rounded-[var(--radius-card)] border border-amber-200 bg-warning-50 px-4 py-3">
          <Hourglass className="h-5 w-5 text-warning-600 shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1 text-sm text-warning-700">
            <p className="font-medium">Risk acceptance pending approval</p>
            <p className="mt-0.5 opacity-90">Requested by {pending.requested_by_name ?? "—"} {fmtRelative(pending.created_at)}. An administrator other than the requester must decide.</p>
          </div>
          <Link to={`/approvals/${pending.id}`}><Button size="sm" variant="secondary" iconRight={ExternalLink}>View approval #{pending.id}</Button></Link>
        </div>
      )}
      {!pending && latest?.status === "rejected" && !resolved && (
        <div className="mb-5 flex items-start gap-3 rounded-[var(--radius-card)] border border-red-200 bg-danger-50 px-4 py-3">
          <XCircle className="h-5 w-5 text-danger-600 shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1 text-sm text-danger-700">
            <p className="font-medium">Risk acceptance was rejected{latest.decided_at ? ` ${fmtRelative(latest.decided_at)}` : ""}</p>
            {latest.comment && <p className="mt-0.5 opacity-90">“{latest.comment}”</p>}
          </div>
          <Link to={`/approvals/${latest.id}`} className="text-sm font-medium text-danger-700 hover:underline shrink-0">View</Link>
        </div>
      )}
      {f.status === "risk_accepted" && (
        <div className="mb-5 flex items-start gap-3 rounded-[var(--radius-card)] border border-sky-200 bg-sky-50 px-4 py-3">
          <ShieldCheck className="h-5 w-5 text-sky-600 shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1 text-sm text-sky-800">
            <p className="font-medium">Risk formally accepted{f.resolved_at ? ` on ${fmtDate(f.resolved_at)}` : ""}</p>
            <p className="mt-0.5 opacity-90">This finding no longer counts toward the vendor's residual risk. Reopen it if circumstances change.</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-6 items-start">
        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader title="Description" />
            {f.description ? <p className="text-sm text-ink-700 leading-6 whitespace-pre-wrap break-words">{f.description}</p> : <p className="text-sm text-ink-400 italic">No description provided.</p>}
          </Card>

          <Card>
            <CardHeader
              title="Remediation plan"
              description="Agreed corrective actions, milestones and evidence expected from the vendor."
              action={canWrite && !planEditing && <Button size="sm" variant="ghost" icon={Edit3} onClick={() => { setPlan(f.remediation_plan ?? ""); setPlanEditing(true); }}>{f.remediation_plan ? "Edit" : "Add plan"}</Button>}
            />
            {planEditing ? (
              <div>
                <Textarea value={plan} onChange={(e) => setPlan(e.target.value)} rows={6} autoFocus placeholder={"1. Vendor to enforce MFA for all support accounts by …\n2. Provide evidence (screenshot of IdP policy)\n3. Re-test during next quarterly review"} onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) savePlan.mutate(); if (e.key === "Escape") { e.stopPropagation(); setPlanEditing(false); } }} />
                <div className="mt-3 flex items-center justify-end gap-2">
                  <Button size="sm" variant="secondary" onClick={() => setPlanEditing(false)}>Cancel</Button>
                  <Button size="sm" onClick={() => savePlan.mutate()} loading={savePlan.isPending} disabled={plan.trim() === (f.remediation_plan ?? "").trim()}>Save plan</Button>
                </div>
              </div>
            ) : f.remediation_plan ? (
              <p className="text-sm text-ink-700 leading-6 whitespace-pre-wrap break-words">{f.remediation_plan}</p>
            ) : (
              <button type="button" disabled={!canWrite} onClick={() => { setPlan(""); setPlanEditing(true); }} className="w-full rounded-lg border border-dashed border-ink-300 px-4 py-6 text-center text-sm text-ink-500 enabled:hover:border-brand-300 enabled:hover:bg-brand-50/40 enabled:hover:text-brand-700 transition-colors focus-ring">
                <FileText className="h-5 w-5 mx-auto mb-1.5 text-ink-400" />
                {canWrite ? "No remediation plan yet — click to add one" : "No remediation plan recorded"}
              </button>
            )}
          </Card>

          <Card>
            <CardHeader title="Discussion" description="Coordinate remediation with owners and reviewers." />
            <CommentsThread entityType="finding" entityId={f.id} onChange={() => qc.invalidateQueries({ queryKey: key })} />
          </Card>
        </div>

        <aside className="space-y-6">
          <SlaCard f={f} />
          <Card>
            <CardHeader title="Details" />
            <DescriptionList cols={1} items={[
              { label: "Vendor", value: <span className="inline-flex items-center gap-2"><Link to={`/vendors/${f.vendor_id}`} className="font-medium text-brand-700 hover:underline">{f.vendor_name}</Link><TierBadge tier={f.vendor_tier} size="xs" /></span> },
              { label: "Source assessment", value: f.assessment_id ? <Link to={`/assessments/${f.assessment_id}`} className="inline-flex items-start gap-1.5 text-brand-700 hover:underline"><ClipboardList className="h-4 w-4 mt-0.5 shrink-0" />{f.assessment_title ?? `Assessment #${f.assessment_id}`}</Link> : <span className="text-ink-500">Raised manually</span> },
              ...(qRef ? [{ label: "Source question", value: <span><span className="font-medium tnum">Q{qRef.n}</span> <span className="text-ink-500">· {qRef.section}</span></span> }] : []),
              { label: "Owner", value: <UserCell name={f.owner_name} /> },
              { label: "Due date", value: <span className="tnum">{fmtDate(f.due_date)}</span> },
              { label: "Raised", value: <span className="tnum">{fmtDate(f.created_at)} <span className="text-ink-500">· {age != null ? `${age}d ${accepted ? "until accepted" : resolved ? "to resolve" : "open"}` : ""}</span></span> },
              accepted
                ? { label: "Risk accepted", value: f.resolved_at ? <span className="tnum">{fmtDate(f.resolved_at)}</span> : <span className="text-ink-400">—</span> }
                : { label: "Resolved", value: f.resolved_at ? <span className="tnum">{fmtDate(f.resolved_at)}</span> : <span className="text-ink-400">Not resolved</span> },
            ]} />
          </Card>
          {raApprovals.length > 0 && (
            <Card>
              <CardHeader title="Approvals" />
              <div className="space-y-1">{raApprovals.map((a) => <ApprovalRow key={a.id} a={a} />)}</div>
            </Card>
          )}
          <Card>
            <CardHeader title="Activity" />
            <ActivityTimeline items={f.activity} />
          </Card>
        </aside>
      </div>

      <FindingFormModal open={editOpen} onClose={() => setEditOpen(false)} finding={f} />

      <Modal open={closeOpen} onClose={() => setCloseOpen(false)} size="sm" title="Close finding" description="Confirm the vendor has remediated this gap. The vendor's residual risk will be recalculated."
        footer={<><Button variant="secondary" onClick={() => setCloseOpen(false)}>Cancel</Button><Button icon={CheckCircle2} loading={busy} onClick={() => transition.mutate({ status: "closed", note: closeNote ? `Closed: ${closeNote.trim()}` : undefined })}>Close finding</Button></>}>
        <Field label="Closing note" hint="Optional — evidence of remediation, posted as a comment.">
          <Textarea value={closeNote} onChange={(e) => setCloseNote(e.target.value)} rows={3} placeholder="e.g. Verified MFA policy enforced in vendor IdP (screenshot attached to ticket)." autoFocus />
        </Field>
      </Modal>

      <Modal open={raOpen} onClose={() => setRaOpen(false)} title="Request risk acceptance" description={`Formally accept the residual risk of this ${f.severity} finding instead of remediating it. ${can("admin") ? "Another administrator must approve your request." : "An administrator must approve the request."}`}
        footer={<><Button variant="secondary" onClick={() => setRaOpen(false)}>Cancel</Button><Button icon={ShieldQuestion} loading={requestRa.isPending} disabled={jLen < 10} onClick={() => requestRa.mutate()}>Submit request</Button></>}>
        <Field label="Business justification" required error={justification && jLen < 10 ? `At least 10 characters (${jLen}/10)` : null} hint="Explain why the risk is acceptable, compensating controls, and when it will be revisited.">
          <Textarea value={justification} onChange={(e) => setJustification(e.target.value)} rows={5} autoFocus placeholder="e.g. Compensating control: all vendor support sessions are brokered through our PAM with session recording. Revisit at contract renewal." invalid={!!justification && jLen < 10} />
        </Field>
      </Modal>
    </>
  );
}
