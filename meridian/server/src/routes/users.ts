import { Router } from "express";
import { z } from "zod";
import { all, get, insert, update } from "../db.js";
import { hashPassword, requireAuth, requireRole } from "../auth.js";
import { HttpError, notFound, validate, wrap } from "../http.js";
import { logActivity } from "../activity.js";

export const usersRouter = Router();
usersRouter.use(requireAuth);

const roleEnum = z.enum(["admin", "risk_analyst", "procurement", "vendor_owner", "auditor"]);
const cols = "id, name, email, role, department, title, active, created_at";

usersRouter.get("/", wrap((_req, res) => res.json({ data: all(`SELECT ${cols} FROM users ORDER BY name`) })));

usersRouter.post(
  "/",
  requireRole("admin"),
  wrap((req, res) => {
    const body = validate(
      z.object({ name: z.string().min(1), email: z.string().email(), password: z.string().min(6), role: roleEnum, department: z.string().optional(), title: z.string().optional() }),
      req.body
    );
    if (get("SELECT id FROM users WHERE lower(email)=lower(?)", body.email)) return res.status(409).json({ error: "Email already in use" });
    const id = insert("users", { ...body, password: hashPassword(body.password) });
    logActivity(req.user!.id, "create", "user", id, `Created user ${body.name} (${body.role})`);
    res.status(201).json({ data: get(`SELECT ${cols} FROM users WHERE id = ?`, id) });
  })
);

usersRouter.patch(
  "/:id",
  requireRole("admin"),
  wrap((req, res) => {
    const id = Number(req.params.id);
    const existing = get<{ id: number; name: string }>("SELECT id, name FROM users WHERE id = ?", id);
    if (!existing) throw notFound("User");
    const body = validate(
      z.object({ name: z.string().min(1).optional(), role: roleEnum.optional(), department: z.string().nullable().optional(), title: z.string().nullable().optional(), active: z.boolean().optional(), password: z.string().min(6).optional() }),
      req.body
    );
    if (id === req.user!.id && (body.active === false || (body.role && body.role !== "admin"))) throw new HttpError(400, "You cannot deactivate or demote your own account");
    const data: Record<string, unknown> = { ...body };
    if (body.active !== undefined) data.active = body.active ? 1 : 0;
    if (body.password) data.password = hashPassword(body.password);
    update("users", id, data);
    logActivity(req.user!.id, "update", "user", id, `Updated user ${existing.name}`, body.password ? { ...body, password: "***" } : body);
    res.json({ data: get(`SELECT ${cols} FROM users WHERE id = ?`, id) });
  })
);
