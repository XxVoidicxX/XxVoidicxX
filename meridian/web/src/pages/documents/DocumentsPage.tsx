import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlarmClock, CalendarClock, ClipboardCheck, FileClock, FileText, FileX2, MoreHorizontal, Pencil, RefreshCw, ShieldCheck, Trash2, UploadCloud, X } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useListParams, usePagedQuery } from "@/lib/hooks";
import { LABELS, TONES, daysUntil, fmtBytes, fmtDate } from "@/lib/format";
import type { Document, DocumentStatus } from "@/lib/types";
import { Avatar, Badge, Button, Card, DataTable, EmptyState, PageHeader, Pagination, Skeleton, Stat, cn, type Column } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { CELL, ConfirmDialog, DaysLabel, Dropdown, FilterChips, SHORT_DOCUMENT_TYPE, SearchInput, ToolbarSelect, errorMessage, useDebouncedSearch, useVendorOptions, type ChipOption, type MenuItem } from "@/components/contracts/shared";
import { DOCUMENT_TYPES, DocumentEditModal, DocumentReviewModal, DocumentUploadModal, useInvalidateDocuments } from "@/components/documents/DocumentModals";

interface DocumentSummary { total: number; counts: Record<DocumentStatus, number>; upcoming: Document[] }

const STATUSES: DocumentStatus[] = ["valid", "expiring", "expired", "pending_review", "rejected"];
const FILTER_KEYS = ["q", "status", "type", "vendor_id", "contract_id"] as const;
const CHIP_STATUS: Record<string, string> = { all: "", expiring: "expiring", expired: "expired", pending: "pending_review" };

export default function DocumentsPage() {
  const navigate = useNavigate();
  const { canWrite } = useAuth();
  const { toast } = useToast();
  const invalidate = useInvalidateDocuments();
  const p = useListParams({ sort: "expiry_date", dir: "asc" });
  const [search, setSearch] = useDebouncedSearch(p.q, (v) => p.set({ q: v }));
  const { data: vendors = [] } = useVendorOptions();
  const [uploading, setUploading] = useState(false);
  const [editing, setEditing] = useState<Document | null>(null);
  const [reviewing, setReviewing] = useState<Document | null>(null);
  const [deleting, setDeleting] = useState<Document | null>(null);

  const status = p.get("status");
  const type = p.get("type");
  const vendorId = p.get("vendor_id");
  const contractId = p.get("contract_id");
  const params = { q: p.q, page: p.page, limit: p.limit, sort: p.sort, dir: p.dir, status, type, vendor_id: vendorId, contract_id: contractId };
  const list = usePagedQuery<Document>("documents", "/api/documents", params);
  const summary = useQuery({ queryKey: ["documents-summary"], queryFn: () => api.get<{ data: DocumentSummary }>("/api/documents/summary").then((r) => r.data) });
  const s = summary.data;

  const remove = useMutation({
    mutationFn: (d: Document) => api.delete(`/api/documents/${d.id}`),
    onSuccess: (_r, d) => { toast("success", "Document deleted", d.name); invalidate(); setDeleting(null); },
    onError: (e) => toast("error", "Could not delete document", errorMessage(e)),
  });

  const chip = useMemo(() => Object.entries(CHIP_STATUS).find(([, v]) => v === status)?.[0] ?? "", [status]);
  const chips: ChipOption[] = [
    { id: "all", label: "All", count: s?.total },
    { id: "expiring", label: "Expiring", count: s?.counts.expiring, tone: "warning" },
    { id: "expired", label: "Expired", count: s?.counts.expired, tone: "danger" },
    { id: "pending", label: "Pending review", count: s?.counts.pending_review, tone: "info" },
  ];
  const hasFilters = FILTER_KEYS.some((k) => !!p.get(k));
  const clearFilters = () => { setSearch(""); p.set(Object.fromEntries(FILTER_KEYS.map((k) => [k, null]))); };
  const filteredVendor = vendorId ? vendors.find((v) => String(v.id) === vendorId) : undefined;

  const rowMenu = (d: Document): (MenuItem | "divider")[] => [
    ...(d.status === "pending_review" ? [{ label: "Review…", icon: ClipboardCheck, onSelect: () => setReviewing(d) }] : d.status === "rejected" ? [{ label: "Re-review…", icon: ClipboardCheck, onSelect: () => setReviewing(d) }] : []),
    { label: "Edit details", icon: Pencil, onSelect: () => setEditing(d) },
    ...(d.contract_id ? [{ label: "Open linked contract", icon: FileText, onSelect: () => navigate(`/contracts/${d.contract_id}`) }] : []),
    "divider",
    { label: "Delete", icon: Trash2, danger: true, onSelect: () => setDeleting(d) },
  ];

  const columns: Column<Document>[] = [
    {
      key: "name", header: "Document", sortable: true, className: CELL,
      render: (d) => (
        <div className="flex w-[230px] items-start gap-2.5 xl:w-[240px] 2xl:w-[320px]">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-ink-100 text-ink-500"><FileText className="h-4 w-4" /></span>
          <div className="min-w-0">
            <p className="truncate font-medium text-ink-900" title={d.name}>{d.name}</p>
            <p className="truncate text-[11px] text-ink-500" title={d.file_name ?? undefined}><span className="font-mono">{d.file_name ?? "—"}</span><span className="text-ink-400"> · {fmtBytes(d.file_size ?? 0)}</span></p>
          </div>
        </div>
      ),
    },
    {
      key: "vendor_name", header: "Vendor", sortable: true, className: CELL,
      render: (d) => <Link to={`/vendors/${d.vendor_id}`} title={d.vendor_name} className="block max-w-[130px] truncate text-ink-700 hover:text-brand-700 hover:underline 2xl:max-w-[200px]">{d.vendor_name}</Link>,
    },
    { key: "type", header: "Type", sortable: true, className: CELL, render: (d) => <Badge tone="neutral" size="xs"><span title={LABELS.documentType[d.type]}>{SHORT_DOCUMENT_TYPE[d.type] ?? d.type}</span></Badge> },
    { key: "status", header: "Status", sortable: true, className: CELL, render: (d) => <Badge tone={TONES.documentStatus[d.status]} dot>{LABELS.documentStatus[d.status]}</Badge> },
    { key: "issued_date", header: "Issued", sortable: true, className: CELL, render: (d) => <span className="whitespace-nowrap text-ink-600 tnum">{fmtDate(d.issued_date)}</span> },
    {
      key: "expiry_date", header: "Expiry", sortable: true, className: CELL,
      render: (d) => d.expiry_date ? (
        <div className="whitespace-nowrap leading-5">
          <p className="text-ink-700 tnum">{fmtDate(d.expiry_date)}</p>
          {d.status !== "rejected" && <DaysLabel date={d.expiry_date} className="text-xs" />}
        </div>
      ) : <span className="text-xs text-ink-400">No expiry</span>,
    },
    {
      key: "uploaded_by", header: "Uploaded by", className: CELL,
      render: (d) => d.uploaded_by_name ? <span className="inline-flex max-w-[110px] items-center gap-1.5 text-ink-700 2xl:max-w-[160px]" title={d.uploaded_by_name}><Avatar name={d.uploaded_by_name} size="xs" /><span className="truncate">{d.uploaded_by_name}</span></span> : <span className="text-ink-400">—</span>,
    },
    {
      key: "actions", header: <span className="sr-only">Actions</span>, align: "right", width: "1%", className: CELL,
      render: (d) => canWrite ? (
        <div className="flex items-center justify-end gap-1">
          {d.status === "pending_review" && <Button size="xs" variant="outline" icon={ClipboardCheck} onClick={() => setReviewing(d)}>Review</Button>}
          <Dropdown
            label={`Actions for ${d.name}`}
            items={rowMenu(d)}
            trigger={(t) => <Button {...t} size="xs" variant="ghost" icon={MoreHorizontal} aria-label={`Actions for ${d.name}`} />}
          />
        </div>
      ) : null,
    },
  ];


  return (
    <div className="space-y-5">
      <PageHeader
        title="Documents"
        description="Evidence library — certifications, audit reports, insurance and agreements collected from vendors."
        actions={canWrite ? <Button icon={UploadCloud} onClick={() => setUploading(true)}>Upload document</Button> : undefined}
      />

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Stat label="Valid" value={s ? s.counts.valid : "—"} icon={ShieldCheck} tone="success" hint={s ? `${pct(s.counts.valid, s.total)} of library` : " "} to="/documents?status=valid" />
          <Stat label="Expiring" value={s ? s.counts.expiring : "—"} icon={AlarmClock} tone={s && s.counts.expiring > 0 ? "warning" : undefined} hint="Within 45 days" to="/documents?status=expiring" />
          <Stat label="Expired" value={s ? s.counts.expired : "—"} icon={FileX2} tone={s && s.counts.expired > 0 ? "danger" : undefined} hint="Request refreshed evidence" to="/documents?status=expired" />
          <Stat label="Pending review" value={s ? s.counts.pending_review : "—"} icon={FileClock} tone={s && s.counts.pending_review > 0 ? "info" : undefined} hint={s && s.counts.rejected ? `${s.counts.rejected} rejected` : "Awaiting a reviewer"} to="/documents?status=pending_review" />
        </div>
        <ExpiringSoon docs={s?.upcoming} loading={summary.isLoading} />
      </div>

      <Card padded={false}>
        <div className="space-y-3 border-b border-ink-200 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <FilterChips options={chips} value={chip} onChange={(id) => p.set({ status: CHIP_STATUS[id] || null })} />
            {list.isFetching && !list.isLoading && <RefreshCw className="h-3.5 w-3.5 animate-spin text-ink-400" aria-label="Refreshing" />}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput value={search} onChange={setSearch} placeholder="Search name, file or vendor…" className="w-full sm:w-72" />
            <ToolbarSelect label="Type" value={type} onChange={(v) => p.set({ type: v })}>
              <option value="">All types</option>
              {DOCUMENT_TYPES.map((t) => <option key={t} value={t}>{LABELS.documentType[t]}</option>)}
            </ToolbarSelect>
            <ToolbarSelect label="Status" value={status} onChange={(v) => p.set({ status: v })}>
              <option value="">All statuses</option>
              {STATUSES.map((st) => <option key={st} value={st}>{LABELS.documentStatus[st]}</option>)}
            </ToolbarSelect>
            <ToolbarSelect label="Vendor" value={vendorId} onChange={(v) => p.set({ vendor_id: v })} className="max-w-[220px]">
              <option value="">All vendors</option>
              {vendorId && !filteredVendor && <option value={vendorId}>Vendor #{vendorId}</option>}
              {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </ToolbarSelect>
            {contractId && <Badge tone="brand">Contract #{contractId}<button onClick={() => p.set({ contract_id: null })} aria-label="Clear contract filter"><X className="h-3 w-3" /></button></Badge>}
            {hasFilters && <Button variant="ghost" size="sm" icon={X} onClick={clearFilters}>Clear</Button>}
          </div>
        </div>
        <DataTable
          columns={columns}
          rows={list.data?.data ?? []}
          loading={list.isLoading}
          sort={{ key: p.sort, dir: p.dir }}
          onSort={p.toggleSort}
          emptyTitle={hasFilters ? "No documents match these filters" : "The evidence library is empty"}
          emptyDescription={hasFilters ? "Try a different status or clear the search." : canWrite ? "Upload SOC 2 reports, certificates and insurance documents to start tracking expiry." : undefined}
        />
        {list.isError && <p className="border-t border-ink-200 px-4 py-3 text-sm text-danger-700">Could not load documents. {errorMessage(list.error)}</p>}
        <Pagination page={p.page} limit={p.limit} total={list.data?.total ?? 0} onPage={p.setPage} />
      </Card>

      <DocumentUploadModal open={uploading} onClose={() => setUploading(false)} defaultVendorId={vendorId ? Number(vendorId) : null} />
      <DocumentEditModal doc={editing} onClose={() => setEditing(null)} />
      <DocumentReviewModal doc={reviewing} onClose={() => setReviewing(null)} />
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting)}
        loading={remove.isPending}
        danger
        title="Delete document?"
        confirmLabel="Delete document"
        description={deleting ? `"${deleting.name}" from ${deleting.vendor_name} will be permanently removed from the evidence library. This cannot be undone.` : undefined}
      />
    </div>
  );
}

function pct(n: number, total: number) {
  return total ? `${Math.round((n / total) * 100)}%` : "0%";
}

function ExpiringSoon({ docs, loading }: { docs?: Document[]; loading: boolean }) {
  return (
    <Card padded={false}>
      <div className="flex items-center justify-between gap-3 border-b border-ink-100 px-5 py-3">
        <div className="flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-warning-600" />
          <h3 className="text-sm font-semibold text-ink-900">Expiring soon</h3>
          <span className="text-sm text-ink-500">· next documents to lapse</span>
        </div>
        <Link to="/documents?status=expiring" className="text-xs font-medium text-brand-700 hover:underline">View all expiring</Link>
      </div>
      {loading ? (
        <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 xl:grid-cols-5">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-14" />)}</div>
      ) : !docs?.length ? (
        <EmptyState icon={ShieldCheck} title="Nothing expiring" description="All dated evidence is current." className="py-6" />
      ) : (
        <ul className="grid grid-cols-1 divide-y divide-ink-100 sm:grid-cols-2 sm:divide-y-0 xl:grid-cols-5 xl:divide-x" data-testid="expiring-soon">
          {docs.map((d) => {
            const days = daysUntil(d.expiry_date);
            return (
              <li key={d.id} className="flex items-start gap-3 px-5 py-3">
                <span className={cn("mt-0.5 flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-md ring-1 ring-inset tnum", days != null && days <= 30 ? "bg-danger-50 text-danger-700 ring-red-200" : "bg-warning-50 text-warning-700 ring-amber-200")}>
                  <span className="text-sm font-semibold leading-none">{days ?? "—"}</span>
                  <span className="mt-0.5 text-[9px] font-medium uppercase leading-none">days</span>
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink-900" title={d.name}>{d.name}</p>
                  <Link to={`/vendors/${d.vendor_id}`} className="block truncate text-xs text-ink-500 hover:text-brand-700 hover:underline">{d.vendor_name}</Link>
                  <p className="truncate text-[11px] text-ink-400 tnum">{SHORT_DOCUMENT_TYPE[d.type] ?? d.type} · {fmtDate(d.expiry_date)}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
