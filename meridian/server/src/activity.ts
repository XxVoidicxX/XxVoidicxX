import { insert, all, get } from "./db.js";

export function logActivity(actorId: number | null, action: string, entityType: string, entityId: number | null, summary: string, metadata?: unknown) {
  insert("activity_log", {
    actor_id: actorId,
    action,
    entity_type: entityType,
    entity_id: entityId,
    summary,
    metadata: metadata ? JSON.stringify(metadata) : null,
  });
}

export function notify(userId: number | null | undefined, title: string, body: string, link?: string) {
  if (!userId) return;
  insert("notifications", { user_id: userId, title, body, link: link ?? null });
}

export function notifyRole(role: string, title: string, body: string, link?: string) {
  const users = all<{ id: number }>("SELECT id FROM users WHERE role = ? AND active = 1", role);
  for (const u of users) notify(u.id, title, body, link);
}

const SETTING_DEFAULTS: Record<string, unknown> = {
  org_name: "Meridian Corp",
  review_cadence_months: { critical: 6, high: 12, medium: 24, low: 36 },
  document_expiry_warning_days: 45,
  contract_renewal_notice_days: 60,
  risk_thresholds: { low: 85, medium: 70, high: 50 },
};
export function setting<T = unknown>(key: string): T {
  const row = get<{ value: string }>("SELECT value FROM settings WHERE key = ?", key);
  return (row ? JSON.parse(row.value) : SETTING_DEFAULTS[key]) as T;
}
export function nextReviewDate(tier: string, from = new Date()): string {
  const cadence = setting<Record<string, number>>("review_cadence_months");
  const d = new Date(from);
  d.setMonth(d.getMonth() + (cadence[tier] ?? 12));
  return d.toISOString().slice(0, 10);
}
