import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageSquare, Send, Trash2 } from "lucide-react";
import { Avatar, Badge, Button, Card, CardHeader, Skeleton, Textarea } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { LABELS, fmtDateTime, fmtRelative } from "@/lib/format";
import type { Comment } from "@/lib/types";

export function CommentsThread({ entityType, entityId, description }: { entityType: string; entityId: number; description?: string }) {
  const { user, canWrite } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [body, setBody] = useState("");
  const key = ["comments", entityType, entityId];
  const q = useQuery({ queryKey: key, queryFn: () => api.get<{ data: Comment[] }>(`/api/comments?entity_type=${entityType}&entity_id=${entityId}`).then((r) => r.data) });
  const refresh = () => { qc.invalidateQueries({ queryKey: key }); qc.invalidateQueries({ queryKey: ["activity"] }); };
  const add = useMutation({
    mutationFn: () => api.post<{ data: Comment }>("/api/comments", { entity_type: entityType, entity_id: entityId, body: body.trim() }),
    onSuccess: () => { setBody(""); refresh(); toast("success", "Comment posted"); },
    onError: (e) => toast("error", "Could not post comment", e instanceof ApiError ? e.message : undefined),
  });
  const del = useMutation({
    mutationFn: (id: number) => api.delete(`/api/comments/${id}`),
    onSuccess: () => { refresh(); toast("success", "Comment deleted"); },
    onError: (e) => toast("error", "Could not delete comment", e instanceof ApiError ? e.message : undefined),
  });
  const comments = q.data ?? [];

  return (
    <Card>
      <CardHeader title={<span className="inline-flex items-center gap-2">Discussion {comments.length > 0 && <Badge size="xs">{comments.length}</Badge>}</span>} description={description} />
      {q.isLoading ? (
        <div className="space-y-3">{[0, 1].map((i) => <Skeleton key={i} className="h-14" />)}</div>
      ) : comments.length === 0 ? (
        <div className="flex items-center gap-3 rounded-lg border border-dashed border-ink-200 px-4 py-3.5 text-sm text-ink-500"><MessageSquare className="h-4 w-4 text-ink-400 shrink-0" />{canWrite ? "No comments yet. Ask a question or add context for the approver." : "No one has commented on this request."}</div>
      ) : (
        <ul className="space-y-4">
          {comments.map((c) => {
            const mine = c.author_id === user?.id;
            const canDelete = canWrite && (mine || user?.role === "admin");
            return (
              <li key={c.id} className="group flex gap-3">
                <Avatar name={c.author_name} size="sm" className="mt-0.5" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className="text-sm font-medium text-ink-900">{c.author_name}</span>
                    {c.author_role && <span className="text-xs text-ink-500">{LABELS.role[c.author_role]}</span>}
                    <span className="text-xs text-ink-400" title={fmtDateTime(c.created_at)}>· {fmtRelative(c.created_at)}</span>
                    {canDelete && (
                      <button onClick={() => del.mutate(c.id)} disabled={del.isPending} className="ml-auto text-ink-400 hover:text-danger-600 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity rounded p-0.5 focus-ring" aria-label="Delete comment" title="Delete comment">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  <p className="text-sm text-ink-700 mt-1 whitespace-pre-wrap break-words">{c.body}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {canWrite ? (
        <form className="mt-5 pt-4 border-t border-ink-100" onSubmit={(e) => { e.preventDefault(); if (body.trim()) add.mutate(); }}>
          <div className="flex gap-3">
            <Avatar name={user?.name} size="sm" className="mt-1" />
            <div className="flex-1">
              <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write a comment…" rows={3} maxLength={4000} onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && body.trim()) add.mutate(); }} aria-label="New comment" />
              <div className="flex items-center justify-between mt-2">
                <span className="text-xs text-ink-400">Ctrl + Enter to post</span>
                <Button type="submit" size="sm" icon={Send} loading={add.isPending} disabled={!body.trim()}>Comment</Button>
              </div>
            </div>
          </div>
        </form>
      ) : (
        <p className="mt-4 pt-3 border-t border-ink-100 text-xs text-ink-500">You have read-only access and cannot comment.</p>
      )}
    </Card>
  );
}
