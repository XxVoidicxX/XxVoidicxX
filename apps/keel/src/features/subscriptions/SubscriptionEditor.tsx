import { useId, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { CalendarClock, Sparkles } from 'lucide-react';
import type { EditorProps } from '@/app/ui';
import { Button, Field, Input, Modal, Segmented, Select, Switch, Textarea, useToast } from '@/components/ui';
import { addDays, formatDate, isValidISO, nextOccurrence } from '@/lib/dates';
import { nextChargeDate } from '@/lib/engine';
import { CATEGORIES, categoryMeta, CYCLES, STATUSES, USAGE } from '@/lib/meta';
import { parseAmount, toMonthly, toYearly } from '@/lib/money';
import type { CategoryId, Cycle, RecurringKind, Subscription, SubscriptionStatus, Usage } from '@/lib/types';
import { useMoney } from '@/store/selectors';
import { useActions, useData, useToday } from '@/store/store';
import { currencySymbol, isValidUrl, normalizeUrl, SERVICE_PRESETS, type ServicePreset } from './helpers';
import './subscriptions.css';

interface FormState {
  kind: RecurringKind;
  name: string;
  amount: string;
  cycle: Cycle;
  category: CategoryId;
  date: string;
  status: SubscriptionStatus;
  trialEndsOn: string;
  autopay: boolean;
  paymentMethod: string;
  owner: string;
  usage: Usage | '';
  url: string;
  cancelUrl: string;
  annualPrice: string;
  notes: string;
}

type Errors = Partial<Record<keyof FormState, string>>;

const amountText = (n: number | undefined) => (n === undefined || !Number.isFinite(n) ? '' : String(n));

export function SubscriptionEditor({ open, id, defaults, onClose }: EditorProps<Subscription>) {
  if (!open) return null;
  return <EditorDialog key={id ?? 'new'} id={id} defaults={defaults} onClose={onClose} />;
}

function EditorDialog({ id, defaults, onClose }: { id?: string; defaults?: Partial<Subscription>; onClose: () => void }) {
  const data = useData();
  const today = useToday();
  const actions = useActions();
  const toast = useToast();
  const money = useMoney();
  const formId = useId();
  const nameRef = useRef<HTMLInputElement>(null);
  const { settings } = data;
  const existing = id ? data.subscriptions.find((s) => s.id === id) : undefined;
  const isEdit = !!existing;

  const [initial] = useState<FormState>(() => {
    const src: Partial<Subscription> = existing ?? defaults ?? {};
    const kind = src.kind ?? 'subscription';
    const cycle = src.cycle ?? 'monthly';
    const members = settings.householdMembers;
    const defaultOwner = members[0] ?? '';
    return {
      kind,
      name: src.name ?? '',
      amount: amountText(src.amount),
      cycle,
      category: src.category ?? (kind === 'bill' ? 'utilities' : 'streaming'),
      date: src.anchorDate && isValidISO(src.anchorDate) ? nextOccurrence(src.anchorDate, cycle, today) : today,
      status: src.status ?? 'active',
      trialEndsOn: src.trialEndsOn ?? '',
      autopay: src.autopay ?? kind !== 'bill',
      paymentMethod: src.paymentMethod ?? '',
      owner: src.owner ?? (existing ? '' : defaultOwner),
      usage: src.usage ?? '',
      url: src.url ?? '',
      cancelUrl: src.cancelUrl ?? '',
      annualPrice: amountText(src.annualPrice),
      notes: src.notes ?? '',
    };
  });
  const [form, setForm] = useState<FormState>(initial);
  const [errors, setErrors] = useState<Errors>({});
  const [submitted, setSubmitted] = useState(false);
  const autopayTouched = useRef(isEdit || defaults?.autopay !== undefined);

  const symbol = currencySymbol(settings.currency, settings.locale);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (submitted) setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const owners = useMemo(() => {
    const list = [...settings.householdMembers];
    if (form.owner && !list.includes(form.owner)) list.push(form.owner);
    return list;
  }, [settings.householdMembers, form.owner]);

  const paymentMethods = useMemo(() => {
    const set = new Set<string>();
    for (const s of data.subscriptions) if (s.paymentMethod?.trim()) set.add(s.paymentMethod.trim());
    return [...set].sort();
  }, [data.subscriptions]);

  const orderedGroups = form.kind === 'bill' ? (['bill', 'subscription'] as const) : (['subscription', 'bill'] as const);

  const presets = useMemo(() => {
    if (isEdit) return [];
    const q = form.name.trim().toLowerCase();
    if (!q) return SERVICE_PRESETS.slice(0, 8);
    if (SERVICE_PRESETS.some((p) => p.name.toLowerCase() === q)) return [];
    return SERVICE_PRESETS.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 6);
  }, [isEdit, form.name]);

  const applyPreset = (p: ServicePreset) => {
    setForm((f) => ({
      ...f,
      kind: 'subscription',
      name: p.name,
      category: p.category,
      amount: String(p.amount),
      cycle: p.cycle,
      url: p.url ?? f.url,
      cancelUrl: p.cancelUrl ?? f.cancelUrl,
      annualPrice: p.annualPrice ? String(p.annualPrice) : f.annualPrice,
    }));
    setErrors({});
    nameRef.current?.focus();
  };

  const changeKind = (kind: RecurringKind) => {
    setForm((f) => ({
      ...f,
      kind,
      category: categoryMeta(f.category).group === kind || f.category === 'other' ? f.category : kind === 'bill' ? 'utilities' : 'streaming',
      autopay: autopayTouched.current ? f.autopay : kind !== 'bill',
    }));
  };

  const onKindKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'Home' && e.key !== 'End') return;
    e.preventDefault();
    const next: RecurringKind =
      e.key === 'Home' ? 'subscription' : e.key === 'End' ? 'bill' : form.kind === 'bill' ? 'subscription' : 'bill';
    changeKind(next);
    const tabs = e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    tabs[next === 'bill' ? 1 : 0]?.focus();
  };
  const isBill = form.kind === 'bill';

  const amount = parseAmount(form.amount);
  const annual = form.annualPrice.trim() ? parseAmount(form.annualPrice) : null;

  const anchorFor = (f: FormState): string => {
    if (f.status === 'trial' && isValidISO(f.trialEndsOn)) return f.trialEndsOn;
    if (existing && f.date === initial.date && f.status !== 'trial') return existing.anchorDate;
    return f.date;
  };

  const preview = useMemo(() => {
    if (amount === null || amount <= 0) return null;
    const draft: Subscription = {
      id: 'draft',
      kind: form.kind,
      name: form.name,
      category: form.category,
      amount,
      cycle: form.cycle,
      anchorDate: isValidISO(anchorFor(form)) ? anchorFor(form) : today,
      status: form.status,
      trialEndsOn: isValidISO(form.trialEndsOn) ? form.trialEndsOn : undefined,
      autopay: form.autopay,
      priceHistory: [],
      createdAt: '',
      updatedAt: '',
    };
    return {
      monthly: toMonthly(amount, form.cycle),
      yearly: toYearly(amount, form.cycle),
      next: nextChargeDate(draft, today),
    };
  }, [amount, form, today]);

  const annualSaving =
    annual !== null && annual > 0 && amount !== null && form.cycle !== 'yearly' ? toYearly(amount, form.cycle) - annual : null;

  const validate = (): Errors => {
    const e: Errors = {};
    if (!form.name.trim()) e.name = 'Give it a name, like "Netflix" or "Electric bill".';
    else if (form.name.trim().length > 80) e.name = 'Keep the name under 80 characters.';
    if (!form.amount.trim()) e.amount = 'Enter how much it costs each time.';
    else if (amount === null || amount <= 0) e.amount = 'Enter an amount greater than zero.';
    else if (amount > 1_000_000) e.amount = 'That amount looks too large.';
    if (form.status === 'trial') {
      if (!form.trialEndsOn) e.trialEndsOn = 'Add the day the free trial ends so Keel can remind you.';
      else if (!isValidISO(form.trialEndsOn)) e.trialEndsOn = 'Pick a valid date.';
    } else if (!isValidISO(form.date)) {
      e.date = 'Pick a valid date.';
    }
    if (!isBill && form.annualPrice.trim()) {
      if (annual === null || annual <= 0) e.annualPrice = 'Enter a yearly price greater than zero, or leave it empty.';
    }
    if (form.url.trim() && !isValidUrl(form.url)) e.url = 'That does not look like a web address.';
    if (!isBill && form.cancelUrl.trim() && !isValidUrl(form.cancelUrl)) e.cancelUrl = 'That does not look like a web address.';
    return e;
  };

  const submit = (ev?: FormEvent) => {
    ev?.preventDefault();
    setSubmitted(true);
    const e = validate();
    setErrors(e);
    const firstKey = Object.keys(e)[0];
    if (firstKey) {
      window.setTimeout(() => {
        const el = document.querySelector<HTMLElement>(`[data-field="${firstKey}"]`);
        el?.focus();
      }, 0);
      return;
    }
    const name = form.name.trim();
    const saved = actions.saveSubscription({
      ...(existing ?? {}),
      id: existing?.id,
      kind: form.kind,
      name,
      category: form.category,
      amount: amount ?? 0,
      cycle: form.cycle,
      anchorDate: anchorFor(form),
      status: form.status,
      trialEndsOn: form.status === 'trial' ? form.trialEndsOn : existing?.trialEndsOn,
      autopay: form.autopay,
      paymentMethod: form.paymentMethod.trim() || undefined,
      owner: form.owner.trim() || undefined,
      usage: isBill ? undefined : form.usage || undefined,
      url: form.url.trim() ? normalizeUrl(form.url) : undefined,
      cancelUrl: !isBill && form.cancelUrl.trim() ? normalizeUrl(form.cancelUrl) : undefined,
      annualPrice: !isBill && annual !== null && annual > 0 ? annual : undefined,
      notes: form.notes.trim() || undefined,
      priceHistory: existing?.priceHistory ?? defaults?.priceHistory ?? [],
    });
    toast({
      title: isEdit ? `${saved.name} saved` : `${saved.name} added`,
      description:
        !isEdit && preview
          ? `${money(preview.monthly)} a month${preview.next ? `, next charge ${formatDate(preview.next, 'dayMonth', settings.locale)}` : ''}.`
          : undefined,
    });
    onClose();
  };

  const statusHint =
    form.status === 'paused'
      ? 'Paused items are left out of totals and upcoming charges.'
      : form.status === 'cancelled'
        ? 'Cancelled items count toward what you have saved.'
        : form.status === 'trial'
          ? 'Keel will warn you before the trial converts to paid.'
          : undefined;

  const err = (k: keyof FormState) => errors[k];
  const fid = (k: string) => `${formId}-${k}`;

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={isEdit ? `Edit ${existing?.name}` : form.kind === 'bill' ? 'Add a bill' : 'Add a subscription'}
      description={isEdit ? undefined : 'Anything that charges you on a schedule: streaming, apps, rent, utilities, insurance.'}
      footer={
        <div className="subs-ed-footer">
          <p className="subs-ed-preview tabular" aria-live="polite">
            {preview ? (
              <>
                <CalendarClock size={15} aria-hidden />
                <span>
                  ≈ <strong>{money(preview.monthly)}</strong>/month · {money(preview.yearly)}/year
                  {' · '}
                  {preview.next
                    ? `next charge ${formatDate(preview.next, 'dayMonth', settings.locale)}`
                    : form.status === 'paused'
                      ? 'paused, no charges'
                      : 'cancelled, no charges'}
                </span>
              </>
            ) : (
              <span className="muted">Enter an amount to see the monthly and yearly cost.</span>
            )}
          </p>
          <div className="subs-ed-buttons">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" form={formId}>
              {isEdit ? 'Save changes' : 'Add'}
            </Button>
          </div>
        </div>
      }
    >
      <form id={formId} onSubmit={submit} noValidate className="subs-ed-form">
        <div onKeyDown={onKindKey} className="subs-ed-kind">
          <Segmented<RecurringKind>
            ariaLabel="Type"
            value={form.kind}
            onChange={changeKind}
            options={[
              { value: 'subscription', label: 'Subscription' },
              { value: 'bill', label: 'Bill' },
            ]}
          />
        </div>

        <div className="form-grid">
          <Field label="Name" required htmlFor={fid('name')} error={err('name')} className="span-2">
            <Input
              ref={nameRef}
              id={fid('name')}
              data-field="name"
              data-autofocus
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder={form.kind === 'bill' ? 'e.g. Electric bill' : 'e.g. Netflix'}
              invalid={!!err('name')}
              autoComplete="off"
              maxLength={120}
            />
          </Field>
          {presets.length > 0 && form.kind === 'subscription' && (
            <div className="span-2 subs-presets" aria-label="Popular services">
              <span className="subs-presets-label">
                <Sparkles size={13} aria-hidden /> Quick pick
              </span>
              {presets.map((p) => (
                <button key={p.name} type="button" className="subs-preset" onClick={() => applyPreset(p)}>
                  {p.name}
                  <span className="muted tabular">
                    {money(p.amount)}
                    {p.cycle === 'yearly' ? '/yr' : '/mo'}
                  </span>
                </button>
              ))}
            </div>
          )}

          <Field label="Amount" required htmlFor={fid('amount')} error={err('amount')} hint={isEdit ? 'Changing the price adds a point to its price history.' : undefined}>
            <Input
              id={fid('amount')}
              data-field="amount"
              prefix={symbol}
              inputMode="decimal"
              value={form.amount}
              onChange={(e) => set('amount', e.target.value)}
              placeholder="0.00"
              invalid={!!err('amount')}
              autoComplete="off"
            />
          </Field>
          <Field label="Billed" htmlFor={fid('cycle')}>
            <Select id={fid('cycle')} value={form.cycle} onChange={(e) => set('cycle', e.target.value as Cycle)}>
              {CYCLES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Category" htmlFor={fid('category')}>
            <Select id={fid('category')} value={form.category} onChange={(e) => set('category', e.target.value as CategoryId)}>
              {orderedGroups.map((g) => (
                <optgroup key={g} label={g === 'bill' ? 'Bills' : 'Subscriptions'}>
                  {CATEGORIES.filter((c) => c.group === g).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </Select>
          </Field>
          <Field label="Status" htmlFor={fid('status')} hint={statusHint}>
            <Select id={fid('status')} value={form.status} onChange={(e) => set('status', e.target.value as SubscriptionStatus)}>
              {STATUSES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </Select>
          </Field>

          {form.status === 'trial' ? (
            <Field
              label="Free trial ends"
              required
              htmlFor={fid('trialEndsOn')}
              error={err('trialEndsOn')}
              hint="Billing starts on this day unless you cancel."
              className="span-2"
            >
              <div className="subs-ed-trial">
                <Input
                  id={fid('trialEndsOn')}
                  data-field="trialEndsOn"
                  type="date"
                  value={form.trialEndsOn}
                  onChange={(e) => set('trialEndsOn', e.target.value)}
                  invalid={!!err('trialEndsOn')}
                />
                <div className="subs-ed-chips" role="group" aria-label="Trial length from today">
                  {[7, 14, 30].map((n) => {
                    const d = addDays(today, n);
                    return (
                      <button
                        key={n}
                        type="button"
                        className={`subs-ed-chip${form.trialEndsOn === d ? ' is-active' : ''}`}
                        aria-pressed={form.trialEndsOn === d}
                        aria-label={`${n} day trial, ends ${formatDate(d, 'dayMonth', settings.locale)}`}
                        onClick={() => set('trialEndsOn', d)}
                      >
                        +{n} days
                      </button>
                    );
                  })}
                </div>
              </div>
            </Field>
          ) : (
            <Field
              label={isBill ? 'Due date' : 'Next billing date'}
              required
              htmlFor={fid('date')}
              error={err('date')}
              hint={`${isBill ? 'The next day it is due.' : 'The next day you will be charged.'} Keel repeats it ${CYCLES.find((c) => c.id === form.cycle)?.adverb ?? ''} from there.`}
              className="span-2"
            >
              <Input
                id={fid('date')}
                data-field="date"
                type="date"
                value={form.date}
                onChange={(e) => set('date', e.target.value)}
                invalid={!!err('date')}
              />
            </Field>
          )}

          <div className="span-2 subs-ed-switch">
            <Switch
              checked={form.autopay}
              onChange={(v) => {
                autopayTouched.current = true;
                set('autopay', v);
              }}
              label="Autopay"
              description={form.autopay ? 'Charged automatically.' : 'You pay it yourself. Keel reminds you before it is due.'}
            />
          </div>

          <p className="form-section span-2">Who and how</p>
          <Field label="Payment method" htmlFor={fid('pm')} optional>
            <Input
              id={fid('pm')}
              value={form.paymentMethod}
              onChange={(e) => set('paymentMethod', e.target.value)}
              placeholder="e.g. Visa •• 4821"
              list={paymentMethods.length ? fid('pm-list') : undefined}
              autoComplete="off"
            />
            {paymentMethods.length > 0 && (
              <datalist id={fid('pm-list')}>
                {paymentMethods.map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>
            )}
          </Field>
          <Field label="Owner" htmlFor={fid('owner')}>
            <Select id={fid('owner')} value={form.owner} onChange={(e) => set('owner', e.target.value)}>
              <option value="">No one in particular</option>
              {owners.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </Select>
          </Field>
          {!isBill && (
            <Field label="How much do you use it?" htmlFor={fid('usage')} hint="Keel flags things you barely use." className="span-2">
              <Select id={fid('usage')} value={form.usage} onChange={(e) => set('usage', e.target.value as Usage | '')}>
                <option value="">Not sure yet</option>
                {USAGE.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.label}
                  </option>
                ))}
              </Select>
            </Field>
          )}

          <p className="form-section span-2">{isBill ? 'Link and notes' : 'Links and savings'}</p>
          <Field label={isBill ? 'Website to pay it' : 'Website'} htmlFor={fid('url')} error={err('url')} optional className={isBill ? 'span-2' : undefined}>
            <Input
              id={fid('url')}
              data-field="url"
              value={form.url}
              onChange={(e) => set('url', e.target.value)}
              placeholder="e.g. provider.com"
              inputMode="url"
              invalid={!!err('url')}
              autoComplete="off"
            />
          </Field>
          {!isBill && (
            <Field label="Cancellation page" htmlFor={fid('cancelUrl')} error={err('cancelUrl')} optional>
              <Input
                id={fid('cancelUrl')}
                data-field="cancelUrl"
                value={form.cancelUrl}
                onChange={(e) => set('cancelUrl', e.target.value)}
                placeholder="Where you go to cancel"
                inputMode="url"
                invalid={!!err('cancelUrl')}
                autoComplete="off"
              />
            </Field>
          )}
          {form.cycle !== 'yearly' && !isBill && (
            <Field
              label="Yearly plan price"
              htmlFor={fid('annual')}
              error={err('annualPrice')}
              optional
              className="span-2"
              hint={
                annualSaving !== null && annualSaving > 0.5
                  ? `Switching to yearly would save ${money(annualSaving)} a year.`
                  : annualSaving !== null && annualSaving <= 0.5
                    ? 'The yearly plan is not cheaper than what you pay now.'
                    : 'If the provider offers yearly billing, Keel will tell you how much switching saves.'
              }
            >
              <Input
                id={fid('annual')}
                data-field="annualPrice"
                prefix={symbol}
                suffix="/yr"
                inputMode="decimal"
                value={form.annualPrice}
                onChange={(e) => set('annualPrice', e.target.value)}
                placeholder="0.00"
                invalid={!!err('annualPrice')}
                autoComplete="off"
              />
            </Field>
          )}
          <Field label="Notes" htmlFor={fid('notes')} optional className="span-2">
            <Textarea
              id={fid('notes')}
              value={form.notes}
              onChange={(e) => set('notes', e.target.value)}
              rows={2}
              placeholder="Account email, plan name, who to call…"
            />
          </Field>
        </div>
      </form>
    </Modal>
  );
}
