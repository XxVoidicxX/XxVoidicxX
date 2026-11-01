import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Info, RotateCcw, Save } from "lucide-react";
import { Badge, Button, Card, CardHeader, Field, Input, Skeleton, cn } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { LABELS, TONES } from "@/lib/format";
import type { Tier } from "@/lib/types";

export interface OrgSettings {
  org_name: string;
  document_expiry_warning_days: number;
  contract_renewal_notice_days: number;
  review_cadence_months: Record<Tier, number>;
  risk_thresholds: { low: number; medium: number; high: number };
}
const TIERS: Tier[] = ["critical", "high", "medium", "low"];

type Errors = Partial<Record<string, string>>;
function validateForm(s: OrgSettings): Errors {
  const e: Errors = {};
  const int = (v: number, min: number, max: number) => Number.isInteger(v) && v >= min && v <= max;
  if (!s.org_name.trim()) e.org_name = "Organization name is required";
  if (!int(s.document_expiry_warning_days, 1, 365)) e.document_expiry_warning_days = "Whole number between 1 and 365";
  if (!int(s.contract_renewal_notice_days, 1, 365)) e.contract_renewal_notice_days = "Whole number between 1 and 365";
  for (const t of TIERS) if (!int(s.review_cadence_months[t], 1, 60)) e[`cadence_${t}`] = "1–60";
  const { low, medium, high } = s.risk_thresholds;
  for (const [k, v] of Object.entries(s.risk_thresholds)) if (!int(v, 1, 100)) e[`th_${k}`] = "1–100";
  if (!e.th_low && !e.th_medium && !e.th_high && !(low > medium && medium > high)) e.thresholds = "Thresholds must descend: Low > Medium > High";
  return e;
}

function NumberInput({ value, onChange, disabled, invalid, suffix, ...rest }: { value: number; onChange: (n: number) => void; disabled?: boolean; invalid?: boolean; suffix?: string; min?: number; max?: number; "aria-label"?: string }) {
  return (
    <div className="relative">
      <Input type="number" inputMode="numeric" value={Number.isNaN(value) ? "" : value} onChange={(e) => onChange(e.target.value === "" ? NaN : Number(e.target.value))} disabled={disabled} invalid={invalid} className={cn("tnum", suffix && "pr-16")} {...rest} />
      {suffix && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ink-400">{suffix}</span>}
    </div>
  );
}

export function OrganizationSettings() {
  const { can } = useAuth();
  const isAdmin = can("admin");
  const qc = useQueryClient();
  const { toast } = useToast();
  const q = useQuery({ queryKey: ["settings"], queryFn: () => api.get<{ data: OrgSettings }>("/api/settings").then((r) => r.data) });
  const [form, setForm] = useState<OrgSettings | null>(null);
  const [touched, setTouched] = useState(false);
  useEffect(() => { if (q.data) setForm(structuredClone(q.data)); }, [q.data]);

  const errors = useMemo(() => (form ? validateForm(form) : {}), [form]);
  const dirty = !!form && !!q.data && JSON.stringify(form) !== JSON.stringify(q.data);
  const save = useMutation({
    mutationFn: (s: OrgSettings) => api.put<{ data: OrgSettings }>("/api/settings", {
      org_name: s.org_name.trim(), document_expiry_warning_days: s.document_expiry_warning_days, contract_renewal_notice_days: s.contract_renewal_notice_days,
      review_cadence_months: s.review_cadence_months, risk_thresholds: s.risk_thresholds,
    }),
    onSuccess: (r) => { qc.setQueryData(["settings"], r.data); qc.invalidateQueries({ queryKey: ["activity"] }); setTouched(false); toast("success", "Settings saved", "Changes apply to new reviews, alerts and scores."); },
    onError: (e) => toast("error", "Could not save settings", e instanceof ApiError ? e.message : undefined),
  });

  if (!form) return <div className="space-y-4"><Skeleton className="h-48" /><Skeleton className="h-48" /></div>;
  const set = <K extends keyof OrgSettings>(k: K, v: OrgSettings[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));
  const show = (k: string) => (touched || dirty ? errors[k] : undefined);
  const ro = !isAdmin;
  const th = form.risk_thresholds;
  const hasErrors = Object.keys(errors).length > 0;

  return (
    <form className="space-y-6" onSubmit={(e) => { e.preventDefault(); setTouched(true); if (!hasErrors && isAdmin) save.mutate(form); }}>
      {ro && (
        <div className="flex items-start gap-2.5 rounded-lg border border-sky-200 bg-sky-50 p-3.5 text-sm text-sky-800">
          <Info className="h-4.5 w-4.5 shrink-0 mt-0.5" />
          <p>You are viewing organization settings in read-only mode. Only administrators can change them.</p>
        </div>
      )}
      <Card>
        <CardHeader title="General" description="Identity and alerting windows used across the platform." />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="Organization name" required error={show("org_name")} className="md:col-span-3 max-w-md">
            <Input value={form.org_name} onChange={(e) => set("org_name", e.target.value)} disabled={ro} invalid={!!show("org_name")} maxLength={120} />
          </Field>
          <Field label="Document expiry warning" hint="Flag vendor documents as expiring this many days ahead." error={show("document_expiry_warning_days")}>
            <NumberInput value={form.document_expiry_warning_days} onChange={(n) => set("document_expiry_warning_days", n)} disabled={ro} invalid={!!show("document_expiry_warning_days")} suffix="days" min={1} max={365} aria-label="Document expiry warning days" />
          </Field>
          <Field label="Contract renewal notice" hint="Default notice period for contract renewal alerts." error={show("contract_renewal_notice_days")}>
            <NumberInput value={form.contract_renewal_notice_days} onChange={(n) => set("contract_renewal_notice_days", n)} disabled={ro} invalid={!!show("contract_renewal_notice_days")} suffix="days" min={1} max={365} aria-label="Contract renewal notice days" />
          </Field>
        </div>
      </Card>
      <Card>
        <CardHeader title="Review cadence by tier" description="How often vendors in each tier must be re-assessed." />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {TIERS.map((t) => (
            <Field key={t} label={<span className="inline-flex items-center gap-2"><Badge tone={TONES.tier[t]} dot size="xs">{LABELS.tier[t]}</Badge></span>} error={show(`cadence_${t}`)}>
              <NumberInput value={form.review_cadence_months[t]} onChange={(n) => set("review_cadence_months", { ...form.review_cadence_months, [t]: n })} disabled={ro} invalid={!!show(`cadence_${t}`)} suffix="months" min={1} max={60} aria-label={`${LABELS.tier[t]} review cadence months`} />
            </Field>
          ))}
        </div>
      </Card>
      <Card>
        <CardHeader title="Assessment risk thresholds" description="Minimum weighted assessment score (%) required for each rating. Scores below the High threshold are rated Critical." />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {(["low", "medium", "high"] as const).map((k) => (
            <Field key={k} label={<span className="inline-flex items-center gap-2"><Badge tone={TONES.tier[k]} dot size="xs">{LABELS.tier[k]} risk</Badge><span className="text-ink-500 font-normal">score ≥</span></span>} error={show(`th_${k}`)}>
              <NumberInput value={th[k]} onChange={(n) => set("risk_thresholds", { ...th, [k]: n })} disabled={ro} invalid={!!show(`th_${k}`) || !!show("thresholds")} suffix="%" min={1} max={100} aria-label={`${LABELS.tier[k]} risk threshold`} />
            </Field>
          ))}
        </div>
        {show("thresholds") && <p className="text-xs text-danger-600 mt-2">{show("thresholds")}</p>}
        {!errors.thresholds && !errors.th_low && !errors.th_medium && !errors.th_high && (
          <div className="mt-5">
            <div className="flex gap-0.5">
              {[
                { label: "Critical", range: `< ${th.high}%`, w: th.high, bar: "bg-danger-600" },
                { label: "High", range: `${th.high}–${th.medium - 1}%`, w: th.medium - th.high, bar: "bg-warning-600" },
                { label: "Medium", range: `${th.medium}–${th.low - 1}%`, w: th.low - th.medium, bar: "bg-sky-500" },
                { label: "Low", range: `≥ ${th.low}%`, w: 100 - th.low, bar: "bg-success-600" },
              ].map((band, i) => (
                <div key={band.label} className="min-w-[4.5rem]" style={{ flexGrow: Math.max(band.w, 1), flexBasis: 0 }}>
                  <div className={cn("h-2.5", band.bar, i === 0 && "rounded-l-full", i === 3 && "rounded-r-full")} />
                  <p className="text-[11px] mt-1.5 leading-tight"><span className="font-medium text-ink-700">{band.label}</span> <span className="text-ink-500 tnum">{band.range}</span></p>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>
      {isAdmin && dirty && (
        <div className="sticky bottom-4 z-20 flex items-center justify-between gap-3 rounded-lg border border-ink-200 bg-white px-4 py-3 shadow-pop animate-fade-in">
          <span className="text-sm text-ink-600">You have unsaved changes{hasErrors && <span className="text-danger-600"> · fix the highlighted fields</span>}</span>
          <div className="flex items-center gap-2">
            <Button type="button" variant="secondary" icon={RotateCcw} disabled={save.isPending} onClick={() => { setForm(structuredClone(q.data!)); setTouched(false); }}>Discard</Button>
            <Button type="submit" icon={Save} loading={save.isPending} disabled={hasErrors}>Save changes</Button>
          </div>
        </div>
      )}
    </form>
  );
}
