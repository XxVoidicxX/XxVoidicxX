import { Router } from "express";
import { z } from "zod";
import { all, get, insert, update, run, tx } from "../db.js";
import { requireAuth, canWrite, requireRole } from "../auth.js";
import { HttpError, notFound, orderBy, paginate, toCsv, validate, wrap, shortText, longText, optDate, money, website, email } from "../http.js";
import { logActivity, notify, notifyRole } from "../activity.js";
import { computeInherentRisk, recomputeVendorRisk, tierFromInherent } from "../risk.js";

export const vendorsRouter = Router();
vendorsRouter.use(requireAuth);

export const VENDOR_CATEGORIES = ["Cloud Infrastructure", "SaaS", "Payments", "Security", "Data & Analytics", "HR & Payroll", "Professional Services", "Logistics", "Marketing", "Facilities", "Legal", "Hardware"];

const statusEnum = z.enum(["prospect", "onboarding", "active", "under_review", "offboarding", "terminated"]);
const tierEnum = z.enum(["critical", "high", "medium", "low"]);
const accessEnum = z.enum(["none", "internal", "confidential", "restricted"]);

const contactSchema = z.object({ name: shortText(120), email: email.or(z.literal("")).nullable().optional(), phone: z.string().trim().max(40).nullable().optional(), role: z.string().trim().max(80).nullable().optional(), is_primary: z.boolean().optional() });
const vendorSchema = z.object({
  name: shortText(160),
  legal_name: z.string().trim().max(200).optional().nullable(),
  category: z.string().refine((c) => VENDOR_CATEGORIES.includes(c), "Unknown category"),
  website,
  country: z.string().trim().max(80).optional().nullable(),
  status: statusEnum.optional(),
  tier: tierEnum.optional(),
  data_access: accessEnum.optional(),
  annual_spend: money.optional(),
  owner_id: z.number().int().nullable().optional(),
  description: longText(2000),
  services: longText(1000),
  next_review_date: optDate,
  contacts: z.array(contactSchema).max(20).optional(),
});
const APPROVAL_ONLY_STATUSES = ["active"];
function assertStatusTransition(req: any, from: string | null, to: string | undefined) {
  if (!to || to === from) return;
  if (req.user.role === "admin") return;
  if (APPROVAL_ONLY_STATUSES.includes(to) && (!from || ["prospect", "onboarding"].includes(from))) {
    throw new HttpError(403, "Vendors become active only through an approved onboarding request");
  }
  if (to === "terminated") throw new HttpError(403, "Only administrators can terminate a vendor; request offboarding instead");
}

const SELECT = `SELECT v.*, u.name AS owner_name,
  (SELECT COUNT(*) FROM contracts c WHERE c.vendor_id = v.id AND c.status IN ('active','expiring')) AS active_contracts,
  (SELECT COUNT(*) FROM findings f WHERE f.vendor_id = v.id AND f.status IN ('open','in_remediation')) AS open_findings,
  (SELECT COUNT(*) FROM documents d WHERE d.vendor_id = v.id AND d.status IN ('expired','expiring')) AS document_alerts,
  (SELECT MAX(completed_at) FROM assessments a WHERE a.vendor_id = v.id AND a.status = 'completed') AS last_assessed_at
  FROM vendors v LEFT JOIN users u ON u.id = v.owner_id`;

function buildWhere(query: Record<string, unknown>) {
  const where: string[] = [];
  const params: unknown[] = [];
  if (query.q) { where.push("(v.name LIKE ? OR v.legal_name LIKE ? OR v.category LIKE ?)"); const q = `%${query.q}%`; params.push(q, q, q); }
  for (const f of ["status", "tier", "category", "data_access", "owner_id"]) {
    if (query[f]) { const vals = String(query[f]).split(","); where.push(`v.${f} IN (${vals.map(() => "?").join(",")})`); params.push(...vals); }
  }
  return { whereSql: where.length ? `WHERE ${where.join(" AND ")}` : "", params };
}

const SORT_EXPR: Record<string, string> = {
  tier: "CASE tier WHEN 'critical' THEN 4 WHEN 'high' THEN 3 WHEN 'medium' THEN 2 ELSE 1 END",
  status: "CASE status WHEN 'prospect' THEN 1 WHEN 'onboarding' THEN 2 WHEN 'active' THEN 3 WHEN 'under_review' THEN 4 WHEN 'offboarding' THEN 5 ELSE 6 END",
};
const NULLS_LAST = new Set(["next_review_date", "last_assessed_at", "owner_name"]);

function vendorOrder(req: Parameters<typeof orderBy>[0]) {
  const raw = orderBy(req, ["name", "tier", "status", "residual_risk", "inherent_risk", "annual_spend", "next_review_date", "updated_at", "created_at", "category", "owner_name", "open_findings", "document_alerts", "last_assessed_at", "active_contracts"], "name");
  const [col, dir] = raw.split(" ");
  const expr = SORT_EXPR[col] ?? col;
  return `${NULLS_LAST.has(col) ? `${col} IS NULL, ` : ""}${expr} ${dir}, v.name ASC`;
}

vendorsRouter.get(
  "/",
  wrap((req, res) => {
    const { page, limit, offset } = paginate(req);
    const { whereSql, params } = buildWhere(req.query);
    const order = vendorOrder(req);
    const total = get<{ n: number }>(`SELECT COUNT(*) AS n FROM vendors v ${whereSql}`, ...params)!.n;
    if (req.query.format === "csv") {
      const rows = all(`${SELECT} ${whereSql} ORDER BY ${order}`, ...params);
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=vendors.csv");
      return res.send(toCsv(rows as any, ["id", "name", "category", "status", "tier", "inherent_risk", "residual_risk", "data_access", "annual_spend", "owner_name", "country", "next_review_date"]));
    }
    const data = all(`${SELECT} ${whereSql} ORDER BY ${order} LIMIT ? OFFSET ?`, ...params, limit, offset);
    res.json({ data, total, page, limit });
  })
);

vendorsRouter.get(
  "/summary",
  wrap((req, res) => {
    const { whereSql, params } = buildWhere(req.query);
    const row = get<Record<string, number | null>>(
      `SELECT COUNT(*) AS total,
        SUM(CASE WHEN v.status = 'active' THEN 1 ELSE 0 END) AS active,
        SUM(CASE WHEN v.status IN ('prospect','onboarding') THEN 1 ELSE 0 END) AS onboarding,
        SUM(CASE WHEN v.tier = 'critical' THEN 1 ELSE 0 END) AS critical,
        SUM(CASE WHEN v.tier = 'high' THEN 1 ELSE 0 END) AS high,
        SUM(CASE WHEN v.next_review_date IS NOT NULL AND v.next_review_date < date('now') AND v.status NOT IN ('terminated') THEN 1 ELSE 0 END) AS overdue_reviews,
        SUM(CASE WHEN v.residual_risk >= 60 THEN 1 ELSE 0 END) AS elevated_residual,
        COALESCE(SUM(v.annual_spend), 0) AS total_spend,
        ROUND(AVG(v.residual_risk), 0) AS avg_residual,
        (SELECT COUNT(*) FROM findings f WHERE f.status IN ('open','in_remediation') AND f.vendor_id IN (SELECT v.id FROM vendors v ${whereSql})) AS open_findings
      FROM vendors v ${whereSql}`,
      ...params,
      ...params
    )!;
    const out: Record<string, number> = {};
    for (const [k, val] of Object.entries(row)) out[k] = Number(val ?? 0);
    res.json({ data: out });
  })
);

vendorsRouter.get("/categories", wrap((_req, res) => res.json({ data: VENDOR_CATEGORIES })));

vendorsRouter.get(
  "/:id",
  wrap((req, res) => {
    const id = Number(req.params.id);
    const vendor = get(`${SELECT} WHERE v.id = ?`, id);
    if (!vendor) throw notFound("Vendor");
    const contacts = all("SELECT * FROM vendor_contacts WHERE vendor_id = ? ORDER BY is_primary DESC, name", id);
    const contracts = all("SELECT c.*, u.name AS owner_name FROM contracts c LEFT JOIN users u ON u.id = c.owner_id WHERE c.vendor_id = ? ORDER BY c.end_date", id);
    const assessments = all("SELECT a.*, t.name AS template_name, u.name AS assignee_name FROM assessments a JOIN assessment_templates t ON t.id = a.template_id LEFT JOIN users u ON u.id = a.assigned_to WHERE a.vendor_id = ? ORDER BY a.created_at DESC", id);
    const documents = all("SELECT d.*, u.name AS uploaded_by_name FROM documents d LEFT JOIN users u ON u.id = d.uploaded_by WHERE d.vendor_id = ? ORDER BY d.expiry_date", id);
    const findings = all("SELECT f.*, u.name AS owner_name FROM findings f LEFT JOIN users u ON u.id = f.owner_id WHERE f.vendor_id = ? ORDER BY CASE f.severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, f.created_at DESC", id);
    const approvals = all("SELECT a.*, u.name AS requested_by_name FROM approvals a JOIN users u ON u.id = a.requested_by WHERE a.entity_type = 'vendor' AND a.entity_id = ? ORDER BY a.created_at DESC", id);
    const activity = all("SELECT l.*, u.name AS actor_name FROM activity_log l LEFT JOIN users u ON u.id = l.actor_id WHERE (l.entity_type = 'vendor' AND l.entity_id = ?) OR (l.entity_type='contract' AND l.entity_id IN (SELECT id FROM contracts WHERE vendor_id = ?)) OR (l.entity_type='assessment' AND l.entity_id IN (SELECT id FROM assessments WHERE vendor_id = ?)) OR (l.entity_type='finding' AND l.entity_id IN (SELECT id FROM findings WHERE vendor_id = ?)) OR (l.entity_type='document' AND l.entity_id IN (SELECT id FROM documents WHERE vendor_id = ?)) ORDER BY l.created_at DESC LIMIT 50", id, id, id, id, id);
    res.json({ data: { ...vendor, contacts, contracts, assessments, documents, findings, approvals, activity } });
  })
);

vendorsRouter.post(
  "/",
  canWrite,
  wrap((req, res) => {
    const body = validate(vendorSchema, req.body);
    const { contacts, ...v } = body;
    assertStatusTransition(req, null, v.status);
    if (v.owner_id && !get("SELECT id FROM users WHERE id = ? AND active = 1", v.owner_id)) throw new HttpError(400, "Owner does not exist");
    const inherent = computeInherentRisk({ data_access: v.data_access ?? "internal", annual_spend: v.annual_spend ?? 0, category: v.category });
    const id = tx(() => {
      const id = insert("vendors", {
        ...v,
        status: v.status ?? "prospect",
        tier: v.tier ?? tierFromInherent(inherent),
        inherent_risk: inherent,
        residual_risk: inherent,
        owner_id: v.owner_id ?? req.user!.id,
      });
      for (const c of contacts ?? []) insert("vendor_contacts", { ...c, vendor_id: id });
      return id;
    });
    logActivity(req.user!.id, "create", "vendor", id, `Created vendor ${v.name}`);
    res.status(201).json({ data: get(`${SELECT} WHERE v.id = ?`, id) });
  })
);

vendorsRouter.patch(
  "/:id",
  canWrite,
  wrap((req, res) => {
    const id = Number(req.params.id);
    const existing = get<any>("SELECT * FROM vendors WHERE id = ?", id);
    if (!existing) throw notFound("Vendor");
    const body = validate(vendorSchema.partial(), req.body);
    const { contacts: _c, ...v } = body;
    assertStatusTransition(req, existing.status, v.status);
    if (v.owner_id && !get("SELECT id FROM users WHERE id = ? AND active = 1", v.owner_id)) throw new HttpError(400, "Owner does not exist");
    const merged = { ...existing, ...v };
    const inherent = computeInherentRisk(merged);
    const tier = v.tier ?? (inherent !== existing.inherent_risk ? tierFromInherent(inherent) : existing.tier);
    update("vendors", id, { ...v, tier, inherent_risk: inherent, updated_at: new Date().toISOString() });
    recomputeVendorRisk(id);
    const changes = Object.keys(v).filter((k) => (existing as any)[k] !== (v as any)[k]);
    if (v.status && v.status !== existing.status) {
      if (!["prospect", "onboarding"].includes(v.status)) {
        run("UPDATE approvals SET status = 'cancelled', decided_at = datetime('now'), comment = COALESCE(comment, 'Cancelled: vendor status changed directly') WHERE status = 'pending' AND type = 'vendor_onboarding' AND entity_type = 'vendor' AND entity_id = ?", id);
      }
      logActivity(req.user!.id, "status_change", "vendor", id, `${existing.name} status changed ${existing.status} → ${v.status}`, { from: existing.status, to: v.status });
      if (existing.owner_id && existing.owner_id !== req.user!.id) notify(existing.owner_id, `Vendor status changed`, `${existing.name} is now ${v.status.replace("_", " ")}`, `/vendors/${id}`);
    } else {
      logActivity(req.user!.id, "update", "vendor", id, `Updated ${existing.name} (${changes.join(", ") || "no changes"})`, v);
    }
    res.json({ data: get(`${SELECT} WHERE v.id = ?`, id) });
  })
);

vendorsRouter.delete(
  "/:id",
  requireRole("admin"),
  wrap((req, res) => {
    const id = Number(req.params.id);
    const existing = get<any>("SELECT * FROM vendors WHERE id = ?", id);
    if (!existing) throw notFound("Vendor");
    tx(() => {
      const contractIds = all<{ id: number }>("SELECT id FROM contracts WHERE vendor_id = ?", id).map((r) => r.id);
      const findingIds = all<{ id: number }>("SELECT id FROM findings WHERE vendor_id = ?", id).map((r) => r.id);
      const assessmentIds = all<{ id: number }>("SELECT id FROM assessments WHERE vendor_id = ?", id).map((r) => r.id);
      const docIds = all<{ id: number }>("SELECT id FROM documents WHERE vendor_id = ?", id).map((r) => r.id);
      const groups: Array<[string, number[]]> = [["vendor", [id]], ["contract", contractIds], ["finding", findingIds], ["assessment", assessmentIds], ["document", docIds]];
      for (const [type, ids] of groups) {
        if (!ids.length) continue;
        const ph = ids.map(() => "?").join(",");
        run(`UPDATE approvals SET status = 'cancelled', decided_at = datetime('now'), comment = COALESCE(comment, 'Cancelled: linked record was deleted') WHERE status = 'pending' AND entity_type = ? AND entity_id IN (${ph})`, type, ...ids);
        run(`DELETE FROM comments WHERE entity_type = ? AND entity_id IN (${ph})`, type, ...ids);
      }
      run("DELETE FROM vendors WHERE id = ?", id);
    });
    logActivity(req.user!.id, "delete", "vendor", id, `Deleted vendor ${existing.name}`);
    res.json({ ok: true });
  })
);

vendorsRouter.post(
  "/:id/submit-onboarding",
  canWrite,
  wrap((req, res) => {
    const id = Number(req.params.id);
    const vendor = get<any>("SELECT * FROM vendors WHERE id = ?", id);
    if (!vendor) throw notFound("Vendor");
    if (!["prospect", "onboarding"].includes(vendor.status)) throw new HttpError(400, "Vendor is not in an onboarding state");
    const pending = get("SELECT id FROM approvals WHERE entity_type='vendor' AND entity_id = ? AND type='vendor_onboarding' AND status='pending'", id);
    if (pending) throw new HttpError(409, "An onboarding approval is already pending");
    const approvalId = insert("approvals", {
      type: "vendor_onboarding", entity_type: "vendor", entity_id: id, title: `Onboard ${vendor.name}`,
      description: `Approve ${vendor.name} (${vendor.category}, ${vendor.tier} tier) as an active vendor.`,
      requested_by: req.user!.id, priority: vendor.tier === "critical" ? "urgent" : vendor.tier === "high" ? "high" : "normal",
    });
    update("vendors", id, { status: "onboarding", updated_at: new Date().toISOString() });
    logActivity(req.user!.id, "submit", "vendor", id, `Submitted ${vendor.name} for onboarding approval`);
    notifyRole("admin", "Onboarding approval requested", `${req.user!.name} requested approval to onboard ${vendor.name}`, `/approvals/${approvalId}`);
    notifyRole("risk_analyst", "Onboarding approval requested", `${req.user!.name} requested approval to onboard ${vendor.name}`, `/approvals/${approvalId}`);
    res.json({ data: get(`${SELECT} WHERE v.id = ?`, id), approval_id: approvalId });
  })
);

vendorsRouter.post(
  "/:id/contacts",
  canWrite,
  wrap((req, res) => {
    const id = Number(req.params.id);
    if (!get("SELECT id FROM vendors WHERE id = ?", id)) throw notFound("Vendor");
    const body = validate(contactSchema, req.body);
    if (body.is_primary) run("UPDATE vendor_contacts SET is_primary = 0 WHERE vendor_id = ?", id);
    const cid = insert("vendor_contacts", { ...body, vendor_id: id });
    logActivity(req.user!.id, "update", "vendor", id, `Added contact ${body.name}`);
    res.status(201).json({ data: get("SELECT * FROM vendor_contacts WHERE id = ?", cid) });
  })
);
vendorsRouter.delete(
  "/:id/contacts/:cid",
  canWrite,
  wrap((req, res) => {
    run("DELETE FROM vendor_contacts WHERE id = ? AND vendor_id = ?", Number(req.params.cid), Number(req.params.id));
    res.json({ ok: true });
  })
);
