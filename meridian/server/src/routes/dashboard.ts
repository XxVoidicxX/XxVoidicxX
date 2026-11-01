import { Router } from "express";
import { all, get } from "../db.js";
import { requireAuth } from "../auth.js";
import { wrap } from "../http.js";
import { refreshContractStatuses } from "./contracts.js";
import { refreshDocumentStatuses } from "./documents.js";

export const dashboardRouter = Router();

const APPROVER_TYPES: Record<string, string[]> = {
  admin: ["vendor_onboarding", "contract", "risk_acceptance", "offboarding", "document"],
  risk_analyst: ["vendor_onboarding", "offboarding", "document"],
  procurement: ["contract"],
  vendor_owner: [],
  auditor: [],
};

function orgName(): string {
  const row = get<{ value: string }>("SELECT value FROM settings WHERE key = 'org_name'");
  if (!row) return "Meridian Corp";
  try { return String(JSON.parse(row.value)); } catch { return row.value; }
}
dashboardRouter.use(requireAuth);

dashboardRouter.get(
  "/",
  wrap((req, res) => {
    refreshContractStatuses();
    refreshDocumentStatuses();
    const n = (sql: string, ...p: unknown[]) => get<{ n: number }>(sql, ...p)!.n;
    const kpis = {
      vendors_total: n("SELECT COUNT(*) AS n FROM vendors WHERE status NOT IN ('terminated')"),
      vendors_active: n("SELECT COUNT(*) AS n FROM vendors WHERE status = 'active'"),
      vendors_critical: n("SELECT COUNT(*) AS n FROM vendors WHERE tier = 'critical' AND status = 'active'"),
      vendors_onboarding: n("SELECT COUNT(*) AS n FROM vendors WHERE status IN ('prospect','onboarding')"),
      avg_residual_risk: Math.round(get<{ a: number }>("SELECT AVG(residual_risk) AS a FROM vendors WHERE status = 'active'")!.a ?? 0),
      findings_open: n("SELECT COUNT(*) AS n FROM findings WHERE status IN ('open','in_remediation')"),
      findings_critical_open: n("SELECT COUNT(*) AS n FROM findings WHERE status IN ('open','in_remediation') AND severity = 'critical'"),
      findings_overdue: n("SELECT COUNT(*) AS n FROM findings WHERE status IN ('open','in_remediation') AND due_date < date('now')"),
      contracts_active: n("SELECT COUNT(*) AS n FROM contracts WHERE status IN ('active','expiring')"),
      contracts_expiring_90: n("SELECT COUNT(*) AS n FROM contracts WHERE status IN ('active','expiring') AND end_date BETWEEN date('now') AND date('now','+90 days')"),
      contract_value_active: get<{ v: number }>("SELECT COALESCE(SUM(value),0) AS v FROM contracts WHERE status IN ('active','expiring')")!.v,
      spend_total: get<{ v: number }>("SELECT COALESCE(SUM(annual_spend),0) AS v FROM vendors WHERE status = 'active'")!.v,
      documents_expiring: n("SELECT COUNT(*) AS n FROM documents WHERE status = 'expiring'"),
      documents_expired: n("SELECT COUNT(*) AS n FROM documents WHERE status = 'expired'"),
      assessments_in_progress: n("SELECT COUNT(*) AS n FROM assessments WHERE status IN ('not_started','in_progress')"),
      assessments_awaiting_review: n("SELECT COUNT(*) AS n FROM assessments WHERE status IN ('submitted','under_review')"),
      assessments_overdue: n("SELECT COUNT(*) AS n FROM assessments WHERE status NOT IN ('completed') AND due_date < date('now')"),
      reviews_overdue: n("SELECT COUNT(*) AS n FROM vendors WHERE status = 'active' AND next_review_date < date('now')"),
      approvals_pending: n("SELECT COUNT(*) AS n FROM approvals WHERE status = 'pending'"),
      my_approvals_pending: n("SELECT COUNT(*) AS n FROM approvals WHERE status = 'pending' AND requested_by = ?", req.user!.id),
      contracts_expiring_90_value: get<{ v: number }>("SELECT COALESCE(SUM(value),0) AS v FROM contracts WHERE status IN ('active','expiring') AND end_date BETWEEN date('now') AND date('now','+90 days')")!.v,
      approvals_to_decide: 0,
      findings_closed_30d: n("SELECT COUNT(*) AS n FROM findings WHERE resolved_at >= date('now','-30 days')"),
    };
    const decideTypes = APPROVER_TYPES[req.user!.role] ?? [];
    const typeIn = decideTypes.length ? `a.type IN (${decideTypes.map(() => "?").join(",")})` : "0";
    kpis.approvals_to_decide = n(`SELECT COUNT(*) AS n FROM approvals a WHERE a.status = 'pending' AND a.requested_by != ? AND ${typeIn}`, req.user!.id, ...decideTypes);
    const risk_by_tier = all("SELECT tier, COUNT(*) AS count, ROUND(AVG(residual_risk)) AS avg_residual, COALESCE(SUM(annual_spend),0) AS spend FROM vendors WHERE status NOT IN ('terminated') GROUP BY tier");
    const risk_distribution = all("SELECT tier, COUNT(*) AS count FROM vendors WHERE status NOT IN ('terminated') GROUP BY tier");
    const status_distribution = all("SELECT status, COUNT(*) AS count FROM vendors GROUP BY status");
    const findings_by_severity = all("SELECT severity, status, COUNT(*) AS count FROM findings GROUP BY severity, status");
    const spend_by_category = all("SELECT category, SUM(annual_spend) AS spend, COUNT(*) AS vendors FROM vendors WHERE status = 'active' GROUP BY category ORDER BY spend DESC");
    const risk_heatmap = all("SELECT category, tier, COUNT(*) AS count, ROUND(AVG(residual_risk)) AS avg_risk FROM vendors WHERE status NOT IN ('terminated') GROUP BY category, tier");
    const upcoming_renewals = all("SELECT c.id, c.title, c.end_date, c.value, c.currency, c.auto_renew, v.name AS vendor_name, v.id AS vendor_id, CAST(julianday(c.end_date) - julianday(date('now')) AS INTEGER) AS days_to_end FROM contracts c JOIN vendors v ON v.id = c.vendor_id WHERE c.status IN ('active','expiring') AND c.end_date BETWEEN date('now') AND date('now','+90 days') ORDER BY c.end_date LIMIT 8");
    const expiring_documents = all("SELECT d.id, d.name, d.type, d.expiry_date, d.status, v.name AS vendor_name, v.id AS vendor_id, CAST(julianday(d.expiry_date) - julianday(date('now')) AS INTEGER) AS days_to_expiry FROM documents d JOIN vendors v ON v.id = d.vendor_id WHERE d.status IN ('expiring','expired') ORDER BY d.expiry_date LIMIT 8");
    const top_risk_vendors = all("SELECT v.id, v.name, v.tier, v.category, v.residual_risk, v.inherent_risk, v.status, (SELECT COUNT(*) FROM findings f WHERE f.vendor_id = v.id AND f.status IN ('open','in_remediation')) AS open_findings FROM vendors v WHERE v.status NOT IN ('terminated') ORDER BY v.residual_risk DESC LIMIT 8");
    const my_tasks = {
      assessments: all("SELECT a.id, a.title, a.status, a.due_date, v.name AS vendor_name FROM assessments a JOIN vendors v ON v.id = a.vendor_id WHERE a.assigned_to = ? AND a.status IN ('not_started','in_progress') ORDER BY a.due_date LIMIT 6", req.user!.id),
      reviews: all("SELECT a.id, a.title, a.status, a.due_date, v.name AS vendor_name FROM assessments a JOIN vendors v ON v.id = a.vendor_id WHERE (a.reviewer_id = ? OR ? = 'admin') AND a.status IN ('submitted','under_review') ORDER BY a.submitted_at LIMIT 6", req.user!.id, req.user!.role),
      findings: all("SELECT f.id, f.title, f.severity, f.status, f.due_date, v.name AS vendor_name FROM findings f JOIN vendors v ON v.id = f.vendor_id WHERE f.owner_id = ? AND f.status IN ('open','in_remediation') ORDER BY f.due_date LIMIT 6", req.user!.id),
      approvals: all(`SELECT a.id, a.title, a.type, a.priority, a.created_at, u.name AS requested_by_name FROM approvals a JOIN users u ON u.id = a.requested_by WHERE a.status = 'pending' AND a.requested_by != ? AND ${typeIn} ORDER BY CASE a.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END, a.created_at LIMIT 6`, req.user!.id, ...decideTypes),
    };
    const my_task_counts = {
      assessments: n("SELECT COUNT(*) AS n FROM assessments WHERE assigned_to = ? AND status IN ('not_started','in_progress')", req.user!.id),
      reviews: n("SELECT COUNT(*) AS n FROM assessments WHERE (reviewer_id = ? OR ? = 'admin') AND status IN ('submitted','under_review')", req.user!.id, req.user!.role),
      findings: n("SELECT COUNT(*) AS n FROM findings WHERE owner_id = ? AND status IN ('open','in_remediation')", req.user!.id),
      approvals: kpis.approvals_to_decide,
    };
    const recent_activity = all("SELECT l.*, u.name AS actor_name, u.role AS actor_role FROM activity_log l LEFT JOIN users u ON u.id = l.actor_id WHERE l.action NOT IN ('login','logout') ORDER BY l.created_at DESC, l.id DESC LIMIT 12");
    const assessment_trend = all(`SELECT strftime('%Y-%m', completed_at) AS month, COUNT(*) AS completed, ROUND(AVG(score),1) AS avg_score FROM assessments WHERE status = 'completed' AND completed_at >= date('now','-12 months') GROUP BY month ORDER BY month`);
    res.json({ data: { generated_at: new Date().toISOString(), org_name: orgName(), kpis, risk_by_tier, my_task_counts, risk_distribution, status_distribution, findings_by_severity, spend_by_category, risk_heatmap, upcoming_renewals, expiring_documents, top_risk_vendors, my_tasks, recent_activity, assessment_trend } });
  })
);

export const reportsRouter = Router();
reportsRouter.use(requireAuth);
reportsRouter.get(
  "/",
  wrap((_req, res) => {
    const risk_by_category = all("SELECT category, COUNT(*) AS vendors, ROUND(AVG(inherent_risk)) AS avg_inherent, ROUND(AVG(residual_risk)) AS avg_residual, SUM(annual_spend) AS spend FROM vendors WHERE status NOT IN ('terminated') GROUP BY category ORDER BY avg_residual DESC");
    const tier_matrix = all("SELECT tier, status, COUNT(*) AS count FROM vendors GROUP BY tier, status");
    const findings_aging = all(`SELECT severity,
      SUM(CASE WHEN julianday('now') - julianday(created_at) <= 30 THEN 1 ELSE 0 END) AS d0_30,
      SUM(CASE WHEN julianday('now') - julianday(created_at) BETWEEN 31 AND 60 THEN 1 ELSE 0 END) AS d31_60,
      SUM(CASE WHEN julianday('now') - julianday(created_at) BETWEEN 61 AND 90 THEN 1 ELSE 0 END) AS d61_90,
      SUM(CASE WHEN julianday('now') - julianday(created_at) > 90 THEN 1 ELSE 0 END) AS d90_plus
      FROM findings WHERE status IN ('open','in_remediation') GROUP BY severity`);
    const findings_mttr = all(`SELECT severity, COUNT(*) AS resolved, ROUND(AVG(julianday(resolved_at) - julianday(created_at)),1) AS avg_days FROM findings WHERE status = 'closed' AND resolved_at IS NOT NULL GROUP BY severity`);
    const contract_pipeline = all(`SELECT strftime('%Y-%m', end_date) AS month, COUNT(*) AS contracts, SUM(value) AS value FROM contracts WHERE status IN ('active','expiring') AND end_date BETWEEN date('now') AND date('now','+12 months') GROUP BY month ORDER BY month`);
    const contracts_by_type = all("SELECT type, COUNT(*) AS count, SUM(value) AS value FROM contracts WHERE status IN ('active','expiring') GROUP BY type ORDER BY value DESC");
    const assessment_scores = all("SELECT a.id, a.title, a.score, a.risk_rating, a.completed_at, v.name AS vendor_name, v.tier, t.framework FROM assessments a JOIN vendors v ON v.id = a.vendor_id JOIN assessment_templates t ON t.id = a.template_id WHERE a.status = 'completed' ORDER BY a.score ASC LIMIT 25");
    const compliance_coverage = all(`SELECT v.tier, COUNT(*) AS vendors,
      SUM(CASE WHEN EXISTS (SELECT 1 FROM assessments a WHERE a.vendor_id = v.id AND a.status='completed' AND a.completed_at >= date('now','-12 months')) THEN 1 ELSE 0 END) AS assessed_12m,
      SUM(CASE WHEN EXISTS (SELECT 1 FROM documents d WHERE d.vendor_id = v.id AND d.type IN ('soc2','iso27001') AND d.status = 'valid') THEN 1 ELSE 0 END) AS with_valid_cert,
      SUM(CASE WHEN EXISTS (SELECT 1 FROM contracts c WHERE c.vendor_id = v.id AND c.type = 'dpa' AND c.status IN ('active','expiring')) THEN 1 ELSE 0 END) AS with_dpa
      FROM vendors v WHERE v.status = 'active' GROUP BY v.tier`);
    const spend_concentration = all("SELECT v.id, v.name, v.category, v.tier, v.annual_spend, v.residual_risk FROM vendors v WHERE v.status = 'active' ORDER BY v.annual_spend DESC LIMIT 10");
    const country_exposure = all("SELECT country, COUNT(*) AS vendors, SUM(annual_spend) AS spend, ROUND(AVG(residual_risk)) AS avg_risk FROM vendors WHERE status = 'active' GROUP BY country ORDER BY vendors DESC");
    const spend_total = get<{ v: number; n: number }>("SELECT COALESCE(SUM(annual_spend),0) AS v, COUNT(*) AS n FROM vendors WHERE status = 'active'")!;
    const approvals_sla = all(`SELECT type, COUNT(*) AS total, SUM(CASE WHEN status='approved' THEN 1 ELSE 0 END) AS approved, SUM(CASE WHEN status='rejected' THEN 1 ELSE 0 END) AS rejected, SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) AS pending, SUM(CASE WHEN status='cancelled' THEN 1 ELSE 0 END) AS cancelled, ROUND(MAX(CASE WHEN decided_at IS NOT NULL THEN (julianday(decided_at) - julianday(created_at)) * 24 END),1) AS max_hours, ROUND(AVG(CASE WHEN status='pending' THEN (julianday('now') - julianday(created_at)) * 24 END),1) AS pending_age_hours, ROUND(AVG(CASE WHEN decided_at IS NOT NULL THEN (julianday(decided_at) - julianday(created_at)) * 24 END),1) AS avg_hours FROM approvals GROUP BY type`);
    res.json({ data: { generated_at: new Date().toISOString(), org_name: orgName(), spend_total_active: spend_total.v, vendors_active: spend_total.n, risk_by_category, tier_matrix, findings_aging, findings_mttr, contract_pipeline, contracts_by_type, assessment_scores, compliance_coverage, spend_concentration, country_exposure, approvals_sla } });
  })
);
