import { Router } from "express";
import { z } from "zod";
import { all, get, insert, update } from "../db.js";
import { requireAuth, canWrite } from "../auth.js";
import { HttpError, notFound, orderBy, paginate, validate, wrap, shortText, longText, optDate } from "../http.js";
import { logActivity, notify, notifyRole } from "../activity.js";
import { recomputeVendorRisk } from "../risk.js";

export const findingsRouter = Router();
findingsRouter.use(requireAuth);

const sevEnum = z.enum(["critical", "high", "medium", "low"]);
const statusEnum = z.enum(["open", "in_remediation", "risk_accepted", "closed"]);

const SELECT = `SELECT f.*, v.name AS vendor_name, v.tier AS vendor_tier, u.name AS owner_name, a.title AS assessment_title,
  CAST(julianday(f.due_date) - julianday('now') AS INTEGER) AS days_to_due
  FROM findings f JOIN vendors v ON v.id = f.vendor_id LEFT JOIN users u ON u.id = f.owner_id LEFT JOIN assessments a ON a.id = f.assessment_id`;

findingsRouter.get(
  "/",
  wrap((req, res) => {
    const { page, limit, offset } = paginate(req);
    const where: string[] = [];
    const params: unknown[] = [];
    if (req.query.q) { where.push("(f.title LIKE ? OR v.name LIKE ?)"); const q = `%${req.query.q}%`; params.push(q, q); }
    for (const f of ["status", "severity", "vendor_id", "owner_id"]) {
      if (req.query[f]) { const vals = String(req.query[f]).split(","); where.push(`f.${f} IN (${vals.map(() => "?").join(",")})`); params.push(...vals); }
    }
    if (req.query.overdue === "true") where.push("f.due_date < date('now') AND f.status IN ('open','in_remediation')");
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const order = orderBy(req, ["title", "severity", "status", "due_date", "vendor_name", "created_at", "owner_name"], "created_at");
    const orderSql = order.startsWith("severity") ? `CASE f.severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END ${order.endsWith("DESC") ? "DESC" : "ASC"}` : order;
    const total = get<{ n: number }>(`SELECT COUNT(*) AS n FROM findings f JOIN vendors v ON v.id = f.vendor_id ${whereSql}`, ...params)!.n;
    const data = all(`${SELECT} ${whereSql} ORDER BY ${orderSql} LIMIT ? OFFSET ?`, ...params, limit, offset);
    res.json({ data, total, page, limit });
  })
);

findingsRouter.get(
  "/:id",
  wrap((req, res) => {
    const id = Number(req.params.id);
    const f = get<any>(`${SELECT} WHERE f.id = ?`, id);
    if (!f) throw notFound("Finding");
    f.comments = all("SELECT c.*, u.name AS author_name FROM comments c JOIN users u ON u.id = c.author_id WHERE c.entity_type = 'finding' AND c.entity_id = ? ORDER BY c.created_at", id);
    f.activity = all("SELECT l.*, u.name AS actor_name FROM activity_log l LEFT JOIN users u ON u.id = l.actor_id WHERE l.entity_type = 'finding' AND l.entity_id = ? ORDER BY l.created_at DESC LIMIT 30", id);
    f.approvals = all("SELECT a.*, u.name AS requested_by_name FROM approvals a JOIN users u ON u.id = a.requested_by WHERE a.entity_type = 'finding' AND a.entity_id = ? ORDER BY a.created_at DESC", id);
    res.json({ data: f });
  })
);

findingsRouter.post(
  "/",
  canWrite,
  wrap((req, res) => {
    const body = validate(z.object({ vendor_id: z.number().int(), assessment_id: z.number().int().nullable().optional(), title: shortText(200), description: longText(4000), severity: sevEnum, owner_id: z.number().int().nullable().optional(), due_date: optDate, remediation_plan: longText(4000) }), req.body);
    const vendor = get<any>("SELECT * FROM vendors WHERE id = ?", body.vendor_id);
    if (!vendor) throw new HttpError(400, "Vendor does not exist");
    const id = insert("findings", { ...body, owner_id: body.owner_id ?? vendor.owner_id ?? req.user!.id });
    recomputeVendorRisk(body.vendor_id);
    logActivity(req.user!.id, "create", "finding", id, `Raised ${body.severity} finding: ${body.title}`);
    const ownerId = body.owner_id ?? vendor.owner_id;
    if (ownerId && ownerId !== req.user!.id) notify(ownerId, `New ${body.severity} finding`, `${body.title} (${vendor.name})`, `/findings/${id}`);
    res.status(201).json({ data: get(`${SELECT} WHERE f.id = ?`, id) });
  })
);

findingsRouter.patch(
  "/:id",
  canWrite,
  wrap((req, res) => {
    const id = Number(req.params.id);
    const existing = get<any>("SELECT * FROM findings WHERE id = ?", id);
    if (!existing) throw notFound("Finding");
    const body = validate(z.object({ title: shortText(200).optional(), description: longText(4000), severity: sevEnum.optional(), status: statusEnum.optional(), owner_id: z.number().int().nullable().optional(), due_date: optDate, remediation_plan: longText(4000) }), req.body);
    if (body.status === "risk_accepted" && existing.status !== "risk_accepted" && req.user!.role !== "admin") {
      throw new HttpError(400, "Risk acceptance requires an approval — use the request-risk-acceptance action");
    }
    const data: Record<string, unknown> = { ...body };
    if (body.status && ["closed", "risk_accepted"].includes(body.status) && !existing.resolved_at) data.resolved_at = new Date().toISOString();
    if (body.status && ["open", "in_remediation"].includes(body.status)) data.resolved_at = null;
    update("findings", id, data);
    recomputeVendorRisk(existing.vendor_id);
    if (body.status && body.status !== existing.status) logActivity(req.user!.id, "status_change", "finding", id, `${existing.title} ${existing.status} → ${body.status}`, { from: existing.status, to: body.status });
    else logActivity(req.user!.id, "update", "finding", id, `Updated finding ${existing.title}`, body);
    res.json({ data: get(`${SELECT} WHERE f.id = ?`, id) });
  })
);

findingsRouter.post(
  "/:id/request-risk-acceptance",
  canWrite,
  wrap((req, res) => {
    const id = Number(req.params.id);
    const f = get<any>("SELECT f.*, v.name AS vendor_name FROM findings f JOIN vendors v ON v.id = f.vendor_id WHERE f.id = ?", id);
    if (!f) throw notFound("Finding");
    if (!["open", "in_remediation"].includes(f.status)) throw new HttpError(400, "Finding is not open");
    if (get("SELECT id FROM approvals WHERE entity_type='finding' AND entity_id=? AND status='pending'", id)) throw new HttpError(409, "Approval already pending");
    const body = validate(z.object({ justification: z.string().min(10) }), req.body);
    const approvalId = insert("approvals", {
      type: "risk_acceptance", entity_type: "finding", entity_id: id, title: `Accept risk: ${f.title}`,
      description: `${f.vendor_name} — ${f.severity} severity.\n\nJustification: ${body.justification}`,
      requested_by: req.user!.id, priority: f.severity === "critical" ? "urgent" : f.severity === "high" ? "high" : "normal",
    });
    logActivity(req.user!.id, "submit", "finding", id, `Requested risk acceptance for ${f.title}`);
    notifyRole("admin", "Risk acceptance requested", `${f.title} (${f.vendor_name})`, `/approvals/${approvalId}`);
    res.json({ data: get(`${SELECT} WHERE f.id = ?`, id), approval_id: approvalId });
  })
);
