import { Router } from "express";
import { z } from "zod";
import { all, get, insert, update, run, tx } from "../db.js";
import { requireAuth, canWrite } from "../auth.js";
import { HttpError, notFound, orderBy, paginate, validate, wrap } from "../http.js";
import { logActivity, notify } from "../activity.js";
import { computeAssessmentScore, ratingFromScore, recomputeVendorRisk } from "../risk.js";

export const assessmentsRouter = Router();
assessmentsRouter.use(requireAuth);

const SELECT = `SELECT a.*, v.name AS vendor_name, v.tier AS vendor_tier, t.name AS template_name, t.framework, u.name AS assignee_name, r.name AS reviewer_name,
  (SELECT COUNT(*) FROM template_questions q WHERE q.template_id = a.template_id) AS question_count,
  (SELECT COUNT(*) FROM assessment_answers x WHERE x.assessment_id = a.id AND x.answer IS NOT NULL) AS answered_count,
  CAST(julianday(a.due_date) - julianday('now') AS INTEGER) AS days_to_due
  FROM assessments a JOIN vendors v ON v.id = a.vendor_id JOIN assessment_templates t ON t.id = a.template_id LEFT JOIN users u ON u.id = a.assigned_to LEFT JOIN users r ON r.id = a.reviewer_id`;

assessmentsRouter.get(
  "/",
  wrap((req, res) => {
    const { page, limit, offset } = paginate(req);
    const where: string[] = [];
    const params: unknown[] = [];
    if (req.query.q) { where.push("(a.title LIKE ? OR v.name LIKE ?)"); const q = `%${req.query.q}%`; params.push(q, q); }
    for (const f of ["status", "vendor_id", "assigned_to", "reviewer_id", "template_id", "risk_rating"]) {
      if (req.query[f]) { const vals = String(req.query[f]).split(","); where.push(`a.${f} IN (${vals.map(() => "?").join(",")})`); params.push(...vals); }
    }
    if (req.query.overdue === "true") where.push("a.due_date < date('now') AND a.status != 'completed'");
    if (req.query.completed_from) { where.push("a.completed_at >= ?"); params.push(String(req.query.completed_from)); }
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const order = orderBy(req, ["title", "due_date", "status", "score", "vendor_name", "created_at", "completed_at", "risk_rating", "assignee_name", "progress"], "due_date");
    const orderSql = order.startsWith("progress ") ? `CAST(answered_count AS REAL) / MAX(question_count, 1) ${order.slice(9)}` : order.startsWith("risk_rating ") ? `(a.risk_rating IS NULL), CASE a.risk_rating WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 4 END ${order.slice(12)}` : order;
    const total = get<{ n: number }>(`SELECT COUNT(*) AS n FROM assessments a JOIN vendors v ON v.id = a.vendor_id ${whereSql}`, ...params)!.n;
    const data = all(`${SELECT} ${whereSql} ORDER BY ${orderSql}, a.id LIMIT ? OFFSET ?`, ...params, limit, offset);
    res.json({ data, total, page, limit });
  })
);

assessmentsRouter.get(
  "/templates",
  wrap((_req, res) => {
    const templates = all<any>("SELECT t.*, (SELECT COUNT(*) FROM template_questions q WHERE q.template_id = t.id) AS question_count, (SELECT COUNT(*) FROM assessments a WHERE a.template_id = t.id) AS usage_count FROM assessment_templates t ORDER BY name");
    res.json({ data: templates });
  })
);
assessmentsRouter.get(
  "/templates/:id",
  wrap((req, res) => {
    const t = get<any>("SELECT * FROM assessment_templates WHERE id = ?", Number(req.params.id));
    if (!t) throw notFound("Template");
    t.questions = all("SELECT * FROM template_questions WHERE template_id = ? ORDER BY sort_order, id", t.id);
    res.json({ data: t });
  })
);
assessmentsRouter.post(
  "/templates",
  canWrite,
  wrap((req, res) => {
    const body = validate(
      z.object({
        name: z.string().min(1), description: z.string().optional().nullable(), framework: z.string().optional().nullable(), version: z.string().optional(),
        questions: z.array(z.object({ section: z.string().min(1), text: z.string().min(1), guidance: z.string().optional().nullable(), weight: z.number().int().min(1).max(5).optional() })).min(1),
      }),
      req.body
    );
    const id = tx(() => {
      const { questions, ...t } = body;
      const id = insert("assessment_templates", t);
      questions.forEach((q, i) => insert("template_questions", { ...q, weight: q.weight ?? 1, template_id: id, sort_order: i }));
      return id;
    });
    logActivity(req.user!.id, "create", "template", id, `Created assessment template ${body.name}`);
    res.status(201).json({ data: get("SELECT * FROM assessment_templates WHERE id = ?", id) });
  })
);
assessmentsRouter.patch(
  "/templates/:id",
  canWrite,
  wrap((req, res) => {
    const id = Number(req.params.id);
    if (!get("SELECT id FROM assessment_templates WHERE id = ?", id)) throw notFound("Template");
    const body = validate(z.object({ name: z.string().min(1).optional(), description: z.string().nullable().optional(), framework: z.string().nullable().optional(), active: z.boolean().optional() }), req.body);
    update("assessment_templates", id, body);
    res.json({ data: get("SELECT * FROM assessment_templates WHERE id = ?", id) });
  })
);

assessmentsRouter.get(
  "/:id",
  wrap((req, res) => {
    const id = Number(req.params.id);
    const a = get<any>(`${SELECT} WHERE a.id = ?`, id);
    if (!a) throw notFound("Assessment");
    a.questions = all(
      `SELECT q.*, x.answer, x.note, x.id AS answer_id FROM template_questions q LEFT JOIN assessment_answers x ON x.question_id = q.id AND x.assessment_id = ? WHERE q.template_id = ? ORDER BY q.sort_order, q.id`,
      id, a.template_id
    );
    a.findings = all("SELECT f.*, u.name AS owner_name FROM findings f LEFT JOIN users u ON u.id = f.owner_id WHERE f.assessment_id = ? ORDER BY f.created_at DESC", id);
    a.comments = all("SELECT c.*, u.name AS author_name FROM comments c JOIN users u ON u.id = c.author_id WHERE c.entity_type = 'assessment' AND c.entity_id = ? ORDER BY c.created_at", id);
    a.activity = all("SELECT l.*, u.name AS actor_name FROM activity_log l LEFT JOIN users u ON u.id = l.actor_id WHERE l.entity_type = 'assessment' AND l.entity_id = ? ORDER BY l.created_at DESC LIMIT 30", id);
    res.json({ data: a });
  })
);

assessmentsRouter.post(
  "/",
  canWrite,
  wrap((req, res) => {
    const body = validate(z.object({ vendor_id: z.number().int(), template_id: z.number().int(), title: z.string().min(1).optional(), assigned_to: z.number().int().nullable().optional(), reviewer_id: z.number().int().nullable().optional(), due_date: z.string().nullable().optional() }), req.body);
    const vendor = get<any>("SELECT * FROM vendors WHERE id = ?", body.vendor_id);
    const template = get<any>("SELECT * FROM assessment_templates WHERE id = ?", body.template_id);
    if (!vendor || !template) throw new HttpError(400, "Vendor or template does not exist");
    const id = insert("assessments", { ...body, title: body.title ?? `${template.name} — ${vendor.name}`, assigned_to: body.assigned_to ?? req.user!.id });
    logActivity(req.user!.id, "create", "assessment", id, `Started assessment ${template.name} for ${vendor.name}`);
    if (body.assigned_to && body.assigned_to !== req.user!.id) notify(body.assigned_to, "Assessment assigned to you", `${template.name} for ${vendor.name}`, `/assessments/${id}`);
    res.status(201).json({ data: get(`${SELECT} WHERE a.id = ?`, id) });
  })
);

assessmentsRouter.patch(
  "/:id",
  canWrite,
  wrap((req, res) => {
    const id = Number(req.params.id);
    const existing = get<any>("SELECT * FROM assessments WHERE id = ?", id);
    if (!existing) throw notFound("Assessment");
    const body = validate(z.object({ title: z.string().min(1).optional(), assigned_to: z.number().int().nullable().optional(), reviewer_id: z.number().int().nullable().optional(), due_date: z.string().nullable().optional(), summary: z.string().nullable().optional() }), req.body);
    update("assessments", id, body);
    logActivity(req.user!.id, "update", "assessment", id, `Updated assessment ${existing.title}`, body);
    res.json({ data: get(`${SELECT} WHERE a.id = ?`, id) });
  })
);

assessmentsRouter.put(
  "/:id/answers",
  canWrite,
  wrap((req, res) => {
    const id = Number(req.params.id);
    const a = get<any>("SELECT * FROM assessments WHERE id = ?", id);
    if (!a) throw notFound("Assessment");
    if (["submitted", "under_review", "completed"].includes(a.status)) throw new HttpError(400, "Assessment is locked while awaiting review or completed");
    const body = validate(z.object({ answers: z.array(z.object({ question_id: z.number().int(), answer: z.enum(["yes", "partial", "no", "na"]).nullable(), note: z.string().nullable().optional() })) }), req.body);
    tx(() => {
      for (const ans of body.answers) {
        run(
          `INSERT INTO assessment_answers (assessment_id, question_id, answer, note) VALUES (?, ?, ?, ?)
           ON CONFLICT(assessment_id, question_id) DO UPDATE SET answer = excluded.answer, note = COALESCE(excluded.note, assessment_answers.note)`,
          id, ans.question_id, ans.answer, ans.note ?? null
        );
      }
      const score = computeAssessmentScore(id);
      update("assessments", id, { score, risk_rating: ratingFromScore(score), status: a.status === "not_started" ? "in_progress" : a.status });
    });
    res.json({ data: get(`${SELECT} WHERE a.id = ?`, id) });
  })
);

assessmentsRouter.post(
  "/:id/submit",
  canWrite,
  wrap((req, res) => {
    const id = Number(req.params.id);
    const a = get<any>("SELECT * FROM assessments WHERE id = ?", id);
    if (!a) throw notFound("Assessment");
    if (!["not_started", "in_progress"].includes(a.status)) throw new HttpError(400, "Assessment cannot be submitted from its current state");
    const unanswered = get<{ n: number }>(`SELECT COUNT(*) AS n FROM template_questions q WHERE q.template_id = ? AND NOT EXISTS (SELECT 1 FROM assessment_answers x WHERE x.question_id = q.id AND x.assessment_id = ? AND x.answer IS NOT NULL)`, a.template_id, id)!.n;
    if (unanswered > 0) throw new HttpError(400, `${unanswered} question(s) still unanswered`);
    const score = computeAssessmentScore(id);
    update("assessments", id, { status: "submitted", submitted_at: new Date().toISOString(), score, risk_rating: ratingFromScore(score) });
    logActivity(req.user!.id, "submit", "assessment", id, `Submitted ${a.title} for review (score ${score})`);
    if (a.reviewer_id) notify(a.reviewer_id, "Assessment ready for review", a.title, `/assessments/${id}`);
    res.json({ data: get(`${SELECT} WHERE a.id = ?`, id) });
  })
);

assessmentsRouter.post(
  "/:id/start-review",
  canWrite,
  wrap((req, res) => {
    const id = Number(req.params.id);
    const a = get<any>("SELECT * FROM assessments WHERE id = ?", id);
    if (!a) throw notFound("Assessment");
    if (a.status !== "submitted") throw new HttpError(400, "Only submitted assessments can be taken into review");
    if (a.assigned_to === req.user!.id && req.user!.role !== "admin") throw new HttpError(403, "You cannot review an assessment you completed (segregation of duties)");
    update("assessments", id, { status: "under_review", reviewer_id: req.user!.id });
    logActivity(req.user!.id, "review", "assessment", id, `Started review of ${a.title}`);
    res.json({ data: get(`${SELECT} WHERE a.id = ?`, id) });
  })
);

assessmentsRouter.post(
  "/:id/review",
  canWrite,
  wrap((req, res) => {
    const id = Number(req.params.id);
    const a = get<any>("SELECT * FROM assessments WHERE id = ?", id);
    if (!a) throw notFound("Assessment");
    if (!["submitted", "under_review"].includes(a.status)) throw new HttpError(400, "Assessment is not awaiting review");
    if (a.assigned_to === req.user!.id && req.user!.role !== "admin") throw new HttpError(403, "You cannot review an assessment you completed (segregation of duties)");
    const body = validate(z.object({ decision: z.enum(["complete", "return"]), summary: z.string().optional().nullable() }), req.body);
    if (body.decision === "complete") {
      update("assessments", id, { status: "completed", completed_at: new Date().toISOString(), summary: body.summary ?? a.summary, reviewer_id: req.user!.id });
      const next = new Date(); next.setFullYear(next.getFullYear() + 1);
      update("vendors", a.vendor_id, { next_review_date: next.toISOString().slice(0, 10) });
      recomputeVendorRisk(a.vendor_id);
      logActivity(req.user!.id, "complete", "assessment", id, `Completed review of ${a.title} — rated ${a.risk_rating}`);
      if (a.assigned_to) notify(a.assigned_to, "Assessment completed", `${a.title} was reviewed and completed`, `/assessments/${id}`);
    } else {
      update("assessments", id, { status: "in_progress", summary: body.summary ?? a.summary });
      logActivity(req.user!.id, "return", "assessment", id, `Returned ${a.title} for more information`);
      if (a.assigned_to) notify(a.assigned_to, "Assessment returned", `${a.title} needs more information`, `/assessments/${id}`);
    }
    res.json({ data: get(`${SELECT} WHERE a.id = ?`, id) });
  })
);
