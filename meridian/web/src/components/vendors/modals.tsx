import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, FileUp, Paperclip, X } from "lucide-react";
import { Button, Checkbox, Field, Input, Modal, Select, Textarea, cn } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/api";
import { useUsers } from "@/lib/hooks";
import { LABELS, TONES, fmtBytes } from "@/lib/format";
import type { AssessmentTemplate, DataAccess, Severity, Tier, User, VendorDetail, VendorStatus } from "@/lib/types";
import { DataAccessPicker, RiskPreview } from "./parts";
import { EMAIL_RE, URL_RE, addMonthsIso, computeInherentRisk, errorMessage, normalizeUrl, tierFromInherent, todayIso, useReviewCadence } from "./risk";

type Errors = Record<string, string>;

function useVendorInvalidate(id: number) {
  const qc = useQueryClient();
  return (...extra: string[]) => {
    qc.invalidateQueries({ queryKey: ["vendor", id] });
    qc.invalidateQueries({ queryKey: ["vendors"] });
    for (const k of extra) qc.invalidateQueries({ queryKey: [k] });
  };
}

function useWriters() {
  const users = useUsers();
  return useMemo(() => (users.data ?? []).filter((u: User) => u.active && u.role !== "auditor"), [users.data]);
}

function addDaysIso(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function ConfirmModal({ open, onClose, onConfirm, title, description, confirmLabel = "Confirm", danger, loading, children }: { open: boolean; onClose: () => void; onConfirm: () => void; title: ReactNode; description?: ReactNode; confirmLabel?: string; danger?: boolean; loading?: boolean; children?: ReactNode }) {
  return (
    <Modal open={open} onClose={onClose} title={title} size="sm" footer={<><Button variant="secondary" onClick={onClose} disabled={loading}>Cancel</Button><Button variant={danger ? "danger" : "primary"} onClick={onConfirm} loading={loading}>{confirmLabel}</Button></>}>
      <div className="flex gap-3">
        {danger && <span className="h-9 w-9 rounded-full bg-danger-50 text-danger-600 flex items-center justify-center shrink-0"><AlertTriangle className="h-4.5 w-4.5" /></span>}
        <div className="text-sm text-ink-600 space-y-3 min-w-0 flex-1">
          {description && <p>{description}</p>}
          {children}
        </div>
      </div>
    </Modal>
  );
}

interface EditForm { name: string; legal_name: string; category: string; website: string; country: string; description: string; services: string; data_access: DataAccess; annual_spend: string; owner_id: string; tier: Tier; next_review_date: string }

export function EditVendorModal({ vendor, open, onClose }: { vendor: VendorDetail; open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const invalidate = useVendorInvalidate(vendor.id);
  const owners = useWriters();
  const cadence = useReviewCadence();
  const categories = useQuery({ queryKey: ["vendor-categories"], queryFn: () => api.get<{ data: string[] }>("/api/vendors/categories").then((r) => r.data), staleTime: Infinity });
  const init = (): EditForm => ({
    name: vendor.name, legal_name: vendor.legal_name ?? "", category: vendor.category, website: vendor.website ?? "", country: vendor.country ?? "",
    description: vendor.description ?? "", services: vendor.services ?? "", data_access: vendor.data_access, annual_spend: String(vendor.annual_spend ?? 0),
    owner_id: vendor.owner_id ? String(vendor.owner_id) : "", tier: vendor.tier, next_review_date: vendor.next_review_date?.slice(0, 10) ?? "",
  });
  const [f, setF] = useState<EditForm>(init);
  const [errors, setErrors] = useState<Errors>({});
  useEffect(() => { if (open) { setF(init()); setErrors({}); } }, [open]);
  const set = <K extends keyof EditForm>(k: K, v: EditForm[K]) => { setF((p) => ({ ...p, [k]: v })); setErrors((e) => { const n = { ...e }; delete n[k as string]; return n; }); };
  const spend = Number(f.annual_spend) || 0;
  const computedTier = tierFromInherent(computeInherentRisk({ data_access: f.data_access, annual_spend: spend, category: f.category }));

  const save = useMutation({
    mutationFn: () => api.patch(`/api/vendors/${vendor.id}`, {
      name: f.name.trim(), legal_name: f.legal_name.trim() || null, category: f.category, website: normalizeUrl(f.website) || null, country: f.country.trim() || null,
      description: f.description.trim() || null, services: f.services.trim() || null, data_access: f.data_access, annual_spend: spend,
      owner_id: f.owner_id ? Number(f.owner_id) : null, tier: f.tier, next_review_date: f.next_review_date || null,
    }),
    onSuccess: () => { invalidate(); toast("success", "Vendor updated"); onClose(); },
    onError: (e) => toast("error", "Could not update vendor", errorMessage(e)),
  });
  const submit = () => {
    const e: Errors = {};
    if (!f.name.trim()) e.name = "Name is required";
    if (!f.category) e.category = "Select a category";
    if (f.website.trim() && !URL_RE.test(f.website.trim())) e.website = "Enter a valid URL";
    if (f.annual_spend.trim() === "" || !Number.isFinite(Number(f.annual_spend)) || Number(f.annual_spend) < 0) e.annual_spend = "Enter a positive amount";
    setErrors(e);
    if (!Object.keys(e).length) save.mutate();
  };

  return (
    <Modal open={open} onClose={onClose} size="xl" title="Edit vendor" description="Changes to data access, spend or category recalculate inherent and residual risk."
      footer={<><Button variant="secondary" onClick={onClose} disabled={save.isPending}>Cancel</Button><Button onClick={submit} loading={save.isPending}>Save changes</Button></>}>
      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Vendor name" required error={errors.name}><Input value={f.name} invalid={!!errors.name} onChange={(e) => set("name", e.target.value)} /></Field>
            <Field label="Legal name"><Input value={f.legal_name} onChange={(e) => set("legal_name", e.target.value)} /></Field>
            <Field label="Category" required error={errors.category}>
              <Select value={f.category} invalid={!!errors.category} onChange={(e) => set("category", e.target.value)}>
                {(categories.data ?? [f.category]).map((c) => <option key={c} value={c}>{c}</option>)}
              </Select>
            </Field>
            <Field label="Country"><Input value={f.country} onChange={(e) => set("country", e.target.value)} /></Field>
            <Field label="Website" error={errors.website} className="sm:col-span-2"><Input value={f.website} invalid={!!errors.website} onChange={(e) => set("website", e.target.value)} placeholder="https://" /></Field>
            <Field label="Description" className="sm:col-span-2"><Textarea rows={2} value={f.description} onChange={(e) => set("description", e.target.value)} /></Field>
            <Field label="Services" className="sm:col-span-2"><Input value={f.services} onChange={(e) => set("services", e.target.value)} /></Field>
          </div>
          <div>
            <p className="text-sm font-medium text-ink-700 mb-2">Data access</p>
            <DataAccessPicker value={f.data_access} onChange={(v) => set("data_access", v)} />
          </div>
        </div>
        <div className="lg:col-span-2 space-y-4">
          <Field label="Annual spend (USD)" required error={errors.annual_spend}>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-ink-400 pointer-events-none">$</span>
              <Input type="number" min={0} step={1000} className="pl-7 tnum" value={f.annual_spend} invalid={!!errors.annual_spend} onChange={(e) => set("annual_spend", e.target.value)} />
            </div>
          </Field>
          <Field label="Owner">
            <Select value={f.owner_id} onChange={(e) => set("owner_id", e.target.value)}>
              <option value="">Unassigned</option>
              {owners.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </Select>
          </Field>
          <Field label="Tier" hint={f.tier !== computedTier ? <span>Computed tier is <span className="font-medium">{LABELS.tier[computedTier]}</span> · <button type="button" className="text-brand-700 hover:underline" onClick={() => set("tier", computedTier)}>Use computed</button></span> : "Matches the computed tier"}>
            <Select value={f.tier} onChange={(e) => set("tier", e.target.value as Tier)}>
              {(["critical", "high", "medium", "low"] as Tier[]).map((t) => <option key={t} value={t}>{LABELS.tier[t]}</option>)}
            </Select>
          </Field>
          <Field label="Next review date" hint={<button type="button" className="text-brand-700 hover:underline" onClick={() => set("next_review_date", addMonthsIso(cadence[f.tier]))}>Set to {cadence[f.tier]}-month cadence</button>}>
            <Input type="date" value={f.next_review_date} onChange={(e) => set("next_review_date", e.target.value)} />
          </Field>
          <div className="rounded-lg border border-ink-200 bg-ink-50/60 p-4">
            <RiskPreview dataAccess={f.data_access} annualSpend={spend} category={f.category} cadenceMonths={cadence} compact />
          </div>
        </div>
      </div>
    </Modal>
  );
}

export function StartAssessmentModal({ vendor, open, onClose }: { vendor: VendorDetail; open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const invalidate = useVendorInvalidate(vendor.id);
  const people = useWriters();
  const templates = useQuery({ queryKey: ["assessments", "templates", "picker"], queryFn: () => api.get<{ data: AssessmentTemplate[] }>("/api/assessments/templates").then((r) => r.data.filter((t) => t.active)), enabled: open });
  const [templateId, setTemplateId] = useState("");
  const [title, setTitle] = useState("");
  const [assignee, setAssignee] = useState("");
  const [reviewer, setReviewer] = useState("");
  const [due, setDue] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  useEffect(() => {
    if (!open) return;
    setTemplateId(""); setTitle(""); setReviewer(""); setErrors({});
    setAssignee(vendor.owner_id ? String(vendor.owner_id) : "");
    setDue(addDaysIso(30));
  }, [open, vendor.owner_id]);
  const tpl = templates.data?.find((t) => String(t.id) === templateId);

  const create = useMutation({
    mutationFn: () => api.post<{ data: { id: number } }>("/api/assessments", {
      vendor_id: vendor.id, template_id: Number(templateId), title: title.trim() || undefined,
      assigned_to: assignee ? Number(assignee) : null, reviewer_id: reviewer ? Number(reviewer) : null, due_date: due || null,
    }),
    onSuccess: (r) => { invalidate("assessments"); toast("success", "Assessment started", tpl?.name); onClose(); navigate(`/assessments/${r.data.id}`); },
    onError: (e) => toast("error", "Could not start assessment", errorMessage(e)),
  });
  const submit = () => {
    const e: Errors = {};
    if (!templateId) e.template = "Select a questionnaire template";
    if (assignee && reviewer && assignee === reviewer) e.reviewer = "Reviewer must be different from the assignee";
    if (due && due < todayIso()) e.due = "Due date cannot be in the past";
    setErrors(e);
    if (!Object.keys(e).length) create.mutate();
  };

  return (
    <Modal open={open} onClose={onClose} title="Start assessment" description={`Send a due-diligence questionnaire for ${vendor.name}.`}
      footer={<><Button variant="secondary" onClick={onClose} disabled={create.isPending}>Cancel</Button><Button onClick={submit} loading={create.isPending}>Start assessment</Button></>}>
      <div className="space-y-4">
        <Field label="Template" required error={errors.template}>
          <Select value={templateId} invalid={!!errors.template} onChange={(e) => { setTemplateId(e.target.value); setErrors((x) => ({ ...x, template: "" })); }} disabled={templates.isLoading}>
            <option value="">{templates.isLoading ? "Loading templates…" : "Select a template…"}</option>
            {(templates.data ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}{t.framework ? ` (${t.framework})` : ""}</option>)}
          </Select>
        </Field>
        {tpl && (
          <div className="rounded-lg border border-brand-100 bg-brand-50/50 px-3.5 py-3 text-sm">
            <p className="text-ink-700">{tpl.description}</p>
            <p className="text-xs text-ink-500 mt-1.5 tnum">{tpl.question_count ?? 0} questions · v{tpl.version}{tpl.framework ? ` · ${tpl.framework}` : ""}</p>
          </div>
        )}
        <Field label="Title" hint={tpl ? `Defaults to “${tpl.name} — ${vendor.name}”` : "Optional"}>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={tpl ? `${tpl.name} — ${vendor.name}` : ""} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Assignee" hint="Completes the questionnaire">
            <Select value={assignee} onChange={(e) => setAssignee(e.target.value)}>
              <option value="">Me</option>
              {people.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </Select>
          </Field>
          <Field label="Reviewer" error={errors.reviewer} hint="Signs off the results">
            <Select value={reviewer} invalid={!!errors.reviewer} onChange={(e) => setReviewer(e.target.value)}>
              <option value="">Unassigned</option>
              {people.filter((u) => u.role === "admin" || u.role === "risk_analyst").map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </Select>
          </Field>
          <Field label="Due date" error={errors.due}>
            <Input type="date" value={due} invalid={!!errors.due} onChange={(e) => setDue(e.target.value)} />
          </Field>
        </div>
      </div>
    </Modal>
  );
}

const DOC_TYPES = ["soc2", "iso27001", "insurance", "pen_test", "dpa", "financial", "policy", "other"] as const;
const DOC_VALIDITY_MONTHS: Record<string, number> = { soc2: 12, iso27001: 36, insurance: 12, pen_test: 12, dpa: 36, financial: 12, policy: 24, other: 12 };

export function UploadDocumentModal({ vendor, open, onClose }: { vendor: VendorDetail; open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const invalidate = useVendorInvalidate(vendor.id);
  const fileRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [type, setType] = useState<string>("soc2");
  const [issued, setIssued] = useState("");
  const [expiry, setExpiry] = useState("");
  const [contractId, setContractId] = useState("");
  const [file, setFile] = useState<{ name: string; size: number } | null>(null);
  const [notes, setNotes] = useState("");
  const [drag, setDrag] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  useEffect(() => {
    if (!open) return;
    setName(""); setType("soc2"); setIssued(todayIso()); setExpiry(addMonthsIso(12)); setContractId(""); setFile(null); setNotes(""); setErrors({});
  }, [open]);
  const pick = (fl: FileList | null) => {
    const x = fl?.[0];
    if (!x) return;
    setFile({ name: x.name, size: x.size });
    if (!name) setName(x.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " "));
    setErrors((e) => ({ ...e, file: "" }));
  };
  const changeType = (t: string) => {
    setType(t);
    if (issued) {
      const d = new Date(`${issued}T00:00:00`);
      setExpiry(addMonthsIso(DOC_VALIDITY_MONTHS[t] ?? 12, d));
    }
  };

  const create = useMutation({
    mutationFn: () => api.post("/api/documents", {
      vendor_id: vendor.id, contract_id: contractId ? Number(contractId) : null, name: name.trim(), type,
      issued_date: issued || null, expiry_date: expiry || null, file_name: file?.name ?? null, file_size: file?.size ?? 0, notes: notes.trim() || null,
    }),
    onSuccess: () => { invalidate("documents"); toast("success", "Document uploaded", "It is pending review."); onClose(); },
    onError: (e) => toast("error", "Could not upload document", errorMessage(e)),
  });
  const submit = () => {
    const e: Errors = {};
    if (!name.trim()) e.name = "Document name is required";
    if (!file) e.file = "Attach a file";
    if (issued && expiry && expiry <= issued) e.expiry = "Expiry must be after the issue date";
    setErrors(e);
    if (!Object.keys(e).filter((k) => e[k]).length) create.mutate();
  };

  return (
    <Modal open={open} onClose={onClose} size="lg" title="Upload document" description={`Add evidence such as certifications or insurance for ${vendor.name}.`}
      footer={<><Button variant="secondary" onClick={onClose} disabled={create.isPending}>Cancel</Button><Button icon={FileUp} onClick={submit} loading={create.isPending}>Upload</Button></>}>
      <div className="space-y-4">
        <div>
          <input ref={fileRef} type="file" className="sr-only" onChange={(e) => pick(e.target.files)} aria-label="Choose file" />
          {file ? (
            <div className="flex items-center gap-3 rounded-lg border border-ink-200 bg-ink-50/60 px-3.5 py-3">
              <span className="h-9 w-9 rounded-md bg-brand-50 text-brand-600 flex items-center justify-center shrink-0"><Paperclip className="h-4 w-4" /></span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink-900 truncate">{file.name}</p>
                <p className="text-xs text-ink-500 tnum">{fmtBytes(file.size)}</p>
              </div>
              <Button variant="ghost" size="xs" icon={X} onClick={() => setFile(null)} aria-label="Remove file">Remove</Button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files); }}
              className={cn("w-full rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors focus-ring", errors.file ? "border-danger-600/60 bg-danger-50/40" : drag ? "border-brand-400 bg-brand-50" : "border-ink-200 hover:border-brand-300 hover:bg-brand-50/30")}
            >
              <FileUp className="h-6 w-6 text-ink-400 mx-auto" />
              <p className="text-sm font-medium text-ink-800 mt-2">Drop a file here or <span className="text-brand-700">browse</span></p>
              <p className="text-xs text-ink-500 mt-0.5">PDF, DOCX, XLSX or images. Files are recorded for tracking only.</p>
            </button>
          )}
          {errors.file && <p className="text-xs text-danger-600 mt-1">{errors.file}</p>}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Document name" required error={errors.name} className="sm:col-span-2">
            <Input value={name} invalid={!!errors.name} onChange={(e) => { setName(e.target.value); setErrors((x) => ({ ...x, name: "" })); }} placeholder="e.g. SOC 2 Type II Report 2026" />
          </Field>
          <Field label="Type" required>
            <Select value={type} onChange={(e) => changeType(e.target.value)}>
              {DOC_TYPES.map((t) => <option key={t} value={t}>{LABELS.documentType[t]}</option>)}
            </Select>
          </Field>
          <Field label="Related contract">
            <Select value={contractId} onChange={(e) => setContractId(e.target.value)}>
              <option value="">None</option>
              {vendor.contracts.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
            </Select>
          </Field>
          <Field label="Issued">
            <Input type="date" value={issued} onChange={(e) => setIssued(e.target.value)} />
          </Field>
          <Field label="Expires" error={errors.expiry} hint={`Typical validity: ${DOC_VALIDITY_MONTHS[type]} months`}>
            <Input type="date" value={expiry} invalid={!!errors.expiry} onChange={(e) => { setExpiry(e.target.value); setErrors((x) => ({ ...x, expiry: "" })); }} />
          </Field>
          <Field label="Notes" className="sm:col-span-2">
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Scope, exceptions, auditor, etc." />
          </Field>
        </div>
      </div>
    </Modal>
  );
}

const SEVERITIES: Severity[] = ["critical", "high", "medium", "low"];
const SEVERITY_DUE_DAYS: Record<Severity, number> = { critical: 14, high: 30, medium: 60, low: 90 };

export function RaiseFindingModal({ vendor, open, onClose }: { vendor: VendorDetail; open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const invalidate = useVendorInvalidate(vendor.id);
  const people = useWriters();
  const [title, setTitle] = useState("");
  const [severity, setSeverity] = useState<Severity>("medium");
  const [description, setDescription] = useState("");
  const [owner, setOwner] = useState("");
  const [due, setDue] = useState("");
  const [plan, setPlan] = useState("");
  const [assessmentId, setAssessmentId] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  useEffect(() => {
    if (!open) return;
    setTitle(""); setSeverity("medium"); setDescription(""); setPlan(""); setAssessmentId(""); setErrors({});
    setOwner(vendor.owner_id ? String(vendor.owner_id) : "");
    setDue(addDaysIso(SEVERITY_DUE_DAYS.medium));
  }, [open, vendor.owner_id]);
  const pickSeverity = (s: Severity) => { setSeverity(s); setDue(addDaysIso(SEVERITY_DUE_DAYS[s])); };

  const create = useMutation({
    mutationFn: () => api.post("/api/findings", {
      vendor_id: vendor.id, assessment_id: assessmentId ? Number(assessmentId) : null, title: title.trim(), description: description.trim() || null,
      severity, owner_id: owner ? Number(owner) : null, due_date: due || null, remediation_plan: plan.trim() || null,
    }),
    onSuccess: () => { invalidate("findings"); toast("success", "Finding raised", "Residual risk has been recalculated."); onClose(); },
    onError: (e) => toast("error", "Could not raise finding", errorMessage(e)),
  });
  const submit = () => {
    const e: Errors = {};
    if (!title.trim()) e.title = "Title is required";
    else if (title.trim().length < 5) e.title = "Use a more descriptive title";
    if (due && due < todayIso()) e.due = "Due date cannot be in the past";
    setErrors(e);
    if (!Object.keys(e).length) create.mutate();
  };
  const sevStyle: Record<string, string> = { danger: "border-danger-600 bg-danger-50 text-danger-700 ring-1 ring-danger-600", warning: "border-warning-600 bg-warning-50 text-warning-700 ring-1 ring-warning-600", info: "border-sky-500 bg-sky-50 text-sky-700 ring-1 ring-sky-500", success: "border-success-600 bg-success-50 text-success-700 ring-1 ring-success-600" };

  return (
    <Modal open={open} onClose={onClose} size="lg" title="Raise finding" description={`Record a control gap or issue identified at ${vendor.name}.`}
      footer={<><Button variant="secondary" onClick={onClose} disabled={create.isPending}>Cancel</Button><Button onClick={submit} loading={create.isPending}>Raise finding</Button></>}>
      <div className="space-y-4">
        <Field label="Title" required error={errors.title}>
          <Input value={title} invalid={!!errors.title} onChange={(e) => { setTitle(e.target.value); setErrors((x) => { const n = { ...x }; delete n.title; return n; }); }} placeholder="e.g. MFA not enforced for administrative access" />
        </Field>
        <div>
          <p className="text-sm font-medium text-ink-700 mb-1.5">Severity <span className="text-danger-600">*</span></p>
          <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label="Severity">
            {SEVERITIES.map((s) => (
              <button key={s} type="button" role="radio" aria-checked={severity === s} onClick={() => pickSeverity(s)}
                className={cn("h-9 rounded-md border text-sm font-medium transition-colors focus-ring", severity === s ? sevStyle[TONES.tier[s]] : "border-ink-200 text-ink-600 hover:bg-ink-50")}>
                {LABELS.tier[s]}
              </button>
            ))}
          </div>
          <p className="text-xs text-ink-500 mt-1">Adds +{({ critical: 12, high: 7, medium: 3, low: 1 } as Record<Severity, number>)[severity]} to residual risk while open · default SLA {SEVERITY_DUE_DAYS[severity]} days</p>
        </div>
        <Field label="Description">
          <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What was observed, and what is the impact?" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Owner">
            <Select value={owner} onChange={(e) => setOwner(e.target.value)}>
              <option value="">Unassigned</option>
              {people.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </Select>
          </Field>
          <Field label="Due date" error={errors.due}>
            <Input type="date" value={due} invalid={!!errors.due} onChange={(e) => setDue(e.target.value)} />
          </Field>
          <Field label="Source assessment">
            <Select value={assessmentId} onChange={(e) => setAssessmentId(e.target.value)}>
              <option value="">None</option>
              {vendor.assessments.map((a) => <option key={a.id} value={a.id}>{a.template_name ?? a.title}</option>)}
            </Select>
          </Field>
        </div>
        <Field label="Remediation plan">
          <Textarea rows={2} value={plan} onChange={(e) => setPlan(e.target.value)} placeholder="Agreed actions and milestones (optional)" />
        </Field>
      </div>
    </Modal>
  );
}

export function AddContactModal({ vendor, open, onClose }: { vendor: VendorDetail; open: boolean; onClose: () => void }) {
  const { toast } = useToast();
  const invalidate = useVendorInvalidate(vendor.id);
  const [f, setF] = useState({ name: "", email: "", phone: "", role: "", is_primary: false });
  const [errors, setErrors] = useState<Errors>({});
  useEffect(() => { if (open) { setF({ name: "", email: "", phone: "", role: "", is_primary: vendor.contacts.length === 0 }); setErrors({}); } }, [open, vendor.contacts.length]);
  const set = (k: keyof typeof f, v: string | boolean) => { setF((p) => ({ ...p, [k]: v })); setErrors((e) => { const n = { ...e }; delete n[k]; return n; }); };
  const create = useMutation({
    mutationFn: () => api.post(`/api/vendors/${vendor.id}/contacts`, { name: f.name.trim(), email: f.email.trim() || null, phone: f.phone.trim() || null, role: f.role.trim() || null, is_primary: f.is_primary }),
    onSuccess: () => { invalidate(); toast("success", "Contact added", f.name); onClose(); },
    onError: (e) => toast("error", "Could not add contact", errorMessage(e)),
  });
  const submit = () => {
    const e: Errors = {};
    if (!f.name.trim()) e.name = "Name is required";
    if (!f.email.trim()) e.email = "Email is required";
    else if (!EMAIL_RE.test(f.email.trim())) e.email = "Enter a valid email address";
    setErrors(e);
    if (!Object.keys(e).length) create.mutate();
  };
  return (
    <Modal open={open} onClose={onClose} title="Add contact" description={`Add a person at ${vendor.name}.`}
      footer={<><Button variant="secondary" onClick={onClose} disabled={create.isPending}>Cancel</Button><Button onClick={submit} loading={create.isPending}>Add contact</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name" required error={errors.name}><Input autoFocus value={f.name} invalid={!!errors.name} onChange={(e) => set("name", e.target.value)} /></Field>
        <Field label="Role / title"><Input value={f.role} onChange={(e) => set("role", e.target.value)} placeholder="e.g. Security Officer" /></Field>
        <Field label="Email" required error={errors.email}><Input type="email" value={f.email} invalid={!!errors.email} onChange={(e) => set("email", e.target.value)} /></Field>
        <Field label="Phone"><Input type="tel" value={f.phone} onChange={(e) => set("phone", e.target.value)} /></Field>
        <div className="sm:col-span-2">
          <Checkbox checked={f.is_primary} onChange={(e) => set("is_primary", e.target.checked)} label="Primary contact (replaces the current primary)" />
        </div>
      </div>
    </Modal>
  );
}

export const STATUS_FLOW: { value: VendorStatus; description: string }[] = [
  { value: "prospect", description: "Being evaluated; not yet engaged" },
  { value: "onboarding", description: "Due diligence and approval in progress" },
  { value: "active", description: "Approved and delivering services" },
  { value: "under_review", description: "Periodic or triggered re-review" },
  { value: "offboarding", description: "Relationship is being wound down" },
  { value: "terminated", description: "Relationship has ended" },
];
