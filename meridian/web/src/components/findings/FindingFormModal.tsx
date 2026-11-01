import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ClipboardList } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useUsers } from "@/lib/hooks";
import { LABELS } from "@/lib/format";
import type { Finding, Severity } from "@/lib/types";
import { Button, cn, Field, Input, Modal, Select, Textarea } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { VendorPicker } from "@/components/assessments/VendorPicker";
import { useWritableUsers } from "@/components/assessments/common";

export const SEVERITY_SLA_DAYS: Record<Severity, number> = { critical: 14, high: 30, medium: 60, low: 90 };
const SEVERITIES: Severity[] = ["critical", "high", "medium", "low"];
const SEV_DOT: Record<Severity, string> = { critical: "bg-danger-600", high: "bg-warning-600", medium: "bg-sky-500", low: "bg-success-600" };
const SEV_ACTIVE: Record<Severity, string> = { critical: "border-danger-600 bg-danger-50 text-danger-700 ring-2 ring-danger-600/15", high: "border-warning-600 bg-warning-50 text-warning-700 ring-2 ring-warning-600/15", medium: "border-sky-500 bg-sky-50 text-sky-700 ring-2 ring-sky-500/15", low: "border-success-600 bg-success-50 text-success-700 ring-2 ring-success-600/15" };

function addDays(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export interface FindingFormInitial {
  vendor_id?: number | null;
  assessment_id?: number | null;
  assessment_title?: string | null;
  title?: string;
  description?: string | null;
  severity?: Severity;
  owner_id?: number | null;
  due_date?: string | null;
}

export function FindingFormModal({ open, onClose, finding, initial, lockVendor, onSaved }: { open: boolean; onClose: () => void; finding?: Finding | null; initial?: FindingFormInitial; lockVendor?: boolean; onSaved?: (f: Finding) => void }) {
  const editing = !!finding;
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const users = useWritableUsers(useUsers().data);
  const [vendorId, setVendorId] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState<Severity>("medium");
  const [ownerId, setOwnerId] = useState<string>("");
  const [dueDate, setDueDate] = useState("");
  const [dueTouched, setDueTouched] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!open) return;
    const src = finding ?? initial ?? {};
    const sev = (src.severity as Severity | undefined) ?? "medium";
    setVendorId(src.vendor_id ?? null);
    setTitle(src.title ?? "");
    setDescription(src.description ?? "");
    setSeverity(sev);
    setOwnerId(src.owner_id ? String(src.owner_id) : editing ? "" : user ? String(user.id) : "");
    setDueDate(src.due_date ?? (editing ? "" : addDays(SEVERITY_SLA_DAYS[sev])));
    setDueTouched(editing || !!src.due_date);
    setSubmitted(false);
  }, [open, finding, initial, editing, user]);

  const mutation = useMutation({
    mutationFn: () => {
      const payload = { title: title.trim(), description: description.trim() || null, severity, owner_id: ownerId ? Number(ownerId) : null, due_date: dueDate || null };
      return editing
        ? api.patch<{ data: Finding }>(`/api/findings/${finding!.id}`, payload)
        : api.post<{ data: Finding }>("/api/findings", { ...payload, vendor_id: vendorId, assessment_id: initial?.assessment_id ?? null });
    },
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["findings"] });
      qc.invalidateQueries({ queryKey: ["finding", r.data.id] });
      if (r.data.assessment_id) qc.invalidateQueries({ queryKey: ["assessment", r.data.assessment_id] });
      qc.invalidateQueries({ queryKey: ["vendor", r.data.vendor_id] });
      toast("success", editing ? "Finding updated" : "Finding raised", r.data.title);
      onClose();
      onSaved?.(r.data);
    },
    onError: (e: Error) => toast("error", editing ? "Could not update finding" : "Could not raise finding", e.message),
  });

  const errors = { vendor: !editing && !vendorId ? "Select a vendor" : null, title: !title.trim() ? "Title is required" : null };
  const save = () => {
    setSubmitted(true);
    if (errors.vendor || errors.title) return;
    mutation.mutate();
  };
  const pickSeverity = (s: Severity) => {
    setSeverity(s);
    if (!dueTouched) setDueDate(addDays(SEVERITY_SLA_DAYS[s]));
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={editing ? "Edit finding" : "Raise finding"}
      description={editing ? "Update the details of this finding." : "Record a control gap or issue that needs remediation by the vendor."}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save} loading={mutation.isPending}>{editing ? "Save changes" : "Raise finding"}</Button></>}
    >
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save(); }}>
        {initial?.assessment_title && !editing && (
          <div className="flex items-center gap-2 rounded-lg border border-brand-100 bg-brand-50/60 px-3 py-2 text-sm text-brand-800">
            <ClipboardList className="h-4 w-4 shrink-0" />
            <span className="truncate">Linked to <span className="font-medium">{initial.assessment_title}</span></span>
          </div>
        )}
        {!editing && (
          <Field label="Vendor" required error={submitted ? errors.vendor : null}>
            <VendorPicker value={vendorId} onChange={(id) => setVendorId(id)} invalid={submitted && !!errors.vendor} disabled={lockVendor} />
          </Field>
        )}
        <Field label="Title" required error={submitted ? errors.title : null}>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. MFA not enforced for administrative access" invalid={submitted && !!errors.title} autoFocus={editing || lockVendor} maxLength={200} />
        </Field>
        <Field label="Description" hint="What was observed, the affected control, and the business impact.">
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} placeholder="Describe the gap…" />
        </Field>
        <div>
          <span className="block text-sm font-medium text-ink-700 mb-1.5">Severity<span className="text-danger-600 ml-0.5">*</span></span>
          <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label="Severity">
            {SEVERITIES.map((s) => (
              <button key={s} type="button" role="radio" aria-checked={severity === s} onClick={() => pickSeverity(s)} className={cn("h-9 rounded-md border text-sm font-medium inline-flex items-center justify-center gap-2 transition-colors focus-ring", severity === s ? SEV_ACTIVE[s] : "border-ink-200 bg-white text-ink-600 hover:border-ink-300 hover:bg-ink-50")}>
                <span className={cn("h-2 w-2 rounded-full", SEV_DOT[s])} />{LABELS.tier[s]}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Owner">
            <Select value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
              <option value="">{editing ? "Unassigned" : "Vendor owner (default)"}</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name} · {LABELS.role[u.role]}</option>)}
            </Select>
          </Field>
          <Field label="Due date" hint={!editing && !dueTouched ? `Default SLA for ${LABELS.tier[severity].toLowerCase()} severity: ${SEVERITY_SLA_DAYS[severity]} days` : undefined}>
            <Input type="date" value={dueDate} onChange={(e) => { setDueDate(e.target.value); setDueTouched(true); }} />
          </Field>
        </div>
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
}
