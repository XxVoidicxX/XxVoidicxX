import { Router } from "express";
import { z } from "zod";
import { all, get, insert, update, run } from "../db.js";
import { requireAuth, canWrite } from "../auth.js";
import { HttpError, notFound, orderBy, paginate, validate, wrap, shortText, longText, optDate, dateOrder } from "../http.js";
import { logActivity, setting } from "../activity.js";

export const documentsRouter = Router();
documentsRouter.use(requireAuth);

const typeEnum = z.enum(["soc2", "iso27001", "insurance", "pen_test", "dpa", "financial", "policy", "other"]);
const statusEnum = z.enum(["valid", "expiring", "expired", "pending_review", "rejected"]);

export function refreshDocumentStatuses() {
  const days = Number(setting<number>("document_expiry_warning_days")) || 45;
  run(`UPDATE documents SET status = 'expired' WHERE status IN ('valid','expiring') AND expiry_date IS NOT NULL AND expiry_date < date('now')`);
  run(`UPDATE documents SET status = 'expiring' WHERE status = 'valid' AND expiry_date IS NOT NULL AND expiry_date <= date('now', ?)`, `+${days} days`);
  run(`UPDATE documents SET status = 'valid' WHERE status = 'expiring' AND expiry_date IS NOT NULL AND expiry_date > date('now', ?)`, `+${days} days`);
}

const SELECT = `SELECT d.*, v.name AS vendor_name, v.tier AS vendor_tier, u.name AS uploaded_by_name, c.title AS contract_title,
  CAST(julianday(d.expiry_date) - julianday(date('now')) AS INTEGER) AS days_to_expiry
  FROM documents d JOIN vendors v ON v.id = d.vendor_id LEFT JOIN users u ON u.id = d.uploaded_by LEFT JOIN contracts c ON c.id = d.contract_id`;

documentsRouter.get(
  "/",
  wrap((req, res) => {
    refreshDocumentStatuses();
    const { page, limit, offset } = paginate(req);
    const where: string[] = [];
    const params: unknown[] = [];
    if (req.query.q) { where.push("(d.name LIKE ? OR v.name LIKE ? OR d.file_name LIKE ?)"); const q = `%${req.query.q}%`; params.push(q, q, q); }
    for (const f of ["status", "type", "vendor_id", "contract_id"]) {
      if (req.query[f]) { const vals = String(req.query[f]).split(","); where.push(`d.${f} IN (${vals.map(() => "?").join(",")})`); params.push(...vals); }
    }
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const order = orderBy(req, ["name", "expiry_date", "issued_date", "type", "status", "vendor_name", "created_at"], "expiry_date");
    const total = get<{ n: number }>(`SELECT COUNT(*) AS n FROM documents d JOIN vendors v ON v.id = d.vendor_id ${whereSql}`, ...params)!.n;
    const orderSql = /^(expiry_date|issued_date) /.test(order) ? `d.${order.split(" ")[0]} IS NULL, ${order}, d.id` : `${order}, d.id`;
    const data = all(`${SELECT} ${whereSql} ORDER BY ${orderSql} LIMIT ? OFFSET ?`, ...params, limit, offset);
    res.json({ data, total, page, limit });
  })
);

documentsRouter.get(
  "/summary",
  wrap((_req, res) => {
    refreshDocumentStatuses();
    const counts = Object.fromEntries(["valid", "expiring", "expired", "pending_review", "rejected"].map((s) => [s, 0])) as Record<string, number>;
    for (const r of all<{ status: string; n: number }>("SELECT status, COUNT(*) AS n FROM documents GROUP BY status")) counts[r.status] = r.n;
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    const upcoming = all(`${SELECT} WHERE d.expiry_date IS NOT NULL AND d.expiry_date >= date('now') AND d.status != 'rejected' ORDER BY d.expiry_date ASC, d.id ASC LIMIT 5`);
    res.json({ data: { total, counts, upcoming } });
  })
);

documentsRouter.get(
  "/:id",
  wrap((req, res) => {
    const d = get(`${SELECT} WHERE d.id = ?`, Number(req.params.id));
    if (!d) throw notFound("Document");
    res.json({ data: d });
  })
);

documentsRouter.post(
  "/",
  canWrite,
  wrap((req, res) => {
    const body = validate(
      z.object({ vendor_id: z.number().int(), contract_id: z.number().int().nullable().optional(), name: shortText(200), type: typeEnum, status: statusEnum.optional(), issued_date: optDate, expiry_date: optDate, file_name: z.string().trim().max(255).nullable().optional(), file_size: z.number().int().min(0).max(5e9).optional(), notes: longText(2000) }),
      req.body
    );
    if (!get("SELECT id FROM vendors WHERE id = ?", body.vendor_id)) throw new HttpError(400, "Vendor does not exist");
    dateOrder(body.issued_date, body.expiry_date, "Expiry date must be on or after issue date");
    const id = insert("documents", { ...body, status: body.status ?? "pending_review", uploaded_by: req.user!.id });
    refreshDocumentStatuses();
    logActivity(req.user!.id, "create", "document", id, `Uploaded ${body.name}`);
    res.status(201).json({ data: get(`${SELECT} WHERE d.id = ?`, id) });
  })
);

documentsRouter.patch(
  "/:id",
  canWrite,
  wrap((req, res) => {
    const id = Number(req.params.id);
    const existing = get<any>("SELECT * FROM documents WHERE id = ?", id);
    if (!existing) throw notFound("Document");
    const body = validate(z.object({ name: shortText(200).optional(), type: typeEnum.optional(), status: statusEnum.optional(), issued_date: optDate, expiry_date: optDate, notes: longText(2000), contract_id: z.number().int().nullable().optional() }), req.body);
    dateOrder(body.issued_date ?? existing.issued_date, body.expiry_date ?? existing.expiry_date, "Expiry date must be on or after issue date");
    update("documents", id, body);
    if (body.status && body.status !== existing.status) logActivity(req.user!.id, "status_change", "document", id, `${existing.name} marked ${body.status}`);
    else logActivity(req.user!.id, "update", "document", id, `Updated ${existing.name}`, body);
    res.json({ data: get(`${SELECT} WHERE d.id = ?`, id) });
  })
);

documentsRouter.delete(
  "/:id",
  canWrite,
  wrap((req, res) => {
    const id = Number(req.params.id);
    const existing = get<any>("SELECT * FROM documents WHERE id = ?", id);
    if (!existing) throw notFound("Document");
    run("DELETE FROM documents WHERE id = ?", id);
    logActivity(req.user!.id, "delete", "document", id, `Deleted ${existing.name}`);
    res.json({ ok: true });
  })
);
