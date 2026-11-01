import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import type { Answer, Assessment, TemplateQuestion } from "@/lib/types";

export interface Draft { answer: Answer | null; note: string }
export type SaveState = "idle" | "pending" | "saving" | "saved" | "error";

export function useAnswerAutosave(assessmentId: number, questions: TemplateQuestion[] | undefined, onSaved: (a: Assessment, saved: Record<number, Draft>) => void, onError: (e: Error) => void, delay = 600) {
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const [state, setState] = useState<SaveState>("idle");
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const draftsRef = useRef<Record<number, Draft>>({});
  const dirty = useRef<Set<number>>(new Set());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inflight = useRef<Promise<void> | null>(null);
  const initFor = useRef<number | null>(null);
  const cbs = useRef({ onSaved, onError });
  cbs.current = { onSaved, onError };

  useEffect(() => {
    if (!questions || initFor.current === assessmentId) return;
    initFor.current = assessmentId;
    const map: Record<number, Draft> = {};
    for (const q of questions) map[q.id] = { answer: q.answer ?? null, note: q.note ?? "" };
    draftsRef.current = map;
    dirty.current.clear();
    setDrafts(map);
    setState("idle");
  }, [assessmentId, questions]);

  const flush = useCallback(async (): Promise<boolean> => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    while (inflight.current) await inflight.current;
    if (!dirty.current.size) return true;
    const ids = [...dirty.current];
    dirty.current.clear();
    const snapshot: Record<number, Draft> = {};
    for (const id of ids) snapshot[id] = draftsRef.current[id];
    setState("saving");
    let ok = true;
    const p = api
      .put<{ data: Assessment }>(`/api/assessments/${assessmentId}/answers`, { answers: ids.map((id) => ({ question_id: id, answer: snapshot[id].answer, note: snapshot[id].note })) })
      .then((r) => {
        cbs.current.onSaved(r.data, snapshot);
        setSavedAt(new Date());
        setState(dirty.current.size ? "pending" : "saved");
      })
      .catch((e: Error) => {
        ok = false;
        for (const id of ids) dirty.current.add(id);
        setState("error");
        cbs.current.onError(e);
      })
      .finally(() => { inflight.current = null; });
    inflight.current = p;
    await p;
    return ok;
  }, [assessmentId]);

  const flushRef = useRef(flush);
  flushRef.current = flush;

  const update = useCallback((questionId: number, patch: Partial<Draft>) => {
    const prev = draftsRef.current[questionId] ?? { answer: null, note: "" };
    const next = { ...draftsRef.current, [questionId]: { ...prev, ...patch } };
    draftsRef.current = next;
    setDrafts(next);
    dirty.current.add(questionId);
    setState("pending");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { void flushRef.current(); }, delay);
  }, [delay]);

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirty.current.size || inflight.current) { e.preventDefault(); e.returnValue = ""; }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      if (dirty.current.size) void flushRef.current();
    };
  }, []);

  return { drafts, state, savedAt, update, flush, hasPending: () => dirty.current.size > 0 || !!inflight.current };
}
