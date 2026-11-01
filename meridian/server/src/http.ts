import type { Request, Response, NextFunction } from "express";
import { ZodSchema } from "zod";

export class HttpError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
}
export const notFound = (what = "Resource") => new HttpError(404, `${what} not found`);

export function validate<T>(schema: ZodSchema<T>, data: unknown): T {
  const r = schema.safeParse(data);
  if (!r.success) throw new HttpError(400, "Validation failed", r.error.flatten());
  return r.data;
}

export function wrap(fn: (req: Request, res: Response) => unknown | Promise<unknown>) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      await fn(req, res);
    } catch (e) {
      next(e);
    }
  };
}

export function paginate(req: Request, defaults = { limit: 25 }) {
  const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
  const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit ?? defaults.limit), 10) || defaults.limit));
  return { page, limit, offset: (page - 1) * limit };
}

export function orderBy(req: Request, allowed: string[], fallback: string) {
  const sort = String(req.query.sort ?? fallback);
  const col = allowed.includes(sort) ? sort : fallback;
  const dir = String(req.query.dir ?? "asc").toLowerCase() === "desc" ? "DESC" : "ASC";
  return `${col} ${dir}`;
}

export function toCsv(rows: Record<string, unknown>[], columns?: string[]): string {
  if (!rows.length) return "";
  const cols = columns ?? Object.keys(rows[0]);
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
}
