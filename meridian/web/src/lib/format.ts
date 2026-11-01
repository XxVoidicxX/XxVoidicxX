import { format, formatDistanceToNowStrict, parseISO, differenceInCalendarDays } from "date-fns";

export function parseDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const d = s.includes("T") || s.length <= 10 ? parseISO(s) : parseISO(s.replace(" ", "T") + "Z");
  return isNaN(d.getTime()) ? null : d;
}
export function fmtDate(s: string | null | undefined, pattern = "MMM d, yyyy"): string {
  const d = parseDate(s);
  return d ? format(d, pattern) : "—";
}
export function fmtDateTime(s: string | null | undefined): string {
  return fmtDate(s, "MMM d, yyyy · HH:mm");
}
export function fmtRelative(s: string | null | undefined): string {
  const d = parseDate(s);
  if (!d) return "—";
  const diff = d.getTime() - Date.now();
  const txt = formatDistanceToNowStrict(d, { addSuffix: true });
  return Math.abs(diff) < 60_000 ? "just now" : txt;
}
export function daysUntil(s: string | null | undefined): number | null {
  const d = parseDate(s);
  return d ? differenceInCalendarDays(d, new Date()) : null;
}
export function fmtMoney(n: number | null | undefined, currency = "USD", compact = false): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: compact ? 1 : 0, notation: compact ? "compact" : "standard" }).format(n);
}
export function fmtNumber(n: number | null | undefined): string {
  return n == null ? "—" : new Intl.NumberFormat("en-US").format(n);
}
export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
export function titleCase(s: string | null | undefined): string {
  if (!s) return "—";
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
export function initials(name: string | null | undefined): string {
  if (!name) return "?";
  return name.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}

export const LABELS = {
  role: { admin: "Administrator", risk_analyst: "Risk Analyst", procurement: "Procurement", vendor_owner: "Vendor Owner", auditor: "Auditor" } as Record<string, string>,
  vendorStatus: { prospect: "Prospect", onboarding: "Onboarding", active: "Active", under_review: "Under Review", offboarding: "Offboarding", terminated: "Terminated" } as Record<string, string>,
  tier: { critical: "Critical", high: "High", medium: "Medium", low: "Low" } as Record<string, string>,
  dataAccess: { none: "No data access", internal: "Internal", confidential: "Confidential", restricted: "Restricted" } as Record<string, string>,
  contractType: { msa: "MSA", sow: "SOW", nda: "NDA", dpa: "DPA", saas: "SaaS Subscription", license: "License", services: "Services Agreement" } as Record<string, string>,
  contractStatus: { draft: "Draft", in_review: "In Review", active: "Active", expiring: "Expiring", expired: "Expired", terminated: "Terminated" } as Record<string, string>,
  assessmentStatus: { not_started: "Not Started", in_progress: "In Progress", submitted: "Submitted", under_review: "Under Review", completed: "Completed" } as Record<string, string>,
  documentType: { soc2: "SOC 2 Report", iso27001: "ISO 27001", insurance: "Insurance Certificate", pen_test: "Penetration Test", dpa: "DPA", financial: "Financial Statements", policy: "Policy", other: "Other" } as Record<string, string>,
  documentStatus: { valid: "Valid", expiring: "Expiring", expired: "Expired", pending_review: "Pending Review", rejected: "Rejected" } as Record<string, string>,
  findingStatus: { open: "Open", in_remediation: "In Remediation", risk_accepted: "Risk Accepted", closed: "Closed" } as Record<string, string>,
  approvalType: { vendor_onboarding: "Vendor Onboarding", contract: "Contract", risk_acceptance: "Risk Acceptance", offboarding: "Offboarding", document: "Document" } as Record<string, string>,
  approvalStatus: { pending: "Pending", approved: "Approved", rejected: "Rejected", cancelled: "Cancelled" } as Record<string, string>,
  obligationStatus: { pending: "Pending", met: "Met", missed: "Missed", waived: "Waived" } as Record<string, string>,
  answer: { yes: "Yes", partial: "Partial", no: "No", na: "N/A" } as Record<string, string>,
};

export type Tone = "neutral" | "brand" | "success" | "warning" | "danger" | "info";
export const TONES = {
  tier: { critical: "danger", high: "warning", medium: "info", low: "success" } as Record<string, Tone>,
  vendorStatus: { prospect: "neutral", onboarding: "info", active: "success", under_review: "warning", offboarding: "warning", terminated: "neutral" } as Record<string, Tone>,
  contractStatus: { draft: "neutral", in_review: "info", active: "success", expiring: "warning", expired: "danger", terminated: "neutral" } as Record<string, Tone>,
  assessmentStatus: { not_started: "neutral", in_progress: "info", submitted: "brand", under_review: "warning", completed: "success" } as Record<string, Tone>,
  documentStatus: { valid: "success", expiring: "warning", expired: "danger", pending_review: "info", rejected: "danger" } as Record<string, Tone>,
  findingStatus: { open: "danger", in_remediation: "warning", risk_accepted: "info", closed: "success" } as Record<string, Tone>,
  approvalStatus: { pending: "warning", approved: "success", rejected: "danger", cancelled: "neutral" } as Record<string, Tone>,
  priority: { low: "neutral", normal: "info", high: "warning", urgent: "danger" } as Record<string, Tone>,
  obligationStatus: { pending: "info", met: "success", missed: "danger", waived: "neutral" } as Record<string, Tone>,
  answer: { yes: "success", partial: "warning", no: "danger", na: "neutral" } as Record<string, Tone>,
};

export function riskTone(score: number): Tone {
  if (score >= 80) return "danger";
  if (score >= 60) return "warning";
  if (score >= 35) return "info";
  return "success";
}
