import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Plus, Save, Trash2 } from "lucide-react";
import { Button, Field, Input, Modal, Select, Textarea, cn } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { api, ApiError } from "@/lib/api";
import type { AssessmentTemplate } from "@/lib/types";

interface Row { key: number; section: string; text: string; guidance: string; weight: number }
export interface BuilderSeed { name: string; framework: string; version: string; description: string; questions: Omit<Row, "key">[] }

const FRAMEWORKS = ["SIG Lite", "SIG Core", "ISO 27001", "SOC 2", "NIST CSF", "GDPR", "HIPAA", "PCI DSS", "Custom"];

export function TemplateBuilder({ open, seed, onClose, onCreated }: { open: boolean; seed: BuilderSeed | null; onClose: () => void; onCreated?: (t: AssessmentTemplate) => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const keyRef = useRef(1);
  const blank = (section = ""): Row => ({ key: keyRef.current++, section, text: "", guidance: "", weight: 3 });
  const [name, setName] = useState("");
  const [framework, setFramework] = useState("");
  const [version, setVersion] = useState("1.0");
  const [description, setDescription] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setSubmitted(false);
    setName(seed?.name ?? ""); setFramework(seed?.framework ?? ""); setVersion(seed?.version ?? "1.0"); setDescription(seed?.description ?? "");
    setRows(seed?.questions.length ? seed.questions.map((q) => ({ ...q, key: keyRef.current++ })) : [blank("Governance")]);
  }, [open, seed]);

  const sections = useMemo(() => [...new Set(rows.map((r) => r.section.trim()).filter(Boolean))], [rows]);
  const rowErr = (r: Row) => ({ section: !r.section.trim() ? "Required" : undefined, text: !r.text.trim() ? "Required" : undefined });
  const invalid = !name.trim() || rows.length === 0 || rows.some((r) => !r.section.trim() || !r.text.trim());

  const m = useMutation({
    mutationFn: () => api.post<{ data: AssessmentTemplate }>("/api/assessments/templates", {
      name: name.trim(), framework: framework.trim() || null, version: version.trim() || "1.0", description: description.trim() || null,
      questions: rows.map((r) => ({ section: r.section.trim(), text: r.text.trim(), guidance: r.guidance.trim() || null, weight: r.weight })),
    }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["assessment-templates"] });
      qc.invalidateQueries({ queryKey: ["templates"] });
      qc.invalidateQueries({ queryKey: ["activity"] });
      toast("success", "Template created", `${r.data.name} · ${rows.length} questions`);
      onCreated?.(r.data);
      onClose();
    },
    onError: (e) => toast("error", "Could not create template", e instanceof ApiError ? e.message : undefined),
  });

  const patch = (key: number, p: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...p } : r)));
  const move = (i: number, d: -1 | 1) => setRows((rs) => { const n = [...rs]; const j = i + d; if (j < 0 || j >= n.length) return rs; [n[i], n[j]] = [n[j], n[i]]; return n; });
  const add = () => {
    setRows((rs) => [...rs, blank(rs[rs.length - 1]?.section ?? "")]);
    requestAnimationFrame(() => listRef.current?.lastElementChild?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
  };
  const submit = () => { setSubmitted(true); if (!invalid) m.mutate(); };
  const totalWeight = rows.reduce((s, r) => s + r.weight, 0);

  return (
    <Modal open={open} onClose={() => !m.isPending && onClose()} size="xl"
      title={seed ? "Duplicate template" : "New assessment template"}
      description="Questions are scored yes = 1, partial = 0.5, no = 0, weighted 1–5. N/A answers are excluded."
      footer={
        <>
          <span className="mr-auto text-xs text-ink-500 tnum">{rows.length} question{rows.length === 1 ? "" : "s"} · {sections.length} section{sections.length === 1 ? "" : "s"} · total weight {totalWeight}</span>
          <Button variant="secondary" onClick={onClose} disabled={m.isPending}>Cancel</Button>
          <Button icon={Save} loading={m.isPending} onClick={submit}>Create template</Button>
        </>
      }
    >
      <div className="grid grid-cols-1 sm:grid-cols-6 gap-4">
        <Field label="Template name" required error={submitted && !name.trim() ? "Name is required" : undefined} className="sm:col-span-3">
          <Input value={name} onChange={(e) => setName(e.target.value)} invalid={submitted && !name.trim()} placeholder="e.g. Cloud Security Baseline" autoFocus />
        </Field>
        <Field label="Framework" className="sm:col-span-2">
          <Input value={framework} onChange={(e) => setFramework(e.target.value)} list="tpl-frameworks" placeholder="e.g. ISO 27001" />
          <datalist id="tpl-frameworks">{FRAMEWORKS.map((f) => <option key={f} value={f} />)}</datalist>
        </Field>
        <Field label="Version" className="sm:col-span-1"><Input value={version} onChange={(e) => setVersion(e.target.value)} placeholder="1.0" /></Field>
        <Field label="Description" className="sm:col-span-6"><Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="min-h-[60px]" placeholder="When should this template be used?" /></Field>
      </div>
      <div className="flex items-center justify-between mt-6 mb-2">
        <h4 className="text-sm font-semibold text-ink-900">Questions</h4>
        {submitted && rows.length === 0 && <span className="text-xs text-danger-600">Add at least one question</span>}
      </div>
      <datalist id="tpl-sections">{sections.map((s) => <option key={s} value={s} />)}</datalist>
      <div ref={listRef} className="space-y-2 max-h-[46vh] overflow-y-auto pr-1 -mr-1">
        {rows.map((r, i) => {
          const e = submitted ? rowErr(r) : { section: undefined, text: undefined };
          return (
            <div key={r.key} className={cn("rounded-lg border bg-white p-3", e.section || e.text ? "border-red-200" : "border-ink-200")} data-testid="question-row">
              <div className="flex gap-3">
                <span className="mt-2 h-6 w-6 shrink-0 rounded-full bg-ink-100 text-ink-600 text-xs font-semibold flex items-center justify-center tnum">{i + 1}</span>
                <div className="flex-1 min-w-0 grid grid-cols-1 md:grid-cols-12 gap-2">
                  <div className="md:col-span-4">
                    <Input value={r.section} onChange={(ev) => patch(r.key, { section: ev.target.value })} list="tpl-sections" placeholder="Section" aria-label={`Question ${i + 1} section`} invalid={!!e.section} />
                  </div>
                  <div className="md:col-span-6">
                    <Input value={r.text} onChange={(ev) => patch(r.key, { text: ev.target.value })} placeholder="Question text" aria-label={`Question ${i + 1} text`} invalid={!!e.text} />
                  </div>
                  <div className="md:col-span-2">
                    <Select value={r.weight} onChange={(ev) => patch(r.key, { weight: Number(ev.target.value) })} aria-label={`Question ${i + 1} weight`}>
                      {[1, 2, 3, 4, 5].map((w) => <option key={w} value={w}>Weight {w}</option>)}
                    </Select>
                  </div>
                  <div className="md:col-span-12">
                    <Input value={r.guidance} onChange={(ev) => patch(r.key, { guidance: ev.target.value })} placeholder="Guidance for respondents (optional)" aria-label={`Question ${i + 1} guidance`} className="h-8 text-xs" />
                  </div>
                </div>
                <div className="flex flex-col gap-0.5 shrink-0">
                  <Button type="button" variant="ghost" size="xs" icon={ArrowUp} disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up" title="Move up" />
                  <Button type="button" variant="ghost" size="xs" icon={ArrowDown} disabled={i === rows.length - 1} onClick={() => move(i, 1)} aria-label="Move down" title="Move down" />
                  <Button type="button" variant="ghost" size="xs" icon={Trash2} disabled={rows.length === 1} onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))} aria-label="Remove question" title="Remove question" className="hover:text-danger-600" />
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <Button type="button" variant="outline" size="sm" icon={Plus} onClick={add} className="mt-3">Add question</Button>
    </Modal>
  );
}
