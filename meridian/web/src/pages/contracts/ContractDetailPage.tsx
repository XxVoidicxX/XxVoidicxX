import { useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Ban, ChevronDown, ClipboardList, FileSearch, Pencil, Plus, RotateCcw, Send } from "lucide-react";
import { ApiError, api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { LABELS, TONES, fmtDate, fmtDateTime, fmtMoney } from "@/lib/format";
import type { Contract, ContractDetail } from "@/lib/types";
import { Avatar, Badge, Button, Card, CardHeader, DescriptionList, EmptyState, PageHeader, PageLoader, Tabs } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { ContractFormModal } from "@/components/contracts/ContractFormModal";
import { ActivityTimeline, ApprovalsHistory, LinkedDocuments, ObligationModal, ObligationsPanel, RenewalPanel } from "@/components/contracts/ContractPanels";
import { ConfirmDialog, Dropdown, VendorTierBadge, errorMessage, type MenuItem } from "@/components/contracts/shared";
import { DocumentUploadModal } from "@/components/documents/DocumentModals";

type TabId = "overview" | "obligations" | "documents" | "approvals" | "activity";
const TAB_IDS: TabId[] = ["overview", "obligations", "documents", "approvals", "activity"];

export default function ContractDetailPage() {
  const { id: idParam } = useParams();
  const id = Number(idParam);
  const navigate = useNavigate();
  const { canWrite } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [sp, setSp] = useSearchParams();
  const tabParam = sp.get("tab") as TabId | null;
  const tab: TabId = tabParam && TAB_IDS.includes(tabParam) ? tabParam : "overview";
  const setTab = (t: TabId) => setSp((prev) => { const n = new URLSearchParams(prev); if (t === "overview") n.delete("tab"); else n.set("tab", t); return n; }, { replace: true });

  const [editing, setEditing] = useState(false);
  const [addingObligation, setAddingObligation] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [confirm, setConfirm] = useState<null | "terminate" | "reactivate" | "submit">(null);

  const q = useQuery({
    queryKey: ["contract", id],
    queryFn: () => api.get<{ data: ContractDetail }>(`/api/contracts/${id}`).then((r) => r.data),
    enabled: Number.isFinite(id),
    retry: (n, e) => !(e instanceof ApiError && e.status === 404) && n < 2,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["contract", id] });
    qc.invalidateQueries({ queryKey: ["contracts"] });
    qc.invalidateQueries({ queryKey: ["contracts-summary"] });
    qc.invalidateQueries({ queryKey: ["approvals"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
  };

  const submit = useMutation({
    mutationFn: () => api.post<{ data: Contract; approval_id: number }>(`/api/contracts/${id}/submit-for-approval`),
    onSuccess: (r) => { toast("success", "Submitted for approval", `Approval #${r.approval_id} routed to procurement`); invalidate(); setConfirm(null); setTab("approvals"); },
    onError: (e) => { toast("error", "Could not submit", errorMessage(e)); setConfirm(null); },
  });
  const changeStatus = useMutation({
    mutationFn: (status: "terminated" | "active") => api.patch<{ data: Contract }>(`/api/contracts/${id}`, { status }),
    onSuccess: (r, status) => { toast("success", status === "terminated" ? "Contract terminated" : "Contract reactivated", `Status is now ${LABELS.contractStatus[r.data.status]}`); invalidate(); setConfirm(null); },
    onError: (e) => toast("error", "Could not change status", errorMessage(e)),
  });

  if (!Number.isFinite(id) || (q.isError && q.error instanceof ApiError && q.error.status === 404)) {
    return (
      <Card className="mx-auto mt-10 max-w-lg">
        <EmptyState icon={FileSearch} title="Contract not found" description={`We couldn't find contract #${idParam}. It may have been removed or the link is incorrect.`} action={<Button variant="secondary" icon={ArrowLeft} onClick={() => navigate("/contracts")}>Back to contracts</Button>} />
      </Card>
    );
  }
  if (q.isError) {
    return <Card className="mx-auto mt-10 max-w-lg"><EmptyState title="Could not load contract" description={errorMessage(q.error)} action={<Button variant="secondary" onClick={() => q.refetch()}>Retry</Button>} /></Card>;
  }
  if (q.isLoading || !q.data) return <PageLoader />;

  const c = q.data;
  const pendingApproval = c.approvals.find((a) => a.status === "pending");
  const lastRejected = !pendingApproval ? c.approvals.find((a) => a.status === "rejected") : undefined;
  const canSubmit = c.status === "draft" && !pendingApproval;
  const pendingObs = c.obligations.filter((o) => o.status === "pending").length;

  const menuItems: (MenuItem | "divider")[] = [];
  if (c.status === "terminated") menuItems.push({ label: "Reactivate contract", icon: RotateCcw, onSelect: () => setConfirm("reactivate") });
  else menuItems.push({ label: "Mark terminated", icon: Ban, danger: true, onSelect: () => setConfirm("terminate") });

  return (
    <div className="space-y-5">
      <PageHeader
        breadcrumbs={[{ label: "Contracts", to: "/contracts" }, { label: c.contract_number }]}
        title={c.title}
        meta={
          <>
            <Badge tone={TONES.contractStatus[c.status]} dot>{LABELS.contractStatus[c.status]}</Badge>
            <Badge tone="neutral">{LABELS.contractType[c.type] ?? c.type}</Badge>
            <span className="font-mono text-xs text-ink-500">{c.contract_number}</span>
            <span className="text-ink-300">·</span>
            <Link to={`/vendors/${c.vendor_id}`} className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 hover:underline">{c.vendor_name}</Link>
            <VendorTierBadge tier={c.vendor_tier} />
            <span className="text-ink-300">·</span>
            <span className="text-sm font-semibold text-ink-900 tnum">{fmtMoney(c.value, c.currency)}</span>
          </>
        }
        actions={
          canWrite ? (
            <>
              <Button variant="secondary" icon={Pencil} onClick={() => setEditing(true)}>Edit</Button>
              <Button variant="secondary" icon={Plus} onClick={() => setAddingObligation(true)}>Add obligation</Button>
              {canSubmit && <Button icon={Send} onClick={() => setConfirm("submit")}>Submit for approval</Button>}
              <Dropdown
                label="Status actions"
                items={menuItems}
                trigger={(t) => <Button {...t} variant="secondary" iconRight={ChevronDown}>Status</Button>}
              />
            </>
          ) : undefined
        }
      />

      {pendingApproval && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3">
          <div className="flex items-start gap-2.5">
            <ClipboardList className="mt-0.5 h-4 w-4 text-sky-700" />
            <div>
              <p className="text-sm font-semibold text-sky-900">Awaiting procurement approval</p>
              <p className="text-xs text-sky-800">Submitted by {pendingApproval.requested_by_name ?? "—"} on {fmtDateTime(pendingApproval.created_at)}. The contract stays In Review until a decision is made.</p>
            </div>
          </div>
          <Button size="sm" variant="outline" iconRight={ArrowRight} onClick={() => navigate(`/approvals/${pendingApproval.id}`)}>View approval #{pendingApproval.id}</Button>
        </div>
      )}
      {lastRejected && c.status === "draft" && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-danger-50 px-4 py-3">
          <p className="text-sm text-danger-700"><span className="font-semibold">Previous approval was rejected.</span> {lastRejected.comment}</p>
          <Link to={`/approvals/${lastRejected.id}`} className="text-sm font-medium text-danger-700 hover:underline">View decision</Link>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <div className="min-w-0 space-y-4 xl:col-span-2">
          <Tabs
            value={tab}
            onChange={setTab}
            tabs={[
              { id: "overview", label: "Overview" },
              { id: "obligations", label: "Obligations", count: c.obligations.length },
              { id: "documents", label: "Documents", count: c.documents.length },
              { id: "approvals", label: "Approvals", count: c.approvals.length },
              { id: "activity", label: "Activity" },
            ]}
          />
          {tab === "overview" && (
            <>
              <Card>
                <CardHeader title="Contract details" />
                <DescriptionList
                  cols={3}
                  items={[
                    { label: "Contract number", value: <span className="font-mono text-[13px]">{c.contract_number}</span> },
                    { label: "Type", value: LABELS.contractType[c.type] ?? c.type },
                    { label: "Status", value: <Badge tone={TONES.contractStatus[c.status]} dot>{LABELS.contractStatus[c.status]}</Badge> },
                    { label: "Vendor", value: <Link to={`/vendors/${c.vendor_id}`} className="text-brand-700 hover:underline">{c.vendor_name}</Link> },
                    { label: "Value", value: <span className="tnum">{fmtMoney(c.value, c.currency)}</span> },
                    { label: "Currency", value: c.currency },
                    { label: "Start date", value: fmtDate(c.start_date) },
                    { label: "End date", value: fmtDate(c.end_date) },
                    { label: "Auto-renew", value: c.auto_renew ? "Yes" : "No" },
                    { label: "Renewal notice", value: `${c.renewal_notice_days} days` },
                    { label: "Owner", value: c.owner_name ? <span className="inline-flex items-center gap-2"><Avatar name={c.owner_name} size="xs" />{c.owner_name}</span> : "Unassigned" },
                    { label: "Pending obligations", value: <span className="tnum">{pendingObs}</span> },
                    { label: "Created", value: fmtDateTime(c.created_at) },
                    { label: "Last updated", value: fmtDateTime(c.updated_at) },
                  ]}
                />
              </Card>
              <Card>
                <CardHeader title="Notes" action={canWrite ? <Button size="xs" variant="ghost" icon={Pencil} onClick={() => setEditing(true)}>Edit</Button> : undefined} />
                {c.notes ? <p className="whitespace-pre-line text-sm leading-6 text-ink-700">{c.notes}</p> : <p className="text-sm text-ink-400">No notes recorded.</p>}
              </Card>
            </>
          )}
          {tab === "obligations" && <ObligationsPanel contract={c} onAdd={() => setAddingObligation(true)} />}
          {tab === "documents" && <LinkedDocuments documents={c.documents} vendorId={c.vendor_id} onUpload={() => setUploading(true)} />}
          {tab === "approvals" && <ApprovalsHistory approvals={c.approvals} />}
          {tab === "activity" && <ActivityTimeline items={c.activity} />}
        </div>

        <div className="order-first grid grid-cols-1 items-start gap-4 md:grid-cols-2 xl:order-none xl:grid-cols-1 xl:content-start">
          <RenewalPanel contract={c} />
          <Card>
            <CardHeader title="At a glance" />
            <dl className="space-y-3 text-sm">
              <div className="flex items-center justify-between gap-3"><dt className="text-ink-500">Owner</dt><dd className="text-ink-900">{c.owner_name ?? "Unassigned"}</dd></div>
              <div className="flex items-center justify-between gap-3"><dt className="text-ink-500">Vendor tier</dt><dd>{c.vendor_tier ? <Badge size="xs" tone={TONES.tier[c.vendor_tier]}>{LABELS.tier[c.vendor_tier]}</Badge> : "—"}</dd></div>
              <div className="flex items-center justify-between gap-3"><dt className="text-ink-500">Open obligations</dt><dd className="tnum text-ink-900">{pendingObs} of {c.obligations.length}</dd></div>
              <div className="flex items-center justify-between gap-3"><dt className="text-ink-500">Linked documents</dt><dd className="tnum text-ink-900">{c.documents.length}</dd></div>
            </dl>
          </Card>
        </div>
      </div>

      <ContractFormModal open={editing} onClose={() => setEditing(false)} contract={c} />
      <ObligationModal open={addingObligation} onClose={() => { setAddingObligation(false); }} contractId={c.id} />
      <DocumentUploadModal open={uploading} onClose={() => setUploading(false)} defaultVendorId={c.vendor_id} defaultContractId={c.id} />
      <ConfirmDialog
        open={confirm === "submit"}
        onClose={() => setConfirm(null)}
        onConfirm={() => submit.mutate()}
        loading={submit.isPending}
        title="Submit for approval?"
        confirmLabel="Submit"
        description={`${c.title} (${fmtMoney(c.value, c.currency)}) will be routed to procurement for approval and moved to In Review.`}
      />
      <ConfirmDialog
        open={confirm === "terminate"}
        onClose={() => setConfirm(null)}
        onConfirm={() => changeStatus.mutate("terminated")}
        loading={changeStatus.isPending}
        danger
        title="Mark contract as terminated?"
        confirmLabel="Terminate"
        description="Renewal tracking stops and the contract no longer counts toward active value. You can reactivate it later."
      />
      <ConfirmDialog
        open={confirm === "reactivate"}
        onClose={() => setConfirm(null)}
        onConfirm={() => changeStatus.mutate("active")}
        loading={changeStatus.isPending}
        title="Reactivate contract?"
        confirmLabel="Reactivate"
        description={c.end_date && c.end_date < new Date().toISOString().slice(0, 10) ? "The end date has passed, so the contract will show as Expired until its term is extended." : "The contract returns to Active and renewal tracking resumes."}
      />
    </div>
  );
}
