import crypto from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { get, run } from "./db.js";

export type Role = "admin" | "risk_analyst" | "procurement" | "vendor_owner" | "auditor";
export interface User {
  id: number;
  name: string;
  email: string;
  role: Role;
  department: string | null;
  title: string | null;
  active: number;
}
declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

export function hashPassword(pw: string) {
  const salt = crypto.randomBytes(8).toString("hex");
  const hash = crypto.scryptSync(pw, salt, 32).toString("hex");
  return `${salt}:${hash}`;
}
export function verifyPassword(pw: string, stored: string) {
  const [salt, hash] = stored.split(":");
  const test = crypto.scryptSync(pw, salt, 32).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(test, "hex"));
}

export const SESSION_COOKIE = "meridian_session";

export function createSession(userId: number) {
  const token = crypto.randomBytes(24).toString("hex");
  const expires = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString();
  run("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)", token, userId, expires);
  return token;
}
export function destroySession(token: string) {
  run("DELETE FROM sessions WHERE token = ?", token);
}

export function attachUser(req: Request, _res: Response, next: NextFunction) {
  const token = req.cookies?.[SESSION_COOKIE] || (req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.slice(7) : undefined);
  if (token) {
    const user = get<User>(
      `SELECT u.id, u.name, u.email, u.role, u.department, u.title, u.active FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ? AND s.expires_at > datetime('now') AND u.active = 1`,
      token
    );
    if (user) req.user = user;
  }
  next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ error: "Authentication required" });
  next();
}

export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: "Authentication required" });
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: "Insufficient permissions" });
    next();
  };
}

export const WRITE_ROLES: Role[] = ["admin", "risk_analyst", "procurement", "vendor_owner"];
export const canWrite = requireRole(...WRITE_ROLES);

const attempts = new Map<string, { count: number; until: number }>();
export function checkLoginAllowed(key: string) {
  const a = attempts.get(key);
  if (a && a.count >= 25 && Date.now() < a.until) throw new HttpErrorLike(429, "Too many failed sign-in attempts from this address. Try again in 15 minutes.");
}
export function recordLoginFailure(key: string) {
  const a = attempts.get(key);
  if (!a || Date.now() > a.until) attempts.set(key, { count: 1, until: Date.now() + 15 * 60_000 });
  else a.count++;
}
export function clearLoginFailures(key: string) {
  attempts.delete(key);
}
class HttpErrorLike extends Error {
  constructor(public status: number, message: string) { super(message); }
}
