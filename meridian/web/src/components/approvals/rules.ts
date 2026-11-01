import type { QueryClient } from "@tanstack/react-query";
import type { Approval, ApprovalDetail, ApprovalType, Role } from "@/lib/types";
import { LABELS, TONES, parseDate, titleCase, type Tone } from "@/lib/format";

export type ApprovalRow = Approval & { vendor_id?: number | null };
export type ApprovalDetailRow = ApprovalDetail & { vendor_id?: number | null; approver_roles?: Role[] };

export const APPROVER_ROLES: Record<ApprovalType, Role[]> = {
  vendor_onboarding: ["admin", "risk_analyst"],
  contract: ["admin", "procurement"],
  risk_acceptance: ["admin"],
  offboarding: ["admin", "risk_analyst"],
  document: ["admin", "risk_analyst"],
};

export const APPROVAL_TYPES = Object.keys(APPROVER_ROLES) as ApprovalType[];
export const PRIORITIES = ["urgent", "high", "normal", "low"] as const;
export const TYPE_SHORT: Record<string, string> = { vendor_onboarding: "Onboarding", contract: "Contract", risk_acceptance: "Risk acceptance", offboarding: "Offboarding", document: "Document" };
export const PRIORITY_LABEL: Record<string, string> = { urgent: "Urgent", high: "High", normal: "Normal", low: "Low" };

export function entityPath(entityType: string, entityId: number | null | undefined): string | null {
  if (entityId == null) return null;
  switch (entityType) {
    case "vendor": return `/vendors/${entityId}`;
    case "contract": return `/contracts/${entityId}`;
    case "assessment": return `/assessments/${entityId}`;
    case "finding": return `/findings/${entityId}`;
    case "approval": return `/approvals/${entityId}`;
    default: return null;
  }
}

export function ageHours(from: string | null | undefined, to?: string | null): number | null {
  const a = parseDate(from);
  if (!a) return null;
  const b = to ? parseDate(to) : new Date();
  if (!b) return null;
  return Math.max(0, (b.getTime() - a.getTime()) / 3_600_000);
}

export function fmtDuration(hours: number | null): string {
  if (hours == null) return "—";
  if (hours < 1) return "<1h";
  if (hours < 48) return `${Math.floor(hours)}h`;
  return `${Math.floor(hours / 24)}d`;
}

export function firstLine(s: string | null | undefined): string {
  return (s ?? "").split("\n").find((l) => l.trim())?.trim() ?? "";
}

const ENTITY_KEYS: Record<string, string[]> = {
  vendor: ["vendor", "vendors"],
  contract: ["contract", "contracts"],
  finding: ["finding", "findings"],
};

export function invalidateAfterDecision(qc: QueryClient, entityType?: string) {
  const keys = ["approvals", "approvals-badge", "notifications", "activity", "comments", "dashboard", "reports", ...(entityType ? ENTITY_KEYS[entityType] ?? [] : []), "vendor", "vendors"];
  for (const k of new Set(keys)) qc.invalidateQueries({ queryKey: [k] });
}

const STATUS_LABELS: Record<string, Record<string, string>> = {
  vendor: LABELS.vendorStatus, contract: LABELS.contractStatus, assessment: LABELS.assessmentStatus, document: LABELS.documentStatus,
  finding: LABELS.findingStatus, approval: LABELS.approvalStatus, obligation: LABELS.obligationStatus,
};
const STATUS_TONES: Record<string, Record<string, Tone>> = {
  vendor: TONES.vendorStatus, contract: TONES.contractStatus, assessment: TONES.assessmentStatus, document: TONES.documentStatus,
  finding: TONES.findingStatus, approval: TONES.approvalStatus, obligation: TONES.obligationStatus,
};
const TYPE_LABELS: Record<string, Record<string, string>> = { contract: LABELS.contractType, document: LABELS.documentType, approval: LABELS.approvalType };
const KEY_LABELS: Record<string, Record<string, string>> = {
  tier: LABELS.tier, severity: LABELS.tier, risk_rating: LABELS.tier, data_access: LABELS.dataAccess, role: LABELS.role, answer: LABELS.answer, priority: PRIORITY_LABEL,
  decision: { ...LABELS.approvalStatus, complete: "Complete", return: "Return" },
};
const STATUS_KEYS = new Set(["status", "from", "to", "previous_status", "new_status", "from_status", "to_status"]);
const ENUM_RE = /^[a-z0-9]+(?:_[a-z0-9]+)+$/;

export function statusTones(entityType: string): Record<string, Tone> {
  return STATUS_TONES[entityType] ?? {};
}

export function humanizeKey(key: string): string {
  return titleCase(key);
}

export function humanizeValue(key: string, value: string, entityType: string): string {
  const k = key.toLowerCase();
  const map = STATUS_KEYS.has(k) ? STATUS_LABELS[entityType] : k === "type" ? TYPE_LABELS[entityType] : KEY_LABELS[k];
  if (map?.[value]) return map[value];
  if (STATUS_KEYS.has(k)) for (const m of Object.values(STATUS_LABELS)) if (m[value]) return m[value];
  return ENUM_RE.test(value) ? titleCase(value) : value;
}
