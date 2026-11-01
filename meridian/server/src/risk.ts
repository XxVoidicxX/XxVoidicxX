import { all, get, update } from "./db.js";

export const ANSWER_SCORE: Record<string, number | null> = { yes: 1, partial: 0.5, no: 0, na: null };

export function ratingFromScore(score: number | null): "critical" | "high" | "medium" | "low" | null {
  if (score == null) return null;
  if (score >= 85) return "low";
  if (score >= 70) return "medium";
  if (score >= 50) return "high";
  return "critical";
}

export function computeAssessmentScore(assessmentId: number): number | null {
  const rows = all<{ answer: string | null; weight: number }>(
    `SELECT a.answer, q.weight FROM assessment_answers a JOIN template_questions q ON q.id = a.question_id WHERE a.assessment_id = ?`,
    assessmentId
  );
  let num = 0;
  let den = 0;
  for (const r of rows) {
    const s = r.answer ? ANSWER_SCORE[r.answer] : null;
    if (s == null) continue;
    num += s * r.weight;
    den += r.weight;
  }
  if (!den) return null;
  return Math.round((num / den) * 1000) / 10;
}

export function tierFromInherent(inherent: number): "critical" | "high" | "medium" | "low" {
  if (inherent >= 80) return "critical";
  if (inherent >= 60) return "high";
  if (inherent >= 35) return "medium";
  return "low";
}

export function computeInherentRisk(v: { data_access: string; annual_spend: number; category: string }): number {
  const access: Record<string, number> = { none: 5, internal: 25, confidential: 55, restricted: 80 };
  const spend = v.annual_spend >= 1_000_000 ? 20 : v.annual_spend >= 250_000 ? 12 : v.annual_spend >= 50_000 ? 6 : 2;
  const cat: Record<string, number> = { "Cloud Infrastructure": 10, "Payments": 10, "Security": 6, "Data & Analytics": 8, "HR & Payroll": 8, "SaaS": 4, "Professional Services": 2, "Logistics": 3, "Marketing": 2, "Facilities": 1, "Legal": 3, "Hardware": 2 };
  return Math.min(100, (access[v.data_access] ?? 25) + spend + (cat[v.category] ?? 3));
}

export function recomputeVendorRisk(vendorId: number) {
  const vendor = get<any>("SELECT * FROM vendors WHERE id = ?", vendorId);
  if (!vendor) return;
  const latest = get<{ score: number }>(
    "SELECT score FROM assessments WHERE vendor_id = ? AND status = 'completed' AND score IS NOT NULL ORDER BY completed_at DESC LIMIT 1",
    vendorId
  );
  const findings = all<{ severity: string }>("SELECT severity FROM findings WHERE vendor_id = ? AND status IN ('open','in_remediation')", vendorId);
  const penalty = findings.reduce((acc, f) => acc + ({ critical: 12, high: 7, medium: 3, low: 1 }[f.severity] ?? 0), 0);
  const base = latest ? vendor.inherent_risk * (1 - 0.55 * (latest.score / 100)) : vendor.inherent_risk;
  const residual = Math.max(0, Math.min(100, Math.round(base + penalty)));
  update("vendors", vendorId, { residual_risk: residual, updated_at: new Date().toISOString() });
  return residual;
}
