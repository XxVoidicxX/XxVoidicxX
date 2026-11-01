import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, FileQuestion } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useUsers } from "@/lib/hooks";
import type { Assessment, AssessmentTemplate } from "@/lib/types";
import { Button, cn, EmptyState, Field, Input, Modal, Select, Skeleton } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { useVendorOptions, VendorPicker } from "./VendorPicker";
import { useWritableUsers } from "./common";

export function useTemplates() {
  return useQuery({ queryKey: ["assessment-templates"], queryFn: () => api.get<{ data: AssessmentTemplate[] }>("/api/assessments/templates").then((r) => r.data), staleTime: 5 * 60_000 });
}

function inDays(n: number) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

export function NewAssessmentModal({ open, onClose, defaultVendorId }: { open: boolean; onClose: () => void; defaultVendorId?: number | null }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const templates = useTemplates();
  const users = useWritableUsers(useUsers().data);
  const reviewers = useMemo(() => users.filter((u) => u.role === "admin" || u.role === "risk_analyst"), [users]);
  const [vendorId, setVendorId] = useState<number | null>(null);
  const [templateId, setTemplateId] = useState<number | null>(null);
  const [assignee, setAssignee] = useState("");
  const [reviewer, setReviewer] = useState("");
  const [due, setDue] = useState("");
  const [title, setTitle] = useState("");
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!open) return;
    setVendorId(defaultVendorId ?? null);
    setTemplateId(null);
    setAssignee(user ? String(user.id) : "");
    setReviewer("");
    setDue(inDays(30));
    setTitle("");
    setSubmitted(false);
  }, [open, defaultVendorId, user]);

  useEffect(() => {
    if (!reviewer && reviewers.length && open) {
      const pick = reviewers.find((r) => r.role === "admin" && r.id !== user?.id) ?? reviewers.find((r) => r.id !== user?.id);
      if (pick) setReviewer(String(pick.id));
    }
  }, [reviewers, reviewer, open, user]);

  const vendors = useVendorOptions();
  const vendorName = vendors.data?.find((v) => v.id === vendorId)?.name ?? "";
  const tpl = templates.data?.find((t) => t.id === templateId);
  const autoTitle = tpl && vendorName ? `${tpl.name} — ${vendorName}` : "";

  const create = useMutation({
    mutationFn: () => api.post<{ data: Assessment }>("/api/assessments", {
      vendor_id: vendorId, template_id: templateId, title: title.trim() || undefined,
      assigned_to: assignee ? Number(assignee) : null, reviewer_id: reviewer ? Number(reviewer) : null, due_date: due || null,
    }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["assessments"] });
      qc.invalidateQueries({ queryKey: ["vendor", r.data.vendor_id] });
      toast("success", "Assessment created", r.data.title);
      onClose();
      navigate(`/assessments/${r.data.id}`);
    },
    onError: (e: Error) => toast("error", "Could not create assessment", e.message),
  });

  const save = () => {
    setSubmitted(true);
    if (!vendorId || !templateId) return;
    if (assignee && reviewer && assignee === reviewer) return;
    create.mutate();
  };
  const sameReviewer = !!assignee && assignee === reviewer;

  return (
    <Modal open={open} onClose={onClose} size="lg" title="New assessment" description="Send a due-diligence questionnaire to evaluate a vendor's controls."
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save} loading={create.isPending}>Create assessment</Button></>}>
      <div className="space-y-5">
        <Field label="Vendor" required error={submitted && !vendorId ? "Select a vendor" : null}>
          <VendorPicker value={vendorId} onChange={(id) => setVendorId(id)} invalid={submitted && !vendorId} excludeStatuses={["terminated"]} />
        </Field>
        <div>
          <span className="block text-sm font-medium text-ink-700 mb-1.5">Questionnaire template<span className="text-danger-600 ml-0.5">*</span></span>
          {templates.isLoading ? (
            <div className="grid gap-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-16" />)}</div>
          ) : !templates.data?.length ? (
            <EmptyState icon={FileQuestion} title="No templates available" className="py-6 border border-dashed border-ink-200 rounded-lg" />
          ) : (
            <div className="grid gap-2" role="radiogroup" aria-label="Template">
              {templates.data.filter((t) => t.active).map((t) => {
                const on = t.id === templateId;
                return (
                  <button key={t.id} type="button" role="radio" aria-checked={on} onClick={() => setTemplateId(t.id)} className={cn("flex items-start gap-3 rounded-lg border px-3.5 py-3 text-left transition-colors focus-ring", on ? "border-brand-500 bg-brand-50/60 ring-2 ring-brand-500/15" : "border-ink-200 bg-white hover:border-ink-300 hover:bg-ink-50/60")}>
                    <span className={cn("mt-0.5 h-4 w-4 rounded-full border flex items-center justify-center shrink-0", on ? "border-brand-600 bg-brand-600 text-white" : "border-ink-300 bg-white")}>{on && <Check className="h-3 w-3" strokeWidth={3} />}</span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-ink-900">{t.name}</span>
                        {t.framework && <span className="rounded bg-ink-100 px-1.5 py-0.5 text-[11px] font-medium text-ink-600">{t.framework}</span>}
                      </span>
                      {t.description && <span className="block text-xs text-ink-500 mt-0.5 line-clamp-2">{t.description}</span>}
                    </span>
                    <span className="text-right shrink-0">
                      <span className="block text-sm font-semibold text-ink-800 tnum">{t.question_count ?? 0}</span>
                      <span className="block text-[11px] text-ink-500">questions</span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
          {submitted && !templateId && <span className="block text-xs text-danger-600 mt-1">Select a template</span>}
        </div>
        <Field label="Title" hint={autoTitle ? `Leave blank to use “${autoTitle}”` : "Leave blank to auto-generate from template and vendor"}>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={autoTitle || "Auto-generated"} maxLength={200} />
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field label="Assignee">
            <Select value={assignee} onChange={(e) => setAssignee(e.target.value)}>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </Select>
          </Field>
          <Field label="Reviewer" error={sameReviewer ? "Reviewer must differ from assignee" : null}>
            <Select value={reviewer} onChange={(e) => setReviewer(e.target.value)} invalid={sameReviewer}>
              <option value="">No reviewer</option>
              {reviewers.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </Select>
          </Field>
          <Field label="Due date">
            <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          </Field>
        </div>
      </div>
    </Modal>
  );
}
