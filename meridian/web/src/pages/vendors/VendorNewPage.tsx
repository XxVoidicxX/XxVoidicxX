import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Building2, Check, ClipboardCheck, Pencil, Plus, Send, ShieldCheck, Star, Trash2, Users } from "lucide-react";
import { Avatar, Badge, Button, Card, CardHeader, DescriptionList, EmptyState, Field, Input, PageHeader, Select, Textarea, cn } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { DataAccessPicker, RiskPreview, TierBadge } from "@/components/vendors/parts";
import { EMAIL_RE, URL_RE, addMonthsIso, computeInherentRisk, errorMessage, normalizeUrl, tierFromInherent, useReviewCadence } from "@/components/vendors/risk";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useUsers } from "@/lib/hooks";
import { LABELS, fmtDate, fmtMoney } from "@/lib/format";
import type { DataAccess, Vendor } from "@/lib/types";

interface ContactDraft { key: number; name: string; email: string; phone: string; role: string; is_primary: boolean }
interface FormState {
  name: string; legal_name: string; category: string; website: string; country: string; description: string; services: string;
  data_access: DataAccess; annual_spend: string; owner_id: string; next_review_date: string; contacts: ContactDraft[];
}
type Errors = Record<string, string>;

const STEPS = [
  { id: "profile", label: "Profile", description: "Company details", icon: Building2 },
  { id: "risk", label: "Risk profile", description: "Data access & spend", icon: ShieldCheck },
  { id: "contacts", label: "Contacts", description: "Vendor-side people", icon: Users },
  { id: "review", label: "Review", description: "Confirm & submit", icon: ClipboardCheck },
] as const;

const COUNTRIES = ["United States", "Canada", "United Kingdom", "Ireland", "Germany", "France", "Netherlands", "Sweden", "Switzerland", "Spain", "Italy", "Poland", "India", "Singapore", "Japan", "Australia", "Brazil", "Mexico", "Israel", "South Africa"];

let contactSeq = 1;
const blankContact = (primary: boolean): ContactDraft => ({ key: contactSeq++, name: "", email: "", phone: "", role: "", is_primary: primary });

const NAME_MAX = 160;
const SPEND_MAX = 1_000_000_000_000;

function spendError(raw: string): string | null {
  if (raw.trim() === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return "Enter a number";
  if (n < 0) return "Annual spend cannot be negative";
  if (n > SPEND_MAX) return "Annual spend must be $1 trillion or less";
  return null;
}

function validateStep(step: number, f: FormState): Errors {
  const e: Errors = {};
  if (step === 0) {
    const name = f.name.trim();
    if (!name) e.name = "Vendor name is required";
    else if (name.length < 2) e.name = "Name must be at least 2 characters";
    else if (name.length > NAME_MAX) e.name = `Name must be ${NAME_MAX} characters or fewer (currently ${name.length})`;
    if (f.legal_name.trim().length > 200) e.legal_name = "Legal name must be 200 characters or fewer";
    if (!f.category) e.category = "Select a category";
    const site = f.website.trim();
    if (site && !/^https?:\/\//i.test(site)) e.website = "Website must start with http:// or https://";
    else if (site && !URL_RE.test(site)) e.website = "Enter a valid URL, e.g. https://vendor.com";
  }
  if (step === 1) {
    if (f.annual_spend.trim() === "") e.annual_spend = "Enter the expected annual spend (0 if none)";
    else { const se = spendError(f.annual_spend); if (se) e.annual_spend = se; }
    if (!f.owner_id) e.owner_id = "Assign an internal business owner";
  }
  if (step === 2) {
    if (f.contacts.length === 0) e.contacts = "Add at least one vendor contact";
    for (const c of f.contacts) {
      if (!c.name.trim()) e[`c.${c.key}.name`] = "Name is required";
      if (!c.email.trim()) e[`c.${c.key}.email`] = "Email is required";
      else if (!EMAIL_RE.test(c.email.trim())) e[`c.${c.key}.email`] = "Enter a valid email address";
      if (c.phone.trim() && !/^[+()\d\s.-]{6,}$/.test(c.phone.trim())) e[`c.${c.key}.phone`] = "Enter a valid phone number";
    }
  }
  return e;
}

export default function VendorNewPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { toast } = useToast();
  const { user, canWrite } = useAuth();
  const users = useUsers();
  const cadence = useReviewCadence();
  const categories = useQuery({ queryKey: ["vendor-categories"], queryFn: () => api.get<{ data: string[] }>("/api/vendors/categories").then((r) => r.data), staleTime: Infinity });

  const [sp, setSp] = useSearchParams();
  const rawStep = Number(sp.get("step") || 1);
  const step = Number.isInteger(rawStep) && rawStep >= 1 && rawStep <= STEPS.length ? rawStep - 1 : 0;
  const setStep = useCallback((i: number, replace = false) => {
    setSp((prev) => { const n = new URLSearchParams(prev); n.set("step", String(i + 1)); return n; }, { replace });
  }, [setSp]);
  const [reached, setReached] = useState(0);
  const inFlight = useRef(false);
  const [errors, setErrors] = useState<Errors>({});
  const [reviewTouched, setReviewTouched] = useState(false);
  const [emailTouched, setEmailTouched] = useState<Set<number>>(new Set());
  const [form, setForm] = useState<FormState>(() => ({
    name: "", legal_name: "", category: "", website: "", country: "", description: "", services: "",
    data_access: "internal", annual_spend: "", owner_id: user ? String(user.id) : "", next_review_date: "", contacts: [blankContact(true)],
  }));

  const rawSpend = Number(form.annual_spend);
  const spend = Number.isFinite(rawSpend) && rawSpend > 0 ? Math.min(rawSpend, SPEND_MAX) : 0;
  const liveSpendError = spendError(form.annual_spend);
  const inherent = computeInherentRisk({ data_access: form.data_access, annual_spend: spend, category: form.category });
  const tier = tierFromInherent(inherent);
  const suggestedReview = addMonthsIso(cadence[tier]);
  useEffect(() => { if (!reviewTouched) setForm((f) => (f.next_review_date === suggestedReview ? f : { ...f, next_review_date: suggestedReview })); }, [suggestedReview, reviewTouched]);

  const owners = useMemo(() => (users.data ?? []).filter((u) => u.active && u.role !== "auditor"), [users.data]);
  const ownerName = owners.find((u) => String(u.id) === form.owner_id)?.name ?? null;

  const patch = <K extends keyof FormState>(k: K, v: FormState[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    if (errors[k as string]) setErrors(({ [k as string]: _omit, ...rest }) => rest);
  };
  const patchContact = (key: number, p: Partial<ContactDraft>) => {
    setForm((f) => ({ ...f, contacts: f.contacts.map((c) => (c.key === key ? { ...c, ...p } : p.is_primary ? { ...c, is_primary: false } : c)) }));
    setErrors((e) => { const n = { ...e }; for (const k of Object.keys(p)) delete n[`c.${key}.${k}`]; delete n.contacts; return n; });
  };
  const addContact = () => { setForm((f) => ({ ...f, contacts: [...f.contacts, blankContact(f.contacts.length === 0)] })); setErrors(({ contacts: _c, ...rest }) => rest); };
  const removeContact = (key: number) => setForm((f) => {
    const rest = f.contacts.filter((c) => c.key !== key);
    if (rest.length && !rest.some((c) => c.is_primary)) rest[0] = { ...rest[0], is_primary: true };
    return { ...f, contacts: rest };
  });

  useEffect(() => {
    for (let i = 0; i < step; i++) {
      if (Object.keys(validateStep(i, form)).length) { setStep(i, true); return; }
    }
    setReached((r) => Math.max(r, step));
  }, [step]);

  const focusFirstInvalid = () => requestAnimationFrame(() => document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());

  const goTo = (target: number) => {
    if (target === step) return;
    if (target < step) { setErrors({}); setStep(target); return; }
    for (let i = step; i < target; i++) {
      const e = validateStep(i, form);
      if (Object.keys(e).length) { setErrors(e); if (i !== step) setStep(i); focusFirstInvalid(); return; }
    }
    setErrors({});
    setStep(target);
    setReached((r) => Math.max(r, target));
  };

  const create = useMutation({
    mutationFn: async (submit: boolean) => {
      const payload = {
        name: form.name.trim(),
        legal_name: form.legal_name.trim() || null,
        category: form.category,
        website: normalizeUrl(form.website) || null,
        country: form.country.trim() || null,
        description: form.description.trim() || null,
        services: form.services.trim() || null,
        data_access: form.data_access,
        annual_spend: spend,
        owner_id: Number(form.owner_id),
        next_review_date: form.next_review_date || null,
        contacts: form.contacts.map((c) => ({ name: c.name.trim(), email: c.email.trim() || null, phone: c.phone.trim() || null, role: c.role.trim() || null, is_primary: c.is_primary })),
      };
      const created = await api.post<{ data: Vendor }>("/api/vendors", payload);
      if (!submit) return { vendor: created.data, submitted: false, submitError: null as string | null };
      try {
        await api.post(`/api/vendors/${created.data.id}/submit-onboarding`);
        return { vendor: created.data, submitted: true, submitError: null };
      } catch (e) {
        return { vendor: created.data, submitted: false, submitError: errorMessage(e) };
      }
    },
    onSuccess: ({ vendor, submitted, submitError }) => {
      qc.invalidateQueries({ queryKey: ["vendors"] });
      qc.invalidateQueries({ queryKey: ["approvals"] });
      if (submitError) toast("error", `${vendor.name} was created, but submission failed`, submitError);
      else toast("success", submitted ? `${vendor.name} submitted for onboarding approval` : `${vendor.name} saved as prospect`, submitted ? "Approvers have been notified." : undefined);
      navigate(`/vendors/${vendor.id}`, { replace: true });
    },
    onError: (e) => toast("error", "Could not create vendor", errorMessage(e)),
  });

  const submit = (withApproval: boolean) => {
    if (inFlight.current || create.isPending) return;
    for (let i = 0; i < 3; i++) {
      const e = validateStep(i, form);
      if (Object.keys(e).length) { setErrors(e); setStep(i); toast("error", "Please fix the highlighted fields"); focusFirstInvalid(); return; }
    }
    inFlight.current = true;
    create.mutate(withApproval, { onSettled: (_d, err) => { if (err) inFlight.current = false; } });
  };

  if (!canWrite) {
    return (
      <>
        <PageHeader title="Add vendor" breadcrumbs={[{ label: "Vendors", to: "/vendors" }, { label: "New vendor" }]} />
        <Card><EmptyState icon={ShieldCheck} title="Read-only access" description="Your role can view vendors but cannot create them." action={<Button variant="secondary" onClick={() => navigate("/vendors")}>Back to vendors</Button>} /></Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Add vendor"
        description="Capture the vendor profile and risk drivers. Inherent risk and tier are calculated automatically."
        breadcrumbs={[{ label: "Vendors", to: "/vendors" }, { label: "New vendor" }]}
      />

      <Card className="mb-6 !py-4">
        <Stepper step={step} reached={reached} onSelect={goTo} />
      </Card>

      <div className="grid gap-6 lg:grid-cols-3 items-start">
        <Card className="lg:col-span-2" padded={false}>
          <div className="p-6">
            {step === 0 && (
              <section className="space-y-5">
                <SectionTitle title="Company profile" description="Who is this vendor and what will they do for us?" />
                <div className="grid gap-4 sm:grid-cols-2">
                  <WizField id="vendor-name" label="Vendor name" required error={errors.name} hint={form.name.length > NAME_MAX - 20 ? `${form.name.trim().length} / ${NAME_MAX} characters` : undefined}>
                    {(a) => <Input {...a} autoFocus value={form.name} maxLength={NAME_MAX + 40} invalid={!!errors.name} onChange={(e) => patch("name", e.target.value)} placeholder="e.g. Acme Analytics" />}
                  </WizField>
                  <WizField id="vendor-legal-name" label="Legal entity name" hint="As it appears on contracts" error={errors.legal_name}>
                    {(a) => <Input {...a} value={form.legal_name} invalid={!!errors.legal_name} onChange={(e) => patch("legal_name", e.target.value)} placeholder="e.g. Acme Analytics, Inc." />}
                  </WizField>
                  <WizField id="vendor-category" label="Category" required error={errors.category}>
                    {(a) => (
                      <Select {...a} value={form.category} invalid={!!errors.category} onChange={(e) => patch("category", e.target.value)}>
                        <option value="">Select a category…</option>
                        {(categories.data ?? []).map((c) => <option key={c} value={c}>{c}</option>)}
                      </Select>
                    )}
                  </WizField>
                  <Field label="Country" hint="Primary country of operation">
                    <Input list="vendor-countries" value={form.country} onChange={(e) => patch("country", e.target.value)} placeholder="e.g. United States" />
                    <datalist id="vendor-countries">{COUNTRIES.map((c) => <option key={c} value={c} />)}</datalist>
                  </Field>
                  <WizField id="vendor-website" label="Website" error={errors.website} hint="Include http:// or https://" className="sm:col-span-2">
                    {(a) => <Input {...a} type="url" value={form.website} invalid={!!errors.website} onChange={(e) => patch("website", e.target.value)} placeholder="https://www.vendor.com" />}
                  </WizField>
                  <Field label="Description" hint="Business purpose and context for this relationship" className="sm:col-span-2">
                    <Textarea value={form.description} onChange={(e) => patch("description", e.target.value)} rows={3} placeholder="e.g. Customer analytics platform used by the growth team." />
                  </Field>
                  <Field label="Services provided" hint="Comma-separated list of services in scope" className="sm:col-span-2">
                    <Input value={form.services} onChange={(e) => patch("services", e.target.value)} placeholder="e.g. Event tracking, dashboards, data warehouse sync" />
                  </Field>
                </div>
              </section>
            )}

            {step === 1 && (
              <section className="space-y-6">
                <SectionTitle title="Risk profile" description="These drivers determine inherent risk, tier and the assessment cadence." />
                <div>
                  <p className="text-sm font-medium text-ink-700 mb-2">Data access <span className="text-danger-600">*</span></p>
                  <DataAccessPicker value={form.data_access} onChange={(v) => patch("data_access", v)} />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <WizField id="vendor-spend" label="Expected annual spend (USD)" required error={errors.annual_spend ?? liveSpendError ?? undefined} hint={form.annual_spend ? fmtMoney(spend) : "Thresholds: $50K · $250K · $1M"}>
                    {(a) => (
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-ink-400 pointer-events-none">$</span>
                        <Input {...a} type="number" min={0} max={SPEND_MAX} step={1000} inputMode="numeric" className="pl-7 tnum" value={form.annual_spend} invalid={!!(errors.annual_spend || liveSpendError)} onChange={(e) => patch("annual_spend", e.target.value)} placeholder="0" />
                      </div>
                    )}
                  </WizField>
                  <WizField id="vendor-owner" label="Business owner" required error={errors.owner_id} hint="Accountable for the relationship internally">
                    {(a) => (
                      <Select {...a} value={form.owner_id} invalid={!!errors.owner_id} onChange={(e) => patch("owner_id", e.target.value)}>
                        <option value="">Select owner…</option>
                        {owners.map((u) => <option key={u.id} value={u.id}>{u.name} — {LABELS.role[u.role]}</option>)}
                      </Select>
                    )}
                  </WizField>
                  <Field label="First review date" hint={reviewTouched ? <button type="button" className="text-brand-700 hover:underline" onClick={() => setReviewTouched(false)}>Reset to {LABELS.tier[tier].toLowerCase()} tier cadence ({cadence[tier]} months)</button> : `Defaults to the ${LABELS.tier[tier].toLowerCase()} tier cadence of ${cadence[tier]} months`}>
                    <Input type="date" value={form.next_review_date} onChange={(e) => { setReviewTouched(true); patch("next_review_date", e.target.value); }} />
                  </Field>
                </div>
              </section>
            )}

            {step === 2 && (
              <section className="space-y-5">
                <div className="flex items-start justify-between gap-4">
                  <SectionTitle title="Vendor contacts" description="People at the vendor we work with. The primary contact receives assessment requests." />
                  <Button variant="secondary" size="sm" icon={Plus} onClick={addContact}>Add contact</Button>
                </div>
                {errors.contacts && <p className="text-sm text-danger-600" role="alert">{errors.contacts}</p>}
                {form.contacts.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-ink-300"><EmptyState icon={Users} title="No contacts yet" description="Add at least one contact before continuing." action={<Button size="sm" icon={Plus} onClick={addContact}>Add contact</Button>} /></div>
                ) : (
                  <div className="space-y-4">
                    {form.contacts.map((c, i) => (
                      <div key={c.key} className={cn("rounded-lg border p-4", c.is_primary ? "border-brand-200 bg-brand-50/30" : "border-ink-200")}>
                        <div className="flex items-center justify-between gap-3 mb-3">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-ink-800">Contact {i + 1}</span>
                            {c.is_primary && <Badge tone="brand" size="xs">Primary</Badge>}
                          </div>
                          <div className="flex items-center gap-1">
                            {!c.is_primary && <Button variant="ghost" size="xs" icon={Star} onClick={() => patchContact(c.key, { is_primary: true })}>Make primary</Button>}
                            <Button variant="ghost" size="xs" icon={Trash2} onClick={() => removeContact(c.key)} aria-label={`Remove contact ${i + 1}`} className="text-ink-500 hover:text-danger-700">Remove</Button>
                          </div>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          <WizField id={`contact-${c.key}-name`} label="Full name" required error={errors[`c.${c.key}.name`]}>
                            {(a) => <Input {...a} value={c.name} maxLength={120} invalid={!!errors[`c.${c.key}.name`]} onChange={(e) => patchContact(c.key, { name: e.target.value })} placeholder="e.g. Jamie Rivera" />}
                          </WizField>
                          <Field label="Role / title">
                            <Input value={c.role} onChange={(e) => patchContact(c.key, { role: e.target.value })} placeholder="e.g. Account Executive" />
                          </Field>
                          <WizField id={`contact-${c.key}-email`} label="Email" required error={errors[`c.${c.key}.email`] ?? (c.email.trim() && !EMAIL_RE.test(c.email.trim()) && emailTouched.has(c.key) ? "Enter a valid email address" : undefined)}>
                            {(a) => <Input {...a} type="email" value={c.email} invalid={!!a["aria-invalid"]} onBlur={() => setEmailTouched((t) => new Set(t).add(c.key))} onChange={(e) => patchContact(c.key, { email: e.target.value })} placeholder="name@vendor.com" />}
                          </WizField>
                          <WizField id={`contact-${c.key}-phone`} label="Phone" error={errors[`c.${c.key}.phone`]}>
                            {(a) => <Input {...a} type="tel" value={c.phone} invalid={!!errors[`c.${c.key}.phone`]} onChange={(e) => patchContact(c.key, { phone: e.target.value })} placeholder="+1 555 010 0000" />}
                          </WizField>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}

            {step === 3 && (
              <section className="space-y-6">
                <SectionTitle title="Review & submit" description="Confirm the details below. You can save as a prospect or submit straight to onboarding approval." />
                <ReviewBlock title="Profile" onEdit={() => goTo(0)}>
                  <DescriptionList cols={2} items={[
                    { label: "Vendor name", value: form.name },
                    { label: "Legal name", value: form.legal_name || "—" },
                    { label: "Category", value: form.category },
                    { label: "Country", value: form.country || "—" },
                    { label: "Website", value: form.website ? normalizeUrl(form.website) : "—" },
                    { label: "Services", value: form.services || "—" },
                    { label: "Description", value: form.description || "—" },
                  ]} />
                </ReviewBlock>
                <ReviewBlock title="Risk profile" onEdit={() => goTo(1)}>
                  <DescriptionList cols={3} items={[
                    { label: "Data access", value: LABELS.dataAccess[form.data_access] },
                    { label: "Annual spend", value: fmtMoney(spend) },
                    { label: "Owner", value: ownerName ? <span className="inline-flex items-center gap-2"><Avatar name={ownerName} size="xs" />{ownerName}</span> : "—" },
                    { label: "Inherent risk", value: <span className="font-semibold tnum">{inherent} / 100</span> },
                    { label: "Tier", value: <TierBadge tier={tier} /> },
                    { label: "First review", value: fmtDate(form.next_review_date) },
                  ]} />
                </ReviewBlock>
                <ReviewBlock title={`Contacts (${form.contacts.length})`} onEdit={() => goTo(2)}>
                  <ul className="divide-y divide-ink-100">
                    {form.contacts.map((c) => (
                      <li key={c.key} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                        <Avatar name={c.name} size="sm" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-ink-900 flex items-center gap-2">{c.name}{c.is_primary && <Badge tone="brand" size="xs">Primary</Badge>}</p>
                          <p className="text-xs text-ink-500 truncate">{[c.role, c.email, c.phone].filter(Boolean).join(" · ")}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </ReviewBlock>
              </section>
            )}
          </div>

          <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-ink-100 bg-ink-50/60 rounded-b-[var(--radius-card)]">
            <div className="flex items-center gap-2">
              {step > 0 ? <Button variant="secondary" icon={ArrowLeft} onClick={() => goTo(step - 1)} disabled={create.isPending || create.isSuccess}>Back</Button> : <Button variant="ghost" onClick={() => navigate("/vendors")}>Cancel</Button>}
              <span className="text-xs text-ink-500 hidden sm:inline">Step {step + 1} of {STEPS.length}</span>
            </div>
            {step < 3 ? (
              <Button iconRight={ArrowRight} onClick={() => goTo(step + 1)}>Continue</Button>
            ) : (
              <div className="flex flex-wrap items-center justify-end gap-2">
                <Button variant="secondary" onClick={() => submit(false)} loading={create.isPending && create.variables === false} disabled={create.isPending || create.isSuccess} aria-busy={create.isPending}>Save as prospect</Button>
                <Button icon={Send} onClick={() => submit(true)} loading={create.isPending && create.variables === true} disabled={create.isPending || create.isSuccess} aria-busy={create.isPending}>Save and submit for onboarding approval</Button>
              </div>
            )}
          </div>
        </Card>

        <div className="space-y-6 lg:sticky lg:top-20">
          <Card>
            <CardHeader title="Live risk preview" description="Updates as you fill in the profile" />
            <RiskPreview dataAccess={form.data_access} annualSpend={spend} category={form.category} cadenceMonths={cadence} />
            {liveSpendError && <p className="mt-3 text-xs text-danger-600">Preview ignores the invalid spend value until it is corrected.</p>}
          </Card>
          <Card>
            <CardHeader title="What happens next" />
            <ol className="space-y-3 text-sm">
              {[
                ["Save", "The vendor is created as a prospect with its owner and contacts."],
                ["Approval", "Submitting creates an onboarding approval for risk analysts and admins."],
                ["Assess", "Start a due-diligence assessment to reduce residual risk."],
              ].map(([t, d], i) => (
                <li key={t} className="flex gap-3">
                  <span className="h-5 w-5 rounded-full bg-brand-50 text-brand-700 text-[11px] font-semibold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</span>
                  <span className="text-ink-600"><span className="font-medium text-ink-800">{t}.</span> {d}</span>
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>
    </>
  );
}

function Stepper({ step, reached, onSelect }: { step: number; reached: number; onSelect: (i: number) => void }) {
  return (
    <ol className="flex items-center gap-2 sm:gap-4">
      {STEPS.map((s, i) => {
        const done = i < step;
        const current = i === step;
        const enabled = i <= Math.max(reached, step) + 1;
        return (
          <li key={s.id} className="flex flex-1 items-center gap-2 sm:gap-4 min-w-0 last:flex-none">
            <button type="button" disabled={!enabled} onClick={() => onSelect(i)} aria-current={current ? "step" : undefined} className="flex items-center gap-3 min-w-0 text-left rounded-md focus-ring disabled:cursor-not-allowed group">
              <span className={cn("h-8 w-8 rounded-full flex items-center justify-center text-sm font-semibold shrink-0 transition-colors", done ? "bg-brand-600 text-white" : current ? "bg-white text-brand-700 ring-2 ring-brand-600" : "bg-ink-100 text-ink-500 group-enabled:group-hover:bg-ink-200")}>
                {done ? <Check className="h-4 w-4" strokeWidth={3} /> : i + 1}
              </span>
              <span className="min-w-0 hidden md:block">
                <span className={cn("block text-sm font-medium truncate", current ? "text-brand-700" : done ? "text-ink-900" : "text-ink-500")}>{s.label}</span>
                <span className="block text-xs text-ink-400 truncate">{s.description}</span>
              </span>
            </button>
            {i < STEPS.length - 1 && <span className={cn("h-px flex-1 min-w-4", i < step ? "bg-brand-500" : "bg-ink-200")} />}
          </li>
        );
      })}
    </ol>
  );
}

type AriaProps = { id: string; "aria-invalid"?: true; "aria-describedby"?: string };
function WizField({ id, label, error, hint, required, className, children }: { id: string; label: ReactNode; error?: string; hint?: ReactNode; required?: boolean; className?: string; children: (a: AriaProps) => ReactNode }) {
  const errId = `${id}-error`;
  const hintId = `${id}-hint`;
  return (
    <Field label={label} required={required} className={className}>
      {children({ id, "aria-invalid": error ? true : undefined, "aria-describedby": error ? errId : hint ? hintId : undefined })}
      {error ? <span id={errId} role="alert" className="block text-xs text-danger-600 mt-1">{error}</span> : hint ? <span id={hintId} className="block text-xs text-ink-500 mt-1">{hint}</span> : null}
    </Field>
  );
}

function SectionTitle({ title, description }: { title: string; description: string }) {
  return (
    <div>
      <h2 className="text-base font-semibold text-ink-900">{title}</h2>
      <p className="text-sm text-ink-500 mt-0.5">{description}</p>
    </div>
  );
}

function ReviewBlock({ title, onEdit, children }: { title: string; onEdit: () => void; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-ink-200">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-ink-100 bg-ink-50/60 rounded-t-lg">
        <h3 className="text-sm font-semibold text-ink-800">{title}</h3>
        <Button variant="ghost" size="xs" icon={Pencil} onClick={onEdit}>Edit</Button>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}
