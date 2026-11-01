import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  CalendarDays,
  CircleCheck,
  CornerDownLeft,
  Ellipsis,
  FileText,
  Flag,
  ListChecks,
  Package,
  Pencil,
  Plus,
  StickyNote,
  Trash2,
} from 'lucide-react';
import { useUI } from '@/app/ui';
import { Button, Card, Checkbox, EmptyState, Menu, Monogram, PageHeader, Segmented, cx, useToast } from '@/components/ui';
import { compareISO, diffDays, formatDate, relativeDays } from '@/lib/dates';
import type { Task } from '@/lib/types';
import { useActions, useData, useToday } from '@/store/store';
import { GROUP_LABELS, compareTasks, parseQuickTask, resolveLink, taskGroup, type TaskGroupId } from './taskUtils';
import './tasks.css';

type View = 'open' | 'today' | 'upcoming' | 'done';

const VIEW_GROUPS: Record<View, TaskGroupId[]> = {
  open: ['overdue', 'today', 'week', 'later', 'none'],
  today: ['overdue', 'today'],
  upcoming: ['week', 'later'],
  done: ['done'],
};

export function TasksPage() {
  const data = useData();
  const today = useToday();
  const actions = useActions();
  const toast = useToast();
  const { openEditor } = useUI();
  const [params, setParams] = useSearchParams();
  const [view, setView] = useState<View>('open');
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const openParam = params.get('open');
  useEffect(() => {
    if (!openParam) return;
    if (data.tasks.some((t) => t.id === openParam)) openEditor({ kind: 'task', id: openParam });
    const next = new URLSearchParams(params);
    next.delete('open');
    setParams(next, { replace: true });
  }, [openParam, data.tasks, openEditor, params, setParams]);

  const parsed = useMemo(() => parseQuickTask(draft, today), [draft, today]);

  const buckets = useMemo(() => {
    const map = new Map<TaskGroupId, Task[]>();
    for (const t of data.tasks) {
      const g = taskGroup(t, today);
      const list = map.get(g) ?? [];
      list.push(t);
      map.set(g, list);
    }
    for (const [g, list] of map) {
      if (g === 'done') list.sort((a, b) => (b.doneAt ?? '').localeCompare(a.doneAt ?? '') || a.title.localeCompare(b.title));
      else list.sort(compareTasks);
    }
    return map;
  }, [data.tasks, today]);

  const count = (v: View) => VIEW_GROUPS[v].reduce((a, g) => a + (buckets.get(g)?.length ?? 0), 0);
  const groups = VIEW_GROUPS[view].map((g) => ({ id: g, tasks: buckets.get(g) ?? [] })).filter((g) => g.tasks.length > 0);
  const overdueCount = buckets.get('overdue')?.length ?? 0;
  const doneThisWeek = (buckets.get('done') ?? []).filter((t) => t.doneAt && diffDays(today, t.doneAt.slice(0, 10)) <= 7).length;

  const quickAdd = (e: FormEvent) => {
    e.preventDefault();
    if (!parsed.title.trim()) {
      inputRef.current?.focus();
      return;
    }
    const t = actions.saveTask({ title: parsed.title.trim(), dueDate: parsed.dueDate, done: false, priority: 'normal' });
    setDraft('');
    toast({
      title: 'Task added',
      description: t.dueDate ? `${t.title} · due ${relativeDays(t.dueDate, today).toLowerCase()}` : t.title,
      action: { label: 'Edit', onClick: () => openEditor({ kind: 'task', id: t.id }) },
    });
    if (view === 'done') setView('open');
  };

  const toggle = (t: Task) => {
    actions.toggleTask(t.id);
    if (!t.done) {
      toast({ title: 'Nice — task done', description: t.title, action: { label: 'Undo', onClick: () => actions.toggleTask(t.id) } });
    }
  };

  const remove = (t: Task) => {
    const snap = actions.remove('tasks', t.id);
    if (snap) toast({ title: 'Task deleted', description: t.title, tone: 'info', action: { label: 'Undo', onClick: () => actions.restore(snap) } });
  };

  const clearDone = () => {
    const done = buckets.get('done') ?? [];
    const snaps = done.map((t) => actions.remove('tasks', t.id)).filter((s): s is NonNullable<typeof s> => !!s);
    if (snaps.length) {
      toast({
        title: `Cleared ${snaps.length} completed task${snaps.length === 1 ? '' : 's'}`,
        tone: 'info',
        action: { label: 'Undo', onClick: () => [...snaps].reverse().forEach((s) => actions.restore(s)) },
      });
    }
  };

  const description =
    overdueCount > 0
      ? `${overdueCount} overdue · ${count('open')} open${doneThisWeek ? ` · ${doneThisWeek} done this week` : ''}`
      : count('open') > 0
        ? `${count('open')} open, nothing overdue${doneThisWeek ? ` · ${doneThisWeek} done this week` : ''}`
        : 'Small to-dos that keep renewals, returns and paperwork on track.';

  return (
    <div className="tasks-page">
      <PageHeader
        title="Tasks"
        description={description}
        actions={
          <Button variant="primary" icon={<Plus size={16} />} onClick={() => openEditor({ kind: 'task' })}>
            New task
          </Button>
        }
      />

      <Card className="tasks-quick" padded={false}>
        <form onSubmit={quickAdd} className="tasks-quick-form">
          <Plus size={18} className="tasks-quick-icon" aria-hidden />
          <label htmlFor="tasks-quick-input" className="sr-only">
            Quick add a task
          </label>
          <input
            id="tasks-quick-input"
            ref={inputRef}
            className="tasks-quick-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder='New task… try "call bank friday"'
            autoComplete="off"
            maxLength={160}
          />
          {parsed.dueDate && (
            <span className="tasks-parsed" title={`Due ${formatDate(parsed.dueDate, 'long', data.settings.locale)}`}>
              <CalendarDays size={14} aria-hidden />
              <span>
                {formatDate(parsed.dueDate, 'dayMonth', data.settings.locale)}
                <span className="tasks-parsed-rel"> · {relativeDays(parsed.dueDate, today)}</span>
              </span>
            </span>
          )}
          <Button type="submit" variant={draft.trim() ? 'primary' : 'secondary'} size="sm" disabled={!draft.trim()} className="tasks-quick-submit">
            <span className="hide-sm">Add</span>
            <CornerDownLeft size={14} aria-hidden />
          </Button>
        </form>
        {parsed.dueDate && parsed.matched && (
          <p className="tasks-quick-hint" aria-live="polite">
            Creates <strong>"{parsed.title}"</strong> due {formatDate(parsed.dueDate, 'long', data.settings.locale)}. Picked up from "{parsed.matched}".
          </p>
        )}
      </Card>

      <div className="tasks-toolbar">
        <Segmented<View>
          ariaLabel="Filter tasks"
          value={view}
          onChange={setView}
          options={[
            { value: 'open', label: 'Open', count: count('open') },
            { value: 'today', label: <>Today<span className="tasks-hide-sm"> & overdue</span></>, count: count('today') },
            { value: 'upcoming', label: 'Upcoming', count: count('upcoming') },
            { value: 'done', label: 'Done', count: count('done') },
          ]}
        />
        {view === 'done' && count('done') > 0 && (
          <Button variant="ghost" size="sm" icon={<Trash2 size={14} />} onClick={clearDone}>
            Clear completed
          </Button>
        )}
      </div>

      {groups.length === 0 ? (
        <Card>
          <TasksEmpty view={view} hasAny={data.tasks.length > 0} onAdd={() => inputRef.current?.focus()} onShowOpen={() => setView('open')} />
        </Card>
      ) : (
        <div className="tasks-groups">
          {groups.map((g) => (
            <section key={g.id} className="tasks-group" aria-labelledby={`tasks-g-${g.id}`}>
              <h2 id={`tasks-g-${g.id}`} className={cx('tasks-group-title', g.id === 'overdue' && 'is-overdue')}>
                {GROUP_LABELS[g.id]}
                <span className="tasks-group-count">{g.tasks.length}</span>
              </h2>
              <Card padded={false}>
                <ul className="tasks-list">
                  {g.tasks.map((t) => (
                    <TaskRow key={t.id} task={t} onToggle={() => toggle(t)} onEdit={() => openEditor({ kind: 'task', id: t.id })} onDelete={() => remove(t)} />
                  ))}
                </ul>
              </Card>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function TaskRow({ task, onToggle, onEdit, onDelete }: { task: Task; onToggle: () => void; onEdit: () => void; onDelete: () => void }) {
  const data = useData();
  const today = useToday();
  const link = resolveLink(data, task.link);
  const overdue = !task.done && !!task.dueDate && compareISO(task.dueDate, today) < 0;
  const dueToday = !task.done && task.dueDate === today;

  return (
    <li className={cx('tasks-row', task.done && 'is-done')}>
      <Checkbox checked={task.done} onChange={onToggle} ariaLabel={task.done ? `Mark "${task.title}" as not done` : `Mark "${task.title}" as done`} className="tasks-check" />
      <div className="tasks-row-main">
        <button type="button" className="tasks-row-title" onClick={onEdit}>
          {task.title}
        </button>
        <div className="tasks-row-meta">
          {task.priority !== 'normal' && !task.done && (
            <span className={cx('tasks-flag', `is-${task.priority}`)}>
              <Flag size={12} aria-hidden fill={task.priority === 'high' ? 'currentColor' : 'none'} />
              {task.priority === 'high' ? 'High' : 'Low'}
            </span>
          )}
          {task.dueDate && (
            <span
              className={cx('tasks-due', overdue && 'is-overdue', dueToday && 'is-today')}
              title={formatDate(task.dueDate, 'long', data.settings.locale)}
            >
              <CalendarDays size={12} aria-hidden />
              {task.done ? formatDate(task.dueDate, 'short', data.settings.locale) : relativeDays(task.dueDate, today)}
              {!task.done && !dueToday && Math.abs(diffDays(task.dueDate, today)) > 1 && (
                <span className="tasks-due-abs"> · {formatDate(task.dueDate, 'short', data.settings.locale)}</span>
              )}
            </span>
          )}
          {task.done && task.doneAt && <span className="tasks-donemeta">Done {relativeDays(task.doneAt.slice(0, 10), today).toLowerCase()}</span>}
          {task.notes && (
            <span className="tasks-note" title={task.notes}>
              <StickyNote size={12} aria-hidden />
              Notes
            </span>
          )}
        </div>
      </div>
      {link && (
        <Link
          to={link.path}
          className="tasks-link"
          title={`${link.kindLabel}: ${link.name}`}
        >
          {link.kind === 'subscription' ? (
            <Monogram name={link.name} color={link.color} size={20} />
          ) : (
            <span className="tasks-link-icon" aria-hidden>
              {link.kind === 'document' ? <FileText size={12} /> : <Package size={12} />}
            </span>
          )}
          <span className="truncate">{link.name}</span>
        </Link>
      )}
      <Menu
        label={`Actions for ${task.title}`}
        trigger={(p) => (
          <Button variant="ghost" size="sm" iconOnly icon={<Ellipsis size={16} />} aria-label={`More actions for ${task.title}`} {...p} />
        )}
        items={[
          { label: 'Edit', icon: <Pencil size={15} />, onSelect: onEdit },
          { label: task.done ? 'Mark as not done' : 'Mark as done', icon: <CircleCheck size={15} />, onSelect: onToggle },
          'divider',
          { label: 'Delete', icon: <Trash2 size={15} />, onSelect: onDelete, danger: true },
        ]}
      />
    </li>
  );
}

function TasksEmpty({ view, hasAny, onAdd, onShowOpen }: { view: View; hasAny: boolean; onAdd: () => void; onShowOpen: () => void }) {
  if (!hasAny) {
    return (
      <EmptyState
        icon={<ListChecks size={22} />}
        title="No tasks yet"
        description='Type a task above and press Enter. Add a date in plain words, like "tomorrow" or "in 3 days".'
        action={
          <Button variant="primary" icon={<Plus size={16} />} onClick={onAdd}>
            Add your first task
          </Button>
        }
      />
    );
  }
  const copy: Record<View, { title: string; desc: string }> = {
    open: { title: 'All clear', desc: 'Every task is done. Add another whenever something comes up.' },
    today: { title: 'Nothing due today', desc: 'No overdue tasks either. Enjoy the quiet.' },
    upcoming: { title: 'Nothing scheduled ahead', desc: 'Tasks with a future due date will show up here.' },
    done: { title: 'Nothing completed yet', desc: 'Tick a task off and it will move here.' },
  };
  return (
    <EmptyState
      icon={view === 'done' ? <CircleCheck size={22} /> : <ListChecks size={22} />}
      title={copy[view].title}
      description={copy[view].desc}
      action={
        view === 'open' ? (
          <Button variant="primary" icon={<Plus size={16} />} onClick={onAdd}>
            Add a task
          </Button>
        ) : (
          <Button variant="secondary" icon={<ListChecks size={16} />} onClick={onShowOpen}>
            Show all open tasks
          </Button>
        )
      }
    />
  );
}
