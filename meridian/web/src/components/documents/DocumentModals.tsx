import { useEffect, useRef, useState, type DragEvent, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, FileText, UploadCloud, X, XCircle } from "lucide-react";
import { api } from "@/lib/api";
import { LABELS, TONES, daysUntil, fmtBytes, fmtDate, fmtDateTime } from "@/lib/format";
import type { Contract, Document, DocumentType, Paged } from "@/lib/types";
import { Badge, Button, DescriptionList, Field, Input, Modal, Select, Textarea, cn } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { DaysLabel, VendorPicker, errorMessage } from "@/components/contracts/shared";

export const DOCUMENT_TYPES: DocumentType[] = ["soc2", "iso27001", "insurance", "pen_test", "dpa", "financial", "policy", "other"];
const ALLOWED_EXTENSIONS = ["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "csv", "txt", "rtf", "odt", "ods", "png", "jpg", "jpeg", "gif", "webp", "heic", "tif", "tiff", "zip"];
export const DOCUMENT_ACCEPT = ALLOWED_EXTENSIONS.map((e) => `.${e}`).join(",");
const ACCEPT = DOCUMENT_ACCEPT;
const MAX_BYTES = 50 * 1024 * 1024;
export const EXPIRY_HINT_DAYS = 45;

export function fileTypeError(fileName: string): string | null {
  const m = /\.([a-z0-9]+)$/i.exec(fileName.trim());
  if (m && ALLOWED_EXTENSIONS.includes(m[1].toLowerCase())) return null;
  return `“${fileName}” is not a supported file type. Upload a PDF, Office document (Word, Excel, PowerPoint, CSV, TXT), image (PNG, JPG, GIF, WebP, TIFF) or ZIP archive.`;
}

export function PendingExpiryHint({ doc, className }: { doc: Pick<Document, "status" | "expiry_date">; className?: string }) {
  if (doc.status !== "pending_review" || !doc.expiry_date) return null;
  const d = daysUntil(doc.expiry_date);
  if (d == null || d > EXPIRY_HINT_DAYS) return null;
  const expired = d < 0;
  return (
    <span className={cn("mt-1 flex items-center gap-1 text-[11px] font-medium whitespace-nowrap", expired ? "text-danger-700" : "text-warning-700", className)} title={`Expiry date ${fmtDate(doc.expiry_date)}`}>
      <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden />
      {expired ? "expired" : d === 0 ? "expires today" : `expires in ${d}d`}
    </span>
  );
}

export function useInvalidateDocuments() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["documents"] });
    qc.invalidateQueries({ queryKey: ["documents-summary"] });
    qc.invalidateQueries({ queryKey: ["contract"] });
    qc.invalidateQueries({ queryKey: ["vendor"] });
    qc.invalidateQueries({ queryKey: ["vendors"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
  };
}

function guessType(fileName: string): DocumentType | null {
  const n = fileName.toLowerCase();
  if (/soc[\s_-]?2/.test(n)) return "soc2";
  if (/iso[\s_-]?27001/.test(n)) return "iso27001";
  if (/insur|\bcoi\b/.test(n)) return "insurance";
  if (/pen[\s_-]?test|pentest/.test(n)) return "pen_test";
  if (/\bdpa\b|data[\s_-]?processing/.test(n)) return "dpa";
  if (/financ|10-?k|annual[\s_-]?report/.test(n)) return "financial";
  if (/polic/.test(n)) return "policy";
  return null;
}
function prettyName(fileName: string) {
  return fileName.replace(/\.[^.]+$/, "").replace(/[_]+/g, " ").replace(/\s+/g, " ").trim();
}

function Dropzone({ file, onFile, error }: { file: File | null; onFile: (f: File | null) => void; error?: string }) {
  const [over, setOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) onFile(f);
  };
  if (file) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-ink-200 bg-ink-50/60 px-3 py-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-brand-50 text-brand-600"><FileText className="h-4.5 w-4.5" /></span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-mono text-xs text-ink-800" title={file.name}>{file.name}</p>
          <p className="text-xs text-ink-500 tnum">{fmtBytes(file.size)}{file.type ? ` · ${file.type}` : ""}</p>
        </div>
        <Button type="button" variant="ghost" size="xs" icon={X} onClick={() => onFile(null)} aria-label="Remove file">Remove</Button>
      </div>
    );
  }
  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); inputRef.current?.click(); } }}
        onDragEnter={(e) => { e.preventDefault(); setOver(true); }}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        data-testid="dropzone"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? "document-file-error" : undefined}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-7 text-center transition-colors focus-ring",
          over ? "border-brand-500 bg-brand-50" : error ? "border-danger-600/60 bg-danger-50/40" : "border-ink-200 bg-ink-50/50 hover:border-brand-300 hover:bg-brand-50/40"
        )}
      >
        <UploadCloud className={cn("mb-2 h-7 w-7", over ? "text-brand-600" : "text-ink-400")} />
        <p className="text-sm font-medium text-ink-800">{over ? "Drop to attach" : <>Drag & drop a file, or <span className="text-brand-700">browse</span></>}</p>
        <p className="mt-1 text-xs text-ink-500">PDF, Office, image or ZIP up to 50 MB</p>
        <input ref={inputRef} type="file" accept={ACCEPT} className="hidden" onChange={(e) => { onFile(e.target.files?.[0] ?? null); e.target.value = ""; }} />
      </div>
      {error && <p id="document-file-error" role="alert" className="mt-1 text-xs text-danger-600">{error}</p>}
    </div>
  );
}

export function DocumentUploadModal({ open, onClose, defaultVendorId, defaultContractId }: { open: boolean; onClose: () => void; defaultVendorId?: number | null; defaultContractId?: number | null }) {
  const { toast } = useToast();
  const invalidate = useInvalidateDocuments();
  const [vendorId, setVendorId] = useState<number | null>(defaultVendorId ?? null);
  const [contractId, setContractId] = useState<string>(defaultContractId ? String(defaultContractId) : "");
  const [name, setName] = useState("");
  const [type, setType] = useState<DocumentType>("soc2");
  const [issued, setIssued] = useState("");
  const [expiry, setExpiry] = useState("");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [nameTouched, setNameTouched] = useState(false);
  const [typeTouched, setTypeTouched] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setVendorId(defaultVendorId ?? null); setContractId(defaultContractId ? String(defaultContractId) : "");
    setName(""); setType("soc2"); setIssued(""); setExpiry(""); setNotes(""); setFile(null); setFileError(null);
    setNameTouched(false); setTypeTouched(false); setSubmitted(false);
  }, [open, defaultVendorId, defaultContractId]);

  const contracts = useQuery({
    queryKey: ["contracts", { vendor_id: vendorId, limit: 100, picker: true }],
    queryFn: () => api.get<Paged<Contract>>(`/api/contracts?vendor_id=${vendorId}&limit=100&sort=title`).then((r) => r.data),
    enabled: open && !!vendorId,
  });

  const onFile = (f: File | null) => {
    const typeErr = f ? fileTypeError(f.name) : null;
    setFileError(typeErr);
    if (typeErr) { setFile(null); return; }
    setFile(f);
    if (f && !nameTouched) setName(prettyName(f.name));
    if (f && !typeTouched) { const g = guessType(f.name); if (g) setType(g); }
  };

  const errors: Record<string, string> = {};
  if (!vendorId) errors.vendor = "Select a vendor";
  if (!name.trim()) errors.name = "Name is required";
  if (!file) errors.file = "Attach the evidence file";
  else if (file.size > MAX_BYTES) errors.file = "File exceeds the 50 MB limit";
  if (issued && expiry && expiry < issued) errors.expiry = "Expiry must be after the issue date";
  const err = (k: string) => (submitted ? errors[k] : undefined);

  const save = useMutation({
    mutationFn: () => api.post<{ data: Document }>("/api/documents", {
      vendor_id: vendorId!, contract_id: contractId ? Number(contractId) : null, name: name.trim(), type,
      issued_date: issued || null, expiry_date: expiry || null, file_name: file?.name ?? null, file_size: file?.size ?? 0, notes: notes.trim() || null,
    }),
    onSuccess: (r) => {
      toast("success", "Document uploaded", `${r.data.name} is pending review`);
      invalidate();
      onClose();
    },
    onError: (e) => toast("error", "Upload failed", errorMessage(e)),
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (Object.keys(errors).length === 0) save.mutate();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="Upload document"
      description="Add assurance evidence to the library. New uploads start in Pending review."
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose} disabled={save.isPending}>Cancel</Button>
          <Button type="submit" form="doc-upload-form" icon={UploadCloud} loading={save.isPending}>Upload</Button>
        </>
      }
    >
      <form id="doc-upload-form" onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2" noValidate>
        <div className="sm:col-span-2">
          <Dropzone file={file} onFile={onFile} error={fileError ?? err("file")} />
        </div>
        <div className="sm:col-span-2">
          <span className="mb-1.5 block text-sm font-medium text-ink-700">Vendor<span className="ml-0.5 text-danger-600">*</span></span>
          <VendorPicker value={vendorId} onChange={(id) => { setVendorId(id); setContractId(""); }} invalid={!!err("vendor")} />
          {err("vendor") && <span className="mt-1 block text-xs text-danger-600">{err("vendor")}</span>}
        </div>
        <Field label="Document name" required error={err("name")} className="sm:col-span-2">
          <Input value={name} onChange={(e) => { setName(e.target.value); setNameTouched(true); }} placeholder="e.g. SOC 2 Type II Report FY2026" invalid={!!err("name")} />
        </Field>
        <Field label="Type" required>
          <Select value={type} onChange={(e) => { setType(e.target.value as DocumentType); setTypeTouched(true); }}>
            {DOCUMENT_TYPES.map((t) => <option key={t} value={t}>{LABELS.documentType[t]}</option>)}
          </Select>
        </Field>
        <Field label="Linked contract" hint={!vendorId ? "Select a vendor first" : undefined}>
          <Select value={contractId} onChange={(e) => setContractId(e.target.value)} disabled={!vendorId}>
            <option value="">None</option>
            {(contracts.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.contract_number} · {c.title}</option>)}
          </Select>
        </Field>
        <Field label="Issued">
          <Input type="date" value={issued} onChange={(e) => setIssued(e.target.value)} />
        </Field>
        <Field label="Expires" error={err("expiry")} hint="Leave blank if the document does not expire">
          <Input type="date" value={expiry} min={issued || undefined} onChange={(e) => setExpiry(e.target.value)} invalid={!!err("expiry")} />
        </Field>
        <Field label="Notes" className="sm:col-span-2">
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Scope, auditor, exceptions noted…" />
        </Field>
      </form>
    </Modal>
  );
}

export function DocumentEditModal({ doc, onClose }: { doc: Document | null; onClose: () => void }) {
  const { toast } = useToast();
  const invalidate = useInvalidateDocuments();
  const [name, setName] = useState("");
  const [type, setType] = useState<DocumentType>("other");
  const [issued, setIssued] = useState("");
  const [expiry, setExpiry] = useState("");
  const [notes, setNotes] = useState("");
  const [submitted, setSubmitted] = useState(false);
  useEffect(() => {
    if (!doc) return;
    setName(doc.name); setType(doc.type); setIssued(doc.issued_date ?? ""); setExpiry(doc.expiry_date ?? ""); setNotes(doc.notes ?? ""); setSubmitted(false);
  }, [doc]);
  const errors: Record<string, string> = {};
  if (!name.trim()) errors.name = "Name is required";
  if (issued && expiry && expiry < issued) errors.expiry = "Expiry must be after the issue date";
  const save = useMutation({
    mutationFn: () => api.patch<{ data: Document }>(`/api/documents/${doc!.id}`, { name: name.trim(), type, issued_date: issued || null, expiry_date: expiry || null, notes: notes.trim() || null }),
    onSuccess: () => { toast("success", "Document updated"); invalidate(); onClose(); },
    onError: (e) => toast("error", "Could not update document", errorMessage(e)),
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    if (Object.keys(errors).length === 0) save.mutate();
  };
  return (
    <Modal
      open={!!doc}
      onClose={onClose}
      title="Edit document"
      description={doc?.file_name ?? undefined}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose} disabled={save.isPending}>Cancel</Button>
          <Button type="submit" form="doc-edit-form" loading={save.isPending}>Save changes</Button>
        </>
      }
    >
      <form id="doc-edit-form" onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-2" noValidate>
        <Field label="Document name" required error={submitted ? errors.name : undefined} className="sm:col-span-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} invalid={submitted && !!errors.name} />
        </Field>
        <Field label="Type" className="sm:col-span-2">
          <Select value={type} onChange={(e) => setType(e.target.value as DocumentType)}>
            {DOCUMENT_TYPES.map((t) => <option key={t} value={t}>{LABELS.documentType[t]}</option>)}
          </Select>
        </Field>
        <Field label="Issued">
          <Input type="date" value={issued} onChange={(e) => setIssued(e.target.value)} />
        </Field>
        <Field label="Expires" error={submitted ? errors.expiry : undefined}>
          <Input type="date" value={expiry} min={issued || undefined} onChange={(e) => setExpiry(e.target.value)} invalid={submitted && !!errors.expiry} />
        </Field>
        <Field label="Notes" className="sm:col-span-2">
          <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </form>
    </Modal>
  );
}

export function DocumentReviewModal({ doc, onClose }: { doc: Document | null; onClose: () => void }) {
  const { toast } = useToast();
  const invalidate = useInvalidateDocuments();
  const [note, setNote] = useState("");
  const [rejecting, setRejecting] = useState(false);
  useEffect(() => { if (doc) { setNote(""); setRejecting(false); } }, [doc]);
  const decide = useMutation({
    mutationFn: (status: "valid" | "rejected") => {
      const stamp = `[${status === "valid" ? "Approved" : "Rejected"} ${fmtDate(new Date().toISOString())}] ${note.trim()}`.trim();
      const notes = note.trim() ? [doc!.notes, stamp].filter(Boolean).join("\n") : doc!.notes;
      return api.patch<{ data: Document }>(`/api/documents/${doc!.id}`, { status, notes: notes ?? null });
    },
    onSuccess: (r, status) => {
      toast("success", status === "valid" ? "Document approved" : "Document rejected", r.data.name);
      invalidate();
      onClose();
    },
    onError: (e) => toast("error", "Review failed", errorMessage(e)),
  });
  const expired = !!doc?.expiry_date && doc.expiry_date < new Date().toISOString().slice(0, 10);
  return (
    <Modal
      open={!!doc}
      onClose={onClose}
      title="Review document"
      description="Confirm the evidence is authentic, in scope and current before accepting it."
      footer={
        rejecting ? (
          <>
            <Button variant="secondary" onClick={() => setRejecting(false)} disabled={decide.isPending}>Back</Button>
            <Button variant="danger" icon={XCircle} disabled={!note.trim()} loading={decide.isPending && decide.variables === "rejected"} onClick={() => decide.mutate("rejected")}>Reject document</Button>
          </>
        ) : (
          <>
            <Button variant="secondary" icon={XCircle} onClick={() => setRejecting(true)} disabled={decide.isPending}>Reject…</Button>
            <Button icon={CheckCircle2} loading={decide.isPending && decide.variables === "valid"} onClick={() => decide.mutate("valid")}>Approve</Button>
          </>
        )
      }
    >
      {doc && (
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-lg border border-ink-200 bg-ink-50/60 p-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-white text-brand-600 ring-1 ring-ink-200"><FileText className="h-4.5 w-4.5" /></span>
            <div className="min-w-0 flex-1">
              <p className="font-medium text-ink-900">{doc.name}</p>
              <p className="truncate font-mono text-xs text-ink-500">{doc.file_name ?? "No file"} · {fmtBytes(doc.file_size ?? 0)}</p>
            </div>
            <Badge tone={TONES.documentStatus[doc.status]} dot>{LABELS.documentStatus[doc.status]}</Badge>
          </div>
          <DescriptionList
            items={[
              { label: "Vendor", value: <Link to={`/vendors/${doc.vendor_id}`} className="text-brand-700 hover:underline">{doc.vendor_name}</Link> },
              { label: "Type", value: LABELS.documentType[doc.type] },
              { label: "Issued", value: fmtDate(doc.issued_date) },
              { label: "Expires", value: doc.expiry_date ? <span>{fmtDate(doc.expiry_date)} <DaysLabel date={doc.expiry_date} className="ml-1 text-xs" /></span> : "No expiry" },
              { label: "Uploaded", value: `${doc.uploaded_by_name ?? "—"} · ${fmtDateTime(doc.created_at)}` },
              { label: "Contract", value: doc.contract_id ? <Link to={`/contracts/${doc.contract_id}`} className="text-brand-700 hover:underline">{doc.contract_title ?? `#${doc.contract_id}`}</Link> : "—" },
            ]}
          />
          {doc.notes && <p className="whitespace-pre-line rounded-md bg-ink-50 px-3 py-2 text-sm text-ink-700">{doc.notes}</p>}
          {expired && <p className="rounded-md border border-warning-600/30 bg-warning-50 px-3 py-2 text-sm text-warning-700">This document is past its expiry date — approving it will immediately mark it Expired.</p>}
          {rejecting ? (
            <Field label="Reason for rejection" required hint="Recorded in the document notes and activity log.">
              <Textarea autoFocus rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Report covers the wrong entity; bridge letter missing." />
            </Field>
          ) : (
            <Field label="Review note" hint="Optional — appended to the document notes.">
              <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Unqualified opinion, no exceptions." />
            </Field>
          )}
        </div>
      )}
    </Modal>
  );
}
