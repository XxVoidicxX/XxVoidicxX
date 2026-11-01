import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity as ActivityIcon, AlertTriangle, CheckCircle2, CircleDot, Edit3, Eye, MessageSquare, PlusCircle, RotateCcw, Send, ShieldCheck, Trash2, XCircle, type LucideIcon } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { daysUntil, fmtDate, fmtDateTime, fmtRelative, LABELS, parseDate, TONES, type Tone } from "@/lib/format";
import type { Activity, Answer, Comment, Tier, User } from "@/lib/types";
import { Avatar, Badge, Button, cn, EmptyState, Skeleton, Textarea } from "@/components/ui";
import { useToast } from "@/components/ui/toast";

export const ANSWER_VALUE: Record<Answer, number | null> = { yes: 1, partial: 0.5, no: 0, na: null };

export function scoreAnswers(items: { weight: number; answer: Answer | null | undefined }[]): number | null {
  let num = 0;
  let den = 0;
  for (const it of items) {
    if (!it.answer) continue;
    const v = ANSWER_VALUE[it.answer];
    if (v == null) continue;
    num += v * it.weight;
    den += it.weight;
  }
  if (!den) return null;
  return Math.round((num / den) * 1000) / 10;
}

export function ratingFromScore(score: number | null | undefined): Tier | null {
  if (score == null) return null;
  if (score >= 85) return "low";
  if (score >= 70) return "medium";
  if (score >= 50) return "high";
  return "critical";
}

export const RATING_TEXT: Record<Tier, string> = { low: "text-success-700", medium: "text-sky-700", high: "text-warning-700", critical: "text-danger-700" };
export const RATING_STROKE: Record<Tier, string> = { low: "stroke-success-600", medium: "stroke-sky-500", high: "stroke-warning-600", critical: "stroke-danger-600" };
export const RATING_BG: Record<Tier, string> = { low: "bg-success-600", medium: "bg-sky-500", high: "bg-warning-600", critical: "bg-danger-600" };
export const RATING_LABEL: Record<Tier, string> = { low: "Low risk", medium: "Medium risk", high: "High risk", critical: "Critical risk" };

export function fmtScore(score: number | null | undefined): string {
  if (score == null) return "—";
  return Number.isInteger(score) ? String(score) : score.toFixed(1);
}

export function ProgressBar({ value, max, className, barClassName, size = "sm" }: { value: number; max: number; className?: string; barClassName?: string; size?: "xs" | "sm" | "md" }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  const done = max > 0 && value >= max;
  return (
    <span className={cn("block rounded-full bg-ink-100 overflow-hidden", size === "xs" ? "h-1" : size === "md" ? "h-2.5" : "h-1.5", className)} role="progressbar" aria-valuemin={0} aria-valuemax={max} aria-valuenow={value}>
      <span className={cn("block h-full rounded-full transition-[width] duration-300", barClassName ?? (done ? "bg-success-600" : "bg-brand-500"))} style={{ width: `${pct}%` }} />
    </span>
  );
}

export function ProgressRing({ pct, size = 96, stroke = 8, strokeClassName = "stroke-brand-600", children }: { pct: number; size?: number; stroke?: number; strokeClassName?: string; children?: ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.min(100, Math.max(0, pct));
  return (
    <div className="relative inline-flex items-center justify-center shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} className="fill-none stroke-ink-100" />
        <circle cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} strokeLinecap="round" className={cn("fill-none transition-[stroke-dashoffset] duration-500", strokeClassName)} strokeDasharray={c} strokeDashoffset={c * (1 - clamped / 100)} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>
    </div>
  );
}

export interface ChipOption<T extends string> { id: T; label: string; count?: number | null }
export function QuickChips<T extends string>({ options, value, onChange }: { options: ChipOption<T>[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="radiogroup">
      {options.map((o) => {
        const active = o.id === value;
        return (
          <button key={o.id} type="button" role="radio" aria-checked={active} onClick={() => onChange(o.id)} className={cn("inline-flex items-center gap-1.5 h-7 rounded-full px-3 text-xs font-medium border transition-colors focus-ring", active ? "bg-brand-600 border-brand-600 text-white shadow-sm" : "bg-white border-ink-200 text-ink-600 hover:border-ink-300 hover:text-ink-900")}>
            {o.label}
            {o.count != null && <span className={cn("rounded-full px-1.5 text-[10px] font-semibold tnum", active ? "bg-white/20 text-white" : "bg-ink-100 text-ink-600")}>{o.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function DueCell({ date, resolved, compact }: { date: string | null | undefined; resolved?: boolean; compact?: boolean }) {
  const d = daysUntil(date);
  if (!date || d == null) return <span className="text-ink-400">—</span>;
  const overdue = !resolved && d < 0;
  const soon = !resolved && d >= 0 && d <= 7;
  return (
    <div className="leading-tight whitespace-nowrap">
      <div className={cn("tnum", overdue ? "text-danger-700 font-medium" : "text-ink-800")}>{fmtDate(date)}</div>
      {!compact && !resolved && (
        <div className={cn("text-xs tnum mt-0.5", overdue ? "text-danger-600" : soon ? "text-warning-700" : "text-ink-500")}>
          {overdue ? `${Math.abs(d)}d overdue` : d === 0 ? "Due today" : `in ${d}d`}
        </div>
      )}
    </div>
  );
}

export function slaInfo(date: string | null | undefined, resolvedAt?: string | null, createdAt?: string | null, status?: string): { tone: Tone; label: string } {
  if (status === "risk_accepted") return { tone: "info", label: resolvedAt ? `Risk accepted on ${fmtDate(resolvedAt)}` : "Risk accepted" };
  if (resolvedAt) {
    const c = parseDate(createdAt);
    const r = parseDate(resolvedAt);
    const days = c && r ? Math.max(0, Math.round((r.getTime() - c.getTime()) / 86_400_000)) : null;
    return { tone: "success", label: days != null ? `Resolved in ${days}d` : "Resolved" };
  }
  const d = daysUntil(date);
  if (d == null) return { tone: "neutral", label: "No due date" };
  if (d < 0) return { tone: "danger", label: `${Math.abs(d)}d overdue` };
  if (d === 0) return { tone: "warning", label: "Due today" };
  if (d <= 7) return { tone: "warning", label: `Due in ${d}d` };
  return { tone: "neutral", label: `Due in ${d}d` };
}

export function UserCell({ name, sub }: { name: string | null | undefined; sub?: ReactNode }) {
  if (!name) return <span className="text-ink-400">Unassigned</span>;
  return (
    <span className="inline-flex items-center gap-2 min-w-0">
      <Avatar name={name} size="sm" />
      <span className="min-w-0">
        <span className="block truncate text-ink-800">{name}</span>
        {sub && <span className="block text-xs text-ink-500 truncate">{sub}</span>}
      </span>
    </span>
  );
}

export function useWritableUsers(users: User[] | undefined) {
  return useMemo(() => (users ?? []).filter((u) => u.active && u.role !== "auditor").sort((a, b) => a.name.localeCompare(b.name)), [users]);
}

export function useDebouncedSearch(urlValue: string, onCommit: (v: string) => void, ms = 300) {
  const [value, setValue] = useState(urlValue);
  const commitRef = useRef(onCommit);
  commitRef.current = onCommit;
  const lastCommitted = useRef(urlValue);
  useEffect(() => {
    if (urlValue !== lastCommitted.current) {
      lastCommitted.current = urlValue;
      setValue(urlValue);
    }
  }, [urlValue]);
  useEffect(() => {
    if (value === lastCommitted.current) return;
    const t = setTimeout(() => { lastCommitted.current = value; commitRef.current(value); }, ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return [value, setValue] as const;
}

export function useCount(key: string, endpoint: string, params: Record<string, string | number | undefined>) {
  return useQuery({
    queryKey: [key, "count", params],
    queryFn: () => {
      const sp = new URLSearchParams();
      for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") sp.set(k, String(v));
      sp.set("limit", "1");
      return api.get<{ total: number }>(`${endpoint}?${sp.toString()}`).then((r) => r.total);
    },
  });
}

const ACTION_META: Record<string, { icon: LucideIcon; cls: string }> = {
  create: { icon: PlusCircle, cls: "bg-brand-50 text-brand-600 ring-brand-200" },
  update: { icon: Edit3, cls: "bg-ink-100 text-ink-600 ring-ink-200" },
  submit: { icon: Send, cls: "bg-brand-50 text-brand-600 ring-brand-200" },
  complete: { icon: CheckCircle2, cls: "bg-success-50 text-success-600 ring-emerald-200" },
  approve: { icon: ShieldCheck, cls: "bg-success-50 text-success-600 ring-emerald-200" },
  reject: { icon: XCircle, cls: "bg-danger-50 text-danger-600 ring-red-200" },
  review: { icon: Eye, cls: "bg-brand-50 text-brand-600 ring-brand-200" },
  return: { icon: RotateCcw, cls: "bg-warning-50 text-warning-600 ring-amber-200" },
  status_change: { icon: CircleDot, cls: "bg-warning-50 text-warning-600 ring-amber-200" },
  comment: { icon: MessageSquare, cls: "bg-sky-50 text-sky-600 ring-sky-200" },
};

export function ActivityTimeline({ items, loading, emptyText = "No activity recorded yet." }: { items: Activity[] | undefined; loading?: boolean; emptyText?: string }) {
  if (loading) return <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-10" />)}</div>;
  if (!items?.length) return <EmptyState icon={ActivityIcon} title="No activity" description={emptyText} className="py-8" />;
  const sorted = [...items].sort((x, y) => (y.created_at === x.created_at ? y.id - x.id : y.created_at < x.created_at ? -1 : 1));
  return (
    <ol className="relative">
      {sorted.map((a, i) => {
        const meta = ACTION_META[a.action] ?? { icon: AlertTriangle, cls: "bg-ink-100 text-ink-500 ring-ink-200" };
        const Icon = meta.icon;
        return (
          <li key={a.id} className="relative flex gap-3 pb-4 last:pb-0">
            {i < sorted.length - 1 && <span className="absolute left-[13px] top-7 bottom-0 w-px bg-ink-200" aria-hidden />}
            <span className={cn("relative z-10 h-7 w-7 rounded-full ring-1 ring-inset flex items-center justify-center shrink-0", meta.cls)}><Icon className="h-3.5 w-3.5" /></span>
            <div className="min-w-0 pt-0.5">
              <p className="text-sm text-ink-800 break-words">{a.summary}</p>
              <p className="text-xs text-ink-500 mt-0.5"><span className="font-medium text-ink-600">{a.actor_name ?? "System"}</span> · <span title={fmtDateTime(a.created_at)}>{fmtRelative(a.created_at)}</span></p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function CommentsThread({ entityType, entityId, onChange }: { entityType: "assessment" | "finding"; entityId: number; onChange?: () => void }) {
  const { user, canWrite, can } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const key = ["comments", entityType, entityId];
  const [body, setBody] = useState("");
  const q = useQuery({ queryKey: key, queryFn: () => api.get<{ data: Comment[] }>(`/api/comments?entity_type=${entityType}&entity_id=${entityId}`).then((r) => r.data) });
  const add = useMutation({
    mutationFn: (text: string) => api.post<{ data: Comment }>("/api/comments", { entity_type: entityType, entity_id: entityId, body: text }),
    onSuccess: () => { setBody(""); qc.invalidateQueries({ queryKey: key }); onChange?.(); toast("success", "Comment posted"); },
    onError: (e: Error) => toast("error", "Could not post comment", e.message),
  });
  const del = useMutation({
    mutationFn: (id: number) => api.delete(`/api/comments/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: key }); onChange?.(); toast("success", "Comment deleted"); },
    onError: (e: Error) => toast("error", "Could not delete comment", e.message),
  });
  const submit = () => { const t = body.trim(); if (t) add.mutate(t); };
  return (
    <div>
      {q.isLoading ? (
        <div className="space-y-3">{[0, 1].map((i) => <Skeleton key={i} className="h-14" />)}</div>
      ) : !q.data?.length ? (
        <EmptyState icon={MessageSquare} title="No comments yet" description={canWrite ? "Start the conversation — comments are visible to everyone with access." : "Nobody has commented yet."} className="py-8" />
      ) : (
        <ul className="space-y-4">
          {q.data.map((c) => {
            const mine = c.author_id === user?.id;
            return (
              <li key={c.id} className="group flex gap-3">
                <Avatar name={c.author_name} size="md" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-ink-900">{c.author_name}</span>
                    {c.author_role && <span className="text-xs text-ink-500">{LABELS.role[c.author_role]}</span>}
                    <span className="text-xs text-ink-400" title={fmtDateTime(c.created_at)}>{fmtRelative(c.created_at)}</span>
                    {(mine || can("admin")) && canWrite && (
                      <button type="button" onClick={() => del.mutate(c.id)} disabled={del.isPending} className="ml-auto opacity-0 group-hover:opacity-100 focus:opacity-100 text-ink-400 hover:text-danger-600 transition-opacity rounded p-0.5 focus-ring" aria-label="Delete comment"><Trash2 className="h-3.5 w-3.5" /></button>
                    )}
                  </div>
                  <div className="mt-1 rounded-lg rounded-tl-sm bg-ink-50 border border-ink-100 px-3 py-2 text-sm text-ink-800 whitespace-pre-wrap break-words">{c.body}</div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {canWrite && (
        <div className="mt-5 flex gap-3">
          <Avatar name={user?.name} size="md" />
          <div className="flex-1 min-w-0">
            <Textarea aria-label="Add a comment" value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write a comment…" rows={3} maxLength={4000} onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); submit(); } }} />
            <div className="mt-2 flex items-center justify-between gap-3">
              <span className="text-xs text-ink-400">Ctrl/⌘ + Enter to post</span>
              <Button size="sm" icon={Send} onClick={submit} loading={add.isPending} disabled={!body.trim()}>Comment</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function NotFoundState({ what, backTo, backLabel }: { what: string; backTo: string; backLabel: string }) {
  return (
    <div className="bg-white rounded-[var(--radius-card)] border border-ink-200 shadow-card">
      <EmptyState icon={AlertTriangle} title={`${what} not found`} description={`This ${what.toLowerCase()} may have been deleted, or the link is incorrect.`} action={<Link to={backTo}><Button variant="secondary">{backLabel}</Button></Link>} className="py-20" />
    </div>
  );
}

export function TierBadge({ tier, size = "sm", suffix }: { tier: Tier | null | undefined; size?: "xs" | "sm"; suffix?: string }) {
  if (!tier) return <span className="text-ink-400">—</span>;
  return <Badge tone={TONES.tier[tier]} size={size}>{LABELS.tier[tier]}{suffix ? ` ${suffix}` : ""}</Badge>;
}

const QUESTION_REF = /^Q(\d+) \(([^)\n]*)\):\s*/;
export function questionRefPrefix(n: number, section: string): string {
  return `Q${n} (${section}): `;
}
export function parseQuestionRef(description: string | null | undefined): { n: number; section: string } | null {
  const m = QUESTION_REF.exec(description ?? "");
  return m ? { n: Number(m[1]), section: m[2] } : null;
}
