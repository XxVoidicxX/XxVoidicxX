import { useQuery } from "@tanstack/react-query";
import { Ban, Building2, Lock, ShieldAlert, type LucideIcon } from "lucide-react";
import { api } from "@/lib/api";
import type { Assessment, DataAccess, Finding, Tier, VendorDetail } from "@/lib/types";

export const ACCESS_POINTS: Record<DataAccess, number> = { none: 5, internal: 25, confidential: 55, restricted: 80 };
export const CATEGORY_POINTS: Record<string, number> = { "Cloud Infrastructure": 10, Payments: 10, Security: 6, "Data & Analytics": 8, "HR & Payroll": 8, SaaS: 4, "Professional Services": 2, Logistics: 3, Marketing: 2, Facilities: 1, Legal: 3, Hardware: 2 };
export const FINDING_PENALTY: Record<Tier, number> = { critical: 12, high: 7, medium: 3, low: 1 };
export const ASSESSMENT_REDUCTION = 0.55;

export function spendPoints(spend: number): number {
  return spend >= 1_000_000 ? 20 : spend >= 250_000 ? 12 : spend >= 50_000 ? 6 : 2;
}

export function inherentBreakdown(v: { data_access: DataAccess; annual_spend: number; category: string }) {
  const access = ACCESS_POINTS[v.data_access] ?? 25;
  const spend = spendPoints(v.annual_spend || 0);
  const category = CATEGORY_POINTS[v.category] ?? 3;
  return { access, spend, category, total: Math.min(100, access + spend + category) };
}

export function computeInherentRisk(v: { data_access: DataAccess; annual_spend: number; category: string }): number {
  return inherentBreakdown(v).total;
}

export function tierFromInherent(inherent: number): Tier {
  if (inherent >= 80) return "critical";
  if (inherent >= 60) return "high";
  if (inherent >= 35) return "medium";
  return "low";
}

export function latestCompletedAssessment(assessments: Assessment[]): Assessment | null {
  const done = assessments.filter((a) => a.status === "completed" && a.score != null);
  done.sort((a, b) => (b.completed_at ?? "").localeCompare(a.completed_at ?? ""));
  return done[0] ?? null;
}

export function residualBreakdown(v: Pick<VendorDetail, "inherent_risk" | "assessments" | "findings">) {
  const latest = latestCompletedAssessment(v.assessments);
  const reduction = latest ? v.inherent_risk * ASSESSMENT_REDUCTION * ((latest.score ?? 0) / 100) : 0;
  const base = v.inherent_risk - reduction;
  const open: Finding[] = v.findings.filter((f) => f.status === "open" || f.status === "in_remediation");
  const bySeverity = (["critical", "high", "medium", "low"] as Tier[]).map((s) => {
    const count = open.filter((f) => f.severity === s).length;
    return { severity: s, count, points: count * FINDING_PENALTY[s] };
  });
  const penalty = bySeverity.reduce((a, b) => a + b.points, 0);
  const residual = Math.max(0, Math.min(100, Math.round(base + penalty)));
  return { latest, reduction, base, bySeverity, penalty, residual };
}

export const DATA_ACCESS_OPTIONS: { value: DataAccess; label: string; description: string; examples: string; icon: LucideIcon }[] = [
  { value: "none", label: "No data access", description: "Vendor never stores, processes or views company data.", examples: "Facilities, office supplies, hardware delivery", icon: Ban },
  { value: "internal", label: "Internal", description: "Access to non-sensitive internal information only.", examples: "Project plans, internal wikis, business contact details", icon: Building2 },
  { value: "confidential", label: "Confidential", description: "Processes confidential business or limited personal data.", examples: "Employee records, financial reports, customer contact lists", icon: Lock },
  { value: "restricted", label: "Restricted", description: "Stores or processes regulated, customer or production data.", examples: "Payment card data, health records, production systems", icon: ShieldAlert },
];

export const DEFAULT_CADENCE: Record<Tier, number> = { critical: 6, high: 12, medium: 24, low: 36 };

export function useReviewCadence(): Record<Tier, number> {
  const q = useQuery({
    queryKey: ["settings", "vendor-cadence"],
    queryFn: () => api.get<{ data: { review_cadence_months?: Record<Tier, number> } }>("/api/settings").then((r) => r.data),
    staleTime: 5 * 60_000,
  });
  return { ...DEFAULT_CADENCE, ...(q.data?.review_cadence_months ?? {}) };
}

export function addMonthsIso(months: number, from = new Date()): string {
  const d = new Date(from.getFullYear(), from.getMonth() + months, from.getDate());
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function todayIso(): string {
  return addMonthsIso(0);
}

export function normalizeUrl(s: string): string {
  const t = s.trim();
  if (!t) return "";
  return /^https?:\/\//i.test(t) ? t : `https://${t}`;
}

export const URL_RE = /^(https?:\/\/)?([\w-]+\.)+[a-z]{2,}(:\d+)?(\/\S*)?$/i;
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function errorMessage(e: unknown): string {
  if (e && typeof e === "object" && "message" in e) return String((e as { message: unknown }).message);
  return "Something went wrong";
}
