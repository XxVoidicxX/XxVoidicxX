import { Router } from "express";
import { z } from "zod";
import { all, get, insert, update } from "../db.js";
import { requireAuth, requireRole } from "../auth.js";
import { HttpError, notFound, orderBy, paginate, validate, wrap } from "../http.js";
import { logActivity, notify } from "../activity.js";
import { recomputeVendorRisk } from "../risk.js";

export const approvalsRouter = Router();
approvalsRouter.use(requireAuth);

const SELECT = `SELECT a.*, u.name AS requested_by_name, ap.name AS approver_name,
  CASE a.entity_type WHEN 'vendor' THEN (SELECT name FROM vendors WHERE id = a.entity_id) WHEN 'contract' THEN (SELECT v.name FROM contracts c JOIN vendors v ON v.id = c.vendor_id WHERE c.id = a.entity_id) WHEN 'finding' THEN (SELECT v.name FROM findings f JOIN vendors v ON v.id = f.vendor_id WHERE f.id = a.entity_id) END AS vendor_name
  FROM approvals a JOIN users u ON u.id = a.requested_by LEFT JOIN users ap ON ap.id = a.approver_id`;

const APPROVER_ROLES: Record<string, string[]> = {
  vendor_onboarding: ["admin", "risk_analyst"],
  contract: ["admin", "procurement"],
  risk_acceptance: ["admin"],
  offboarding: ["admin", "risk_analyst"],
  document: ["admin", "risk_analyst"],
};

approvalsRouter.get(
  "/",
  wrap((req, res) => {
    const { page, limit, offset } = paginate(req);
    const where: string[] = [];
    const params: unknown[] = [];
    for (const f of ["status", "type", "priority", "requested_by"]) {
      if (req.query[f]) { const vals = String(req.query[f]).split(","); where.push(`a.${f} IN (${vals.map(() => "?").join(",")})`); params.push(...vals); }
    }
    if (req.query.mine === "true") {
      const roles = Object.entries(APPROVER_ROLES).filter(([, r]) => r.includes(req.user!.role)).map(([t]) => t);
      if (!roles.length) where.push("0");
      else { where.push(`a.type IN (${roles.map(() => "?").join(",")})`); params.push(...roles); }
    }
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const order = orderBy(req, ["created_at", "priority", "status", "type", "decided_at"], "created_at");
    const orderSql = order.startsWith("priority") ? `CASE a.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END ${order.endsWith("DESC") ? "DESC" : "ASC"}` : order;
    const total = get<{ n: number }>(`SELECT COUNT(*) AS n FROM approvals a ${whereSql}`, ...params)!.n;
    const data = all(`${SELECT} ${whereSql} ORDER BY ${orderSql} LIMIT ? OFFSET ?`, ...params, limit, offset);
    res.json({ data, total, page, limit, can_approve: Object.entries(APPROVER_ROLES).filter(([, r]) => r.includes(req.user!.role)).map(([t]) => t) });
  })
);

approvalsRouter.get(
  "/:id",
  wrap((req, res) => {
    const id = Number(req.params.id);
    const a = get<any>(`${SELECT} WHERE a.id = ?`, id);
    if (!a) throw notFound("Approval");
    a.comments = all("SELECT c.*, u.name AS author_name FROM comments c JOIN users u ON u.id = c.author_id WHERE c.entity_type = 'approval' AND c.entity_id = ? ORDER BY c.created_at", id);
    a.can_decide = a.status === "pending" && (APPROVER_ROLES[a.type] ?? []).includes(req.user!.role) && a.requested_by !== req.user!.id;
    if (a.entity_type === "vendor") a.entity = get("SELECT v.*, u.name AS owner_name FROM vendors v LEFT JOIN users u ON u.id = v.owner_id WHERE v.id = ?", a.entity_id);
    if (a.entity_type === "contract") a.entity = get("SELECT c.*, v.name AS vendor_name FROM contracts c JOIN vendors v ON v.id = c.vendor_id WHERE c.id = ?", a.entity_id);
    if (a.entity_type === "finding") a.entity = get("SELECT f.*, v.name AS vendor_name FROM findings f JOIN vendors v ON v.id = f.vendor_id WHERE f.id = ?", a.entity_id);
    res.json({ data: a });
  })
);

approvalsRouter.post(
  "/:id/decide",
  requireRole("admin", "risk_analyst", "procurement"),
  wrap((req, res) => {
    const id = Number(req.params.id);
    const a = get<any>("SELECT * FROM approvals WHERE id = ?", id);
    if (!a) throw notFound("Approval");
    if (a.status !== "pending") throw new HttpError(400, "Approval has already been decided");
    if (!(APPROVER_ROLES[a.type] ?? []).includes(req.user!.role)) throw new HttpError(403, `Your role cannot approve ${a.type.replace("_", " ")} requests`);
    if (a.requested_by === req.user!.id) throw new HttpError(403, "You cannot approve your own request (segregation of duties)");
    const body = validate(z.object({ decision: z.enum(["approved", "rejected"]), comment: z.string().optional().nullable() }), req.body);
    if (body.decision === "rejected" && !body.comment?.trim()) throw new HttpError(400, "A comment is required when rejecting");
    const now = new Date().toISOString();
    update("approvals", id, { status: body.decision, comment: body.comment ?? null, approver_id: req.user!.id, decided_at: now });
    const approved = body.decision === "approved";
    if (a.entity_type === "vendor" && a.type === "vendor_onboarding") {
      update("vendors", a.entity_id, { status: approved ? "active" : "prospect", onboarded_at: approved ? now : null, updated_at: now });
      logActivity(req.user!.id, approved ? "approve" : "reject", "vendor", a.entity_id, `Onboarding ${body.decision}${body.comment ? `: ${body.comment}` : ""}`);
    } else if (a.entity_type === "vendor" && a.type === "offboarding") {
      update("vendors", a.entity_id, { status: approved ? "terminated" : "active", updated_at: now });
      logActivity(req.user!.id, approved ? "approve" : "reject", "vendor", a.entity_id, `Offboarding ${body.decision}`);
    } else if (a.entity_type === "contract") {
      update("contracts", a.entity_id, { status: approved ? "active" : "draft", updated_at: now });
      logActivity(req.user!.id, approved ? "approve" : "reject", "contract", a.entity_id, `Contract ${body.decision}${body.comment ? `: ${body.comment}` : ""}`);
    } else if (a.entity_type === "finding") {
      if (approved) {
        const f = get<any>("SELECT vendor_id FROM findings WHERE id = ?", a.entity_id);
        update("findings", a.entity_id, { status: "risk_accepted", resolved_at: now });
        if (f) recomputeVendorRisk(f.vendor_id);
      }
      logActivity(req.user!.id, approved ? "approve" : "reject", "finding", a.entity_id, `Risk acceptance ${body.decision}${body.comment ? `: ${body.comment}` : ""}`);
    }
    logActivity(req.user!.id, approved ? "approve" : "reject", "approval", id, `${approved ? "Approved" : "Rejected"}: ${a.title}`);
    notify(a.requested_by, `Request ${body.decision}`, `${a.title}${body.comment ? ` — ${body.comment}` : ""}`, `/approvals/${id}`);
    res.json({ data: get(`${SELECT} WHERE a.id = ?`, id) });
  })
);

approvalsRouter.post(
  "/:id/cancel",
  wrap((req, res) => {
    const id = Number(req.params.id);
    const a = get<any>("SELECT * FROM approvals WHERE id = ?", id);
    if (!a) throw notFound("Approval");
    if (a.status !== "pending") throw new HttpError(400, "Only pending approvals can be cancelled");
    if (a.requested_by !== req.user!.id && req.user!.role !== "admin") throw new HttpError(403, "Only the requester can cancel");
    update("approvals", id, { status: "cancelled", decided_at: new Date().toISOString() });
    if (a.entity_type === "contract") update("contracts", a.entity_id, { status: "draft" });
    if (a.entity_type === "vendor" && a.type === "vendor_onboarding") update("vendors", a.entity_id, { status: "prospect" });
    logActivity(req.user!.id, "cancel", "approval", id, `Cancelled: ${a.title}`);
    res.json({ data: get(`${SELECT} WHERE a.id = ?`, id) });
  })
);
