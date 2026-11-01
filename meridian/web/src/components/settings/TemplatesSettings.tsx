import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, Eye, Plus, Search } from "lucide-react";
import { Badge, Button, Card, DataTable, Input, type Column } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { AssessmentTemplate } from "@/lib/types";
import { Switch } from "./Switch";
import { TemplateViewer } from "./TemplateViewer";
import { TemplateBuilder, type BuilderSeed } from "./TemplateBuilder";

function bump(v: string) {
  const m = /^(\d+)(?:\.(\d+))?$/.exec(v.trim());
  return m ? `${m[1]}.${Number(m[2] ?? 0) + 1}` : `${v}-copy`;
}

export function TemplatesSettings() {
  const { canWrite } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [viewId, setViewId] = useState<number | null>(null);
  const [builder, setBuilder] = useState<{ open: boolean; seed: BuilderSeed | null }>({ open: false, seed: null });
  const [pendingId, setPendingId] = useState<number | null>(null);
  const q = useQuery({ queryKey: ["assessment-templates", "list"], queryFn: () => api.get<{ data: AssessmentTemplate[] }>("/api/assessments/templates").then((r) => r.data) });

  const toggle = useMutation({
    mutationFn: (t: AssessmentTemplate) => api.patch<{ data: AssessmentTemplate }>(`/api/assessments/templates/${t.id}`, { active: !t.active }),
    onMutate: (t) => setPendingId(t.id),
    onSuccess: (r) => { qc.invalidateQueries({ queryKey: ["assessment-templates"] }); qc.invalidateQueries({ queryKey: ["templates"] }); toast("success", r.data.active ? "Template activated" : "Template deactivated", r.data.active ? `${r.data.name} is available for new assessments.` : `${r.data.name} can no longer be used for new assessments.`); },
    onError: (e) => toast("error", "Could not update template", e instanceof ApiError ? e.message : undefined),
    onSettled: () => setPendingId(null),
  });

  const duplicate = async (t: AssessmentTemplate) => {
    const full = t.questions ? t : await qc.fetchQuery({ queryKey: ["assessment-templates", t.id], queryFn: () => api.get<{ data: AssessmentTemplate }>(`/api/assessments/templates/${t.id}`).then((r) => r.data) });
    setViewId(null);
    setBuilder({
      open: true,
      seed: {
        name: `${full.name} (copy)`, framework: full.framework ?? "", version: bump(full.version), description: full.description ?? "",
        questions: (full.questions ?? []).map((x) => ({ section: x.section, text: x.text, guidance: x.guidance ?? "", weight: x.weight })),
      },
    });
  };

  const all = q.data ?? [];
  const rows = useMemo(() => {
    const s = search.trim().toLowerCase();
    return s ? all.filter((t) => [t.name, t.framework, t.description].some((x) => x?.toLowerCase().includes(s))) : all;
  }, [all, search]);

  const columns: Column<AssessmentTemplate>[] = [
    {
      key: "name", header: "Template", render: (t) => (
        <div className="min-w-0 max-w-[16rem] 2xl:max-w-md">
          <p className="font-medium text-ink-900 truncate">{t.name}</p>
          {t.description && <p className="text-xs text-ink-500 truncate mt-0.5">{t.description}</p>}
        </div>
      ),
    },
    {
      key: "framework", header: "Framework", render: (t) => (
        <div className="flex flex-col items-start gap-1">
          {t.framework ? <Badge tone="brand">{t.framework}</Badge> : <span className="text-ink-400">—</span>}
          <span className="font-mono text-[11px] text-ink-500">v{t.version}</span>
        </div>
      ),
    },
    { key: "questions", header: "Questions", align: "right", render: (t) => <span className="tnum">{t.question_count ?? 0}</span> },
    { key: "usage", header: "Assessments", align: "right", render: (t) => <span className="tnum text-ink-700" title={`Used in ${t.usage_count ?? 0} assessment${t.usage_count === 1 ? "" : "s"}`}>{t.usage_count ?? 0}</span> },
    {
      key: "active", header: "Active", align: "center", render: (t) => (
        <Switch checked={!!t.active} onChange={() => toggle.mutate(t)} disabled={!canWrite} loading={pendingId === t.id} label={`${t.active ? "Deactivate" : "Activate"} ${t.name}`} />
      ),
    },
    {
      key: "actions", header: <span className="sr-only">Actions</span>, align: "right", render: (t) => (
        <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          <Button size="xs" variant="ghost" icon={Eye} onClick={() => setViewId(t.id)} aria-label={`View ${t.name}`} title="View questions" />
          {canWrite && <Button size="xs" variant="ghost" icon={Copy} onClick={() => duplicate(t)} aria-label={`Duplicate ${t.name}`} title="Duplicate as new template" />}
        </div>
      ),
    },
  ];

  return (
    <>
      <Card padded={false}>
        <div className="flex flex-wrap items-start justify-between gap-3 p-5 pb-4">
          <div>
            <h3 className="text-sm font-semibold text-ink-900">Assessment templates</h3>
            <p className="text-sm text-ink-500 mt-0.5">Questionnaires used to assess vendor controls. {all.filter((t) => t.active).length} active of {all.length}.</p>
          </div>
          {canWrite && <Button icon={Plus} onClick={() => setBuilder({ open: true, seed: null })}>New template</Button>}
        </div>
        <div className="flex flex-wrap items-center gap-2 px-5 pb-4">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-400" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search templates…" className="pl-9" aria-label="Search templates" />
          </div>
          {!canWrite && <span className="ml-auto text-xs text-ink-500">You have read-only access to templates.</span>}
        </div>
        <div className="border-t border-ink-200">
          <DataTable<AssessmentTemplate> columns={columns} rows={rows} loading={q.isLoading} onRowClick={(t) => setViewId(t.id)} emptyTitle={search ? "No templates match" : "No templates yet"} emptyDescription={search ? "Try a different search." : "Create a template to start assessing vendors."} />
        </div>
      </Card>
      <TemplateViewer id={viewId} onClose={() => setViewId(null)} onDuplicate={canWrite ? duplicate : undefined} />
      <TemplateBuilder open={builder.open} seed={builder.seed} onClose={() => setBuilder((b) => ({ ...b, open: false }))} />
    </>
  );
}
