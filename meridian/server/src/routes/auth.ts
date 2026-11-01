import { Router } from "express";
import { z } from "zod";
import { get } from "../db.js";
import { createSession, destroySession, SESSION_COOKIE, verifyPassword, requireAuth } from "../auth.js";
import { HttpError, validate, wrap } from "../http.js";
import { logActivity } from "../activity.js";

export const authRouter = Router();

authRouter.post(
  "/login",
  wrap((req, res) => {
    const { email, password } = validate(z.object({ email: z.string().email(), password: z.string().min(1) }), req.body);
    const row = get<any>("SELECT * FROM users WHERE lower(email) = lower(?)", email);
    if (!row || !row.active || !verifyPassword(password, row.password)) throw new HttpError(401, "Invalid email or password");
    const token = createSession(row.id);
    res.cookie(SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", maxAge: 1000 * 60 * 60 * 24 * 7 });
    logActivity(row.id, "login", "user", row.id, `${row.name} signed in`);
    const { password: _pw, ...user } = row;
    res.json({ user, token });
  })
);

authRouter.post(
  "/logout",
  wrap((req, res) => {
    const token = req.cookies?.[SESSION_COOKIE];
    if (token) destroySession(token);
    res.clearCookie(SESSION_COOKIE);
    res.json({ ok: true });
  })
);

authRouter.get(
  "/me",
  requireAuth,
  wrap((req, res) => {
    res.json({ user: req.user });
  })
);
