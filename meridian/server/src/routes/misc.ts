import { Router } from "express";
import { z } from "zod";
import { all, get, insert, run } from "../db.js";
import { requireAuth, canWrite, requireRole } from "../auth.js";
import { HttpError, notFound, paginate, validate, wrap } from "../http.js";
import { logActivity } from "../activity.js";

export const commentsRouter = Router();
commentsRouter.use(requireAuth);
const entityEnum = z.enum(["vendor", "contract", "assessment", "finding", "approval", "document"]);
commentsRouter.get(
  "/",
  wrap((req, res) => {
    const { entity_type, entity_id } = validate(z.object({ entity_type: entityEnum, entity_id: z.coerce.number().int() }), req.query);
    res.json({ data: all("SELECT c.*, u.name AS author_name, u.role AS author_role FROM comments c JOIN users u ON u.id = c.author_id WHERE c.entity_type = ? AND c.entity_id = ? ORDER BY c.created_at", entity_type, entity_id) });
  })
);
commentsRouter.post(
  "/",
  canWrite,
  wrap((req, res) => {
    const body = validate(z.object({ entity_type: entityEnum, entity_id: z.number().int(), body: z.string().trim().min(1).max(4000) }), req.body);
    const table: Record<string, string> = { vendor: "vendors", contract: "contracts", assessment: "assessments", finding: "findings", approval: "approvals", document: "documents" };
    if (!get(`SELECT id FROM ${table[body.entity_type]} WHERE id = ?`, body.entity_id)) throw notFound("Linked record");
    const id = insert("comments", { ...body, author_id: req.user!.id });
    logActivity(req.user!.id, "comment", body.entity_type, body.entity_id, `Commented: ${body.body.slice(0, 80)}${body.body.length > 80 ? "…" : ""}`);
    res.status(201).json({ data: get("SELECT c.*, u.name AS author_name, u.role AS author_role FROM comments c JOIN users u ON u.id = c.author_id WHERE c.id = ?", id) });
  })
);
commentsRouter.delete(
  "/:id",
  canWrite,
  wrap((req, res) => {
    const c = get<any>("SELECT * FROM comments WHERE id = ?", Number(req.params.id));
    if (!c) throw notFound("Comment");
    if (c.author_id !== req.user!.id && req.user!.role !== "admin") throw new HttpError(403, "Cannot delete another user's comment");
    run("DELETE FROM comments WHERE id = ?", c.id);
    res.json({ ok: true });
  })
);

export const activityRouter = Router();
activityRouter.use(requireAuth);
activityRouter.get(
  "/",
  wrap((req, res) => {
    const { page, limit, offset } = paginate(req, { limit: 50 });
    const where: string[] = [];
    const params: unknown[] = [];
    for (const f of ["entity_type", "action", "actor_id"]) {
      if (req.query[f]) { const vals = String(req.query[f]).split(","); where.push(`l.${f} IN (${vals.map(() => "?").join(",")})`); params.push(...vals); }
    }
    if (req.query.entity_id) { where.push("l.entity_id = ?"); params.push(Number(req.query.entity_id)); }
    if (req.query.q) { where.push("(l.summary LIKE ? OR u.name LIKE ? OR l.metadata LIKE ?)"); params.push(`%${req.query.q}%`, `%${req.query.q}%`, `%${req.query.q}%`); }
    if (req.query.from) { where.push("l.created_at >= ?"); params.push(String(req.query.from)); }
    if (req.query.to) { where.push("l.created_at <= ?"); params.push(String(req.query.to) + "T23:59:59"); }
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const total = get<{ n: number }>(`SELECT COUNT(*) AS n FROM activity_log l LEFT JOIN users u ON u.id = l.actor_id ${whereSql}`, ...params)!.n;
    const data = all(`SELECT l.*, u.name AS actor_name, u.role AS actor_role FROM activity_log l LEFT JOIN users u ON u.id = l.actor_id ${whereSql} ORDER BY l.created_at DESC, l.id DESC LIMIT ? OFFSET ?`, ...params, limit, offset);
    res.json({ data, total, page, limit });
  })
);

export const notificationsRouter = Router();
notificationsRouter.use(requireAuth);
notificationsRouter.get(
  "/",
  wrap((req, res) => {
    const data = all("SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 50", req.user!.id);
    const unread = get<{ n: number }>("SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read = 0", req.user!.id)!.n;
    res.json({ data, unread });
  })
);
notificationsRouter.post("/read-all", wrap((req, res) => { run("UPDATE notifications SET read = 1 WHERE user_id = ?", req.user!.id); res.json({ ok: true }); }));
notificationsRouter.post("/:id/read", wrap((req, res) => { run("UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?", Number(req.params.id), req.user!.id); res.json({ ok: true }); }));

export const searchRouter = Router();
searchRouter.use(requireAuth);
searchRouter.get(
  "/",
  wrap((req, res) => {
    const q = String(req.query.q ?? "").trim();
    if (q.length < 2) return res.json({ data: [] });
    const like = `%${q}%`;
    const results = [
      ...all<any>("SELECT id, name AS title, category AS subtitle, 'vendor' AS type FROM vendors WHERE name LIKE ? OR legal_name LIKE ? LIMIT 6", like, like),
      ...all<any>("SELECT c.id, c.title, v.name || ' · ' || c.contract_number AS subtitle, 'contract' AS type FROM contracts c JOIN vendors v ON v.id = c.vendor_id WHERE c.title LIKE ? OR c.contract_number LIKE ? LIMIT 5", like, like),
      ...all<any>("SELECT a.id, a.title, v.name AS subtitle, 'assessment' AS type FROM assessments a JOIN vendors v ON v.id = a.vendor_id WHERE a.title LIKE ? LIMIT 5", like),
      ...all<any>("SELECT f.id, f.title, v.name || ' · ' || f.severity AS subtitle, 'finding' AS type FROM findings f JOIN vendors v ON v.id = f.vendor_id WHERE f.title LIKE ? LIMIT 5", like),
      ...all<any>("SELECT d.id, d.name AS title, v.name AS subtitle, 'document' AS type FROM documents d JOIN vendors v ON v.id = d.vendor_id WHERE d.name LIKE ? LIMIT 4", like),
    ];
    res.json({ data: results });
  })
);

export const settingsRouter = Router();
settingsRouter.use(requireAuth);
const DEFAULTS: Record<string, unknown> = {
  org_name: "Meridian Corp",
  review_cadence_months: { critical: 6, high: 12, medium: 24, low: 36 },
  document_expiry_warning_days: 45,
  contract_renewal_notice_days: 60,
  risk_thresholds: { low: 85, medium: 70, high: 50 },
};
settingsRouter.get(
  "/",
  wrap((_req, res) => {
    const rows = all<{ key: string; value: string }>("SELECT * FROM settings");
    const merged: Record<string, unknown> = { ...DEFAULTS };
    for (const r of rows) merged[r.key] = JSON.parse(r.value);
    res.json({ data: merged });
  })
);
settingsRouter.put(
  "/",
  requireRole("admin"),
  wrap((req, res) => {
    const body = validate(z.record(z.unknown()), req.body);
    const int = (min: number, max: number) => z.number().int().min(min).max(max);
    const known = z.object({
      org_name: z.string().trim().min(1).max(120).optional(),
      document_expiry_warning_days: int(1, 365).optional(),
      contract_renewal_notice_days: int(1, 365).optional(),
      review_cadence_months: z.object({ critical: int(1, 60), high: int(1, 60), medium: int(1, 60), low: int(1, 60) }).optional(),
      risk_thresholds: z.object({ low: int(1, 100), medium: int(1, 100), high: int(1, 100) }).refine((t) => t.low > t.medium && t.medium > t.high, { message: "Thresholds must satisfy low > medium > high" }).optional(),
    });
    const clean = validate(known.strict(), body);
    for (const [k, v] of Object.entries(clean)) {
      if (v === undefined) continue;
      run("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", k, JSON.stringify(v));
    }
    logActivity(req.user!.id, "update", "settings", null, `Updated settings: ${Object.keys(clean).join(", ")}`);
    const rows = all<{ key: string; value: string }>("SELECT * FROM settings");
    const merged: Record<string, unknown> = { ...DEFAULTS };
    for (const r of rows) merged[r.key] = JSON.parse(r.value);
    res.json({ data: merged });
  })
);
