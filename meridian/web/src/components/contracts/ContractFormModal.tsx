import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useUsers } from "@/lib/hooks";
import { LABELS, fmtMoney } from "@/lib/format";
import type { Contract, ContractType } from "@/lib/types";
import { Button, Checkbox, Field, Input, Modal, Select, Textarea } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { VendorPicker, errorMessage } from "./shared";

const TYPES: ContractType[] = ["msa", "sow", "nda", "dpa", "saas", "license", "services"];
const CURRENCIES = ["USD", "EUR", "GBP", "CAD", "AUD", "CHF", "JPY", "SGD"];

interface FormState {
  vendor_id: number | null; title: string; type: ContractType; value: string; currency: string; start_date: string; end_date: string;
  auto_renew: boolean; renewal_notice_days: string; owner_id: string; notes: string;
}

function initial(c: Contract | null | undefined, defaults: { vendorId?: number | null; ownerId?: number | null }): FormState {
  return {
    vendor_id: c?.vendor_id ?? defaults.vendorId ?? null,
    title: c?.title ?? "",
    type: c?.type ?? "msa",
    value: c ? String(c.value ?? 0) : "",
    currency: c?.currency ?? "USD",
    start_date: c?.start_date ?? "",
    end_date: c?.end_date ?? "",
    auto_renew: c ? !!c.auto_renew : false,
    renewal_notice_days: String(c?.renewal_notice_days ?? 60),
    owner_id: String(c?.owner_id ?? defaults.ownerId ?? ""),
    notes: c?.notes ?? "",
  };
}

export function ContractFormModal({ open, onClose, contract, defaultVendorId, onSaved }: { open: boolean; onClose: () => void; contract?: Contract | null; defaultVendorId?: number | null; onSaved?: (c: Contract) => void }) {
  const { user } = useAuth();
  const { data: users = [] } = useUsers();
  const qc = useQueryClient();
  const { toast } = useToast();
  const editing = !!contract;
  const [f, setF] = useState<FormState>(() => initial(contract, { vendorId: defaultVendorId, ownerId: user?.id }));
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (open) { setF(initial(contract, { vendorId: defaultVendorId, ownerId: user?.id })); setTouched(false); }
  }, [open, contract, defaultVendorId, user?.id]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((p) => ({ ...p, [k]: v }));
  const valueNum = f.value.trim() === "" ? 0 : Number(f.value);
  const noticeNum = f.renewal_notice_days.trim() === "" ? 0 : Number(f.renewal_notice_days);
  const errors: Partial<Record<keyof FormState, string>> = {};
  if (!f.vendor_id) errors.vendor_id = "Select a vendor";
  if (!f.title.trim()) errors.title = "Title is required";
  if (!Number.isFinite(valueNum) || valueNum < 0) errors.value = "Enter a non-negative amount";
  if (!Number.isInteger(noticeNum) || noticeNum < 0) errors.renewal_notice_days = "Whole days, 0 or more";
  if (f.start_date && f.end_date && f.end_date < f.start_date) errors.end_date = "End date must be on or after start date";
  const valid = Object.keys(errors).length === 0;

  const save = useMutation({
    mutationFn: () => {
      const body = {
        vendor_id: f.vendor_id!, title: f.title.trim(), type: f.type, value: valueNum, currency: f.currency,
        start_date: f.start_date || null, end_date: f.end_date || null, auto_renew: f.auto_renew, renewal_notice_days: noticeNum,
        owner_id: f.owner_id ? Number(f.owner_id) : null, notes: f.notes.trim() || null,
      };
      return editing ? api.patch<{ data: Contract }>(`/api/contracts/${contract!.id}`, body) : api.post<{ data: Contract }>("/api/contracts", body);
    },
    onSuccess: (r) => {
      toast("success", editing ? "Contract updated" : "Contract created", `${r.data.contract_number} · ${r.data.title}`);
      qc.invalidateQueries({ queryKey: ["contracts"] });
      qc.invalidateQueries({ queryKey: ["contracts-summary"] });
      qc.invalidateQueries({ queryKey: ["contract", r.data.id] });
      qc.invalidateQueries({ queryKey: ["vendor"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      onSaved?.(r.data);
      onClose();
    },
    onError: (e) => toast("error", editing ? "Could not update contract" : "Could not create contract", errorMessage(e)),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (valid) save.mutate();
  };
  const err = (k: keyof FormState) => (touched ? errors[k] : undefined);
  const activeUsers = users.filter((u) => u.active && u.role !== "auditor");

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={editing ? "Edit contract" : "New contract"}
      description={editing ? `${contract!.contract_number} · changes are recorded in the activity log` : "Draft a contract record. You can submit it for procurement approval once it's ready."}
      footer={
        <>
          <Button variant="secondary" type="button" onClick={onClose} disabled={save.isPending}>Cancel</Button>
          <Button type="submit" form="contract-form" loading={save.isPending}>{editing ? "Save changes" : "Create contract"}</Button>
        </>
      }
    >
      <form id="contract-form" onSubmit={submit} className="grid grid-cols-1 gap-4 sm:grid-cols-6" noValidate>
        <div className="sm:col-span-6">
          <span className="mb-1.5 block text-sm font-medium text-ink-700">Vendor<span className="ml-0.5 text-danger-600">*</span></span>
          <VendorPicker value={f.vendor_id} onChange={(id) => set("vendor_id", id)} invalid={!!err("vendor_id")} autoFocus={!editing} />
          {err("vendor_id") && <span className="mt-1 block text-xs text-danger-600">{err("vendor_id")}</span>}
        </div>
        <Field label="Title" required error={err("title")} className="sm:col-span-4">
          <Input value={f.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Master Services Agreement 2027" invalid={!!err("title")} />
        </Field>
        <Field label="Type" required className="sm:col-span-2">
          <Select value={f.type} onChange={(e) => set("type", e.target.value as ContractType)}>
            {TYPES.map((t) => <option key={t} value={t}>{LABELS.contractType[t]}</option>)}
          </Select>
        </Field>
        <Field label="Contract value" error={err("value")} hint={valueNum > 0 ? fmtMoney(valueNum, f.currency) : "Total contract value"} className="sm:col-span-4">
          <Input type="number" inputMode="decimal" min={0} step="any" value={f.value} onChange={(e) => set("value", e.target.value)} placeholder="0" className="tnum" invalid={!!err("value")} />
        </Field>
        <Field label="Currency" className="sm:col-span-2">
          <Select value={f.currency} onChange={(e) => set("currency", e.target.value)}>
            {(CURRENCIES.includes(f.currency) ? CURRENCIES : [f.currency, ...CURRENCIES]).map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
        </Field>
        <Field label="Start date" className="sm:col-span-3">
          <Input type="date" value={f.start_date} onChange={(e) => set("start_date", e.target.value)} />
        </Field>
        <Field label="End date" error={err("end_date")} className="sm:col-span-3">
          <Input type="date" value={f.end_date} min={f.start_date || undefined} onChange={(e) => set("end_date", e.target.value)} invalid={!!err("end_date")} />
        </Field>
        <Field label="Renewal notice" error={err("renewal_notice_days")} hint="Days before end date notice is due" className="sm:col-span-3">
          <div className="relative">
            <Input type="number" min={0} step={1} value={f.renewal_notice_days} onChange={(e) => set("renewal_notice_days", e.target.value)} className="tnum pr-12" invalid={!!err("renewal_notice_days")} />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ink-400">days</span>
          </div>
        </Field>
        <Field label="Owner" className="sm:col-span-3">
          <Select value={f.owner_id} onChange={(e) => set("owner_id", e.target.value)}>
            <option value="">Unassigned</option>
            {activeUsers.map((u) => <option key={u.id} value={u.id}>{u.name} — {LABELS.role[u.role]}</option>)}
          </Select>
        </Field>
        <div className="sm:col-span-6 rounded-md border border-ink-200 bg-ink-50/60 px-3 py-2.5">
          <Checkbox checked={f.auto_renew} onChange={(e) => set("auto_renew", e.target.checked)} label={<span><span className="font-medium text-ink-800">Auto-renews</span><span className="text-ink-500"> — renews automatically unless notice is given before the notice window</span></span>} />
        </div>
        <Field label="Notes" className="sm:col-span-6">
          <Textarea value={f.notes} onChange={(e) => set("notes", e.target.value)} rows={3} placeholder="Payment terms, special clauses, negotiation context…" />
        </Field>
      </form>
    </Modal>
  );
}
