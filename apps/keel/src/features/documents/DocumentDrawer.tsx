import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { CalendarPlus, CircleCheck, Lightbulb, ListChecks, Pencil, RefreshCw, Trash2 } from 'lucide-react';
import { useUI } from '@/app/ui';
import {
  Badge,
  Button,
  Checkbox,
  DescriptionList,
  Drawer,
  Field,
  Input,
  Modal,
  cx,
  useToast,
} from '@/components/ui';
import { addDays, compareISO, diffDays, formatDate, isValidISO, maxISO, minISO, relativeDays } from '@/lib/dates';
import { documentStatus, renewalWindowStart } from '@/lib/engine';
import { documentTypeMeta } from '@/lib/meta';
import { ROUTES } from '@/lib/routes';
import type { DocumentItem } from '@/lib/types';
import { useActions, useData, useToday } from '@/store/store';
import { useLinkedTaskFollowUp } from '@/features/tasks/useLinkedTaskFollowUp';
import { DOC_ICONS, DOC_STATUS, RENEWAL_TIPS, statusSentence, suggestedRenewalExpiry } from './docMeta';

export function DocumentDrawer({ doc, onClose }: { doc: DocumentItem; onClose: () => void }) {
  const data = useData();
  const today = useToday();
  const actions = useActions();
  const toast = useToast();
  const { openEditor } = useUI();
  const [renewing, setRenewing] = useState(false);
  const locale = data.settings.locale;

  const st = documentStatus(doc, today);
  const meta = DOC_STATUS[st];
  const typeMeta = documentTypeMeta(doc.type);
  const Icon = DOC_ICONS[doc.type];
  const win = renewalWindowStart(doc);
  const tasks = data.tasks.filter((t) => t.link?.kind === 'document' && t.link.id === doc.id);
  const label = `${doc.holder}’s ${doc.name}`;

  const remove = () => {
    const snap = actions.remove('documents', doc.id);
    onClose();
    if (snap) {
      toast({
        title: 'Document deleted',
        description: label,
        tone: 'info',
        action: { label: 'Undo', onClick: () => actions.restore(snap) },
      });
    }
  };

  const createTask = () => {
    const due = win ? maxISO(win, today) : today;
    openEditor({
      kind: 'task',
      defaults: {
        title: `Renew ${label}`,
        dueDate: doc.expiresOn ? minISO(due, doc.expiresOn) : undefined,
        priority: st === 'expired' || st === 'renew_now' ? 'high' : 'normal',
        link: { kind: 'document', id: doc.id },
      },
    });
  };

  return (
    <>
      <Drawer
        open
        onClose={onClose}
        width={560}
        title={doc.name}
        subtitle={`${typeMeta.label} · ${doc.holder}`}
        headerExtra={
          <span className={cx('docs-type-icon', 'docs-type-lg', `docs-type-${st}`)} aria-hidden>
            <Icon size={20} />
          </span>
        }
        footer={
          <>
            <Button variant="ghost" className="docs-delete" icon={<Trash2 size={16} />} onClick={remove}>
              Delete
            </Button>
            <Button icon={<CalendarPlus size={16} />} onClick={createTask}>
              Create task
            </Button>
            <Button icon={<RefreshCw size={16} />} onClick={() => setRenewing(true)}>
              Mark renewed
            </Button>
            <Button variant="primary" icon={<Pencil size={16} />} onClick={() => openEditor({ kind: 'document', id: doc.id })}>
              Edit
            </Button>
          </>
        }
      >
        <div className="docs-drawer">
          <div className={cx('docs-callout', `docs-callout-${st}`)}>
            <Badge tone={meta.tone} dot>
              {meta.label}
            </Badge>
            <p>{statusSentence(doc, today)}</p>
          </div>

          <section aria-labelledby="docs-tl-title">
            <h3 id="docs-tl-title" className="docs-section-title">
              Renewal timeline
            </h3>
            <RenewalTimeline doc={doc} today={today} locale={locale} />
          </section>

          <section aria-labelledby="docs-facts-title">
            <h3 id="docs-facts-title" className="docs-section-title">
              Details
            </h3>
            <DescriptionList
              items={[
                { label: 'Type', value: typeMeta.label },
                { label: 'Holder', value: doc.holder },
                { label: 'Issued by', value: doc.issuer || '—' },
                {
                  label: 'Number',
                  value: doc.numberLast4 ? (
                    <span className="tabular docs-mono">•••• {doc.numberLast4}</span>
                  ) : (
                    <span className="muted">Not saved</span>
                  ),
                },
                { label: 'Issued', value: doc.issuedOn ? formatDate(doc.issuedOn, 'medium', locale) : '—' },
                {
                  label: 'Expires',
                  value: doc.expiresOn ? (
                    <span>
                      {formatDate(doc.expiresOn, 'medium', locale)}{' '}
                      <span className="muted">· {relativeDays(doc.expiresOn, today)}</span>
                    </span>
                  ) : (
                    'Doesn’t expire'
                  ),
                },
                {
                  label: 'Renewal reminder',
                  value: win
                    ? `${doc.renewalLeadDays} days before · from ${formatDate(win, 'medium', locale)}`
                    : `${doc.renewalLeadDays} days before expiry`,
                },
                { label: 'Stored at', value: doc.storedAt || '—' },
                ...(doc.notes ? [{ label: 'Notes', value: <span className="docs-notes">{doc.notes}</span> }] : []),
              ]}
            />
          </section>

          <section aria-labelledby="docs-tips-title">
            <h3 id="docs-tips-title" className="docs-section-title">
              <Lightbulb size={15} aria-hidden /> Renewal checklist
            </h3>
            <ul className="docs-tips">
              {RENEWAL_TIPS[doc.type].map((tip) => (
                <li key={tip}>
                  <CircleCheck size={16} aria-hidden />
                  <span>{tip}</span>
                </li>
              ))}
            </ul>
            <p className="docs-disclaimer">General pointers only. Check with the issuing office for exact requirements, fees and timing.</p>
          </section>

          <section aria-labelledby="docs-tasks-title">
            <h3 id="docs-tasks-title" className="docs-section-title">
              <ListChecks size={15} aria-hidden /> Related tasks
            </h3>
            {tasks.length === 0 ? (
              <div className="docs-tasks-empty">
                <span className="muted">No tasks linked yet.</span>
                <Button size="sm" variant="subtle" icon={<CalendarPlus size={14} />} onClick={createTask}>
                  Create task
                </Button>
              </div>
            ) : (
              <ul className="docs-tasks">
                {tasks.map((t) => (
                  <li key={t.id} className={cx('docs-task', t.done && 'is-done')}>
                    <Checkbox checked={t.done} onChange={() => actions.toggleTask(t.id)} ariaLabel={`Mark “${t.title}” as ${t.done ? 'not done' : 'done'}`} />
                    <Link to={`${ROUTES.tasks}?open=${t.id}`} className="docs-task-title truncate">
                      {t.title}
                    </Link>
                    {t.dueDate && (
                      <span
                        className={cx(
                          'docs-task-due',
                          !t.done && compareISO(t.dueDate, today) < 0 && 'is-overdue',
                        )}
                      >
                        {formatDate(t.dueDate, 'short', locale)}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </Drawer>
      {renewing && <MarkRenewedModal doc={doc} onClose={() => setRenewing(false)} />}
    </>
  );
}

function RenewalTimeline({ doc, today, locale }: { doc: DocumentItem; today: string; locale: string }) {
  if (!doc.expiresOn) {
    return (
      <div className="docs-tl-empty">
        No expiry date saved. Add one to see the renewal timeline and get reminders.
      </div>
    );
  }
  const exp = doc.expiresOn;
  const win = renewalWindowStart(doc) ?? exp;
  const issued = doc.issuedOn && compareISO(doc.issuedOn, exp) < 0 ? doc.issuedOn : undefined;
  const expired = compareISO(today, exp) > 0;
  const hasWindow = compareISO(win, exp) < 0;
  const start = issued ?? addDays(minISO(win, today), -Math.max(365, doc.renewalLeadDays));
  const end = addDays(today, Math.max(3, Math.round(diffDays(today, exp) * 0.35)));
  const stops: [string, number][] = expired
    ? hasWindow
      ? [[start, 0], [win, 46], [exp, 76], [end, 100]]
      : [[start, 0], [exp, 76], [end, 100]]
    : hasWindow
      ? [[start, 0], [win, 62], [exp, 100]]
      : [[start, 0], [exp, 100]];
  const pos = (iso: string) => {
    if (compareISO(iso, stops[0][0]) <= 0) return 0;
    for (let i = 0; i < stops.length - 1; i++) {
      const [a, pa] = stops[i];
      const [b, pb] = stops[i + 1];
      if (compareISO(iso, b) <= 0) {
        const span = Math.max(1, diffDays(b, a));
        return pa + ((pb - pa) * diffDays(iso, a)) / span;
      }
    }
    return 100;
  };

  const pWin = pos(win);
  const pExp = pos(exp);
  const pToday = pos(today);
  const todayAlign = pToday < 12 ? 'start' : pToday > 88 ? 'end' : 'center';

  return (
    <div className="docs-tl">
      <div className="docs-tl-area">
        <div className={cx('docs-tl-today', `docs-tl-today-${todayAlign}`)} style={{ left: `${pToday}%` }}>
          <span className="docs-tl-today-label">Today</span>
        </div>
        <div className="docs-tl-track" role="img" aria-label={`Issued ${issued ? formatDate(issued, 'medium', locale) : 'date not set'}, renewal window opens ${formatDate(win, 'medium', locale)}, expires ${formatDate(exp, 'medium', locale)}.`}>
          <span className={cx('docs-tl-seg', 'docs-tl-valid', !issued && 'is-unknown')} style={{ left: 0, width: `${pWin}%` }} />
          <span className="docs-tl-seg docs-tl-window" style={{ left: `${pWin}%`, width: `${Math.max(0.8, pExp - pWin)}%` }} />
          {expired && <span className="docs-tl-seg docs-tl-over" style={{ left: `${pExp}%`, width: `${100 - pExp}%` }} />}
          <span className="docs-tl-elapsed" style={{ width: `${pToday}%` }} />
          {issued && <span className="docs-tl-dot docs-tl-dot-issued" style={{ left: `${pos(issued)}%` }} />}
          <span className="docs-tl-dot docs-tl-dot-window" style={{ left: `${pWin}%` }} />
          <span className="docs-tl-dot docs-tl-dot-exp" style={{ left: `${pExp}%` }} />
        </div>
      </div>
      <ol className="docs-tl-legend">
        <li>
          <span className="docs-tl-key docs-tl-key-issued" aria-hidden />
          <span className="docs-tl-legend-label">Issued</span>
          <span className="docs-tl-legend-date">{issued ? formatDate(issued, 'medium', locale) : 'Not set'}</span>
        </li>
        <li>
          <span className="docs-tl-key docs-tl-key-window" aria-hidden />
          <span className="docs-tl-legend-label">Renewal opens</span>
          <span className="docs-tl-legend-date">{formatDate(win, 'medium', locale)}</span>
          <span className="docs-tl-legend-rel">{relativeDays(win, today)}</span>
        </li>
        <li>
          <span className="docs-tl-key docs-tl-key-exp" aria-hidden />
          <span className="docs-tl-legend-label">Expires</span>
          <span className="docs-tl-legend-date">{formatDate(exp, 'medium', locale)}</span>
          <span className="docs-tl-legend-rel">{relativeDays(exp, today)}</span>
        </li>
      </ol>
    </div>
  );
}

function MarkRenewedModal({ doc, onClose }: { doc: DocumentItem; onClose: () => void }) {
  const today = useToday();
  const actions = useActions();
  const toast = useToast();
  const { settings } = useData();
  const followUp = useLinkedTaskFollowUp();
  const [expiry, setExpiry] = useState(() => suggestedRenewalExpiry(doc, today));
  const [error, setError] = useState<string | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!isValidISO(expiry)) return setError('Enter the new expiry date.');
    if (compareISO(expiry, today) <= 0) return setError('The new expiry date should be in the future.');
    const { id, type, name, holder, issuer, numberLast4, renewalLeadDays, storedAt, notes } = doc;
    actions.saveDocument({ id, type, name, holder, issuer, numberLast4, renewalLeadDays, storedAt, notes, issuedOn: today, expiresOn: expiry });
    toast({
      title: `${doc.name} marked as renewed`,
      description: `Now valid until ${formatDate(expiry, 'medium', settings.locale)}.`,
    });
    followUp({ kind: 'document', id: doc.id }, 'it is renewed');
    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title="Mark as renewed"
      description={`Record the new expiry date for ${doc.holder}’s ${doc.name}. The issue date will be set to today.`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="docs-renew-form">
            Save renewal
          </Button>
        </>
      }
    >
      <form id="docs-renew-form" onSubmit={submit} noValidate>
        <Field label="New expiry date" htmlFor="docs-renew-date" required error={error} hint="Pre-filled with a typical validity period — change it to match the new document.">
          <Input
            id="docs-renew-date"
            type="date"
            value={expiry}
            min={addDays(today, 1)}
            onChange={(e) => {
              setExpiry(e.target.value);
              setError(null);
            }}
            invalid={!!error}
            data-autofocus
          />
        </Field>
      </form>
    </Modal>
  );
}
