import { useQuery } from "@tanstack/react-query";
import { Copy } from "lucide-react";
import { Badge, Button, Modal, Skeleton } from "@/components/ui";
import { api } from "@/lib/api";
import type { AssessmentTemplate, TemplateQuestion } from "@/lib/types";

export function groupBySection(qs: TemplateQuestion[]) {
  const map = new Map<string, TemplateQuestion[]>();
  for (const q of qs) map.set(q.section, [...(map.get(q.section) ?? []), q]);
  return [...map.entries()];
}

export function useTemplate(id: number | null) {
  return useQuery({ queryKey: ["assessment-templates", id], enabled: id != null, queryFn: () => api.get<{ data: AssessmentTemplate }>(`/api/assessments/templates/${id}`).then((r) => r.data) });
}

export function TemplateViewer({ id, onClose, onDuplicate }: { id: number | null; onClose: () => void; onDuplicate?: (t: AssessmentTemplate) => void }) {
  const q = useTemplate(id);
  const t = q.data;
  const questions = t?.questions ?? [];
  const totalWeight = questions.reduce((s, x) => s + x.weight, 0);
  const sections = groupBySection(questions);
  return (
    <Modal open={id != null} onClose={onClose} size="xl"
      title={t ? t.name : "Template"}
      description={t ? <span className="inline-flex flex-wrap items-center gap-2">{t.framework && <Badge tone="brand" size="xs">{t.framework}</Badge>}<span>Version {t.version}</span><span>·</span><span className="tnum">{questions.length} questions · {sections.length} sections · total weight {totalWeight}</span>{!t.active && <Badge size="xs">Inactive</Badge>}</span> : undefined}
      footer={<>{onDuplicate && t && <Button variant="secondary" icon={Copy} onClick={() => onDuplicate(t)}>Duplicate as new template</Button>}<Button onClick={onClose}>Close</Button></>}
    >
      {q.isLoading || !t ? (
        <div className="space-y-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}</div>
      ) : (
        <div className="space-y-5 max-h-[60vh] overflow-y-auto pr-1 -mr-1">
          {t.description && <p className="text-sm text-ink-600">{t.description}</p>}
          {sections.map(([section, items]) => (
            <section key={section}>
              <div className="flex items-center justify-between gap-3 mb-2 sticky top-0 bg-white py-1 z-10">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-600">{section}</h4>
                <span className="text-xs text-ink-400 tnum">{items.length} question{items.length === 1 ? "" : "s"} · weight {items.reduce((s, x) => s + x.weight, 0)} ({totalWeight ? Math.round((items.reduce((s, x) => s + x.weight, 0) / totalWeight) * 100) : 0}%)</span>
              </div>
              <ol className="divide-y divide-ink-100 rounded-lg border border-ink-200">
                {items.map((qq) => (
                  <li key={qq.id} className="flex gap-3 px-3.5 py-3">
                    <span className="text-xs text-ink-400 tnum w-6 shrink-0 pt-0.5">{questions.indexOf(qq) + 1}.</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-ink-800">{qq.text}</p>
                      {qq.guidance && <p className="text-xs text-ink-500 mt-1">{qq.guidance}</p>}
                    </div>
                    <span className="shrink-0" title={`Weight ${qq.weight} of 5`}>
                      <span className="inline-flex gap-0.5" aria-label={`Weight ${qq.weight}`}>
                        {[1, 2, 3, 4, 5].map((n) => <span key={n} className={n <= qq.weight ? "h-3 w-1.5 rounded-sm bg-brand-500" : "h-3 w-1.5 rounded-sm bg-ink-200"} />)}
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </div>
      )}
    </Modal>
  );
}
