import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = process.env.MERIDIAN_DATA_DIR || path.resolve(__dirname, "../data");
fs.mkdirSync(dataDir, { recursive: true });
export const DB_PATH = process.env.MERIDIAN_DB === ":memory:" ? ":memory:" : path.join(dataDir, process.env.MERIDIAN_DB || "meridian.db");

export const db = new DatabaseSync(DB_PATH);
db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','risk_analyst','procurement','vendor_owner','auditor')),
  department TEXT,
  title TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS vendors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  legal_name TEXT,
  category TEXT NOT NULL,
  website TEXT,
  country TEXT,
  status TEXT NOT NULL DEFAULT 'prospect' CHECK (status IN ('prospect','onboarding','active','under_review','offboarding','terminated')),
  tier TEXT NOT NULL DEFAULT 'medium' CHECK (tier IN ('critical','high','medium','low')),
  inherent_risk INTEGER NOT NULL DEFAULT 50,
  residual_risk INTEGER NOT NULL DEFAULT 50,
  data_access TEXT NOT NULL DEFAULT 'internal' CHECK (data_access IN ('none','internal','confidential','restricted')),
  annual_spend REAL NOT NULL DEFAULT 0,
  owner_id INTEGER REFERENCES users(id),
  description TEXT,
  services TEXT,
  next_review_date TEXT,
  onboarded_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS vendor_contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vendor_id INTEGER NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  role TEXT,
  is_primary INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS contracts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vendor_id INTEGER NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  contract_number TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL CHECK (type IN ('msa','sow','nda','dpa','saas','license','services')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','in_review','active','expiring','expired','terminated')),
  value REAL NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  start_date TEXT,
  end_date TEXT,
  auto_renew INTEGER NOT NULL DEFAULT 0,
  renewal_notice_days INTEGER NOT NULL DEFAULT 60,
  owner_id INTEGER REFERENCES users(id),
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS contract_obligations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contract_id INTEGER NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  due_date TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','met','missed','waived')),
  owner_id INTEGER REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS assessment_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  framework TEXT,
  version TEXT NOT NULL DEFAULT '1.0',
  active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS template_questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  template_id INTEGER NOT NULL REFERENCES assessment_templates(id) ON DELETE CASCADE,
  section TEXT NOT NULL,
  text TEXT NOT NULL,
  guidance TEXT,
  weight INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS assessments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vendor_id INTEGER NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  template_id INTEGER NOT NULL REFERENCES assessment_templates(id),
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started','in_progress','submitted','under_review','completed')),
  assigned_to INTEGER REFERENCES users(id),
  reviewer_id INTEGER REFERENCES users(id),
  due_date TEXT,
  score REAL,
  risk_rating TEXT CHECK (risk_rating IN ('critical','high','medium','low') OR risk_rating IS NULL),
  summary TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  submitted_at TEXT,
  completed_at TEXT
);
CREATE TABLE IF NOT EXISTS assessment_answers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  assessment_id INTEGER NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  question_id INTEGER NOT NULL REFERENCES template_questions(id) ON DELETE CASCADE,
  answer TEXT CHECK (answer IN ('yes','partial','no','na') OR answer IS NULL),
  note TEXT,
  UNIQUE (assessment_id, question_id)
);
CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vendor_id INTEGER NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  contract_id INTEGER REFERENCES contracts(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('soc2','iso27001','insurance','pen_test','dpa','financial','policy','other')),
  status TEXT NOT NULL DEFAULT 'valid' CHECK (status IN ('valid','expiring','expired','pending_review','rejected')),
  issued_date TEXT,
  expiry_date TEXT,
  file_name TEXT,
  file_size INTEGER NOT NULL DEFAULT 0,
  uploaded_by INTEGER REFERENCES users(id),
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS findings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vendor_id INTEGER NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  assessment_id INTEGER REFERENCES assessments(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  severity TEXT NOT NULL CHECK (severity IN ('critical','high','medium','low')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_remediation','risk_accepted','closed')),
  owner_id INTEGER REFERENCES users(id),
  due_date TEXT,
  remediation_plan TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at TEXT
);
CREATE TABLE IF NOT EXISTS approvals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL CHECK (type IN ('vendor_onboarding','contract','risk_acceptance','offboarding','document')),
  entity_type TEXT NOT NULL,
  entity_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  requested_by INTEGER NOT NULL REFERENCES users(id),
  approver_id INTEGER REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','cancelled')),
  comment TEXT,
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  decided_at TEXT
);
CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL,
  entity_id INTEGER NOT NULL,
  author_id INTEGER NOT NULL REFERENCES users(id),
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS activity_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id INTEGER REFERENCES users(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id INTEGER,
  summary TEXT NOT NULL,
  metadata TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,
  read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_contracts_vendor ON contracts(vendor_id);
CREATE INDEX IF NOT EXISTS idx_assessments_vendor ON assessments(vendor_id);
CREATE INDEX IF NOT EXISTS idx_documents_vendor ON documents(vendor_id);
CREATE INDEX IF NOT EXISTS idx_findings_vendor ON findings(vendor_id);
CREATE INDEX IF NOT EXISTS idx_activity_entity ON activity_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read);
CREATE INDEX IF NOT EXISTS idx_comments_entity ON comments(entity_type, entity_id);
`;

export function migrate() {
  db.exec(SCHEMA);
}

type Row = Record<string, unknown>;

export function all<T = Row>(sql: string, ...params: unknown[]): T[] {
  return db.prepare(sql).all(...(params as any[])) as T[];
}
export function get<T = Row>(sql: string, ...params: unknown[]): T | undefined {
  return db.prepare(sql).get(...(params as any[])) as T | undefined;
}
export function run(sql: string, ...params: unknown[]) {
  return db.prepare(sql).run(...(params as any[]));
}
export function insert(table: string, data: Record<string, unknown>): number {
  const keys = Object.keys(data);
  const sql = `INSERT INTO ${table} (${keys.join(",")}) VALUES (${keys.map(() => "?").join(",")})`;
  const res = run(sql, ...keys.map((k) => normalize(data[k])));
  return Number(res.lastInsertRowid);
}
export function update(table: string, id: number, data: Record<string, unknown>) {
  const keys = Object.keys(data).filter((k) => data[k] !== undefined);
  if (!keys.length) return;
  const sql = `UPDATE ${table} SET ${keys.map((k) => `${k} = ?`).join(", ")} WHERE id = ?`;
  run(sql, ...keys.map((k) => normalize(data[k])), id);
}
function normalize(v: unknown) {
  if (typeof v === "boolean") return v ? 1 : 0;
  if (v === undefined) return null;
  return v as any;
}
export function tx<T>(fn: () => T): T {
  db.exec("BEGIN");
  try {
    const r = fn();
    db.exec("COMMIT");
    return r;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
