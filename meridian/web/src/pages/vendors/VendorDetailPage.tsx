import { useState, type ReactNode } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity as ActivityIcon, AlertTriangle, ArrowRight, CalendarClock, CheckCircle2, ClipboardList, ExternalLink, FileText, FileUp, Flag, Gauge, Globe,
  Mail, MapPin, MoreHorizontal, Pencil, Phone, Plus, RefreshCcw, Send, ShieldCheck, Star, Tag, Trash2, TrendingDown, UserRound, Users, FileSignature, Building2, Clock,
} from "lucide-react";
import { Avatar, Badge, Button, Card, DataTable, DescriptionList, EmptyState, PageHeader, PageLoader, RiskScore, Tabs, cn, type Column } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { DropdownMenu, Kpi, TierBadge, VendorMark } from "@/components/vendors/parts";
import { AddContactModal, ConfirmModal, EditVendorModal, RaiseFindingModal, STATUS_FLOW, StartAssessmentModal, UploadDocumentModal } from "@/components/vendors/modals";
import { ASSESSMENT_REDUCTION, FINDING_PENALTY, errorMessage, inherentBreakdown, residualBreakdown } from "@/components/vendors/risk";
import { HeaderActions, useInFlight } from "@/components/contracts/shared";
import { PendingExpiryHint } from "@/components/documents/DocumentModals";
import { ApiError, api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { LABELS, TONES, daysUntil, fmtBytes, fmtDate, fmtDateTime, fmtMoney, fmtRelative, riskTone, titleCase, type Tone } from "@/lib/format";
import { humanizeValue, statusTones } from "@/components/approvals/rules";
import type { Activity, Approval, Assessment, Contract, Document, Finding, VendorContact, VendorDetail, VendorStatus } from "@/lib/types";

type TabId = "overview" | "contracts" | "assessments" | "documents" | "findings" | "approvals" | "activity";
type ModalId = "edit" | "assess" | "doc" | "finding" | "contact" | null;
const TAB_IDS: TabId[] = ["overview", "contracts", "assessments", "documents", "findings", "approvals", "activity"];

export default function VendorDetailPage() {
  const { id: idParam } = useParams();
  const id = Number(idParam);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { toast } = useToast();
  const { canWrite, can } = useAuth();
  const isAdmin = can("admin");
  const guard = useInFlight();
  const [sp, setSp] = useSearchParams();
  const tabParam = sp.get("tab") as TabId | null;
  const tab: TabId = tabParam && TAB_IDS.includes(tabParam) ? tabParam : "overview";
  const setTab = (t: TabId) => setSp((p) => { const n = new URLSearchParams(p); if (t === "overview") n.delete("tab"); else n.set("tab", t); return n; }, { replace: true });

  const [modal, setModal] = useState<ModalId>(null);
  const [pendingStatus, setPendingStatus] = useState<VendorStatus | null>(null);
  const [removeContact, setRemoveContact] = useState<VendorContact | null>(null);
  const [confirmSubmit, setConfirmSubmit] = useState(false);

  const q = useQuery({
    queryKey: ["vendor", id],
    queryFn: () => api.get<{ data: VendorDetail }>(`/api/vendors/${id}`).then((r) => r.data),
    enabled: Number.isFinite(id) && id > 0,
    retry: (n, e) => !(e instanceof ApiError && e.status === 404) && n < 2,
  });
  const invalidate = () => { qc.invalidateQueries({ queryKey: ["vendor", id] }); qc.invalidateQueries({ queryKey: ["vendors"] }); };

  const statusMut = useMutation({
    mutationFn: (status: VendorStatus) => api.patch(`/api/vendors/${id}`, { status }),
    onSuccess: (_r, status) => { toast("success", `Status changed to ${LABELS.vendorStatus[status]}`); setPendingStatus(null); },
    onError: (e) => { toast("error", "Could not change status", errorMessage(e)); setPendingStatus(null); },
    onSettled: () => { invalidate(); qc.invalidateQueries({ queryKey: ["approvals"] }); qc.invalidateQueries({ queryKey: ["dashboard"] }); return q.refetch(); },
  });
  const submitMut = useMutation({
    mutationFn: () => api.post<{ approval_id: number }>(`/api/vendors/${id}/submit-onboarding`),
    onSuccess: (r) => { invalidate(); qc.invalidateQueries({ queryKey: ["approvals"] }); setConfirmSubmit(false); toast("success", "Submitted for onboarding approval", "Risk analysts and admins have been notified."); if (r?.approval_id) setTab("approvals"); },
    onError: (e) => toast("error", "Could not submit for onboarding", errorMessage(e)),
  });
  const removeContactMut = useMutation({
    mutationFn: (c: VendorContact) => api.delete(`/api/vendors/${id}/contacts/${c.id}`),
    onSuccess: (_r, c) => { invalidate(); toast("success", "Contact removed", c.name); setRemoveContact(null); },
    onError: (e) => toast("error", "Could not remove contact", errorMessage(e)),
  });

  if (!Number.isFinite(id) || id <= 0 || (q.error instanceof ApiError && q.error.status === 404)) {
    return (
      <>
        <PageHeader title="Vendor not found" breadcrumbs={[{ label: "Vendors", to: "/vendors" }, { label: "Not found" }]} />
        <Card><EmptyState icon={Building2} title="This vendor doesn’t exist" description="It may have been deleted, or the link is incorrect." action={<Button variant="secondary" onClick={() => navigate("/vendors")}>Back to vendors</Button>} /></Card>
      </>
    );
  }
  if (q.isError) {
    return (
      <>
        <PageHeader title="Vendor" breadcrumbs={[{ label: "Vendors", to: "/vendors" }, { label: "Error" }]} />
        <Card><EmptyState icon={AlertTriangle} title="Could not load vendor" description={errorMessage(q.error)} action={<Button variant="secondary" icon={RefreshCcw} onClick={() => q.refetch()}>Try again</Button>} /></Card>
      </>
    );
  }
  if (!q.data) return <PageLoader />;
  const v = q.data;

  const pendingOnboarding = v.status === "prospect" || v.status === "onboarding" ? v.approvals.find((a) => a.type === "vendor_onboarding" && a.status === "pending") : undefined;
  const canSubmit = canWrite && (v.status === "prospect" || v.status === "onboarding") && !pendingOnboarding;
  const openFindings = v.findings.filter((f) => f.status === "open" || f.status === "in_remediation");
  const highFindings = openFindings.filter((f) => f.severity === "critical" || f.severity === "high").length;
  const activeContracts = v.contracts.filter((c) => c.status === "active" || c.status === "expiring");
  const contractValue = activeContracts.reduce((a, c) => a + (c.value || 0), 0);
  const reviewDays = daysUntil(v.next_review_date);
  const reviewOverdue = reviewDays != null && reviewDays < 0 && v.status !== "terminated";
  const docExpired = v.documents.filter((d) => d.status === "expired").length;

  const requestStatus = (s: VendorStatus) => {
    if (s === "offboarding" || s === "terminated") setPendingStatus(s);
    else guard(() => statusMut.mutateAsync(s));
  };
  const statusOptions = STATUS_FLOW.filter((s) => isAdmin || s.value === v.status || !((s.value === "active" && (v.status === "prospect" || v.status === "onboarding")) || s.value === "terminated"));
  const statusHint = !isAdmin && (v.status === "prospect" || v.status === "onboarding") ? "Activation happens when the onboarding approval is granted" : null;
  const moreItems = [
    { key: "edit", label: "Edit vendor", icon: Pencil, onSelect: () => setModal("edit") },
    { key: "doc", label: "Upload document", icon: FileUp, onSelect: () => setModal("doc") },
    { key: "finding", label: "Raise finding", icon: Flag, onSelect: () => setModal("finding") },
  ];

  const tabs: { id: TabId; label: string; count?: number }[] = [
    { id: "overview", label: "Overview" },
    { id: "contracts", label: "Contracts", count: v.contracts.length },
    { id: "assessments", label: "Assessments", count: v.assessments.length },
    { id: "documents", label: "Documents", count: v.documents.length },
    { id: "findings", label: "Findings", count: v.findings.length },
    { id: "approvals", label: "Approvals", count: v.approvals.length },
    { id: "activity", label: "Activity", count: v.activity.length },
  ];

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Vendors", to: "/vendors" }, { label: v.name.length > 26 ? `${v.name.slice(0, 25)}…` : v.name }]}
        documentTitle={v.name}
        title={<span className="flex items-center gap-3 min-w-0"><VendorMark name={v.name} size="lg" /><span className="min-w-0"><span className="line-clamp-2 break-words [overflow-wrap:anywhere]" title={v.name}>{v.name}</span>{v.legal_name && v.legal_name !== v.name && <span className="text-sm font-normal text-ink-500 tracking-normal mt-0.5 line-clamp-2 break-words [overflow-wrap:anywhere]">{v.legal_name}</span>}</span></span>}
        meta={
          <>
            <Badge tone={TONES.vendorStatus[v.status]} dot>{LABELS.vendorStatus[v.status]}</Badge>
            <TierBadge tier={v.tier} />
            <MetaItem icon={Tag}>{v.category}</MetaItem>
            {v.country && <MetaItem icon={MapPin}>{v.country}</MetaItem>}
            {v.website && /^https?:\/\//i.test(v.website) && <a href={v.website} target="_blank" rel="noreferrer" className="inline-flex min-w-0 max-w-full items-center gap-1 text-sm text-brand-700 hover:underline [overflow-wrap:anywhere]"><Globe className="h-3.5 w-3.5" />{v.website.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}<ExternalLink className="h-3 w-3" /></a>}
            <MetaItem icon={UserRound}>{v.owner_name ? <span className="inline-flex items-center gap-1.5">Owner <span className="font-medium text-ink-800">{v.owner_name}</span></span> : "No owner"}</MetaItem>
          </>
        }
        actions={canWrite ? (
          <HeaderActions>
            <span className="hidden xl:contents">
              <Button variant="secondary" icon={Pencil} onClick={() => setModal("edit")}>Edit</Button>
              <Button variant="secondary" icon={FileUp} onClick={() => setModal("doc")}>Upload document</Button>
              <Button variant="secondary" icon={Flag} onClick={() => setModal("finding")}>Raise finding</Button>
            </span>
            <DropdownMenu
              label="Status"
              items={[
                ...statusOptions.map((s) => ({
                  key: s.value, label: LABELS.vendorStatus[s.value], description: s.description, active: s.value === v.status, disabled: s.value === v.status || statusMut.isPending,
                  danger: s.value === "offboarding" || s.value === "terminated", onSelect: () => requestStatus(s.value),
                })),
                ...(statusHint ? [{ key: "hint", label: <span className="text-xs font-normal text-ink-500">{statusHint}</span>, disabled: true, onSelect: () => undefined }] : []),
              ]}
            />
            {canSubmit && <span className="hidden sm:contents"><Button variant="outline" icon={Send} onClick={() => setConfirmSubmit(true)}>Submit for onboarding</Button></span>}
            <span className="xl:hidden">
              <DropdownMenu
                label={<span className="sr-only sm:not-sr-only">More</span>}
                icon={MoreHorizontal}
                items={[...moreItems, ...(canSubmit ? [{ key: "submit", label: "Submit for onboarding", icon: Send, onSelect: () => setConfirmSubmit(true) }] : [])]}
              />
            </span>
            <Button icon={ClipboardList} onClick={() => setModal("assess")} aria-label="Start assessment"><span className="hidden sm:inline">Start assessment</span></Button>
          </HeaderActions>
        ) : <Badge tone="neutral">Read-only</Badge>}
      />

      {pendingOnboarding && (
        <div className="mb-6 flex flex-wrap items-center gap-3 rounded-lg border border-warning-600/30 bg-warning-50 px-4 py-3 text-sm">
          <Clock className="h-4 w-4 text-warning-700 shrink-0" />
          <span className="text-warning-700 flex-1 min-w-0">
            <span className="font-medium">Onboarding approval pending.</span> Requested by {pendingOnboarding.requested_by_name ?? "a user"} {fmtRelative(pendingOnboarding.created_at)}.
          </span>
          <Link to={`/approvals/${pendingOnboarding.id}`} className="inline-flex items-center gap-1 font-medium text-warning-700 hover:underline">View approval<ArrowRight className="h-3.5 w-3.5" /></Link>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4 mb-6">
        <Kpi label="Inherent risk" icon={Gauge} tone={riskTone(v.inherent_risk)} hint={`${LABELS.dataAccess[v.data_access]} data · ${fmtMoney(v.annual_spend, "USD", true)}`}>{v.inherent_risk}<span className="text-sm font-normal text-ink-400 ml-1">/ 100</span></Kpi>
        <Kpi label="Residual risk" icon={TrendingDown} tone={riskTone(v.residual_risk)} hint={v.residual_risk < v.inherent_risk ? `${v.inherent_risk - v.residual_risk} below inherent` : v.residual_risk > v.inherent_risk ? `${v.residual_risk - v.inherent_risk} above inherent` : "No mitigation yet"}><span className="hidden sm:inline-flex"><RiskScore value={v.residual_risk} size="lg" /></span><span className="inline-flex sm:hidden"><RiskScore value={v.residual_risk} size="sm" /></span></Kpi>
        <Kpi label="Open findings" icon={Flag} tone={v.open_findings > 0 ? "danger" : "success"} hint={v.open_findings > 0 ? `${highFindings} critical or high` : "No open issues"}>{v.open_findings}</Kpi>
        <Kpi label="Active contracts" icon={FileSignature} tone="brand" hint={activeContracts.length ? `${fmtMoney(contractValue, "USD", true)} total value` : "No active agreements"}>{v.active_contracts}</Kpi>
        <Kpi label="Document alerts" icon={FileText} tone={v.document_alerts > 0 ? "warning" : "success"} hint={v.document_alerts > 0 ? `${docExpired} expired · ${v.document_alerts - docExpired} expiring` : "All documents current"}>{v.document_alerts}</Kpi>
        <Kpi label="Next review" icon={CalendarClock} tone={reviewOverdue ? "danger" : reviewDays != null && reviewDays <= 30 ? "warning" : "neutral"} hint={reviewDays == null ? "Not scheduled" : reviewOverdue ? `${Math.abs(reviewDays)} days overdue` : reviewDays === 0 ? "Due today" : `In ${reviewDays} days`}>
          <span className="text-lg">{v.next_review_date ? fmtDate(v.next_review_date) : "—"}</span>
        </Kpi>
      </div>

      <Tabs tabs={tabs} value={tab} onChange={setTab} className="mb-6" />

      {tab === "overview" && <OverviewTab v={v} canWrite={canWrite} onAddContact={() => setModal("contact")} onRemoveContact={setRemoveContact} onAssess={() => setModal("assess")} />}
      {tab === "contracts" && <ContractsTab v={v} />}
      {tab === "assessments" && <AssessmentsTab v={v} action={canWrite ? <Button size="sm" icon={Plus} onClick={() => setModal("assess")}>Start assessment</Button> : null} />}
      {tab === "documents" && <DocumentsTab v={v} action={canWrite ? <Button size="sm" icon={FileUp} onClick={() => setModal("doc")}>Upload document</Button> : null} />}
      {tab === "findings" && <FindingsTab v={v} action={canWrite ? <Button size="sm" icon={Flag} onClick={() => setModal("finding")}>Raise finding</Button> : null} />}
      {tab === "approvals" && <ApprovalsTab v={v} action={canSubmit ? <Button size="sm" icon={Send} onClick={() => setConfirmSubmit(true)}>Submit for onboarding</Button> : null} />}
      {tab === "activity" && <ActivityTab items={v.activity} />}

      <EditVendorModal vendor={v} open={modal === "edit"} onClose={() => setModal(null)} />
      <StartAssessmentModal vendor={v} open={modal === "assess"} onClose={() => setModal(null)} />
      <UploadDocumentModal vendor={v} open={modal === "doc"} onClose={() => setModal(null)} />
      <RaiseFindingModal vendor={v} open={modal === "finding"} onClose={() => setModal(null)} />
      <AddContactModal vendor={v} open={modal === "contact"} onClose={() => setModal(null)} />

      <ConfirmModal
        open={!!pendingStatus}
        onClose={() => setPendingStatus(null)}
        onConfirm={() => { const s = pendingStatus; if (s) guard(() => statusMut.mutateAsync(s)); }}
        loading={statusMut.isPending}
        danger
        title={pendingStatus === "terminated" ? `Terminate ${v.name}?` : `Begin offboarding ${v.name}?`}
        confirmLabel={pendingStatus === "terminated" ? "Terminate vendor" : "Start offboarding"}
        description={pendingStatus === "terminated"
          ? "The relationship will be marked as ended. Make sure contracts are closed, access is revoked and data has been returned or destroyed."
          : "The vendor will move to offboarding. Plan access revocation, data return or destruction, and contract exit before termination."}
      >
        {(activeContracts.length > 0 || openFindings.length > 0) && (
          <ul className="rounded-md border border-warning-600/30 bg-warning-50 px-3 py-2 text-xs text-warning-700 space-y-1">
            {activeContracts.length > 0 && <li>{activeContracts.length} active contract{activeContracts.length > 1 ? "s" : ""} still in force</li>}
            {openFindings.length > 0 && <li>{openFindings.length} open finding{openFindings.length > 1 ? "s" : ""} not yet closed</li>}
          </ul>
        )}
      </ConfirmModal>
      <ConfirmModal
        open={confirmSubmit}
        onClose={() => setConfirmSubmit(false)}
        onConfirm={() => guard(() => submitMut.mutateAsync())}
        loading={submitMut.isPending}
        title="Submit for onboarding approval?"
        confirmLabel="Submit for approval"
        description={`An onboarding approval request will be created for ${v.name} (${LABELS.tier[v.tier]} tier). Risk analysts and admins will be notified.`}
      />
      <ConfirmModal
        open={!!removeContact}
        onClose={() => setRemoveContact(null)}
        onConfirm={() => { const c = removeContact; if (c) guard(() => removeContactMut.mutateAsync(c)); }}
        loading={removeContactMut.isPending}
        danger
        title="Remove contact?"
        confirmLabel="Remove"
        description={removeContact ? `${removeContact.name} will be removed from ${v.name}.` : ""}
      />
    </>
  );
}

function MetaItem({ icon: Icon, children }: { icon: typeof Tag; children: ReactNode }) {
  return <span className="inline-flex items-center gap-1 text-sm text-ink-600"><Icon className="h-3.5 w-3.5 text-ink-400" />{children}</span>;
}

function TabCard({ title, description, action, children }: { title: ReactNode; description?: ReactNode; action?: ReactNode; children: ReactNode }) {
  return (
    <Card padded={false}>
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-ink-200">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-ink-900">{title}</h3>
          {description && <p className="text-sm text-ink-500 mt-0.5">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </Card>
  );
}

function DueCell({ date, done }: { date: string | null; done?: boolean }) {
  const d = daysUntil(date);
  if (d == null) return <span className="text-ink-400">—</span>;
  const overdue = d < 0 && !done;
  return (
    <span className="whitespace-nowrap">
      <span className={overdue ? "text-danger-700 font-medium" : "text-ink-700"}>{fmtDate(date)}</span>
      {!done && <span className={cn("block text-xs", overdue ? "text-danger-600" : d <= 30 ? "text-warning-700" : "text-ink-400")}>{overdue ? `${Math.abs(d)}d overdue` : d === 0 ? "Today" : `in ${d}d`}</span>}
    </span>
  );
}

function OverviewTab({ v, canWrite, onAddContact, onRemoveContact, onAssess }: { v: VendorDetail; canWrite: boolean; onAddContact: () => void; onRemoveContact: (c: VendorContact) => void; onAssess: () => void }) {
  const ib = inherentBreakdown(v);
  const rb = residualBreakdown(v);
  const services = (v.services ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return (
    <div className="grid gap-6 xl:grid-cols-3 items-start [&>*]:min-w-0">
      <div className="xl:col-span-2 space-y-6 min-w-0">
        <Card>
          <div className="flex items-start justify-between gap-4 mb-4">
            <h3 className="text-sm font-semibold text-ink-900">Vendor profile</h3>
          </div>
          {v.description && <p className="text-sm text-ink-700 leading-relaxed mb-4">{v.description}</p>}
          {services.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-5">{services.map((s) => <Badge key={s} tone="neutral">{s}</Badge>)}</div>
          )}
          <DescriptionList cols={3} items={[
            { label: "Vendor name", value: <span className="[overflow-wrap:anywhere]">{v.name}</span> },
            { label: "Legal name", value: <span className="[overflow-wrap:anywhere]">{v.legal_name || "—"}</span> },
            { label: "Category", value: v.category },
            { label: "Status", value: <Badge tone={TONES.vendorStatus[v.status]} dot>{LABELS.vendorStatus[v.status]}</Badge> },
            { label: "Tier", value: <TierBadge tier={v.tier} /> },
            { label: "Data access", value: LABELS.dataAccess[v.data_access] },
            { label: "Annual spend", value: <span className="tnum">{fmtMoney(v.annual_spend)}</span> },
            { label: "Owner", value: v.owner_name ? <span className="inline-flex items-center gap-2"><Avatar name={v.owner_name} size="xs" />{v.owner_name}</span> : "Unassigned" },
            { label: "Country", value: v.country || "—" },
            { label: "Website", value: v.website ? <a href={v.website} target="_blank" rel="noreferrer" className="text-brand-700 hover:underline break-all">{v.website.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}</a> : "—" },
            { label: "Onboarded", value: fmtDate(v.onboarded_at) },
            { label: "Last assessed", value: v.last_assessed_at ? fmtDate(v.last_assessed_at) : "Never" },
            { label: "Next review", value: fmtDate(v.next_review_date) },
            { label: "Created", value: fmtDate(v.created_at) },
            { label: "Last updated", value: <span title={fmtDateTime(v.updated_at)}>{fmtRelative(v.updated_at)}</span> },
          ]} />
        </Card>

        <Card padded={false}>
          <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-ink-200">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-ink-900">Contacts</h3>
              <p className="text-sm text-ink-500 mt-0.5 line-clamp-2 [overflow-wrap:anywhere]">People at {v.name}</p>
            </div>
            {canWrite && <Button size="sm" variant="secondary" icon={Plus} onClick={onAddContact}>Add contact</Button>}
          </div>
          {v.contacts.length === 0 ? (
            <EmptyState icon={Users} title="No contacts" description="Add a primary contact to route assessment requests." className="py-8" />
          ) : (
            <ul className="divide-y divide-ink-100">
              {v.contacts.map((c) => (
                <li key={c.id} className="group flex items-center gap-4 px-5 py-3">
                  <Avatar name={c.name} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-ink-900 flex items-center gap-2">{c.name}{!!c.is_primary && <Badge tone="brand" size="xs"><Star className="h-2.5 w-2.5" />Primary</Badge>}</p>
                    <p className="text-xs text-ink-500">{c.role || "—"}</p>
                  </div>
                  <div className="hidden sm:flex flex-col items-end gap-0.5 text-xs text-ink-600 min-w-0">
                    {c.email && <a href={`mailto:${c.email}`} className="inline-flex items-center gap-1.5 hover:text-brand-700 truncate"><Mail className="h-3.5 w-3.5 text-ink-400" />{c.email}</a>}
                    {c.phone && <span className="inline-flex items-center gap-1.5 tnum"><Phone className="h-3.5 w-3.5 text-ink-400" />{c.phone}</span>}
                  </div>
                  {canWrite && <Button variant="ghost" size="xs" icon={Trash2} onClick={() => onRemoveContact(c)} aria-label={`Remove ${c.name}`} className="text-ink-400 hover:text-danger-700 opacity-60 group-hover:opacity-100" />}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Card>
        <div className="mb-4">
          <h3 className="text-sm font-semibold text-ink-900">How residual risk is derived</h3>
          <p className="text-sm text-ink-500 mt-0.5">Inherent risk, reduced by the latest completed assessment, plus penalties for open findings.</p>
        </div>
        <ol className="space-y-4">
          <DerivationStep n={1} title="Inherent risk" value={<span className="tnum">{v.inherent_risk}</span>}>
            <div className="space-y-1 text-xs text-ink-600">
              <Row label={`Data access · ${LABELS.dataAccess[v.data_access]}`} value={`+${ib.access}`} />
              <Row label={`Annual spend · ${fmtMoney(v.annual_spend, "USD", true)}`} value={`+${ib.spend}`} />
              <Row label={`Category · ${v.category}`} value={`+${ib.category}`} />
            </div>
          </DerivationStep>
          <DerivationStep n={2} title="Assessment credit" value={<span className={cn("tnum", rb.latest ? "text-success-700" : "text-ink-500")}>{rb.latest ? `−${rb.reduction.toFixed(1)}` : "0"}</span>}>
            {rb.latest ? (
              <div className="text-xs text-ink-600 space-y-1">
                <Link to={`/assessments/${rb.latest.id}`} className="font-medium text-brand-700 hover:underline">{rb.latest.template_name ?? rb.latest.title}</Link>
                <p>Scored <span className="font-semibold text-ink-800 tnum">{rb.latest.score}%</span> · completed {fmtDate(rb.latest.completed_at)}</p>
                <p className="text-ink-500 tnum">{v.inherent_risk} × {ASSESSMENT_REDUCTION} × {rb.latest.score}% = {rb.reduction.toFixed(1)}</p>
              </div>
            ) : (
              <div className="text-xs text-ink-500">
                No completed assessment yet, so no credit is applied.
                {canWrite && <button onClick={onAssess} className="block mt-1 font-medium text-brand-700 hover:underline">Start an assessment</button>}
              </div>
            )}
          </DerivationStep>
          <DerivationStep n={3} title="Open findings penalty" value={<span className={cn("tnum", rb.penalty > 0 && "text-danger-700")}>+{rb.penalty}</span>}>
            {rb.penalty > 0 ? (
              <div className="space-y-1 text-xs text-ink-600">
                {rb.bySeverity.filter((s) => s.count > 0).map((s) => (
                  <Row key={s.severity} label={<span className="inline-flex items-center gap-1.5"><Badge tone={TONES.tier[s.severity]} size="xs">{LABELS.tier[s.severity]}</Badge>{s.count} × {FINDING_PENALTY[s.severity]}</span>} value={`+${s.points}`} />
                ))}
              </div>
            ) : <p className="text-xs text-ink-500">No open findings.</p>}
          </DerivationStep>
        </ol>
        <div className="mt-5 pt-4 border-t border-ink-200 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-ink-500">Residual risk</p>
            {rb.residual !== v.residual_risk && <p className="text-[11px] text-ink-400 mt-0.5">Recalculated value {rb.residual}; stored value updates on next change</p>}
          </div>
          <RiskScore value={v.residual_risk} size="lg" />
        </div>
      </Card>
    </div>
  );
}

function DerivationStep({ n, title, value, children }: { n: number; title: string; value: ReactNode; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="h-6 w-6 rounded-full bg-ink-100 text-ink-600 text-xs font-semibold flex items-center justify-center shrink-0">{n}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-sm font-medium text-ink-800">{title}</p>
          <p className="text-sm font-semibold text-ink-900">{value}</p>
        </div>
        <div className="mt-1.5">{children}</div>
      </div>
    </li>
  );
}

function Row({ label, value }: { label: ReactNode; value: ReactNode }) {
  return <div className="flex items-center justify-between gap-2"><span className="min-w-0 truncate">{label}</span><span className="tnum font-medium text-ink-700">{value}</span></div>;
}

function ContractsTab({ v }: { v: VendorDetail }) {
  const cols: Column<Contract>[] = [
    { key: "title", header: "Contract", render: (c) => <div className="min-w-[200px]"><p className="font-medium text-ink-900">{c.title}</p><p className="text-xs text-ink-500 font-mono">{c.contract_number}</p></div> },
    { key: "type", header: "Type", render: (c) => <span className="text-ink-700">{LABELS.contractType[c.type]}</span> },
    { key: "status", header: "Status", render: (c) => <Badge tone={TONES.contractStatus[c.status]} dot>{LABELS.contractStatus[c.status]}</Badge> },
    { key: "value", header: "Value", align: "right", render: (c) => <span className="tnum">{fmtMoney(c.value, c.currency || "USD")}</span> },
    { key: "start", header: "Start", render: (c) => <span className="text-ink-600 whitespace-nowrap">{fmtDate(c.start_date)}</span> },
    { key: "end", header: "End", render: (c) => <DueCell date={c.end_date} done={c.status === "expired" || c.status === "terminated"} /> },
    { key: "renew", header: "Auto-renew", render: (c) => c.auto_renew ? <Badge tone="info" size="xs">Auto-renew</Badge> : <span className="text-ink-400 text-xs">Manual</span> },
    { key: "owner", header: "Owner", render: (c) => c.owner_name ? <span className="inline-flex items-center gap-2 whitespace-nowrap"><Avatar name={c.owner_name} size="xs" />{c.owner_name}</span> : <span className="text-ink-400">—</span> },
  ];
  return (
    <TabCard title="Contracts" description="Agreements with this vendor, ordered by end date." action={<Link to={`/contracts?vendor_id=${v.id}`} className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline">Open in Contracts<ArrowRight className="h-3.5 w-3.5" /></Link>}>
      <DataTable columns={cols} rows={v.contracts} rowHref={(c) => `/contracts/${c.id}`} emptyTitle="No contracts" emptyDescription="Contracts linked to this vendor will appear here." />
    </TabCard>
  );
}

function AssessmentsTab({ v, action }: { v: VendorDetail; action: ReactNode }) {
  const cols: Column<Assessment>[] = [
    { key: "title", header: "Assessment", render: (a) => <div className="min-w-[220px]"><p className="font-medium text-ink-900">{a.template_name ?? a.title}</p><p className="text-xs text-ink-500">Started {fmtDate(a.created_at)}</p></div> },
    { key: "status", header: "Status", render: (a) => <Badge tone={TONES.assessmentStatus[a.status]} dot>{LABELS.assessmentStatus[a.status]}</Badge> },
    { key: "score", header: "Score", render: (a) => a.score != null ? <span className="inline-flex items-center gap-2"><span className="h-1.5 w-14 rounded-full bg-ink-100 overflow-hidden"><span className={cn("block h-full rounded-full", a.score >= 85 ? "bg-success-600" : a.score >= 70 ? "bg-sky-500" : a.score >= 50 ? "bg-warning-600" : "bg-danger-600")} style={{ width: `${a.score}%` }} /></span><span className="tnum font-medium text-ink-800">{a.score}%</span></span> : <span className="text-ink-400">—</span> },
    { key: "rating", header: "Rating", render: (a) => a.risk_rating ? <Badge tone={TONES.tier[a.risk_rating]}>{LABELS.tier[a.risk_rating]}</Badge> : <span className="text-ink-400">—</span> },
    { key: "assignee", header: "Assignee", render: (a) => a.assignee_name ? <span className="inline-flex items-center gap-2 whitespace-nowrap"><Avatar name={a.assignee_name} size="xs" />{a.assignee_name}</span> : <span className="text-ink-400">Unassigned</span> },
    { key: "due", header: "Due", render: (a) => <DueCell date={a.due_date} done={a.status === "completed"} /> },
    { key: "completed", header: "Completed", render: (a) => <span className="text-ink-600 whitespace-nowrap">{a.completed_at ? fmtDate(a.completed_at) : "—"}</span> },
  ];
  return (
    <TabCard title="Assessments" description="Due-diligence questionnaires; the latest completed score drives residual risk." action={action}>
      <DataTable columns={cols} rows={v.assessments} rowHref={(a) => `/assessments/${a.id}`} emptyTitle="No assessments yet" emptyDescription="Start an assessment to evaluate this vendor’s controls." />
    </TabCard>
  );
}

function DocumentsTab({ v, action }: { v: VendorDetail; action: ReactNode }) {
  const cols: Column<Document>[] = [
    { key: "name", header: "Document", render: (d) => <div className="flex items-center gap-3 min-w-[220px]"><span className="h-8 w-8 rounded-md bg-ink-100 text-ink-500 flex items-center justify-center shrink-0"><FileText className="h-4 w-4" /></span><div className="min-w-0"><p className="font-medium text-ink-900 truncate">{d.name}</p><p className="text-xs text-ink-500 truncate">{d.file_name ? `${d.file_name}${d.file_size ? ` · ${fmtBytes(d.file_size)}` : ""}` : "No file"}</p></div></div> },
    { key: "type", header: "Type", render: (d) => <span className="text-ink-700 whitespace-nowrap">{LABELS.documentType[d.type]}</span> },
    { key: "status", header: "Status", render: (d) => <div><Badge tone={TONES.documentStatus[d.status]} dot>{LABELS.documentStatus[d.status]}</Badge><PendingExpiryHint doc={d} /></div> },
    { key: "issued", header: "Issued", render: (d) => <span className="text-ink-600 whitespace-nowrap">{fmtDate(d.issued_date)}</span> },
    { key: "expiry", header: "Expiry", render: (d) => <DueCell date={d.expiry_date} done={d.status === "rejected"} /> },
    { key: "uploaded", header: "Uploaded by", render: (d) => d.uploaded_by_name ? <span className="inline-flex items-center gap-2 whitespace-nowrap"><Avatar name={d.uploaded_by_name} size="xs" /><span><span className="block">{d.uploaded_by_name}</span><span className="block text-xs text-ink-400">{fmtDate(d.created_at)}</span></span></span> : <span className="text-ink-400">—</span> },
  ];
  return (
    <TabCard title="Documents" description="Certifications, reports and evidence, ordered by expiry." action={action}>
      <DataTable columns={cols} rows={v.documents} emptyTitle="No documents" emptyDescription="Upload SOC 2 reports, certificates of insurance and other evidence." />
    </TabCard>
  );
}

function FindingsTab({ v, action }: { v: VendorDetail; action: ReactNode }) {
  const cols: Column<Finding>[] = [
    { key: "title", header: "Finding", render: (f) => <div className="min-w-[240px]"><p className="font-medium text-ink-900">{f.title}</p><p className="text-xs text-ink-500">Raised {fmtDate(f.created_at)}</p></div> },
    { key: "severity", header: "Severity", render: (f) => <Badge tone={TONES.tier[f.severity]}>{LABELS.tier[f.severity]}</Badge> },
    { key: "status", header: "Status", render: (f) => <Badge tone={TONES.findingStatus[f.status]} dot>{LABELS.findingStatus[f.status]}</Badge> },
    { key: "owner", header: "Owner", render: (f) => f.owner_name ? <span className="inline-flex items-center gap-2 whitespace-nowrap"><Avatar name={f.owner_name} size="xs" />{f.owner_name}</span> : <span className="text-ink-400">Unassigned</span> },
    { key: "due", header: "Due / outcome", render: (f) => <FindingOutcome f={f} /> },
  ];
  return (
    <TabCard title="Findings" description="Control gaps and issues; open findings add a penalty to residual risk." action={action}>
      <DataTable columns={cols} rows={v.findings} rowHref={(f) => `/findings/${f.id}`} emptyTitle="No findings" emptyDescription="No issues have been raised for this vendor." />
    </TabCard>
  );
}

function FindingOutcome({ f }: { f: Finding }) {
  if (f.status === "closed") return <span className="whitespace-nowrap"><span className="block text-success-700 font-medium">Resolved</span><span className="block text-xs text-ink-500">{f.resolved_at ? fmtDate(f.resolved_at) : "—"}</span></span>;
  if (f.status === "risk_accepted") return <span className="whitespace-nowrap"><span className="block text-sky-700 font-medium">Risk accepted</span><span className="block text-xs text-ink-500">{f.resolved_at ? fmtDate(f.resolved_at) : "—"}</span></span>;
  return <DueCell date={f.due_date} />;
}

function ApprovalsTab({ v, action }: { v: VendorDetail; action: ReactNode }) {
  return (
    <TabCard title="Approvals" description="Onboarding and offboarding decisions for this vendor." action={action}>
      {v.approvals.length === 0 ? (
        <EmptyState icon={ShieldCheck} title="No approval requests" description="Submit the vendor for onboarding to request approval." />
      ) : (
        <ul className="divide-y divide-ink-100">
          {v.approvals.map((a: Approval) => (
            <li key={a.id}>
              <Link to={`/approvals/${a.id}`} className="flex items-start gap-4 px-5 py-4 hover:bg-brand-50/40 transition-colors">
                <span className={cn("h-9 w-9 rounded-full flex items-center justify-center shrink-0", a.status === "approved" ? "bg-success-50 text-success-700" : a.status === "rejected" ? "bg-danger-50 text-danger-700" : a.status === "pending" ? "bg-warning-50 text-warning-700" : "bg-ink-100 text-ink-500")}>
                  {a.status === "approved" ? <CheckCircle2 className="h-4.5 w-4.5" /> : a.status === "pending" ? <Clock className="h-4.5 w-4.5" /> : <ShieldCheck className="h-4.5 w-4.5" />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium text-ink-900">{a.title}</p>
                    <Badge tone="neutral" size="xs">{LABELS.approvalType[a.type]}</Badge>
                    {a.priority !== "normal" && <Badge tone={TONES.priority[a.priority]} size="xs">{titleCase(a.priority)}</Badge>}
                  </div>
                  {a.description && <p className="text-sm text-ink-600 mt-0.5">{a.description}</p>}
                  <p className="text-xs text-ink-500 mt-1">Requested by {a.requested_by_name ?? "—"} · {fmtDate(a.created_at)}{a.decided_at ? ` · decided ${fmtDate(a.decided_at)}` : ""}</p>
                  {a.comment && <p className="text-xs text-ink-600 mt-1.5 rounded-md bg-ink-50 border border-ink-100 px-2.5 py-1.5 italic">“{a.comment}”</p>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge tone={TONES.approvalStatus[a.status]} dot>{LABELS.approvalStatus[a.status]}</Badge>
                  <ArrowRight className="h-4 w-4 text-ink-300" />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </TabCard>
  );
}

function statusTransition(a: Activity): { from: string; to: string; fromTone: Tone; toTone: Tone } | null {
  if (!a.metadata) return null;
  try {
    const m = JSON.parse(a.metadata) as { from?: unknown; to?: unknown };
    if (typeof m.from !== "string" || typeof m.to !== "string") return null;
    const lbl = humanizeValue("status", m.from, a.entity_type);
    const lbl2 = humanizeValue("status", m.to, a.entity_type);
    const tones = statusTones(a.entity_type);
    return { from: lbl, to: lbl2, fromTone: tones[m.from] ?? "neutral", toTone: tones[m.to] ?? "neutral" };
  } catch {
    return null;
  }
}

const ENTITY_ICON: Record<string, typeof Tag> = { vendor: Building2, contract: FileSignature, assessment: ClipboardList, finding: Flag, document: FileText };
const ENTITY_LINK: Record<string, string> = { contract: "/contracts/", assessment: "/assessments/", finding: "/findings/" };

function ActivityTab({ items }: { items: Activity[] }) {
  return (
    <TabCard title="Activity" description="Most recent 50 events across this vendor and its contracts, assessments, documents and findings.">
      {items.length === 0 ? (
        <EmptyState icon={ActivityIcon} title="No activity yet" />
      ) : (
        <ol className="px-5 py-4">
          {items.map((a, i) => {
            const Icon = ENTITY_ICON[a.entity_type] ?? ActivityIcon;
            const href = a.entity_id != null && ENTITY_LINK[a.entity_type] ? `${ENTITY_LINK[a.entity_type]}${a.entity_id}` : null;
            const transition = statusTransition(a);
            return (
              <li key={a.id} className="relative flex gap-3 pb-5 last:pb-0">
                {i < items.length - 1 && <span className="absolute left-4 top-9 bottom-0 w-px bg-ink-200" aria-hidden />}
                <div className="relative shrink-0">
                  <Avatar name={a.actor_name ?? "System"} />
                  <span className="absolute -bottom-1 -right-1 h-4.5 w-4.5 rounded-full bg-white ring-1 ring-ink-200 flex items-center justify-center"><Icon className="h-2.5 w-2.5 text-ink-500" /></span>
                </div>
                <div className="min-w-0 flex-1 pt-0.5">
                  <p className="text-sm text-ink-800">
                    <span className="font-medium text-ink-900">{a.actor_name ?? "System"}</span>{" "}
                    {href ? <Link to={href} className="hover:text-brand-700 hover:underline break-words">{a.summary}</Link> : <span className="break-words">{a.summary}</span>}
                  </p>
                  {transition && (
                    <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                      <Badge size="xs" tone={transition.fromTone}>{transition.from}</Badge>
                      <ArrowRight className="h-3 w-3 text-ink-400" aria-label="to" />
                      <Badge size="xs" tone={transition.toTone}>{transition.to}</Badge>
                    </p>
                  )}
                  <p className="text-xs text-ink-500 mt-0.5 flex items-center gap-1.5">
                    <span title={fmtDateTime(a.created_at)}>{fmtRelative(a.created_at)}</span>
                    <span className="text-ink-300">·</span>
                    <span>{titleCase(a.entity_type)}</span>
                    <span className="text-ink-300">·</span>
                    <span>{titleCase(a.action)}</span>
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </TabCard>
  );
}
