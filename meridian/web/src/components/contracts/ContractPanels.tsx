import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { addDays, differenceInCalendarDays, format, subDays } from "date-fns";
import { AlertTriangle, ArrowRight, ArrowRightLeft, CalendarClock, CheckCircle2, CircleDot, ClipboardCheck, ExternalLink, FilePlus2, FileText, History, Pencil, Plus, RefreshCw, Send, Trash2, type LucideIcon } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useUsers } from "@/lib/hooks";
import { LABELS, TONES, daysUntil, fmtBytes, fmtDate, fmtDateTime, fmtRelative, parseDate } from "@/lib/format";
import type { Activity, Approval, Contract, ContractDetail, Document, Obligation } from "@/lib/types";
import { Avatar, Badge, Button, Card, CardHeader, EmptyState, Field, Input, Modal, Select, Textarea, cn } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { ConfirmDialog, DaysLabel, errorMessage } from "./shared";

type RenewalState = { tone: "neutral" | "success" | "info" | "warning" | "danger"; title: string; body: string };

export function renewalState(c: Contract): RenewalState & { noticeDate: Date | null; daysLeft: number | null; daysToNotice: number | null } {
  const end = parseDate(c.end_date);
  const daysLeft = daysUntil(c.end_date);
  const noticeDate = end ? subDays(end, c.renewal_notice_days ?? 0) : null;
  const daysToNotice = noticeDate ? differenceInCalendarDays(noticeDate, new Date()) : null;
  const base = { noticeDate, daysLeft, daysToNotice };
  if (c.status === "terminated") return { ...base, tone: "neutral", title: "Contract terminated", body: "No renewal action required." };
  if (c.status === "draft" || c.status === "in_review") {
    if (!end) return { ...base, tone: "neutral", title: "Not yet in force", body: "Set an end date to track renewals." };
  }
  if (!end || daysLeft == null) return { ...base, tone: "neutral", title: "No end date", body: "Evergreen or undefined term — renewal tracking is off." };
  if (daysLeft < 0) return { ...base, tone: "danger", title: "Term ended", body: `Ended ${Math.abs(daysLeft)} days ago on ${format(end, "MMM d, yyyy")}.` };
  if (daysToNotice != null && daysToNotice <= 0) {
    return {
      ...base, tone: "warning", title: "Notice period open",
      body: c.auto_renew
        ? `Auto-renews in ${daysLeft} days unless non-renewal notice is served. Window opened ${format(noticeDate!, "MMM d")}.`
        : `Expires in ${daysLeft} days. Decide to renew, renegotiate or exit — window opened ${format(noticeDate!, "MMM d")}.`,
    };
  }
  if (daysToNotice != null && daysToNotice <= 30) return { ...base, tone: "info", title: `Notice window opens in ${daysToNotice} days`, body: `Plan the renewal decision before ${format(noticeDate!, "MMM d, yyyy")}.` };
  return { ...base, tone: "success", title: "On track", body: `Notice window opens ${format(noticeDate!, "MMM d, yyyy")}.` };
}

const stateCls: Record<RenewalState["tone"], string> = {
  neutral: "border-ink-200 bg-ink-50 text-ink-700",
  success: "border-emerald-200 bg-success-50 text-success-700",
  info: "border-sky-200 bg-sky-50 text-sky-800",
  warning: "border-amber-200 bg-warning-50 text-warning-700",
  danger: "border-red-200 bg-danger-50 text-danger-700",
};
const stateIcon: Record<RenewalState["tone"], LucideIcon> = { neutral: CircleDot, success: CheckCircle2, info: CalendarClock, warning: AlertTriangle, danger: AlertTriangle };

export function RenewalPanel({ contract: c }: { contract: Contract }) {
  const st = renewalState(c);
  const start = parseDate(c.start_date);
  const end = parseDate(c.end_date);
  const total = start && end ? Math.max(1, differenceInCalendarDays(end, start)) : null;
  const elapsed = start && total ? Math.min(total, Math.max(0, differenceInCalendarDays(new Date(), start))) : null;
  const pct = total != null && elapsed != null ? (elapsed / total) * 100 : null;
  const noticePct = total && st.noticeDate && start ? Math.min(100, Math.max(0, (differenceInCalendarDays(st.noticeDate, start) / total) * 100)) : null;
  const barTone = st.tone === "danger" ? "bg-danger-600" : st.tone === "warning" ? "bg-warning-600" : "bg-brand-600";
  const Icon = stateIcon[st.tone];
  return (
    <Card>
      <CardHeader title="Renewal" description="Term and notice window" action={c.auto_renew ? <Badge tone="brand"><RefreshCw className="h-3 w-3" />Auto-renews</Badge> : <Badge tone="neutral">Manual renewal</Badge>} />
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-ink-500">Days remaining</p>
          <p className={cn("mt-1 text-3xl font-semibold tracking-tight tnum", st.daysLeft == null ? "text-ink-400" : st.daysLeft < 0 || st.daysLeft <= 30 ? "text-danger-700" : st.daysLeft <= 90 ? "text-warning-700" : "text-ink-900")}>
            {st.daysLeft == null ? "—" : st.daysLeft < 0 ? 0 : st.daysLeft}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-500">End date</p>
          <p className="mt-1 text-sm font-medium text-ink-900 tnum">{fmtDate(c.end_date)}</p>
        </div>
      </div>
      {pct != null && (
        <div className="mt-4">
          <div className="relative h-2 rounded-full bg-ink-100" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label="Term elapsed">
            <div className={cn("h-full rounded-full", barTone)} style={{ width: `${pct}%` }} />
            {noticePct != null && noticePct > 0 && noticePct < 100 && (
              <span className="absolute -top-1 h-4 w-0.5 rounded bg-warning-600" style={{ left: `calc(${noticePct}% - 1px)` }} title={`Notice window opens ${st.noticeDate ? format(st.noticeDate, "MMM d, yyyy") : ""}`} />
            )}
          </div>
          <div className="mt-1.5 flex justify-between text-[11px] text-ink-500 tnum">
            <span>{fmtDate(c.start_date, "MMM d, yyyy")}</span>
            <span>{Math.round(pct)}% elapsed</span>
            <span>{fmtDate(c.end_date, "MMM d, yyyy")}</span>
          </div>
        </div>
      )}
      <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-ink-100 pt-4 text-sm">
        <div>
          <dt className="text-xs text-ink-500">Notice period</dt>
          <dd className="mt-0.5 font-medium text-ink-900 tnum">{c.renewal_notice_days} days</dd>
        </div>
        <div>
          <dt className="text-xs text-ink-500">Notice window opens</dt>
          <dd className="mt-0.5 font-medium text-ink-900 tnum">{st.noticeDate ? format(st.noticeDate, "MMM d, yyyy") : "—"}</dd>
        </div>
      </dl>
      <div className={cn("mt-4 flex gap-2.5 rounded-lg border px-3 py-2.5", stateCls[st.tone])} data-testid="renewal-state">
        <Icon className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="min-w-0">
          <p className="text-sm font-semibold">{st.title}</p>
          <p className="text-xs opacity-90">{st.body}</p>
        </div>
      </div>
    </Card>
  );
}

function useInvalidateContract(id: number) {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["contract", id] });
    qc.invalidateQueries({ queryKey: ["contracts"] });
    qc.invalidateQueries({ queryKey: ["contracts-summary"] });
  };
}

export function ObligationModal({ open, onClose, contractId }: { open: boolean; onClose: () => void; contractId: number }) {
  const { user } = useAuth();
  const { data: users = [] } = useUsers();
  const { toast } = useToast();
  const invalidate = useInvalidateContract(contractId);
  const [description, setDescription] = useState("");
  const [due, setDue] = useState("");
  const [owner, setOwner] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const reset = () => { setDescription(""); setDue(""); setOwner(user ? String(user.id) : ""); setSubmitted(false); };
  const [lastOpen, setLastOpen] = useState(false);
  if (open !== lastOpen) { setLastOpen(open); if (open) reset(); }
  const save = useMutation({
    mutationFn: () => api.post<{ data: Obligation }>(`/api/contracts/${contractId}/obligations`, { description: description.trim(), due_date: due || null, owner_id: owner ? Number(owner) : null }),
    onSuccess: () => { toast("success", "Obligation added", description.trim()); invalidate(); onClose(); },
    onError: (e) => toast("error", "Could not add obligation", errorMessage(e)),
  });
  const submit = (e: FormEvent) => { e.preventDefault(); setSubmitted(true); if (description.trim()) save.mutate(); };
  const quick = [30, 90, 180];
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add obligation"
      description="Track a deliverable, SLA, notice or compliance commitment under this contract."
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose} disabled={save.isPending}>Cancel</Button>
          <Button type="submit" form="obligation-form" loading={save.isPending}>Add obligation</Button>
        </>
      }
    >
      <form id="obligation-form" onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Description" required error={submitted && !description.trim() ? "Describe the obligation" : undefined}>
          <Textarea autoFocus rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Deliver annual SOC 2 Type II report" invalid={submitted && !description.trim()} />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Due date">
            <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
            <span className="mt-1.5 flex gap-1">
              {quick.map((d) => (
                <button key={d} type="button" onClick={() => setDue(format(addDays(new Date(), d), "yyyy-MM-dd"))} className="rounded border border-ink-200 px-1.5 py-0.5 text-[11px] text-ink-600 hover:border-brand-300 hover:text-brand-700">+{d}d</button>
              ))}
            </span>
          </Field>
          <Field label="Owner">
            <Select value={owner} onChange={(e) => setOwner(e.target.value)}>
              <option value="">Unassigned</option>
              {users.filter((u) => u.active && u.role !== "auditor").map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </Select>
          </Field>
        </div>
      </form>
    </Modal>
  );
}

const OB_STATUSES: Obligation["status"][] = ["pending", "met", "missed", "waived"];
const obSelectCls: Record<string, string> = {
  pending: "bg-sky-50 text-sky-700 border-sky-200",
  met: "bg-success-50 text-success-700 border-emerald-200",
  missed: "bg-danger-50 text-danger-700 border-red-200",
  waived: "bg-ink-100 text-ink-700 border-ink-200",
};

export function ObligationsPanel({ contract, onAdd }: { contract: ContractDetail; onAdd: () => void }) {
  const { canWrite } = useAuth();
  const { toast } = useToast();
  const invalidate = useInvalidateContract(contract.id);
  const [deleting, setDeleting] = useState<Obligation | null>(null);
  const setStatus = useMutation({
    mutationFn: ({ ob, status }: { ob: Obligation; status: Obligation["status"] }) => api.patch(`/api/contracts/${contract.id}/obligations/${ob.id}`, { status }),
    onSuccess: (_r, v) => { toast("success", `Marked ${LABELS.obligationStatus[v.status].toLowerCase()}`, v.ob.description); invalidate(); },
    onError: (e) => toast("error", "Could not update obligation", errorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: (ob: Obligation) => api.delete(`/api/contracts/${contract.id}/obligations/${ob.id}`),
    onSuccess: () => { toast("success", "Obligation removed"); invalidate(); setDeleting(null); },
    onError: (e) => toast("error", "Could not remove obligation", errorMessage(e)),
  });
  const obs = contract.obligations;
  const counts = OB_STATUSES.map((s) => ({ s, n: obs.filter((o) => o.status === s).length })).filter((x) => x.n > 0);
  return (
    <Card padded={false}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-200 px-5 py-3.5">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold text-ink-900">Obligations</h3>
          {counts.map(({ s, n }) => <Badge key={s} size="xs" tone={TONES.obligationStatus[s]}>{n} {LABELS.obligationStatus[s].toLowerCase()}</Badge>)}
        </div>
        {canWrite && <Button size="sm" variant="secondary" icon={Plus} onClick={onAdd}>Add obligation</Button>}
      </div>
      {obs.length === 0 ? (
        <EmptyState icon={ClipboardCheck} title="No obligations tracked" description="Capture SLAs, deliverables and notice commitments so nothing slips." action={canWrite ? <Button size="sm" icon={Plus} onClick={onAdd}>Add obligation</Button> : undefined} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink-200 bg-ink-50/70 text-left text-xs font-semibold uppercase tracking-wide text-ink-500">
                <th className="px-5 py-2.5">Obligation</th>
                <th className="px-4 py-2.5">Due</th>
                <th className="px-4 py-2.5">Owner</th>
                <th className="px-4 py-2.5">Status</th>
                {canWrite && <th className="w-12 px-4 py-2.5"><span className="sr-only">Actions</span></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {obs.map((o) => {
                const d = daysUntil(o.due_date);
                const overdue = o.status === "pending" && d != null && d < 0;
                return (
                  <tr key={o.id} className={cn("group", overdue && "bg-danger-50/30")} data-testid="obligation-row">
                    <td className="px-5 py-3">
                      <p className="text-ink-900">{o.description}</p>
                      {overdue && <p className="mt-0.5 text-xs font-medium text-danger-700">Overdue by {Math.abs(d!)} days</p>}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 tnum">
                      <span className="text-ink-700">{fmtDate(o.due_date)}</span>
                      {o.status === "pending" && o.due_date && d != null && d >= 0 && <DaysLabel date={o.due_date} className="ml-2 text-xs" />}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {o.owner_name ? <span className="inline-flex items-center gap-2 text-ink-700"><Avatar name={o.owner_name} size="xs" />{o.owner_name}</span> : <span className="text-ink-400">Unassigned</span>}
                    </td>
                    <td className="px-4 py-3">
                      {canWrite ? (
                        <select
                          aria-label={`Status for ${o.description}`}
                          value={o.status}
                          disabled={setStatus.isPending && setStatus.variables?.ob.id === o.id}
                          onChange={(e) => setStatus.mutate({ ob: o, status: e.target.value as Obligation["status"] })}
                          className={cn("h-7 cursor-pointer appearance-none rounded-full border pl-2.5 pr-6 text-xs font-medium outline-none focus:ring-2 focus:ring-brand-500/30 bg-no-repeat bg-[right_0.35rem_center] bg-[length:12px] bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2216%22 height=%2216%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%2364748b%22 stroke-width=%222.5%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22><path d=%22m6 9 6 6 6-6%22/></svg>')]", obSelectCls[o.status])}
                        >
                          {OB_STATUSES.map((s) => <option key={s} value={s}>{LABELS.obligationStatus[s]}</option>)}
                        </select>
                      ) : (
                        <Badge tone={TONES.obligationStatus[o.status]} dot>{LABELS.obligationStatus[o.status]}</Badge>
                      )}
                    </td>
                    {canWrite && (
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => setDeleting(o)} className="rounded p-1 text-ink-400 opacity-60 transition hover:bg-danger-50 hover:text-danger-600 group-hover:opacity-100 focus-ring" aria-label={`Delete ${o.description}`}><Trash2 className="h-4 w-4" /></button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting)}
        loading={remove.isPending}
        danger
        title="Delete obligation?"
        description={deleting ? `"${deleting.description}" will be permanently removed from this contract.` : undefined}
        confirmLabel="Delete"
      />
    </Card>
  );
}

export function LinkedDocuments({ documents, vendorId, onUpload }: { documents: Document[]; vendorId: number; onUpload: () => void }) {
  const { canWrite } = useAuth();
  return (
    <Card padded={false}>
      <div className="flex items-center justify-between gap-3 border-b border-ink-200 px-5 py-3.5">
        <h3 className="text-sm font-semibold text-ink-900">Linked documents</h3>
        <div className="flex items-center gap-2">
          <Link to={`/documents?vendor_id=${vendorId}`} className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline">All vendor documents<ArrowRight className="h-3 w-3" /></Link>
          {canWrite && <Button size="sm" variant="secondary" icon={FilePlus2} onClick={onUpload}>Upload</Button>}
        </div>
      </div>
      {documents.length === 0 ? (
        <EmptyState icon={FileText} title="No documents linked" description="Attach the executed agreement, DPA or supporting evidence to this contract." />
      ) : (
        <ul className="divide-y divide-ink-100">
          {documents.map((d) => (
            <li key={d.id} className="flex items-center gap-3 px-5 py-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-ink-100 text-ink-500"><FileText className="h-4 w-4" /></span>
              <div className="min-w-0 flex-1">
                <Link to={`/documents?vendor_id=${vendorId}&q=${encodeURIComponent(d.name)}`} className="block truncate text-sm font-medium text-ink-900 hover:text-brand-700">{d.name}</Link>
                <p className="truncate font-mono text-xs text-ink-500">{d.file_name ?? "—"} · {fmtBytes(d.file_size ?? 0)}</p>
              </div>
              <Badge tone="neutral" size="xs" className="hidden sm:inline-flex">{LABELS.documentType[d.type]}</Badge>
              <div className="hidden w-32 text-right text-xs md:block">
                <p className="text-ink-600 tnum">{d.expiry_date ? fmtDate(d.expiry_date) : "No expiry"}</p>
                {d.expiry_date && <DaysLabel date={d.expiry_date} className="text-[11px]" />}
              </div>
              <Badge tone={TONES.documentStatus[d.status]} dot>{LABELS.documentStatus[d.status]}</Badge>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function ApprovalsHistory({ approvals }: { approvals: Approval[] }) {
  if (approvals.length === 0) {
    return <Card><EmptyState icon={ClipboardCheck} title="No approval requests" description="Draft contracts can be submitted to procurement for approval." /></Card>;
  }
  return (
    <Card padded={false}>
      <ul className="divide-y divide-ink-100">
        {approvals.map((a) => (
          <li key={a.id} className="px-5 py-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <Link to={`/approvals/${a.id}`} className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-900 hover:text-brand-700">{a.title}<ExternalLink className="h-3.5 w-3.5 text-ink-400" /></Link>
                <p className="mt-0.5 text-xs text-ink-500">
                  Requested by {a.requested_by_name ?? "—"} · {fmtDateTime(a.created_at)}
                  {a.decided_at && <> · Decided by {a.approver_name ?? "—"} {fmtRelative(a.decided_at)}</>}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {a.priority !== "normal" && <Badge size="xs" tone={TONES.priority[a.priority]}>{titlePriority(a.priority)}</Badge>}
                <Badge tone={TONES.approvalStatus[a.status]} dot>{LABELS.approvalStatus[a.status]}</Badge>
              </div>
            </div>
            {a.comment && <p className="mt-2 rounded-md border-l-2 border-ink-200 bg-ink-50 px-3 py-2 text-sm text-ink-700">{a.comment}</p>}
          </li>
        ))}
      </ul>
    </Card>
  );
}
function titlePriority(p: string) { return p.charAt(0).toUpperCase() + p.slice(1); }

const actionIcon: Record<string, { icon: LucideIcon; cls: string }> = {
  create: { icon: Plus, cls: "bg-success-50 text-success-700 ring-emerald-200" },
  update: { icon: Pencil, cls: "bg-brand-50 text-brand-700 ring-brand-200" },
  status_change: { icon: ArrowRightLeft, cls: "bg-warning-50 text-warning-700 ring-amber-200" },
  submit: { icon: Send, cls: "bg-sky-50 text-sky-700 ring-sky-200" },
  approve: { icon: CheckCircle2, cls: "bg-success-50 text-success-700 ring-emerald-200" },
  reject: { icon: AlertTriangle, cls: "bg-danger-50 text-danger-700 ring-red-200" },
  delete: { icon: Trash2, cls: "bg-danger-50 text-danger-700 ring-red-200" },
};

export function ActivityTimeline({ items }: { items: Activity[] }) {
  if (items.length === 0) return <Card><EmptyState icon={History} title="No activity yet" description="Edits, status changes and approvals will appear here." /></Card>;
  return (
    <Card>
      <ol className="relative">
        {items.map((a, i) => {
          const meta = actionIcon[a.action] ?? { icon: CircleDot, cls: "bg-ink-100 text-ink-600 ring-ink-200" };
          const Icon = meta.icon;
          return (
            <li key={a.id} className="relative flex gap-3 pb-5 last:pb-0">
              {i < items.length - 1 && <span className="absolute left-[13px] top-7 bottom-0 w-px bg-ink-200" aria-hidden />}
              <span className={cn("relative z-[1] flex h-7 w-7 shrink-0 items-center justify-center rounded-full ring-1", meta.cls)}><Icon className="h-3.5 w-3.5" /></span>
              <div className="min-w-0 flex-1 pt-0.5">
                <p className="text-sm text-ink-800">{a.summary}</p>
                <p className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-500">
                  {a.actor_name && <><Avatar name={a.actor_name} size="xs" /><span className="font-medium text-ink-600">{a.actor_name}</span><span className="text-ink-300">·</span></>}
                  <time title={fmtDateTime(a.created_at)}>{fmtRelative(a.created_at)}</time>
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
