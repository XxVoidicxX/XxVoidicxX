import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, ArrowDownToLine, CheckCircle2, ClipboardCheck, Cloud, CloudOff, Eye, Flag, Loader2, Lock, RotateCcw, Send, ShieldAlert } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { fmtDate, fmtRelative, LABELS, TONES } from "@/lib/format";
import type { Assessment, AssessmentDetail, Comment, Finding, TemplateQuestion } from "@/lib/types";
import { Badge, Button, Card, CardHeader, Checkbox, cn, DataTable, EmptyState, Field, Modal, PageHeader, PageLoader, Tabs, Textarea, type Column } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { ActivityTimeline, CommentsThread, DueCell, fmtScore, NotFoundState, parseQuestionRef, ProgressBar, ProgressRing, questionRefPrefix, RATING_LABEL, RATING_STROKE, RATING_TEXT, ratingFromScore, scoreAnswers, TierBadge, UserCell } from "@/components/assessments/common";
import { HeaderActions } from "@/components/contracts/shared";
import { QuestionCard } from "@/components/assessments/QuestionCard";
import { useAnswerAutosave, type Draft, type SaveState } from "@/components/assessments/useAnswerAutosave";
import { FindingFormModal, type FindingFormInitial } from "@/components/findings/FindingFormModal";

type TabId = "findings" | "comments" | "activity";

function SaveIndicator({ state, savedAt, onRetry }: { state: SaveState; savedAt: Date | null; onRetry: () => void }) {
  if (state === "saving" || state === "pending") return <span className="inline-flex items-center gap-1.5 text-xs text-ink-500"><Loader2 className="h-3.5 w-3.5 animate-spin" />Saving…</span>;
  if (state === "error") return <button type="button" onClick={onRetry} className="inline-flex items-center gap-1.5 text-xs font-medium text-danger-700 hover:underline"><CloudOff className="h-3.5 w-3.5" />Not saved · Retry</button>;
  if (state === "saved") return <span className="inline-flex items-center gap-1.5 text-xs text-success-700" title={savedAt ? `Saved ${fmtRelative(savedAt.toISOString())}` : undefined}><CheckCircle2 className="h-3.5 w-3.5" />Saved ✓</span>;
  return <span className="inline-flex items-center gap-1.5 text-xs text-ink-400"><Cloud className="h-3.5 w-3.5" />Autosave on</span>;
}

function Banner({ tone, icon: Icon, title, children, action }: { tone: "info" | "success" | "warning" | "neutral"; icon: typeof Lock; title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  const cls = { info: "border-brand-200 bg-brand-50/70 text-brand-900", success: "border-emerald-200 bg-success-50 text-success-700", warning: "border-amber-200 bg-warning-50 text-warning-700", neutral: "border-ink-200 bg-white text-ink-700" }[tone];
  const icls = { info: "text-brand-600", success: "text-success-600", warning: "text-warning-600", neutral: "text-ink-400" }[tone];
  return (
    <div className={cn("mb-5 flex items-start gap-3 rounded-[var(--radius-card)] border px-4 py-3", cls)}>
      <Icon className={cn("h-5 w-5 shrink-0 mt-0.5", icls)} />
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-medium">{title}</p>
        {children && <div className="mt-0.5 opacity-90">{children}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export default function AssessmentDetailPage() {
  const id = Number(useParams().id);
  const navigate = useNavigate();
  const { user, canWrite, can } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const key = useMemo(() => ["assessment", id], [id]);
  const q = useQuery({ queryKey: key, queryFn: () => api.get<{ data: AssessmentDetail }>(`/api/assessments/${id}`).then((r) => r.data), enabled: Number.isFinite(id), retry: (n, e) => !(e instanceof ApiError && e.status === 404) && n < 1 });
  const a = q.data;
  const comments = useQuery({ queryKey: ["comments", "assessment", id], queryFn: () => api.get<{ data: Comment[] }>(`/api/comments?entity_type=assessment&entity_id=${id}`).then((r) => r.data), enabled: Number.isFinite(id) });

  const onSaved = useCallback((resp: Assessment, saved: Record<number, Draft>) => {
    qc.setQueryData<AssessmentDetail>(key, (old) => old ? { ...old, ...resp, questions: old.questions.map((qq) => saved[qq.id] ? { ...qq, answer: saved[qq.id].answer, note: saved[qq.id].note } : qq) } : old);
    qc.invalidateQueries({ queryKey: ["assessments"] });
  }, [qc, key]);
  const onSaveError = useCallback((e: Error) => toast("error", "Autosave failed", e.message), [toast]);
  const autosave = useAnswerAutosave(id, a?.questions, onSaved, onSaveError);
  const { drafts, update, flush } = autosave;
  const draftsRef = useRef(drafts);
  draftsRef.current = drafts;

  const [tab, setTab] = useState<TabId>("findings");
  const [onlyOpen, setOnlyOpen] = useState(false);
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [findingInit, setFindingInit] = useState<FindingFormInitial | null>(null);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);
  const [summary, setSummary] = useState("");
  const [returnMsg, setReturnMsg] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const submitLock = useRef(false);

  const questions = useMemo(() => a?.questions ?? [], [a?.questions]);
  const sections = useMemo(() => {
    const order: string[] = [];
    const map = new Map<string, TemplateQuestion[]>();
    for (const qq of questions) {
      if (!map.has(qq.section)) { map.set(qq.section, []); order.push(qq.section); }
      map.get(qq.section)!.push(qq);
    }
    return order.map((name) => ({ name, items: map.get(name)! }));
  }, [questions]);
  const indexOf = useMemo(() => new Map(questions.map((qq, i) => [qq.id, i + 1])), [questions]);

  const answerOf = (qq: TemplateQuestion) => (drafts[qq.id] ? drafts[qq.id].answer : qq.answer ?? null);
  const scoreItems = questions.map((qq) => ({ weight: qq.weight, answer: answerOf(qq) }));
  const liveScore = scoreAnswers(scoreItems);
  const liveRating = ratingFromScore(liveScore);
  const answered = scoreItems.filter((s) => s.answer).length;
  const total = questions.length;
  const unanswered = total - answered;
  const dist = { yes: 0, partial: 0, no: 0, na: 0 };
  for (const s of scoreItems) if (s.answer) dist[s.answer] += 1;

  const status = a?.status;
  const editable = !!a && canWrite && (status === "not_started" || status === "in_progress");
  const awaitingReview = status === "submitted" || status === "under_review";
  const isAssignee = !!a && user?.id === a.assigned_to;
  const reviewEligible = !!a && canWrite && awaitingReview && !(isAssignee && !can("admin")) && (user?.id === a.reviewer_id || can("admin", "risk_analyst"));
  const canStartReview = reviewEligible && status === "submitted";
  const canReview = reviewEligible && status === "under_review";
  const completedBy = a?.activity.find((x) => x.action === "complete")?.actor_name ?? a?.reviewer_name ?? null;
  const lastWorkflow = a?.activity.find((x) => x.action === "return" || x.action === "submit");

  useEffect(() => {
    if (!sections.length) return;
    const els = sections.map((s) => document.getElementById(`sec-${slug(s.name)}`)).filter(Boolean) as HTMLElement[];
    const io = new IntersectionObserver((entries) => {
      const vis = entries.filter((e) => e.isIntersecting).sort((x, y) => x.boundingClientRect.top - y.boundingClientRect.top);
      if (vis[0]) setActiveSection(vis[0].target.getAttribute("data-section"));
    }, { rootMargin: "-80px 0px -60% 0px" });
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [sections, onlyOpen]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: key });
    qc.invalidateQueries({ queryKey: ["assessments"] });
    if (a) qc.invalidateQueries({ queryKey: ["vendor", a.vendor_id] });
  };

  const submit = useMutation({
    mutationFn: async () => {
      const ok = await flush();
      if (!ok) throw new Error("Some answers could not be saved. Retry saving before submitting.");
      return api.post<{ data: Assessment }>(`/api/assessments/${id}/submit`);
    },
    onSuccess: () => { setSubmitError(null); setConfirmSubmit(false); refresh(); toast("success", "Submitted for review", a?.reviewer_name ? `${a.reviewer_name} has been notified.` : undefined); },
    onError: (e: Error) => { setSubmitError(e.message); toast("error", "Could not submit", e.message); },
  });
  const doSubmit = () => {
    if (submitLock.current) return;
    submitLock.current = true;
    submit.mutate(undefined, { onSettled: () => { submitLock.current = false; } });
  };
  const startReview = useMutation({
    mutationFn: () => api.post<{ data: Assessment }>(`/api/assessments/${id}/start-review`),
    onSuccess: () => { refresh(); toast("success", "Review started", "You are now the reviewer for this assessment."); },
    onError: (e: Error) => toast("error", "Could not start review", e.message),
  });
  const review = useMutation({
    mutationFn: async (decision: "complete" | "return") => {
      if (decision === "return" && returnMsg.trim()) await api.post("/api/comments", { entity_type: "assessment", entity_id: id, body: `Returned for more information: ${returnMsg.trim()}` });
      return api.post<{ data: Assessment }>(`/api/assessments/${id}/review`, decision === "complete" ? { decision, summary: summary.trim() || null } : { decision });
    },
    onSuccess: (_r, decision) => {
      setCompleteOpen(false); setReturnOpen(false); setReturnMsg("");
      refresh();
      qc.invalidateQueries({ queryKey: ["comments", "assessment", id] });
      qc.invalidateQueries({ queryKey: ["vendors"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      toast("success", decision === "complete" ? "Review completed" : "Returned to assignee", decision === "complete" ? `Rated ${liveRating ? LABELS.tier[liveRating].toLowerCase() : "—"} risk · vendor residual risk recalculated` : undefined);
    },
    onError: (e: Error) => toast("error", "Review action failed", e.message),
  });

  const raiseFromQuestion = useCallback((qq: TemplateQuestion) => {
    if (!a) return;
    const d = draftsRef.current[qq.id];
    const ans = d?.answer ?? qq.answer ?? null;
    const note = (d?.note ?? qq.note ?? "").trim();
    const sev = ans === "no" ? (qq.weight >= 3 ? "high" : "medium") : ans === "partial" ? (qq.weight >= 3 ? "medium" : "low") : "medium";
    const n = questions.findIndex((x) => x.id === qq.id) + 1;
    setFindingInit({
      vendor_id: a.vendor_id, assessment_id: a.id, assessment_title: `${a.title} · Q${n} (${qq.section})`, severity: sev,
      description: `${questionRefPrefix(n, qq.section)}${qq.text}${ans ? `\n\nAssessment answer: ${LABELS.answer[ans]}` : ""}${note ? `\nAssessor note: ${note}` : ""}`,
    });
  }, [a, questions]);
  const questionRef = useCallback((f: Finding) => {
    const r = parseQuestionRef(f.description);
    if (r) return r;
    const desc = f.description ?? "";
    const i = questions.findIndex((qq) => desc.startsWith(`${qq.section} — ${qq.text}`));
    return i >= 0 ? { n: i + 1, section: questions[i].section } : null;
  }, [questions]);
  const findingsByQuestion = useMemo(() => {
    const m = new Map<number, number>();
    for (const f of a?.findings ?? []) { const r = questionRef(f); if (r) m.set(r.n, (m.get(r.n) ?? 0) + 1); }
    return m;
  }, [a?.findings, questionRef]);

  const jumpTo = (elId: string) => document.getElementById(elId)?.scrollIntoView({ behavior: "smooth", block: "start" });
  const nextUnanswered = questions.find((qq) => !answerOf(qq));

  if (!Number.isFinite(id) || (q.error instanceof ApiError && q.error.status === 404)) return <NotFoundState what="Assessment" backTo="/assessments" backLabel="Back to assessments" />;
  if (q.isLoading) return <PageLoader />;
  if (q.error || !a) return <Card><EmptyState icon={AlertCircle} title="Could not load assessment" description={(q.error as Error | null)?.message} action={<Button variant="secondary" onClick={() => q.refetch()}>Try again</Button>} /></Card>;

  const pct = total ? Math.round((answered / total) * 100) : 0;
  const findingCols: Column<Finding>[] = [
    { key: "title", header: "Finding", render: (f) => <span className="block min-w-[12rem] font-medium text-ink-900">{f.title}</span> },
    { key: "source", header: "Source", render: (f) => { const r = questionRef(f); return r ? <span className="whitespace-nowrap text-ink-700"><span className="font-medium tnum">Q{r.n}</span><span className="text-ink-500"> · {r.section}</span></span> : <span className="text-ink-500">Whole assessment</span>; } },
    { key: "severity", header: "Severity", render: (f) => <Badge tone={TONES.tier[f.severity]}>{LABELS.tier[f.severity]}</Badge> },
    { key: "status", header: "Status", render: (f) => <Badge tone={TONES.findingStatus[f.status]} dot>{LABELS.findingStatus[f.status]}</Badge> },
    { key: "owner", header: "Owner", render: (f) => <UserCell name={f.owner_name} /> },
    { key: "due", header: "Due", render: (f) => <DueCell date={f.due_date} resolved={f.status === "closed" || f.status === "risk_accepted"} /> },
  ];

  const sectionNav = (
    <Card padded={false}>
      <div className="px-4 pt-4 pb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ink-900">Sections</h3>
        <span className="text-xs text-ink-500 tnum">{sections.length}</span>
      </div>
      <nav className="px-2 pb-2" aria-label="Questionnaire sections">
        {sections.map((s) => {
          const done = s.items.filter((qq) => answerOf(qq)).length;
          const complete = done === s.items.length;
          const active = activeSection === s.name;
          return (
            <button key={s.name} type="button" onClick={() => jumpTo(`sec-${slug(s.name)}`)} className={cn("w-full rounded-md px-2.5 py-2 text-left transition-colors focus-ring", active ? "bg-brand-50" : "hover:bg-ink-50")}>
              <span className="flex items-center justify-between gap-2">
                <span className={cn("flex items-center gap-2 text-sm truncate", active ? "font-medium text-brand-800" : "text-ink-700")}>
                  {complete ? <CheckCircle2 className="h-3.5 w-3.5 text-success-600 shrink-0" /> : <span className={cn("h-3.5 w-3.5 rounded-full border-2 shrink-0", done ? "border-brand-400" : "border-ink-300")} />}
                  <span className="truncate">{s.name}</span>
                </span>
                <span className={cn("text-xs tnum shrink-0", complete ? "text-success-700" : "text-ink-500")}>{done}/{s.items.length}</span>
              </span>
              <ProgressBar value={done} max={s.items.length} size="xs" className="mt-1.5 ml-5.5" />
            </button>
          );
        })}
      </nav>
    </Card>
  );

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Assessments", to: "/assessments" }, { label: a.title }]}
        title={<span className="block break-words [overflow-wrap:anywhere]">{a.title}</span>}
        documentTitle={a.title}
        meta={
          <>
            <Badge tone={TONES.assessmentStatus[a.status]} dot>{LABELS.assessmentStatus[a.status]}</Badge>
            <span className="text-ink-300">|</span>
            <Link to={`/vendors/${a.vendor_id}`} className="text-sm font-medium text-ink-700 hover:text-brand-700 hover:underline">{a.vendor_name}</Link>
            <TierBadge tier={a.vendor_tier} size="xs" suffix="tier" />
            <span className="text-ink-300">|</span>
            <span className="text-sm text-ink-500">{a.template_name}{a.framework ? ` · ${a.framework}` : ""}</span>
          </>
        }
        actions={
          <HeaderActions>
            {canWrite && <Button variant="secondary" icon={Flag} onClick={() => setFindingInit({ vendor_id: a.vendor_id, assessment_id: a.id, assessment_title: a.title })}>Raise finding</Button>}
            {editable && (
              <Button icon={Send} onClick={() => setConfirmSubmit(true)} loading={submit.isPending} disabled={unanswered > 0 || submit.isPending} title={unanswered > 0 ? `${unanswered} question(s) still unanswered` : undefined}>Submit for review</Button>
            )}
            {canStartReview && <Button icon={Eye} onClick={() => startReview.mutate()} loading={startReview.isPending}>Start review</Button>}
            {canReview && (
              <>
                <Button variant="secondary" icon={RotateCcw} onClick={() => setReturnOpen(true)}>Return for more info</Button>
                <Button icon={ClipboardCheck} onClick={() => { setSummary(a.summary ?? ""); setCompleteOpen(true); }}>Complete review</Button>
              </>
            )}
          </HeaderActions>
        }
      />

      {awaitingReview && (
        <Banner tone="info" icon={Lock} title={status === "under_review" ? `Under review by ${a.reviewer_name ?? "a reviewer"}` : `Submitted for review ${a.submitted_at ? fmtRelative(a.submitted_at) : ""}`}>
          {status === "under_review"
            ? `Answers are locked during review.${canReview ? " Complete the review or return it to the assignee for more information." : ""}`
            : `Answers are locked until ${a.reviewer_name ?? "a reviewer"} picks this up.${canStartReview ? " Start the review to take ownership of it." : isAssignee && awaitingReview ? " As the assignee you can't review your own submission." : ""}`}
        </Banner>
      )}
      {status === "completed" && (
        <Banner tone="success" icon={CheckCircle2} title={`Review completed ${fmtDate(a.completed_at)}${completedBy ? ` by ${completedBy}` : ""}`}>
          {a.summary ? <span className="whitespace-pre-wrap">{a.summary}</span> : "This assessment is locked. Its score now contributes to the vendor's residual risk."}
        </Banner>
      )}
      {editable && lastWorkflow?.action === "return" && (
        <Banner tone="warning" icon={RotateCcw} title={`Returned for more information by ${lastWorkflow.actor_name ?? "the reviewer"} ${fmtRelative(lastWorkflow.created_at)}`} action={<Button size="xs" variant="secondary" onClick={() => { setTab("comments"); jumpTo("assessment-tabs"); }}>View comments</Button>}>
          Update the answers and resubmit when ready.
        </Banner>
      )}
      {!canWrite && <Banner tone="neutral" icon={Lock} title="Read-only access">You can view this assessment but not change answers.</Banner>}

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-6 items-start">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <p className="text-sm text-ink-600"><span className="font-semibold text-ink-900 tnum">{total}</span> questions across <span className="font-semibold text-ink-900 tnum">{sections.length}</span> sections</p>
            <div className="flex items-center gap-4">
              {editable && <SaveIndicator state={autosave.state} savedAt={autosave.savedAt} onRetry={() => void flush()} />}
              <Checkbox label="Unanswered only" checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)} />
            </div>
          </div>
          <div className="space-y-8">
          {sections.map((s) => {
            const items = onlyOpen ? s.items.filter((qq) => !answerOf(qq)) : s.items;
            if (!items.length) return null;
            const done = s.items.filter((qq) => answerOf(qq)).length;
            return (
              <section key={s.name} id={`sec-${slug(s.name)}`} data-section={s.name} className="scroll-mt-24">
                <div className="flex items-center gap-3 mb-3">
                  <h2 className="text-sm font-semibold text-ink-900">{s.name}</h2>
                  <span className="text-xs text-ink-500 tnum">{done} of {s.items.length} answered</span>
                  <span className="h-px flex-1 bg-ink-200" />
                </div>
                <div className="space-y-3">
                  {items.map((qq) => (
                    <QuestionCard key={qq.id} q={qq} index={indexOf.get(qq.id) ?? 0} draft={drafts[qq.id]} editable={editable} canRaise={canWrite} onChange={update} onRaise={raiseFromQuestion} findingCount={findingsByQuestion.get(indexOf.get(qq.id) ?? 0) ?? 0} />
                  ))}
                </div>
              </section>
            );
          })}
          {onlyOpen && unanswered === 0 && (
            <Card><EmptyState icon={CheckCircle2} title="All questions answered" description={editable ? "You're ready to submit this assessment for review." : undefined} /></Card>
          )}
          </div>
        </div>

        <aside className="lg:sticky lg:top-20 space-y-4 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto lg:pb-2 -mx-1 px-1">
          <Card>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-ink-900">{status === "completed" ? "Final score" : "Live score"}</h3>
              <Badge tone={TONES.assessmentStatus[a.status]} dot>{LABELS.assessmentStatus[a.status]}</Badge>
            </div>
            <div className="flex items-center gap-4">
              <ProgressRing pct={liveScore ?? 0} size={104} stroke={9} strokeClassName={liveRating ? RATING_STROKE[liveRating] : "stroke-ink-200"}>
                <span className={cn("text-2xl font-semibold tracking-tight tnum leading-none", liveRating ? RATING_TEXT[liveRating] : "text-ink-400")}>{fmtScore(liveScore)}</span>
                <span className="text-[11px] text-ink-400 mt-1">of 100</span>
              </ProgressRing>
              <div className="min-w-0 space-y-2">
                {liveRating ? <Badge tone={TONES.tier[liveRating]}>{RATING_LABEL[liveRating]}</Badge> : <Badge tone="neutral">Not scored</Badge>}
                <p className="text-xs text-ink-500 leading-relaxed" title="Weighted average: Yes = 1, Partial = 0.5, No = 0. N/A answers are excluded.">Weighted across {answered - dist.na} scored answer{answered - dist.na === 1 ? "" : "s"}{dist.na ? `, ${dist.na} N/A excluded` : ""}</p>
              </div>
            </div>
            <div className="mt-5">
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="font-medium text-ink-700">Progress</span>
                <span className="text-ink-500 tnum">{answered}/{total} · {pct}%</span>
              </div>
              <ProgressBar value={answered} max={total} size="md" />
              <div className="mt-3 flex h-1.5 rounded-full overflow-hidden bg-ink-100" aria-hidden>
                {(["yes", "partial", "no", "na"] as const).map((k) => dist[k] ? <span key={k} className={{ yes: "bg-success-600", partial: "bg-warning-600", no: "bg-danger-600", na: "bg-ink-400" }[k]} style={{ width: `${(dist[k] / Math.max(1, total)) * 100}%` }} /> : null)}
              </div>
              <div className="mt-2 grid grid-cols-4 gap-1 text-center">
                {(["yes", "partial", "no", "na"] as const).map((k) => (
                  <div key={k} className="rounded-md bg-ink-50 py-1.5">
                    <div className={cn("text-sm font-semibold tnum", { yes: "text-success-700", partial: "text-warning-700", no: "text-danger-700", na: "text-ink-600" }[k])}>{dist[k]}</div>
                    <div className="text-[10px] uppercase tracking-wide text-ink-500">{LABELS.answer[k]}</div>
                  </div>
                ))}
              </div>
            </div>
            {editable && (
              <div className="mt-4 pt-4 border-t border-ink-100">
                {unanswered > 0 ? (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-ink-600"><span className="font-semibold tnum">{unanswered}</span> unanswered</span>
                    {nextUnanswered && <Button size="xs" variant="outline" icon={ArrowDownToLine} onClick={() => jumpTo(`q-${nextUnanswered.id}`)}>Next unanswered</Button>}
                  </div>
                ) : (
                  <Button className="w-full" icon={Send} onClick={() => setConfirmSubmit(true)} loading={submit.isPending}>Submit for review</Button>
                )}
                {submitError && <p className="mt-2 flex items-start gap-1.5 text-xs text-danger-700"><ShieldAlert className="h-3.5 w-3.5 mt-px shrink-0" />{submitError}</p>}
              </div>
            )}
            <dl className="mt-4 pt-4 border-t border-ink-100 space-y-3 text-sm">
              <div className="flex items-center justify-between gap-3"><dt className="text-ink-500">Vendor</dt><dd className="min-w-0 flex items-center gap-1.5"><Link to={`/vendors/${a.vendor_id}`} className="truncate font-medium text-ink-800 hover:text-brand-700 hover:underline">{a.vendor_name}</Link></dd></div>
              <div className="flex items-center justify-between gap-3"><dt className="text-ink-500">Assignee</dt><dd className="min-w-0"><UserCell name={a.assignee_name} /></dd></div>
              <div className="flex items-center justify-between gap-3"><dt className="text-ink-500">Reviewer</dt><dd className="min-w-0">{a.reviewer_name ? <UserCell name={a.reviewer_name} /> : <span className="text-ink-400">Not set</span>}</dd></div>
              <div className="flex items-start justify-between gap-3"><dt className="text-ink-500">Due</dt><dd className="text-right"><DueCell date={a.due_date} resolved={status === "completed"} /></dd></div>
              {a.submitted_at && <div className="flex items-center justify-between gap-3"><dt className="text-ink-500">Submitted</dt><dd className="text-ink-800 tnum">{fmtDate(a.submitted_at)}</dd></div>}
              {a.completed_at && <div className="flex items-center justify-between gap-3"><dt className="text-ink-500">Completed</dt><dd className="text-ink-800 tnum">{fmtDate(a.completed_at)}</dd></div>}
            </dl>
          </Card>
          {sectionNav}
        </aside>
      </div>

      <Card padded={false} className="mt-8">
        <div id="assessment-tabs" className="scroll-mt-24 px-4 pt-1">
          <Tabs<TabId> value={tab} onChange={setTab} tabs={[{ id: "findings", label: "Findings", count: a.findings.length }, { id: "comments", label: "Comments", count: comments.data?.length ?? a.comments.length }, { id: "activity", label: "Activity", count: a.activity.length }]} />
        </div>
        {tab === "findings" && (
          a.findings.length ? (
            <DataTable columns={findingCols} rows={a.findings} onRowClick={(f) => navigate(`/findings/${f.id}`)} />
          ) : (
            <EmptyState icon={Flag} title="No findings linked" description="Findings raised from this assessment will appear here." action={canWrite ? <Button size="sm" variant="secondary" icon={Flag} onClick={() => setFindingInit({ vendor_id: a.vendor_id, assessment_id: a.id, assessment_title: a.title })}>Raise finding</Button> : undefined} />
          )
        )}
        {tab === "comments" && <div className="p-5"><CommentsThread entityType="assessment" entityId={a.id} onChange={() => qc.invalidateQueries({ queryKey: key })} /></div>}
        {tab === "activity" && <div className="p-5"><ActivityTimeline items={a.activity} /></div>}
      </Card>

      <FindingFormModal open={!!findingInit} onClose={() => setFindingInit(null)} initial={findingInit ?? undefined} lockVendor onSaved={() => setTab("findings")} />

      <Modal open={confirmSubmit} onClose={() => { if (!submit.isPending) setConfirmSubmit(false); }} size="sm" title="Submit for review?" description={`${a.title} will be sent to ${a.reviewer_name ?? "a reviewer"} for review.`}
        footer={<><Button variant="secondary" onClick={() => setConfirmSubmit(false)} disabled={submit.isPending}>Cancel</Button><Button icon={Send} loading={submit.isPending} disabled={submit.isPending || unanswered > 0} onClick={doSubmit}>Submit for review</Button></>}>
        <div className="space-y-4">
          <div className="flex items-center gap-4 rounded-lg border border-ink-200 bg-ink-50/60 p-3">
            <ProgressRing pct={liveScore ?? 0} size={56} stroke={6} strokeClassName={liveRating ? RATING_STROKE[liveRating] : "stroke-ink-200"}>
              <span className={cn("text-sm font-semibold tnum", liveRating ? RATING_TEXT[liveRating] : "text-ink-400")}>{fmtScore(liveScore)}</span>
            </ProgressRing>
            <div className="min-w-0 text-sm">
              <p className="font-medium text-ink-900">Score {fmtScore(liveScore)} · {liveRating ? RATING_LABEL[liveRating] : "Not scored"}</p>
              <p className="text-ink-500 text-xs mt-0.5">{answered}/{total} answered · {dist.yes} yes · {dist.partial} partial · {dist.no} no · {dist.na} N/A · {a.findings.length} finding{a.findings.length === 1 ? "" : "s"} raised</p>
            </div>
          </div>
          <p className="flex items-start gap-2 rounded-md border border-amber-200 bg-warning-50 px-3 py-2 text-sm text-warning-700"><Lock className="h-4 w-4 mt-0.5 shrink-0" />Answers and notes lock after submission. They can only be changed if the reviewer returns the assessment for more information.</p>
          {submitError && <p role="alert" className="flex items-start gap-1.5 text-xs text-danger-700"><ShieldAlert className="h-3.5 w-3.5 mt-px shrink-0" />{submitError}</p>}
        </div>
      </Modal>

      <Modal open={completeOpen} onClose={() => setCompleteOpen(false)} title="Complete review" description="Completing locks the assessment and updates the vendor's residual risk."
        footer={<><Button variant="secondary" onClick={() => setCompleteOpen(false)}>Cancel</Button><Button icon={ClipboardCheck} loading={review.isPending} onClick={() => review.mutate("complete")}>Complete review</Button></>}>
        <div className="space-y-4">
          <div className="flex items-center gap-4 rounded-lg border border-ink-200 bg-ink-50/60 p-3">
            <ProgressRing pct={liveScore ?? 0} size={56} stroke={6} strokeClassName={liveRating ? RATING_STROKE[liveRating] : "stroke-ink-200"}>
              <span className={cn("text-sm font-semibold tnum", liveRating ? RATING_TEXT[liveRating] : "text-ink-400")}>{fmtScore(liveScore)}</span>
            </ProgressRing>
            <div className="text-sm">
              <p className="font-medium text-ink-900">{liveRating ? RATING_LABEL[liveRating] : "Not scored"}</p>
              <p className="text-ink-500 text-xs mt-0.5">{dist.no} no · {dist.partial} partial · {dist.yes} yes · {dist.na} N/A · {a.findings.length} finding{a.findings.length === 1 ? "" : "s"} raised</p>
            </div>
          </div>
          <Field label="Review summary" hint="Shared with the assignee and shown on the vendor profile.">
            <Textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={5} placeholder="Overall conclusion, key gaps, and agreed remediation…" autoFocus />
          </Field>
        </div>
      </Modal>

      <Modal open={returnOpen} onClose={() => setReturnOpen(false)} title="Return for more information" description={`The assessment goes back to ${a.assignee_name ?? "the assignee"} and answers are unlocked.`}
        footer={<><Button variant="secondary" onClick={() => setReturnOpen(false)}>Cancel</Button><Button icon={RotateCcw} loading={review.isPending} onClick={() => review.mutate("return")}>Return assessment</Button></>}>
        <Field label="What's needed?" hint="Posted as a comment on the assessment.">
          <Textarea value={returnMsg} onChange={(e) => setReturnMsg(e.target.value)} rows={4} placeholder="e.g. Please attach the latest penetration test and clarify the MFA exception for support staff." autoFocus />
        </Field>
      </Modal>
    </>
  );
}

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}
