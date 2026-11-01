import { insert, all } from "./db.js";

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
