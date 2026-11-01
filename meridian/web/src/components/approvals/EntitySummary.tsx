import { Link } from "react-router-dom";
import { ArrowUpRight, Building2, FileSignature, ShieldAlert, type LucideIcon } from "lucide-react";
import { Badge, Card, CardHeader, DescriptionList, EmptyState, RiskScore } from "@/components/ui";
import { LABELS, TONES, fmtDate, fmtMoney, titleCase } from "@/lib/format";
import type { Contract, Finding, Vendor } from "@/lib/types";
import type { ApprovalDetailRow } from "./rules";

function Header({ icon: Icon, kind, title, to, label }: { icon: LucideIcon; kind: string; title: string; to: string; label: string }) {
  return (
    <div className="flex items-start justify-between gap-3 mb-5 pb-4 border-b border-ink-100">
      <div className="flex items-start gap-3 min-w-0">
        <span className="h-10 w-10 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center shrink-0"><Icon className="h-5 w-5" /></span>
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-500">{kind}</p>
          <p className="text-base font-semibold text-ink-900 truncate">{title}</p>
        </div>
      </div>
      <Link to={to} className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:text-brand-800 whitespace-nowrap focus-ring rounded">{label}<ArrowUpRight className="h-4 w-4" /></Link>
    </div>
  );
}

function VendorLink({ id, name }: { id?: number | null; name?: string | null }) {
  if (!name) return <>—</>;
  return id ? <Link to={`/vendors/${id}`} className="text-brand-700 hover:underline">{name}</Link> : <>{name}</>;
}

export function EntitySummary({ approval }: { approval: ApprovalDetailRow }) {
  const e = approval.entity;
  let body;
  if (!e) {
    body = <EmptyState title="Linked record unavailable" description={`The ${approval.entity_type} #${approval.entity_id} referenced by this request could not be loaded.`} className="py-6" />;
  } else if (approval.entity_type === "vendor") {
    const v = e as unknown as Vendor;
    body = (
      <>
        <Header icon={Building2} kind="Vendor" title={v.name} to={`/vendors/${v.id}`} label="Open vendor" />
        <DescriptionList cols={3} items={[
          { label: "Category", value: v.category },
          { label: "Tier", value: <Badge tone={TONES.tier[v.tier]} dot>{LABELS.tier[v.tier]}</Badge> },
          { label: "Current status", value: <Badge tone={TONES.vendorStatus[v.status]} dot>{LABELS.vendorStatus[v.status]}</Badge> },
          { label: "Data access", value: LABELS.dataAccess[v.data_access] ?? titleCase(v.data_access) },
          { label: "Annual spend", value: <span className="tnum">{fmtMoney(v.annual_spend)}</span> },
          { label: "Inherent risk", value: <RiskScore value={v.inherent_risk} /> },
          { label: "Business owner", value: v.owner_name ?? "Unassigned" },
          { label: "Country", value: v.country ?? "—" },
          { label: "Services", value: v.services ?? "—" },
        ]} />
        {v.description && <p className="text-sm text-ink-600 mt-5 pt-4 border-t border-ink-100">{v.description}</p>}
      </>
    );
  } else if (approval.entity_type === "contract") {
    const c = e as unknown as Contract;
    body = (
      <>
        <Header icon={FileSignature} kind={`Contract · ${c.contract_number}`} title={c.title} to={`/contracts/${c.id}`} label="Open contract" />
        <DescriptionList cols={3} items={[
          { label: "Vendor", value: <VendorLink id={c.vendor_id} name={c.vendor_name} /> },
          { label: "Contract number", value: <span className="font-mono text-xs">{c.contract_number}</span> },
          { label: "Type", value: LABELS.contractType[c.type] ?? titleCase(c.type) },
          { label: "Value", value: <span className="tnum font-medium">{fmtMoney(c.value, c.currency || "USD")}</span> },
          { label: "Term", value: <span className="tnum">{fmtDate(c.start_date)} – {fmtDate(c.end_date)}</span> },
          { label: "Auto-renew", value: c.auto_renew ? `Yes · ${c.renewal_notice_days}d notice` : "No" },
          { label: "Current status", value: <Badge tone={TONES.contractStatus[c.status]} dot>{LABELS.contractStatus[c.status]}</Badge> },
        ]} />
        {c.notes && <p className="text-sm text-ink-600 mt-5 pt-4 border-t border-ink-100 whitespace-pre-wrap">{c.notes}</p>}
      </>
    );
  } else if (approval.entity_type === "finding") {
    const f = e as unknown as Finding;
    body = (
      <>
        <Header icon={ShieldAlert} kind="Finding" title={f.title} to={`/findings/${f.id}`} label="Open finding" />
        <DescriptionList cols={3} items={[
          { label: "Vendor", value: <VendorLink id={f.vendor_id} name={f.vendor_name} /> },
          { label: "Severity", value: <Badge tone={TONES.tier[f.severity]} dot>{LABELS.tier[f.severity]}</Badge> },
          { label: "Status", value: <Badge tone={TONES.findingStatus[f.status]} dot>{LABELS.findingStatus[f.status]}</Badge> },
          { label: "Due date", value: fmtDate(f.due_date) },
          { label: "Raised", value: fmtDate(f.created_at) },
        ]} />
        {f.description && <p className="text-sm text-ink-600 mt-5 pt-4 border-t border-ink-100 whitespace-pre-wrap">{f.description}</p>}
      </>
    );
  } else {
    body = <DescriptionList items={[{ label: "Record type", value: titleCase(approval.entity_type) }, { label: "Record ID", value: `#${approval.entity_id}` }]} />;
  }
  return (
    <Card>
      <CardHeader title="What you're approving" description={approval.status === "pending" ? "Current state of the linked record" : "Linked record as it stands today"} />
      {body}
    </Card>
  );
}
