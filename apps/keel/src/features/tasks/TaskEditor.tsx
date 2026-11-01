import { useEffect, useId, useMemo, useState, type FormEvent } from 'react';
import { Trash2 } from 'lucide-react';
import type { EditorProps } from '@/app/ui';
import { Button, Field, Input, Modal, Segmented, Select, Textarea, useToast } from '@/components/ui';
import { addDays, formatDate, isValidISO, relativeDays } from '@/lib/dates';
import { documentTypeMeta } from '@/lib/meta';
import type { Priority, Task } from '@/lib/types';
import { useActions, useData, useToday } from '@/store/store';
import { decodeLink, encodeLink } from './taskUtils';
import './tasks.css';

interface FormState {
  title: string;
  dueDate: string;
  priority: Priority;
  link: string;
  notes: string;
  done: boolean;
}

const EMPTY: FormState = { title: '', dueDate: '', priority: 'normal', link: '', notes: '', done: false };

export function TaskEditor({ open, id, defaults, onClose }: EditorProps<Task>) {
  const data = useData();
  const today = useToday();
  const actions = useActions();
  const toast = useToast();
  const formId = useId();
  const existing = id ? data.tasks.find((t) => t.id === id) : undefined;
  const [form, setForm] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<{ title?: string; dueDate?: string }>({});

  useEffect(() => {
    if (!open) return;
    const src: Partial<Task> = existing ?? defaults ?? {};
    setForm({
      title: src.title ?? '',
      dueDate: src.dueDate ?? '',
      priority: src.priority ?? 'normal',
      link: encodeLink(src.link),
      notes: src.notes ?? '',
      done: src.done ?? false,
    });
    setErrors({});
  }, [open, id]);

  const linkGroups = useMemo(() => {
    const subs = [...data.subscriptions].sort((a, b) => a.name.localeCompare(b.name));
    const docs = [...data.documents].sort((a, b) => a.name.localeCompare(b.name) || a.holder.localeCompare(b.holder));
    const buys = [...data.purchases].sort((a, b) => a.item.localeCompare(b.item));
    return [
      {
        label: 'Subscriptions & bills',
        options: subs.map((s) => ({ value: `subscription:${s.id}`, label: s.status === 'cancelled' ? `${s.name} (cancelled)` : s.name })),
      },
      {
        label: 'Documents & IDs',
        options: docs.map((d) => ({ value: `document:${d.id}`, label: `${d.name} · ${d.holder || documentTypeMeta(d.type).label}` })),
      },
      {
        label: 'Purchases',
        options: buys.map((p) => ({ value: `purchase:${p.id}`, label: p.brand ? `${p.item} · ${p.brand}` : p.item })),
      },
    ].filter((g) => g.options.length > 0);
  }, [data.subscriptions, data.documents, data.purchases]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    const next: typeof errors = {};
    const title = form.title.trim();
    if (!title) next.title = 'Give the task a short title.';
    else if (title.length > 160) next.title = 'Keep the title under 160 characters.';
    if (form.dueDate && !isValidISO(form.dueDate)) next.dueDate = 'Pick a valid date.';
    setErrors(next);
    if (Object.keys(next).length) return;
    const saved = actions.saveTask({
      ...(existing ?? {}),
      id: existing?.id,
      title,
      dueDate: form.dueDate || undefined,
      priority: form.priority,
      link: decodeLink(form.link),
      notes: form.notes.trim() || undefined,
      done: form.done,
      doneAt: form.done ? existing?.doneAt ?? new Date().toISOString() : undefined,
    });
    toast({ title: existing ? 'Task updated' : 'Task added', description: saved.title });
    onClose();
  };

  const remove = () => {
    if (!existing) return;
    const snap = actions.remove('tasks', existing.id);
    onClose();
    if (snap) toast({ title: 'Task deleted', description: existing.title, tone: 'info', action: { label: 'Undo', onClick: () => actions.restore(snap) } });
  };

  const quickDates = [
    { label: 'Today', value: today },
    { label: 'Tomorrow', value: addDays(today, 1) },
    { label: 'Next week', value: addDays(today, 7) },
  ];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={existing ? 'Edit task' : 'New task'}
      description={existing ? undefined : 'A reminder to do something, optionally tied to a subscription, document or purchase.'}
      footer={
        <>
          {existing && (
            <Button variant="ghost" icon={<Trash2 size={16} />} onClick={remove} className="tasks-editor-delete">
              Delete
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form={formId}>
            {existing ? 'Save changes' : 'Add task'}
          </Button>
        </>
      }
    >
      <form id={formId} className="form-grid" onSubmit={submit} noValidate>
        <Field label="Title" required htmlFor={`${formId}-title`} error={errors.title} className="span-2">
          <Input
            id={`${formId}-title`}
            value={form.title}
            onChange={(e) => set('title', e.target.value)}
            placeholder="e.g. Book a passport photo appointment"
            invalid={!!errors.title}
            autoComplete="off"
            data-autofocus
          />
        </Field>
        <Field
          label="Due date"
          optional
          htmlFor={`${formId}-due`}
          error={errors.dueDate}
          hint={form.dueDate && isValidISO(form.dueDate) ? `${formatDate(form.dueDate, 'long', data.settings.locale)} · ${relativeDays(form.dueDate, today)}` : undefined}
        >
          <Input id={`${formId}-due`} type="date" value={form.dueDate} onChange={(e) => set('dueDate', e.target.value)} invalid={!!errors.dueDate} />
          <div className="tasks-quickdates">
            {quickDates.map((q) => (
              <button
                key={q.label}
                type="button"
                className={form.dueDate === q.value ? 'tasks-chipbtn is-active' : 'tasks-chipbtn'}
                onClick={() => set('dueDate', q.value)}
              >
                {q.label}
              </button>
            ))}
            {form.dueDate && (
              <button type="button" className="tasks-chipbtn" onClick={() => set('dueDate', '')}>
                Clear
              </button>
            )}
          </div>
        </Field>
        <Field label="Priority">
          <Segmented<Priority>
            ariaLabel="Priority"
            value={form.priority}
            onChange={(v) => set('priority', v)}
            options={[
              { value: 'low', label: 'Low' },
              { value: 'normal', label: 'Normal' },
              { value: 'high', label: 'High' },
            ]}
          />
        </Field>
        <Field label="Linked to" optional htmlFor={`${formId}-link`} className="span-2" hint="Linking keeps the task next to the thing it's about.">
          <Select id={`${formId}-link`} value={form.link} onChange={(e) => set('link', e.target.value)}>
            <option value="">Nothing linked</option>
            {linkGroups.map((g) => (
              <optgroup key={g.label} label={g.label}>
                {g.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </Select>
        </Field>
        <Field label="Notes" optional htmlFor={`${formId}-notes`} className="span-2">
          <Textarea
            id={`${formId}-notes`}
            value={form.notes}
            onChange={(e) => set('notes', e.target.value)}
            placeholder="Anything you'll need: phone numbers, what to bring, reference numbers…"
            rows={3}
          />
        </Field>
      </form>
    </Modal>
  );
}
