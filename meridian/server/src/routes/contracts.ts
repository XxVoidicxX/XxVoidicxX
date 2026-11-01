import { Router } from "express";
import { z } from "zod";
import { all, get, insert, update, run } from "../db.js";
import { requireAuth, canWrite } from "../auth.js";
import { HttpError, notFound, orderBy, paginate, toCsv, validate, wrap } from "../http.js";
import { logActivity, notify, notifyRole } from "../activity.js";

export const contractsRouter = Router();
contractsRouter.use(requireAuth);

const typeEnum = z.enum(["msa", "sow", "nda", "dpa", "saas", "license", "services"]);
const statusEnum = z.enum(["draft", "in_review", "active", "expiring", "expired", "terminated"]);

const schema = z.object({
  vendor_id: z.number().int(),
  title: z.string().min(1),
  contract_number: z.string().min(1).optional(),
  type: typeEnum,
  status: statusEnum.optional(),
  value: z.number().min(0).optional(),
  currency: z.string().length(3).optional(),
  start_date: z.string().nullable().optional(),
  end_date: z.string().nullable().optional(),
  auto_renew: z.boolean().optional(),
  renewal_notice_days: z.number().int().min(0).optional(),
  owner_id: z.number().int().nullable().optional(),
  notes: z.string().nullable().optional(),
});

const SELECT = `SELECT c.*, v.name AS vendor_name, v.tier AS vendor_tier, u.name AS owner_name,
  CAST(julianday(c.end_date) - julianday('now') AS INTEGER) AS days_to_end,
  (SELECT COUNT(*) FROM contract_obligations o WHERE o.contract_id = c.id AND o.status = 'pending') AS pending_obligations
  FROM contracts c JOIN vendors v ON v.id = c.vendor_id LEFT JOIN users u ON u.id = c.owner_id`;

function nextNumber() {
  const year = new Date().getFullYear();
  const row = get<{ n: number }>("SELECT COUNT(*) AS n FROM contracts");
  return `CTR-${year}-${String((row?.n ?? 0) + 1).padStart(4, "0")}`;
}

export function refreshContractStatuses() {
  run(`UPDATE contracts SET status = 'expired' WHERE status IN ('active','expiring') AND end_date IS NOT NULL AND end_date < date('now')`);
  run(`UPDATE contracts SET status = 'expiring' WHERE status = 'active' AND end_date IS NOT NULL AND julianday(end_date) - julianday('now') <= renewal_notice_days`);
}

contractsRouter.get(
  "/",
  wrap((req, res) => {
    refreshContractStatuses();
    const { page, limit, offset } = paginate(req);
    const where: string[] = [];
    const params: unknown[] = [];
    if (req.query.q) { where.push("(c.title LIKE ? OR c.contract_number LIKE ? OR v.name LIKE ?)"); const q = `%${req.query.q}%`; params.push(q, q, q); }
    for (const f of ["status", "type", "vendor_id", "owner_id"]) {
      if (req.query[f]) { const vals = String(req.query[f]).split(","); where.push(`c.${f} IN (${vals.map(() => "?").join(",")})`); params.push(...vals); }
    }
    if (req.query.expiring_within) { where.push("c.end_date BETWEEN date('now') AND date('now', ?)"); params.push(`+${Number(req.query.expiring_within)} days`); }
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const order = orderBy(req, ["title", "end_date", "start_date", "value", "status", "type", "vendor_name", "created_at", "contract_number"], "end_date");
    const total = get<{ n: number }>(`SELECT COUNT(*) AS n FROM contracts c JOIN vendors v ON v.id = c.vendor_id ${whereSql}`, ...params)!.n;
    if (req.query.format === "csv") {
      const rows = all(`${SELECT} ${whereSql} ORDER BY ${order}`, ...params);
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=contracts.csv");
      return res.send(toCsv(rows as any, ["id", "contract_number", "title", "vendor_name", "type", "status", "value", "currency", "start_date", "end_date", "auto_renew", "owner_name"]));
    }
    const data = all(`${SELECT} ${whereSql} ORDER BY ${order} LIMIT ? OFFSET ?`, ...params, limit, offset);
    res.json({ data, total, page, limit });
  })
);

contractsRouter.get(
  "/:id",
  wrap((req, res) => {
    const id = Number(req.params.id);
    const contract = get(`${SELECT} WHERE c.id = ?`, id);
    if (!contract) throw notFound("Contract");
    const obligations = all("SELECT o.*, u.name AS owner_name FROM contract_obligations o LEFT JOIN users u ON u.id = o.owner_id WHERE o.contract_id = ? ORDER BY o.due_date", id);
    const documents = all("SELECT * FROM documents WHERE contract_id = ? ORDER BY created_at DESC", id);
    const approvals = all("SELECT a.*, u.name AS requested_by_name FROM approvals a JOIN users u ON u.id = a.requested_by WHERE a.entity_type = 'contract' AND a.entity_id = ? ORDER BY a.created_at DESC", id);
    const activity = all("SELECT l.*, u.name AS actor_name FROM activity_log l LEFT JOIN users u ON u.id = l.actor_id WHERE l.entity_type = 'contract' AND l.entity_id = ? ORDER BY l.created_at DESC LIMIT 50", id);
    res.json({ data: { ...contract, obligations, documents, approvals, activity } });
  })
);

contractsRouter.post(
  "/",
  canWrite,
  wrap((req, res) => {
    const body = validate(schema, req.body);
    if (!get("SELECT id FROM vendors WHERE id = ?", body.vendor_id)) throw new HttpError(400, "Vendor does not exist");
    const id = insert("contracts", { ...body, contract_number: body.contract_number ?? nextNumber(), status: body.status ?? "draft", owner_id: body.owner_id ?? req.user!.id });
    logActivity(req.user!.id, "create", "contract", id, `Created contract ${body.title}`);
    res.status(201).json({ data: get(`${SELECT} WHERE c.id = ?`, id) });
  })
);

contractsRouter.patch(
  "/:id",
  canWrite,
  wrap((req, res) => {
    const id = Number(req.params.id);
    const existing = get<any>("SELECT * FROM contracts WHERE id = ?", id);
    if (!existing) throw notFound("Contract");
    const body = validate(schema.partial(), req.body);
    update("contracts", id, { ...body, updated_at: new Date().toISOString() });
    if (body.status && body.status !== existing.status) {
      logActivity(req.user!.id, "status_change", "contract", id, `${existing.title} status ${existing.status} → ${body.status}`, { from: existing.status, to: body.status });
    } else {
      logActivity(req.user!.id, "update", "contract", id, `Updated contract ${existing.title}`, body);
    }
    res.json({ data: get(`${SELECT} WHERE c.id = ?`, id) });
  })
);

contractsRouter.post(
  "/:id/submit-for-approval",
  canWrite,
  wrap((req, res) => {
    const id = Number(req.params.id);
    const c = get<any>("SELECT c.*, v.name AS vendor_name FROM contracts c JOIN vendors v ON v.id = c.vendor_id WHERE c.id = ?", id);
    if (!c) throw notFound("Contract");
    if (!["draft", "in_review"].includes(c.status)) throw new HttpError(400, "Only draft contracts can be submitted");
    if (get("SELECT id FROM approvals WHERE entity_type='contract' AND entity_id=? AND status='pending'", id)) throw new HttpError(409, "Approval already pending");
    const approvalId = insert("approvals", {
      type: "contract", entity_type: "contract", entity_id: id, title: `Contract: ${c.title}`,
      description: `${c.vendor_name} — ${c.type.toUpperCase()} valued at ${c.currency} ${Number(c.value).toLocaleString()}`,
      requested_by: req.user!.id, priority: c.value >= 500000 ? "high" : "normal",
    });
    update("contracts", id, { status: "in_review", updated_at: new Date().toISOString() });
    logActivity(req.user!.id, "submit", "contract", id, `Submitted ${c.title} for approval`);
    notifyRole("admin", "Contract approval requested", `${c.title} (${c.vendor_name})`, `/approvals/${approvalId}`);
    notifyRole("procurement", "Contract approval requested", `${c.title} (${c.vendor_name})`, `/approvals/${approvalId}`);
    res.json({ data: get(`${SELECT} WHERE c.id = ?`, id), approval_id: approvalId });
  })
);

contractsRouter.post(
  "/:id/obligations",
  canWrite,
  wrap((req, res) => {
    const id = Number(req.params.id);
    if (!get("SELECT id FROM contracts WHERE id = ?", id)) throw notFound("Contract");
    const body = validate(z.object({ description: z.string().min(1), due_date: z.string().nullable().optional(), owner_id: z.number().int().nullable().optional() }), req.body);
    const oid = insert("contract_obligations", { ...body, contract_id: id, owner_id: body.owner_id ?? req.user!.id });
    logActivity(req.user!.id, "update", "contract", id, `Added obligation: ${body.description}`);
    res.status(201).json({ data: get("SELECT * FROM contract_obligations WHERE id = ?", oid) });
  })
);
contractsRouter.patch(
  "/:id/obligations/:oid",
  canWrite,
  wrap((req, res) => {
    const oid = Number(req.params.oid);
    const existing = get<any>("SELECT * FROM contract_obligations WHERE id = ? AND contract_id = ?", oid, Number(req.params.id));
    if (!existing) throw notFound("Obligation");
    const body = validate(z.object({ description: z.string().min(1).optional(), due_date: z.string().nullable().optional(), status: z.enum(["pending", "met", "missed", "waived"]).optional(), owner_id: z.number().int().nullable().optional() }), req.body);
    update("contract_obligations", oid, body);
    if (body.status && body.status !== existing.status) logActivity(req.user!.id, "update", "contract", existing.contract_id, `Obligation "${existing.description}" marked ${body.status}`);
    res.json({ data: get("SELECT * FROM contract_obligations WHERE id = ?", oid) });
  })
);
contractsRouter.delete(
  "/:id/obligations/:oid",
  canWrite,
  wrap((req, res) => {
    run("DELETE FROM contract_obligations WHERE id = ? AND contract_id = ?", Number(req.params.oid), Number(req.params.id));
    res.json({ ok: true });
  })
);
