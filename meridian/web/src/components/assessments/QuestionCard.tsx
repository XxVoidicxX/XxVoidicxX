import { memo, useState } from "react";
import { Check, Contrast, Flag, Info, Minus, StickyNote, X, type LucideIcon } from "lucide-react";
import { LABELS, TONES } from "@/lib/format";
import type { Answer, TemplateQuestion } from "@/lib/types";
import { Badge, Button, cn, Textarea } from "@/components/ui";
import type { Draft } from "./useAnswerAutosave";

const OPTIONS: { id: Answer; label: string; icon: LucideIcon; on: string; hover: string }[] = [
  { id: "yes", label: "Yes", icon: Check, on: "bg-success-600 text-white shadow-sm", hover: "hover:text-success-700 hover:bg-success-50" },
  { id: "partial", label: "Partial", icon: Contrast, on: "bg-warning-600 text-white shadow-sm", hover: "hover:text-warning-700 hover:bg-warning-50" },
  { id: "no", label: "No", icon: X, on: "bg-danger-600 text-white shadow-sm", hover: "hover:text-danger-700 hover:bg-danger-50" },
  { id: "na", label: "N/A", icon: Minus, on: "bg-ink-600 text-white shadow-sm", hover: "hover:text-ink-900 hover:bg-white" },
];
const ACCENT: Record<Answer, string> = { yes: "border-l-success-600", partial: "border-l-warning-600", no: "border-l-danger-600", na: "border-l-ink-400" };

export function WeightPill({ weight }: { weight: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-ink-100 px-2 py-0.5 text-[11px] font-medium text-ink-600" title={`Weight ${weight} of 5`}>
      Weight
      <span className="inline-flex items-end gap-px" aria-hidden>
        {[1, 2, 3, 4, 5].map((i) => <span key={i} className={cn("w-[3px] rounded-sm", i <= weight ? "bg-brand-500" : "bg-ink-300")} style={{ height: 4 + i * 1.5 }} />)}
      </span>
      <span className="tnum">{weight}</span>
    </span>
  );
}

export function AnswerSegmented({ value, onChange, disabled, label }: { value: Answer | null; onChange: (a: Answer | null) => void; disabled?: boolean; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-lg border border-ink-200 bg-ink-50 p-0.5 gap-0.5">
      {OPTIONS.map((o) => {
        const on = value === o.id;
        const Icon = o.icon;
        return (
          <button key={o.id} type="button" role="radio" aria-checked={on} disabled={disabled} onClick={() => onChange(on ? null : o.id)} className={cn("h-8 min-w-[76px] px-3 rounded-md text-sm font-medium inline-flex items-center justify-center gap-1.5 transition-colors focus-ring disabled:cursor-not-allowed", on ? o.on : cn("text-ink-600", o.hover))}>
            <Icon className="h-3.5 w-3.5" strokeWidth={2.5} />
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export const QuestionCard = memo(function QuestionCard({ q, index, draft, editable, canRaise, onChange, onRaise }: { q: TemplateQuestion; index: number; draft: Draft | undefined; editable: boolean; canRaise: boolean; onChange: (id: number, patch: Partial<Draft>) => void; onRaise: (q: TemplateQuestion) => void }) {
  const answer = draft ? draft.answer : q.answer ?? null;
  const note = draft ? draft.note : q.note ?? "";
  const [noteToggle, setNoteToggle] = useState<boolean | null>(null);
  const noteOpen = noteToggle ?? !!note;
  const flagged = answer === "no" || answer === "partial";
  return (
    <article id={`q-${q.id}`} className={cn("scroll-mt-24 rounded-[var(--radius-card)] border border-ink-200 border-l-[3px] bg-white shadow-card transition-colors", answer ? ACCENT[answer] : "border-l-ink-200")}>
      <div className="flex gap-3.5 p-4 sm:p-5">
        <span className={cn("mt-0.5 h-6 w-6 shrink-0 rounded-full text-[11px] font-semibold tnum flex items-center justify-center", answer ? "bg-ink-900 text-white" : "bg-ink-100 text-ink-500 ring-1 ring-inset ring-ink-200")}>
          {answer ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : index}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">{q.section}</span>
            <span className="text-ink-300">·</span>
            <span className="text-[11px] font-medium text-ink-400 tnum">Q{index}</span>
            <WeightPill weight={q.weight} />
          </div>
          <p className="mt-1.5 text-[15px] leading-6 font-medium text-ink-900">{q.text}</p>
          {q.guidance && (
            <p className="mt-1.5 flex gap-1.5 text-sm text-ink-500"><Info className="h-4 w-4 shrink-0 mt-0.5 text-ink-400" />{q.guidance}</p>
          )}
          {editable ? (
            <>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <AnswerSegmented value={answer} label={`Answer for question ${index}`} onChange={(a) => onChange(q.id, { answer: a })} />
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="xs" icon={StickyNote} onClick={() => setNoteToggle(!noteOpen)} aria-expanded={noteOpen} className={note ? "text-brand-700" : undefined}>
                    {note ? "Note" : "Add note"}
                  </Button>
                  {canRaise && (
                    <Button variant="ghost" size="xs" icon={Flag} onClick={() => onRaise(q)} className={flagged ? "text-danger-700 hover:text-danger-700 hover:bg-danger-50" : undefined}>Raise finding</Button>
                  )}
                </div>
              </div>
              {noteOpen && (
                <Textarea value={note} onChange={(e) => onChange(q.id, { note: e.target.value })} rows={3} placeholder="Evidence reviewed, compensating controls, follow-ups…" className="mt-3 text-sm" aria-label={`Note for question ${index}`} autoFocus={noteToggle === true && !note} />
              )}
            </>
          ) : (
            <div className="mt-3 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                {answer ? <Badge tone={TONES.answer[answer]} dot>{LABELS.answer[answer]}</Badge> : <Badge tone="neutral">Not answered</Badge>}
                {canRaise && flagged && <Button variant="ghost" size="xs" icon={Flag} onClick={() => onRaise(q)} className="text-danger-700 hover:text-danger-700 hover:bg-danger-50">Raise finding</Button>}
              </div>
              {note && <p className="rounded-md bg-ink-50 border border-ink-100 px-3 py-2 text-sm text-ink-700 whitespace-pre-wrap">{note}</p>}
            </div>
          )}
        </div>
      </div>
    </article>
  );
});
