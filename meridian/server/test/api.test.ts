import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";

process.env.MERIDIAN_DB = ":memory:";
const { migrate } = await import("../src/db.js");
const { seed } = await import("../src/seed.js");
const { createApp } = await import("../src/app.js");

let base = "";
let server: import("node:http").Server;
const jars: Record<string, string> = {};

async function login(email: string) {
  if (jars[email]) return jars[email];
  const r = await fetch(`${base}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password: "Meridian!2026" }) });
  assert.equal(r.status, 200);
  const { token } = (await r.json()) as { token: string };
  jars[email] = token;
  return token;
}
async function call(as: string, method: string, path: string, body?: unknown) {
  const token = await login(as);
  const r = await fetch(`${base}${path}`, { method, headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: r.status, body: json };
}
const ADMIN = "avery.chen@meridian.example";
const ANALYST = "jordan.patel@meridian.example";
const PROC = "marcus.lee@meridian.example";
const OWNER = "daniel.okafor@meridian.example";
const AUDITOR = "grace.kim@meridian.example";

before(async () => {
  migrate();
  seed();
  server = createApp().listen(0);
  await new Promise((r) => server.once("listening", r));
  const addr = server.address() as { port: number };
  base = `http://127.0.0.1:${addr.port}`;
});
after(() => server.close());

describe("auth", () => {
  test("rejects bad credentials", async () => {
    const r = await fetch(`${base}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: ADMIN, password: "wrong" }) });
    assert.equal(r.status, 401);
  });
  test("requires auth", async () => {
    const r = await fetch(`${base}/api/vendors`);
    assert.equal(r.status, 401);
  });
  test("me returns the user", async () => {
    const r = await call(ADMIN, "GET", "/api/auth/me");
    assert.equal(r.body.user.role, "admin");
  });
});

describe("rbac", () => {
  test("auditor cannot write", async () => {
    const r = await call(AUDITOR, "POST", "/api/vendors", { name: "X", category: "SaaS" });
    assert.equal(r.status, 403);
    const r2 = await call(AUDITOR, "PATCH", "/api/findings/1", { status: "closed" });
    assert.equal(r2.status, 403);
  });
  test("only admin manages users and settings", async () => {
    assert.equal((await call(ANALYST, "POST", "/api/users", { name: "A", email: "a@x.io", password: "secret1", role: "auditor" })).status, 403);
    assert.equal((await call(ANALYST, "PUT", "/api/settings", { org_name: "Nope" })).status, 403);
    const ok = await call(ADMIN, "PUT", "/api/settings", { org_name: "Meridian Test" });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.data.org_name, "Meridian Test");
  });
});

describe("vendors", () => {
  test("list supports filters, sort and pagination", async () => {
    const r = await call(ADMIN, "GET", "/api/vendors?status=active&sort=residual_risk&dir=desc&limit=5");
    assert.equal(r.status, 200);
    assert.equal(r.body.data.length, 5);
    assert.ok(r.body.total > 5);
    const risks = r.body.data.map((v: any) => v.residual_risk);
    assert.deepEqual(risks, [...risks].sort((a, b) => b - a));
    for (const v of r.body.data) assert.equal(v.status, "active");
  });
  test("csv export", async () => {
    const token = await login(ADMIN);
    const r = await fetch(`${base}/api/vendors?format=csv`, { headers: { authorization: `Bearer ${token}` } });
    assert.equal(r.headers.get("content-type")?.includes("text/csv"), true);
    const text = await r.text();
    assert.ok(text.startsWith("id,name,category"));
  });
  test("create computes inherent risk and tier, validates input", async () => {
    const bad = await call(PROC, "POST", "/api/vendors", { name: "", category: "SaaS" });
    assert.equal(bad.status, 400);
    const r = await call(PROC, "POST", "/api/vendors", { name: "Test Vendor Co", category: "Payments", data_access: "restricted", annual_spend: 1_500_000, contacts: [{ name: "Jane Doe", email: "jane@test.example", is_primary: true }] });
    assert.equal(r.status, 201);
    assert.equal(r.body.data.tier, "critical");
    assert.ok(r.body.data.inherent_risk >= 80);
    const d = await call(PROC, "GET", `/api/vendors/${r.body.data.id}`);
    assert.equal(d.body.data.contacts.length, 1);
    assert.equal(d.body.data.status, "prospect");
  });
  test("404 on unknown vendor", async () => {
    assert.equal((await call(ADMIN, "GET", "/api/vendors/99999")).status, 404);
  });
});

describe("onboarding approval workflow", () => {
  let vendorId: number;
  let approvalId: number;
  test("submit creates a pending approval and notifies approvers", async () => {
    const v = await call(PROC, "POST", "/api/vendors", { name: "Workflow Vendor", category: "SaaS", data_access: "confidential", annual_spend: 50000 });
    vendorId = v.body.data.id;
    const s = await call(PROC, "POST", `/api/vendors/${vendorId}/submit-onboarding`);
    assert.equal(s.status, 200);
    assert.equal(s.body.data.status, "onboarding");
    approvalId = s.body.approval_id;
    const dup = await call(PROC, "POST", `/api/vendors/${vendorId}/submit-onboarding`);
    assert.equal(dup.status, 409);
    const notes = await call(ADMIN, "GET", "/api/notifications");
    assert.ok(notes.body.data.some((n: any) => n.title.includes("Onboarding approval requested")));
  });
  test("procurement cannot approve onboarding; requester cannot self-approve", async () => {
    const r = await call(PROC, "POST", `/api/approvals/${approvalId}/decide`, { decision: "approved" });
    assert.equal(r.status, 403);
  });
  test("reject requires a comment", async () => {
    const r = await call(ANALYST, "POST", `/api/approvals/${approvalId}/decide`, { decision: "rejected" });
    assert.equal(r.status, 400);
  });
  test("analyst approves → vendor becomes active, activity logged", async () => {
    const r = await call(ANALYST, "POST", `/api/approvals/${approvalId}/decide`, { decision: "approved", comment: "Looks good" });
    assert.equal(r.status, 200);
    assert.equal(r.body.data.status, "approved");
    const v = await call(ANALYST, "GET", `/api/vendors/${vendorId}`);
    assert.equal(v.body.data.status, "active");
    assert.ok(v.body.data.onboarded_at);
    assert.ok(v.body.data.activity.some((a: any) => a.action === "approve"));
    const again = await call(ADMIN, "POST", `/api/approvals/${approvalId}/decide`, { decision: "approved" });
    assert.equal(again.status, 400);
  });
});

describe("assessments", () => {
  let id: number;
  let questions: any[];
  test("create against a template", async () => {
    const r = await call(ANALYST, "POST", "/api/assessments", { vendor_id: 1, template_id: 1, reviewer_id: 1, due_date: "2026-12-15" });
    assert.equal(r.status, 201);
    id = r.body.data.id;
    assert.equal(r.body.data.status, "not_started");
    const d = await call(ANALYST, "GET", `/api/assessments/${id}`);
    questions = d.body.data.questions;
    assert.equal(questions.length, 20);
  });
  test("cannot submit with unanswered questions", async () => {
    const r = await call(ANALYST, "POST", `/api/assessments/${id}/submit`);
    assert.equal(r.status, 400);
    assert.match(r.body.error, /unanswered/);
  });
  test("answers are scored with weights and N/A excluded", async () => {
    const answers = questions.map((q, i) => ({ question_id: q.id, answer: i === 0 ? "na" : i % 4 === 1 ? "no" : i % 4 === 2 ? "partial" : "yes" }));
    const r = await call(ANALYST, "PUT", `/api/assessments/${id}/answers`, { answers });
    assert.equal(r.status, 200);
    assert.equal(r.body.data.status, "in_progress");
    let num = 0, den = 0;
    questions.forEach((q, i) => { if (i === 0) return; const s = i % 4 === 1 ? 0 : i % 4 === 2 ? 0.5 : 1; num += s * q.weight; den += q.weight; });
    assert.equal(r.body.data.score, Math.round((num / den) * 1000) / 10);
  });
  test("submit → review complete updates vendor residual risk and next review", async () => {
    const before = (await call(ADMIN, "GET", "/api/vendors/1")).body.data;
    const s = await call(ANALYST, "POST", `/api/assessments/${id}/submit`);
    assert.equal(s.status, 200);
    assert.equal(s.body.data.status, "submitted");
    const locked = await call(ANALYST, "POST", `/api/assessments/${id}/submit`);
    assert.equal(locked.status, 400);
    const c = await call(ADMIN, "POST", `/api/assessments/${id}/review`, { decision: "complete", summary: "Done" });
    assert.equal(c.status, 200);
    assert.equal(c.body.data.status, "completed");
    const after = (await call(ADMIN, "GET", "/api/vendors/1")).body.data;
    assert.ok(after.next_review_date > "2027-01-01");
    assert.notEqual(after.updated_at, before.updated_at);
    const edit = await call(ANALYST, "PUT", `/api/assessments/${id}/answers`, { answers: [{ question_id: questions[0].id, answer: "yes" }] });
    assert.equal(edit.status, 400);
  });
});

describe("findings and risk acceptance", () => {
  let fid: number;
  let approvalId: number;
  test("raising a critical finding increases residual risk", async () => {
    const before = (await call(ADMIN, "GET", "/api/vendors/2")).body.data.residual_risk;
    const r = await call(ANALYST, "POST", "/api/findings", { vendor_id: 2, title: "Test critical gap", severity: "critical", owner_id: 6, due_date: "2026-12-01" });
    assert.equal(r.status, 201);
    fid = r.body.data.id;
    const after = (await call(ADMIN, "GET", "/api/vendors/2")).body.data.residual_risk;
    assert.ok(after > before);
  });
  test("non-admin cannot set risk_accepted directly", async () => {
    const r = await call(OWNER, "PATCH", `/api/findings/${fid}`, { status: "risk_accepted" });
    assert.equal(r.status, 400);
  });
  test("risk acceptance request → admin approval → finding accepted", async () => {
    const short = await call(OWNER, "POST", `/api/findings/${fid}/request-risk-acceptance`, { justification: "too short" });
    assert.equal(short.status, 400);
    const r = await call(OWNER, "POST", `/api/findings/${fid}/request-risk-acceptance`, { justification: "Compensating controls in place; vendor remediation next quarter." });
    assert.equal(r.status, 200);
    approvalId = r.body.approval_id;
    const analystTry = await call(ANALYST, "POST", `/api/approvals/${approvalId}/decide`, { decision: "approved" });
    assert.equal(analystTry.status, 403);
    const ok = await call(ADMIN, "POST", `/api/approvals/${approvalId}/decide`, { decision: "approved", comment: "Accepted for 6 months" });
    assert.equal(ok.status, 200);
    const f = await call(ADMIN, "GET", `/api/findings/${fid}`);
    assert.equal(f.body.data.status, "risk_accepted");
    assert.ok(f.body.data.resolved_at);
  });
  test("closing clears resolved_at on reopen", async () => {
    await call(ADMIN, "PATCH", `/api/findings/${fid}`, { status: "open" });
    const f = await call(ADMIN, "GET", `/api/findings/${fid}`);
    assert.equal(f.body.data.resolved_at, null);
  });
});

describe("contracts", () => {
  let cid: number;
  test("create assigns a contract number and submit routes to procurement", async () => {
    const r = await call(PROC, "POST", "/api/contracts", { vendor_id: 3, title: "Test SOW", type: "sow", value: 120000, start_date: "2026-11-01", end_date: "2027-10-31" });
    assert.equal(r.status, 201);
    cid = r.body.data.id;
    assert.match(r.body.data.contract_number, /^CTR-\d{4}-\d{4}$/);
    const s = await call(PROC, "POST", `/api/contracts/${cid}/submit-for-approval`);
    assert.equal(s.status, 200);
    assert.equal(s.body.data.status, "in_review");
    const a = await call(ADMIN, "GET", `/api/approvals/${s.body.approval_id}`);
    assert.equal(a.body.data.type, "contract");
    assert.equal(a.body.data.entity.title, "Test SOW");
    const dec = await call(ADMIN, "POST", `/api/approvals/${s.body.approval_id}/decide`, { decision: "approved" });
    assert.equal(dec.status, 200);
    const c = await call(ADMIN, "GET", `/api/contracts/${cid}`);
    assert.equal(c.body.data.status, "active");
  });
  test("obligations CRUD", async () => {
    const o = await call(PROC, "POST", `/api/contracts/${cid}/obligations`, { description: "Deliver SOC 2", due_date: "2027-01-31" });
    assert.equal(o.status, 201);
    const u = await call(PROC, "PATCH", `/api/contracts/${cid}/obligations/${o.body.data.id}`, { status: "met" });
    assert.equal(u.body.data.status, "met");
    const d = await call(PROC, "DELETE", `/api/contracts/${cid}/obligations/${o.body.data.id}`);
    assert.equal(d.status, 200);
  });
  test("expiring filter", async () => {
    const r = await call(ADMIN, "GET", "/api/contracts?expiring_within=90&limit=100");
    for (const c of r.body.data) assert.ok(c.days_to_end <= 90 && c.days_to_end >= 0);
  });
});

describe("documents, comments, search, dashboard", () => {
  test("document statuses derive from expiry", async () => {
    const r = await call(ANALYST, "POST", "/api/documents", { vendor_id: 1, name: "Old cert", type: "iso27001", status: "valid", expiry_date: "2025-01-01" });
    assert.equal(r.status, 201);
    assert.equal(r.body.data.status, "expired");
    const soon = await call(ANALYST, "POST", "/api/documents", { vendor_id: 1, name: "Soon cert", type: "soc2", status: "valid", expiry_date: new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10) });
    assert.equal(soon.body.data.status, "expiring");
  });
  test("comments are scoped and deletable by author only", async () => {
    const c = await call(OWNER, "POST", "/api/comments", { entity_type: "finding", entity_id: 1, body: "Hello" });
    assert.equal(c.status, 201);
    const list = await call(ANALYST, "GET", "/api/comments?entity_type=finding&entity_id=1");
    assert.ok(list.body.data.some((x: any) => x.id === c.body.data.id));
    assert.equal((await call(ANALYST, "DELETE", `/api/comments/${c.body.data.id}`)).status, 403);
    assert.equal((await call(OWNER, "DELETE", `/api/comments/${c.body.data.id}`)).status, 200);
  });
  test("search returns typed hits", async () => {
    const r = await call(ADMIN, "GET", "/api/search?q=nimbus");
    assert.ok(r.body.data.some((h: any) => h.type === "vendor" && h.title === "Nimbus Cloud Services"));
  });
  test("dashboard and reports payloads", async () => {
    const d = await call(ADMIN, "GET", "/api/dashboard");
    assert.ok(d.body.data.kpis.vendors_total > 30);
    assert.ok(Array.isArray(d.body.data.top_risk_vendors));
    const r = await call(AUDITOR, "GET", "/api/reports");
    assert.ok(r.body.data.risk_by_category.length > 5);
  });
  test("activity log filters", async () => {
    const r = await call(AUDITOR, "GET", "/api/activity?entity_type=approval&action=approve");
    assert.ok(r.body.total >= 2);
    for (const a of r.body.data) assert.equal(a.action, "approve");
  });
});

describe("hardening", () => {
  test("non-admin cannot bypass onboarding approval via status", async () => {
    const r = await call(OWNER, "POST", "/api/vendors", { name: "Bypass Co", category: "SaaS", status: "active" });
    assert.equal(r.status, 403);
    const v = await call(OWNER, "POST", "/api/vendors", { name: "Bypass Co", category: "SaaS" });
    const p = await call(OWNER, "PATCH", `/api/vendors/${v.body.data.id}`, { status: "active" });
    assert.equal(p.status, 403);
    const c = await call(OWNER, "POST", "/api/contracts", { vendor_id: v.body.data.id, title: "Sneaky", type: "msa", status: "active" });
    assert.equal(c.status, 403);
  });
  test("input validation rejects bad shapes with 400", async () => {
    assert.equal((await call(ADMIN, "POST", "/api/vendors", { name: "   ", category: "SaaS" })).status, 400);
    assert.equal((await call(ADMIN, "POST", "/api/vendors", { name: "X".repeat(500), category: "SaaS" })).status, 400);
    assert.equal((await call(ADMIN, "POST", "/api/vendors", { name: "Cat", category: "Not a category" })).status, 400);
    assert.equal((await call(ADMIN, "POST", "/api/vendors", { name: "Web", category: "SaaS", website: "javascript:alert(1)" })).status, 400);
    assert.equal((await call(ADMIN, "POST", "/api/vendors", { name: "Spend", category: "SaaS", annual_spend: 1e308 })).status, 400);
    assert.equal((await call(ADMIN, "POST", "/api/contracts", { vendor_id: 1, title: "Dates", type: "msa", start_date: "2027-01-01", end_date: "2026-01-01" })).status, 400);
    assert.equal((await call(ADMIN, "POST", "/api/documents", { vendor_id: 1, name: "Doc", type: "soc2", issued_date: "2026-05-01", expiry_date: "2026-04-01" })).status, 400);
    assert.equal((await call(ADMIN, "POST", "/api/comments", { entity_type: "vendor", entity_id: 999999, body: "ghost" })).status, 404);
    const s = await call(ADMIN, "PUT", "/api/settings", { unknown_key: 1 });
    assert.equal(s.status, 400);
  });
  test("malformed and oversized bodies return 4xx", async () => {
    const token = await login(ADMIN);
    const bad = await fetch(`${base}/api/vendors`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: "{not json" });
    assert.equal(bad.status, 400);
    const big = await fetch(`${base}/api/vendors`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ name: "x".repeat(2_000_000), category: "SaaS" }) });
    assert.equal(big.status, 413);
    const huge = await call(ADMIN, "GET", "/api/vendors?page=99999999999999999999");
    assert.equal(huge.status, 200);
  });
  test("deleting a vendor cancels its pending approvals", async () => {
    const v = await call(PROC, "POST", "/api/vendors", { name: "Doomed Vendor", category: "SaaS" });
    const s = await call(PROC, "POST", `/api/vendors/${v.body.data.id}/submit-onboarding`);
    assert.equal((await call(ADMIN, "DELETE", `/api/vendors/${v.body.data.id}`)).status, 200);
    const a = await call(ADMIN, "GET", `/api/approvals/${s.body.approval_id}`);
    assert.equal(a.body.data.status, "cancelled");
  });
  test("csv export neutralises formula injection", async () => {
    await call(ADMIN, "POST", "/api/vendors", { name: "=HYPERLINK(\"http://evil\")", category: "SaaS" });
    const token = await login(ADMIN);
    const text = await (await fetch(`${base}/api/vendors?format=csv&q=HYPERLINK`, { headers: { authorization: `Bearer ${token}` } })).text();
    assert.ok(text.includes("'=HYPERLINK"));
  });
  test("login throttling and bearer logout", async () => {
    for (let i = 0; i < 10; i++) await fetch(`${base}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "throttle@meridian.example", password: "nope" }) });
    const r = await fetch(`${base}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "throttle@meridian.example", password: "nope" }) });
    assert.equal(r.status, 429);
    const tok = (await (await fetch(`${base}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: OWNER, password: "Meridian!2026" }) })).json() as any).token;
    await fetch(`${base}/api/auth/logout`, { method: "POST", headers: { authorization: `Bearer ${tok}` } });
    const me = await fetch(`${base}/api/auth/me`, { headers: { authorization: `Bearer ${tok}` } });
    assert.equal(me.status, 401);
  });
});
