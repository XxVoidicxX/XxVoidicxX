import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, XCircle } from "lucide-react";
import { Badge, Button, Field, Modal, Textarea } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { api, ApiError } from "@/lib/api";
import { LABELS, TONES } from "@/lib/format";
import type { Approval } from "@/lib/types";
import { invalidateAfterDecision } from "./rules";

export type Decision = "approved" | "rejected";

export function DecisionModal({ approval, decision, onClose, onDecided }: { approval: Pick<Approval, "id" | "title" | "type" | "priority" | "entity_type" | "vendor_name"> | null; decision: Decision | null; onClose: () => void; onDecided?: (d: Decision) => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const open = !!approval && !!decision;
  const reject = decision === "rejected";

  useEffect(() => { if (open) { setComment(""); setError(null); } }, [open, approval?.id, decision]);

  const m = useMutation({
    mutationFn: () => api.post(`/api/approvals/${approval!.id}/decide`, { decision, comment: comment.trim() || null }),
    onSuccess: () => {
      toast("success", reject ? "Request rejected" : "Request approved", approval!.title);
      invalidateAfterDecision(qc, approval!.entity_type);
      onDecided?.(decision!);
      onClose();
    },
    onError: (e) => {
      const msg = e instanceof ApiError ? e.message : "Something went wrong";
      setError(msg);
      toast("error", reject ? "Could not reject request" : "Could not approve request", msg);
    },
  });

  if (!approval || !decision) return null;
  return (
    <Modal
      open={open}
      onClose={() => !m.isPending && onClose()}
      title={reject ? "Reject request" : "Approve request"}
      description={reject ? "The requester will be notified with your reason." : "This decision is recorded in the audit trail and cannot be undone."}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={m.isPending}>Cancel</Button>
          <Button variant={reject ? "danger" : "primary"} icon={reject ? XCircle : CheckCircle2} loading={m.isPending} onClick={() => { setError(null); m.mutate(); }}>
            {reject ? "Reject request" : "Approve request"}
          </Button>
        </>
      }
    >
      <div className="rounded-lg border border-ink-200 bg-ink-50/60 p-3 mb-4">
        <p className="text-sm font-medium text-ink-900">{approval.title}</p>
        <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
          <Badge tone="brand" size="xs">{LABELS.approvalType[approval.type]}</Badge>
          <Badge tone={TONES.priority[approval.priority]} size="xs">{approval.priority[0].toUpperCase() + approval.priority.slice(1)} priority</Badge>
          {approval.vendor_name && <span className="text-xs text-ink-500">{approval.vendor_name}</span>}
        </div>
      </div>
      <Field label={reject ? "Reason for rejection" : "Comment"} required={reject} error={error ?? undefined} hint={reject ? "Required. Explain what must change before this can be approved." : "Optional. Add conditions or context for the record."}>
        <Textarea autoFocus value={comment} onChange={(e) => { setComment(e.target.value); if (error) setError(null); }} invalid={!!error} rows={4} placeholder={reject ? "e.g. SOC 2 report is older than 12 months; please obtain a bridge letter." : "e.g. Approved subject to annual SOC 2 refresh."} maxLength={2000} />
      </Field>
    </Modal>
  );
}
