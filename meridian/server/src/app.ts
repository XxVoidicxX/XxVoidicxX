import express from "express";
import cookieParser from "cookie-parser";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { attachUser } from "./auth.js";
import { HttpError } from "./http.js";
import { authRouter } from "./routes/auth.js";
import { usersRouter } from "./routes/users.js";
import { vendorsRouter } from "./routes/vendors.js";
import { contractsRouter } from "./routes/contracts.js";
import { assessmentsRouter } from "./routes/assessments.js";
import { documentsRouter } from "./routes/documents.js";
import { findingsRouter } from "./routes/findings.js";
import { approvalsRouter } from "./routes/approvals.js";
import { commentsRouter, activityRouter, notificationsRouter, searchRouter, settingsRouter } from "./routes/misc.js";
import { dashboardRouter, reportsRouter } from "./routes/dashboard.js";

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "2mb" }));
  app.use(cookieParser());
  app.use(attachUser);

  app.get("/api/health", (_req, res) => res.json({ ok: true, service: "meridian", time: new Date().toISOString() }));
  app.use("/api/auth", authRouter);
  app.use("/api/users", usersRouter);
  app.use("/api/vendors", vendorsRouter);
  app.use("/api/contracts", contractsRouter);
  app.use("/api/assessments", assessmentsRouter);
  app.use("/api/documents", documentsRouter);
  app.use("/api/findings", findingsRouter);
  app.use("/api/approvals", approvalsRouter);
  app.use("/api/comments", commentsRouter);
  app.use("/api/activity", activityRouter);
  app.use("/api/notifications", notificationsRouter);
  app.use("/api/search", searchRouter);
  app.use("/api/settings", settingsRouter);
  app.use("/api/dashboard", dashboardRouter);
  app.use("/api/reports", reportsRouter);
  app.use("/api", (_req, res) => res.status(404).json({ error: "Not found" }));

  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const webDist = path.resolve(__dirname, "../../web/dist");
  if (fs.existsSync(webDist)) {
    app.use(express.static(webDist));
    app.get("*", (_req, res) => res.sendFile(path.join(webDist, "index.html")));
  }

  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, details: err.details });
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("UNIQUE constraint")) return res.status(409).json({ error: "A record with that unique value already exists" });
    if (msg.includes("CHECK constraint") || msg.includes("FOREIGN KEY")) return res.status(400).json({ error: msg });
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  });
  return app;
}
