import { useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock } from 'lucide-react';
import type { EditorProps } from '@/app/ui';
import { Button, Field, Input, Modal, Select, Textarea, cx, useToast } from '@/components/ui';
import { addDays, compareISO, formatDate, isValidISO, relativeDays } from '@/lib/dates';
import { DOCUMENT_TYPES, documentTypeMeta } from '@/lib/meta';
import { ROUTES } from '@/lib/routes';
import type { DocumentItem, DocumentType } from '@/lib/types';
import { useActions, useData, useToday } from '@/store/store';
import './documents.css';

const LEAD_CHIPS = [14, 30, 60, 90, 180];
const OTHER = '__other__';
const STORAGE_SUGGESTIONS = ['Home safe', 'Wallet', 'Glovebox', 'Filing cabinet', 'Desk drawer', 'Phone wallet app'];

interface Draft {
  type: DocumentType;
  name: string;
  holderChoice: string;
  holderOther: string;
  issuer: string;
  numberLast4: string;
  issuedOn: string;
  expiresOn: string;
  renewalLeadDays: string;
  storedAt: string;
  notes: string;
}

type Errors = Partial<Record<keyof Draft, string>>;

export function DocumentEditor(props: EditorProps<DocumentItem>) {
  if (!props.open) return null;
  return <DocumentEditorForm key={props.id ?? 'new'} {...props} />;
}

function DocumentEditorForm({ id, defaults, onClose }: EditorProps<DocumentItem>) {
  const data = useData();
  const today = useToday();
  const actions = useActions();
  const toast = useToast();
  const navigate = useNavigate();
  const existing = id ? data.documents.find((d) => d.id === id) : undefined;

  const members = useMemo(() => {
    const out = [...data.settings.householdMembers];
    for (const d of data.documents) if (d.holder && !out.includes(d.holder)) out.push(d.holder);
    return out;
  }, [data.settings.householdMembers, data.documents]);

  const [draft, setDraft] = useState<Draft>(() => {
    const src: Partial<DocumentItem> = existing ?? defaults ?? {};
    const type = src.type ?? 'passport';
    const holder = src.holder ?? members[0] ?? '';
    const known = members.includes(holder);
    return {
      type,
      name: src.name ?? documentTypeMeta(type).label,
      holderChoice: known || !holder ? holder : OTHER,
      holderOther: known ? '' : holder,
      issuer: src.issuer ?? '',
      numberLast4: src.numberLast4 ?? '',
      issuedOn: src.issuedOn ?? '',
      expiresOn: src.expiresOn ?? '',
      renewalLeadDays: String(src.renewalLeadDays ?? documentTypeMeta(type).defaultLead),
      storedAt: src.storedAt ?? '',
      notes: src.notes ?? '',
    };
  });
  const [errors, setErrors] = useState<Errors>({});

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const changeType = (type: DocumentType) => {
    setDraft((d) => {
      const prevLabel = documentTypeMeta(d.type).label;
      const autoName = d.name.trim() === '' || d.name === prevLabel;
      return {
        ...d,
        type,
        name: autoName ? documentTypeMeta(type).label : d.name,
        renewalLeadDays: String(documentTypeMeta(type).defaultLead),
      };
    });
  };

  const validate = (): Errors => {
    const e: Errors = {};
    if (!draft.name.trim()) e.name = 'Give it a name, like “Passport”.';
    const holder = draft.holderChoice === OTHER ? draft.holderOther.trim() : draft.holderChoice;
    if (!holder) e[draft.holderChoice === OTHER ? 'holderOther' : 'holderChoice'] = 'Who does this belong to?';
    if (!/^\d{0,4}$/.test(draft.numberLast4)) e.numberLast4 = 'Use up to 4 digits only.';
    if (draft.issuedOn && !isValidISO(draft.issuedOn)) e.issuedOn = 'Enter a valid date.';
    if (draft.issuedOn && isValidISO(draft.issuedOn) && compareISO(draft.issuedOn, today) > 0) e.issuedOn = 'The issue date can’t be in the future.';
    if (draft.expiresOn && !isValidISO(draft.expiresOn)) e.expiresOn = 'Enter a valid date.';
    if (
      !e.issuedOn &&
      !e.expiresOn &&
      draft.issuedOn &&
      draft.expiresOn &&
      compareISO(draft.expiresOn, draft.issuedOn) <= 0
    ) {
      e.expiresOn = 'The expiry date must be after the issue date.';
    }
    const lead = Number(draft.renewalLeadDays);
    if (draft.renewalLeadDays.trim() === '' || !Number.isInteger(lead) || lead < 0 || lead > 730) {
      e.renewalLeadDays = 'Enter a whole number of days between 0 and 730.';
    }
    return e;
  };

  const submit = (ev: FormEvent) => {
    ev.preventDefault();
    const e = validate();
    setErrors(e);
    if (Object.values(e).some(Boolean)) return;
    const holder = draft.holderChoice === OTHER ? draft.holderOther.trim() : draft.holderChoice;
    const saved = actions.saveDocument({
      id: existing?.id,
      type: draft.type,
      name: draft.name.trim(),
      holder,
      issuer: draft.issuer.trim() || undefined,
      numberLast4: draft.numberLast4 || undefined,
      issuedOn: draft.issuedOn || undefined,
      expiresOn: draft.expiresOn || undefined,
      renewalLeadDays: Number(draft.renewalLeadDays),
      storedAt: draft.storedAt.trim() || undefined,
      notes: draft.notes.trim() || undefined,
    });
    toast({
      title: existing ? 'Document updated' : 'Document added',
      description: `${holder}’s ${saved.name}`,
      action: existing ? undefined : { label: 'View', onClick: () => navigate(`${ROUTES.documents}?open=${saved.id}`) },
    });
    onClose();
  };

  const lead = Number(draft.renewalLeadDays);
  const reminder =
    isValidISO(draft.expiresOn) && Number.isInteger(lead) && lead >= 0
      ? addDays(draft.expiresOn, -lead)
      : null;

  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      title={existing ? 'Edit document' : 'Add a document'}
      description={existing ? `${existing.holder}’s ${existing.name}` : 'Track an ID or document so you never miss a renewal.'}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="docs-editor-form">
            {existing ? 'Save changes' : 'Add document'}
          </Button>
        </>
      }
    >
      <form id="docs-editor-form" className="form-grid" onSubmit={submit} noValidate>
        <Field label="Type" htmlFor="doc-type" required>
          <Select id="doc-type" value={draft.type} onChange={(e) => changeType(e.target.value as DocumentType)} data-autofocus>
            {DOCUMENT_TYPES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Name" htmlFor="doc-name" required error={errors.name}>
          <Input
            id="doc-name"
            value={draft.name}
            onChange={(e) => set('name', e.target.value)}
            placeholder="e.g. Passport"
            invalid={!!errors.name}
            maxLength={80}
          />
        </Field>

        <Field label="Belongs to" htmlFor="doc-holder" required error={errors.holderChoice}>
          <Select
            id="doc-holder"
            value={draft.holderChoice}
            onChange={(e) => set('holderChoice', e.target.value)}
            invalid={!!errors.holderChoice}
          >
            {draft.holderChoice === '' && <option value="">Choose a person…</option>}
            {members.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
            <option value={OTHER}>Other…</option>
          </Select>
        </Field>
        {draft.holderChoice === OTHER ? (
          <Field label="Person’s name" htmlFor="doc-holder-other" required error={errors.holderOther}>
            <Input
              id="doc-holder-other"
              value={draft.holderOther}
              onChange={(e) => set('holderOther', e.target.value)}
              placeholder="e.g. Grandma"
              invalid={!!errors.holderOther}
              maxLength={40}
              autoFocus
            />
          </Field>
        ) : (
          <Field label="Issued by" htmlFor="doc-issuer" optional>
            <Input id="doc-issuer" value={draft.issuer} onChange={(e) => set('issuer', e.target.value)} placeholder="e.g. State DMV" maxLength={80} />
          </Field>
        )}
        {draft.holderChoice === OTHER && (
          <Field label="Issued by" htmlFor="doc-issuer" optional className="span-2">
            <Input id="doc-issuer" value={draft.issuer} onChange={(e) => set('issuer', e.target.value)} placeholder="e.g. State DMV" maxLength={80} />
          </Field>
        )}

        <Field
          label="Last 4 digits"
          htmlFor="doc-last4"
          optional
          error={errors.numberLast4}
          className="span-2"
          hint={
            <span className="docs-privacy">
              <Lock size={12} aria-hidden /> Keel never stores full ID numbers — only the last 4 digits, so you can tell cards apart.
            </span>
          }
        >
          <Input
            id="doc-last4"
            className="docs-last4"
            prefix="••••"
            value={draft.numberLast4}
            onChange={(e) => {
              const digits = e.target.value.replace(/\D/g, '');
              set('numberLast4', digits.length > 5 ? digits.slice(-4) : digits.slice(0, 4));
            }}
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="off"
            placeholder="1234"
            invalid={!!errors.numberLast4}
          />
        </Field>

        <Field label="Issued on" htmlFor="doc-issued" optional error={errors.issuedOn}>
          <Input
            id="doc-issued"
            type="date"
            value={draft.issuedOn}
            max={today}
            onChange={(e) => set('issuedOn', e.target.value)}
            invalid={!!errors.issuedOn}
          />
        </Field>
        <Field
          label="Expires on"
          htmlFor="doc-expires"
          error={errors.expiresOn}
          hint={isValidISO(draft.expiresOn) ? relativeDays(draft.expiresOn, today) : 'Leave blank if it doesn’t expire.'}
        >
          <Input
            id="doc-expires"
            type="date"
            value={draft.expiresOn}
            min={draft.issuedOn || undefined}
            onChange={(e) => set('expiresOn', e.target.value)}
            invalid={!!errors.expiresOn}
          />
        </Field>

        <Field
          label="Remind me to renew"
          htmlFor="doc-lead"
          className="span-2"
          error={errors.renewalLeadDays}
          hint={
            reminder
              ? `Renewal reminder starts ${formatDate(reminder, 'medium', data.settings.locale)} (${relativeDays(reminder, today).toLowerCase()}).`
              : `${documentTypeMeta(draft.type).label}s usually need about ${documentTypeMeta(draft.type).defaultLead} days.`
          }
        >
          <div className="docs-lead-row">
            <Input
              id="doc-lead"
              className="docs-lead-input"
              type="number"
              min={0}
              max={730}
              step={1}
              inputMode="numeric"
              suffix="days before"
              value={draft.renewalLeadDays}
              onChange={(e) => set('renewalLeadDays', e.target.value)}
              invalid={!!errors.renewalLeadDays}
            />
            <div className="docs-chips" role="group" aria-label="Quick picks">
              {LEAD_CHIPS.map((n) => (
                <button
                  key={n}
                  type="button"
                  className={cx('docs-chip', Number(draft.renewalLeadDays) === n && 'is-active')}
                  aria-pressed={Number(draft.renewalLeadDays) === n}
                  onClick={() => set('renewalLeadDays', String(n))}
                >
                  {n}d
                </button>
              ))}
            </div>
          </div>
        </Field>

        <Field label="Where it’s kept" htmlFor="doc-stored" optional className="span-2">
          <Input
            id="doc-stored"
            value={draft.storedAt}
            onChange={(e) => set('storedAt', e.target.value)}
            placeholder="e.g. Home safe"
            list="docs-stored-suggestions"
            maxLength={80}
          />
          <datalist id="docs-stored-suggestions">
            {Array.from(new Set([...data.documents.map((d) => d.storedAt).filter((s): s is string => !!s), ...STORAGE_SUGGESTIONS])).map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </Field>

        <Field label="Notes" htmlFor="doc-notes" optional className="span-2">
          <Textarea
            id="doc-notes"
            value={draft.notes}
            onChange={(e) => set('notes', e.target.value)}
            placeholder="Anything useful for next time — requirements, reference numbers, who to call…"
            rows={3}
            maxLength={1000}
          />
        </Field>
      </form>
    </Modal>
  );
}
