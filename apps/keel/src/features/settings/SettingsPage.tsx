import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  Bell,
  Database,
  Download,
  FileJson,
  FileSpreadsheet,
  Info,
  Lock,
  Pencil,
  Plus,
  RotateCcw,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Upload,
  UserRound,
  Users,
  X,
} from 'lucide-react';
import { useUI } from '@/app/ui';
import { Button, Card, CardHeader, Field, Input, Modal, PageHeader, Segmented, Select, cx, useConfirm, useToast } from '@/components/ui';
import { formatDate } from '@/lib/dates';
import { CURRENCIES } from '@/lib/meta';
import { formatMoney } from '@/lib/money';
import { useAlerts } from '@/store/selectors';
import { attentionText, countAlerts } from '@/features/notifications/alertHelpers';
import { useActions, useData, useToday } from '@/store/store';
import { validateImport } from '@/store/persistence';
import { exportBackup, exportSubscriptionsCSV } from './dataTransfer';
import { CURRENCY_NAMES, LOCALES } from './locales';
import './settings.css';

const APP_VERSION = '1.0.0';

const SECTIONS = [
  { id: 'profile', label: 'Profile', icon: UserRound },
  { id: 'household', label: 'Household', icon: Users },
  { id: 'preferences', label: 'Preferences', icon: SlidersHorizontal },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'data', label: 'Your data', icon: Database },
  { id: 'about', label: 'About & privacy', icon: Info },
];

export function SettingsPage() {
  const [active, setActive] = useState('profile');

  useEffect(() => {
    const els = SECTIONS.map((s) => document.getElementById(`settings-${s.id}`)).filter((e): e is HTMLElement => !!e);
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id.replace('settings-', ''));
      },
      { rootMargin: '-80px 0px -55% 0px' },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  const jump = (id: string) => {
    const el = document.getElementById(`settings-${id}`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setActive(id);
    el.querySelector<HTMLElement>('input, select, button')?.focus({ preventScroll: true });
  };

  return (
    <div className="settings-page">
      <PageHeader title="Settings" description="Your profile, household, preferences and data. Everything here is stored only on this device." />
      <div className="settings-layout">
        <nav className="settings-nav" aria-label="Settings sections">
          {SECTIONS.map((s) => (
            <button key={s.id} type="button" className={cx('settings-nav-item', active === s.id && 'is-active')} onClick={() => jump(s.id)} aria-current={active === s.id ? 'true' : undefined}>
              <s.icon size={16} aria-hidden />
              {s.label}
            </button>
          ))}
        </nav>
        <div className="settings-sections">
          <ProfileSection />
          <HouseholdSection />
          <PreferencesSection />
          <NotificationsSection />
          <DataSection />
          <AboutSection />
        </div>
      </div>
    </div>
  );
}

function Section({ id, icon, title, subtitle, children, danger }: { id: string; icon: ReactNode; title: string; subtitle?: string; children: ReactNode; danger?: boolean }) {
  return (
    <section id={`settings-${id}`} className="settings-section" aria-labelledby={`settings-${id}-title`}>
      <Card className={cx(danger && 'settings-danger')}>
        <div className="settings-section-head">
          <CardHeader icon={icon} title={<span id={`settings-${id}-title`}>{title}</span>} subtitle={subtitle} />
        </div>
        {children}
      </Card>
    </section>
  );
}

function ProfileSection() {
  const { settings } = useData();
  const actions = useActions();
  const toast = useToast();
  const [name, setName] = useState(settings.displayName);
  const [error, setError] = useState('');
  const id = useId();

  useEffect(() => setName(settings.displayName), [settings.displayName]);

  const dirty = name.trim() !== settings.displayName;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const v = name.trim();
    if (v.length > 40) {
      setError('Keep it under 40 characters.');
      return;
    }
    setError('');
    actions.updateSettings({ displayName: v });
    toast({ title: 'Profile saved', description: v ? `We'll call you ${v}.` : undefined });
  };

  return (
    <Section id="profile" icon={<UserRound size={16} />} title="Profile" subtitle="How Keel greets you.">
      <form className="settings-form-row" onSubmit={submit} noValidate>
        <Field label="Display name" htmlFor={id} error={error} hint="Shown on your overview and in the top bar." className="settings-grow">
          <Input id={id} value={name} onChange={(e) => setName(e.target.value)} placeholder="Your first name" autoComplete="given-name" invalid={!!error} maxLength={60} />
        </Field>
        <Button type="submit" variant="primary" disabled={!dirty} className="settings-inline-btn">
          Save
        </Button>
      </form>
    </Section>
  );
}

function HouseholdSection() {
  const data = useData();
  const actions = useActions();
  const toast = useToast();
  const confirm = useConfirm();
  const members = data.settings.householdMembers;
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const addId = useId();

  const usage = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of data.subscriptions) if (s.owner) map.set(s.owner, (map.get(s.owner) ?? 0) + 1);
    for (const d of data.documents) if (d.holder) map.set(d.holder, (map.get(d.holder) ?? 0) + 1);
    return map;
  }, [data.subscriptions, data.documents]);

  const validate = (v: string, except?: string): string => {
    if (!v) return 'Enter a name.';
    if (v.length > 30) return 'Keep names under 30 characters.';
    if (members.some((m) => m.toLowerCase() === v.toLowerCase() && m !== except)) return `${v} is already in your household.`;
    return '';
  };

  const add = (e: FormEvent) => {
    e.preventDefault();
    const v = draft.trim();
    const err = validate(v);
    setError(err);
    if (err) return;
    actions.updateSettings({ householdMembers: [...members, v] });
    setDraft('');
    toast({ title: `Added ${v}`, description: 'You can now assign subscriptions and documents to them.' });
  };

  const startRename = (m: string) => {
    setEditing(m);
    setEditValue(m);
    setError('');
  };

  const commitRename = () => {
    if (!editing) return;
    const v = editValue.trim();
    if (v === editing) {
      setEditing(null);
      return;
    }
    const err = validate(v, editing);
    if (err) {
      setError(err);
      return;
    }
    const old = editing;
    actions.updateSettings({ householdMembers: members.map((m) => (m === old ? v : m)) });
    let moved = 0;
    for (const s of data.subscriptions) {
      if (s.owner === old) {
        actions.saveSubscription({ ...s, owner: v });
        moved += 1;
      }
    }
    for (const d of data.documents) {
      if (d.holder === old) {
        actions.saveDocument({ ...d, holder: v });
        moved += 1;
      }
    }
    setEditing(null);
    setError('');
    toast({ title: `Renamed ${old} to ${v}`, description: moved ? `Updated ${moved} item${moved === 1 ? '' : 's'} assigned to them.` : undefined });
  };

  const remove = async (m: string) => {
    if (members.length <= 1) {
      toast({ title: 'Keep at least one member', description: 'Rename this one instead.', tone: 'warning' });
      return;
    }
    const n = usage.get(m) ?? 0;
    if (n > 0) {
      const ok = await confirm({
        title: `Remove ${m} from your household?`,
        description: `${n} item${n === 1 ? ' is' : 's are'} still assigned to ${m}. They'll keep that name, but ${m} won't be offered as a choice anymore.`,
        confirmLabel: 'Remove',
        danger: true,
      });
      if (!ok) return;
    }
    const index = members.indexOf(m);
    actions.updateSettings({ householdMembers: members.filter((x) => x !== m) });
    toast({
      title: `Removed ${m}`,
      tone: 'info',
      action: {
        label: 'Undo',
        onClick: () => {
          const next = members.filter((x) => x !== m);
          next.splice(index, 0, m);
          actions.updateSettings({ householdMembers: next });
        },
      },
    });
  };

  return (
    <Section id="household" icon={<Users size={16} />} title="Household members" subtitle="The people whose subscriptions, bills and documents you keep track of.">
      <ul className="settings-chips" aria-label="Household members">
        {members.map((m) => (
          <li key={m} className={cx('settings-chip', editing === m && 'is-editing')}>
            {editing === m ? (
              <form
                className="settings-chip-edit"
                onSubmit={(e) => {
                  e.preventDefault();
                  commitRename();
                }}
              >
                <label className="sr-only" htmlFor={`rename-${m}`}>
                  Rename {m}
                </label>
                <input
                  id={`rename-${m}`}
                  autoFocus
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      e.stopPropagation();
                      setEditing(null);
                      setError('');
                    }
                  }}
                  maxLength={40}
                />
                <button type="submit" className="settings-chip-btn" aria-label="Save name">
                  Save
                </button>
                <button type="button" className="settings-chip-icon" aria-label="Cancel rename" onClick={() => { setEditing(null); setError(''); }}>
                  <X size={13} />
                </button>
              </form>
            ) : (
              <>
                <span className="settings-chip-avatar" aria-hidden>
                  {m === 'Shared' ? <Users size={12} /> : m.slice(0, 1).toUpperCase()}
                </span>
                <span className="settings-chip-name">{m}</span>
                {(usage.get(m) ?? 0) > 0 && <span className="settings-chip-count" title={`${usage.get(m)} items assigned`}>{usage.get(m)}</span>}
                <button type="button" className="settings-chip-icon" aria-label={`Rename ${m}`} onClick={() => startRename(m)}>
                  <Pencil size={12} />
                </button>
                <button type="button" className="settings-chip-icon is-danger" aria-label={`Remove ${m}`} onClick={() => remove(m)}>
                  <X size={13} />
                </button>
              </>
            )}
          </li>
        ))}
      </ul>
      <form className="settings-form-row" onSubmit={add} noValidate>
        <Field label="Add someone" htmlFor={addId} error={error} hint={!members.includes('Shared') ? 'Tip: add "Shared" for things the whole household pays for.' : undefined} className="settings-grow">
          <Input id={addId} value={draft} onChange={(e) => { setDraft(e.target.value); if (error) setError(''); }} placeholder="e.g. Jordan" maxLength={40} invalid={!!error && !editing} />
        </Field>
        <Button type="submit" variant="secondary" icon={<Plus size={16} />} className="settings-inline-btn">
          Add
        </Button>
      </form>
      {!members.includes('Shared') && (
        <button type="button" className="settings-suggest" onClick={() => actions.updateSettings({ householdMembers: [...members, 'Shared'] })}>
          <Plus size={13} /> Add "Shared"
        </button>
      )}
    </Section>
  );
}

interface PrefsForm {
  currency: string;
  locale: string;
  weekStartsOn: '0' | '1';
  reminderDays: string;
  monthlyBudget: string;
}

function PreferencesSection() {
  const { settings } = useData();
  const today = useToday();
  const actions = useActions();
  const toast = useToast();
  const id = useId();
  const fromSettings = (): PrefsForm => ({
    currency: settings.currency,
    locale: settings.locale,
    weekStartsOn: String(settings.weekStartsOn) as '0' | '1',
    reminderDays: String(settings.reminderDays),
    monthlyBudget: settings.monthlyBudget ? String(settings.monthlyBudget) : '',
  });
  const [form, setForm] = useState<PrefsForm>(fromSettings);
  const [errors, setErrors] = useState<{ reminderDays?: string; monthlyBudget?: string }>({});

  useEffect(() => {
    setForm(fromSettings());
  }, [settings.currency, settings.locale, settings.weekStartsOn, settings.reminderDays, settings.monthlyBudget]);

  const initial = fromSettings();
  const dirty = (Object.keys(initial) as (keyof PrefsForm)[]).some((k) => initial[k] !== form[k]);
  const set = <K extends keyof PrefsForm>(k: K, v: PrefsForm[K]) => setForm((f) => ({ ...f, [k]: v }));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const next: typeof errors = {};
    const rd = Number(form.reminderDays);
    if (!/^\d+$/.test(form.reminderDays.trim()) || rd < 1 || rd > 90) next.reminderDays = 'Use a whole number from 1 to 90.';
    let budget: number | undefined;
    if (form.monthlyBudget.trim()) {
      budget = Number(form.monthlyBudget.replace(/,/g, ''));
      if (!Number.isFinite(budget) || budget <= 0) next.monthlyBudget = 'Enter an amount above zero, or leave it empty.';
      else if (budget > 10_000_000) next.monthlyBudget = 'That looks too large.';
    }
    setErrors(next);
    if (Object.keys(next).length) return;
    actions.updateSettings({
      currency: form.currency,
      locale: form.locale,
      weekStartsOn: form.weekStartsOn === '1' ? 1 : 0,
      reminderDays: rd,
      monthlyBudget: budget ? Math.round(budget * 100) / 100 : undefined,
    });
    toast({ title: 'Preferences saved' });
  };

  return (
    <Section id="preferences" icon={<SlidersHorizontal size={16} />} title="Preferences" subtitle="Money, dates and reminders.">
      <form onSubmit={submit} noValidate>
        <div className="form-grid">
          <Field label="Currency" htmlFor={`${id}-cur`}>
            <Select id={`${id}-cur`} value={form.currency} onChange={(e) => set('currency', e.target.value)}>
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c} — {CURRENCY_NAMES[c] ?? c}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Language & region" htmlFor={`${id}-loc`} hint="Controls how dates and numbers are written.">
            <Select id={`${id}-loc`} value={form.locale} onChange={(e) => set('locale', e.target.value)}>
              {LOCALES.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Week starts on">
            <Segmented<'0' | '1'>
              ariaLabel="Week starts on"
              value={form.weekStartsOn}
              onChange={(v) => set('weekStartsOn', v)}
              options={[
                { value: '0', label: 'Sunday' },
                { value: '1', label: 'Monday' },
              ]}
            />
          </Field>
          <Field label="Remind me ahead by" htmlFor={`${id}-rd`} error={errors.reminderDays} hint="How early bills and trials show up as alerts.">
            <Input id={`${id}-rd`} inputMode="numeric" value={form.reminderDays} onChange={(e) => set('reminderDays', e.target.value)} suffix="days" invalid={!!errors.reminderDays} />
          </Field>
          <Field label="Monthly budget" optional htmlFor={`${id}-budget`} error={errors.monthlyBudget} hint="For subscriptions and bills. Used on your overview and insights." className="span-2">
            <Input
              id={`${id}-budget`}
              inputMode="decimal"
              value={form.monthlyBudget}
              onChange={(e) => set('monthlyBudget', e.target.value)}
              prefix={form.currency}
              placeholder="e.g. 3000"
              invalid={!!errors.monthlyBudget}
            />
          </Field>
        </div>
        <div className="settings-preview" aria-live="polite">
          <span className="settings-preview-label">Preview</span>
          <span className="tabular">{formatMoney(1234.5, form.currency, form.locale)}</span>
          <span className="settings-preview-dot" aria-hidden>·</span>
          <span>{formatDate(today, 'long', form.locale)}</span>
        </div>
        <div className="settings-actions">
          {dirty && (
            <Button variant="ghost" onClick={() => { setForm(fromSettings()); setErrors({}); }}>
              Discard
            </Button>
          )}
          <Button type="submit" variant="primary" disabled={!dirty}>
            Save preferences
          </Button>
        </div>
      </form>
    </Section>
  );
}

function NotificationsSection() {
  const data = useData();
  const alerts = useAlerts();
  const actions = useActions();
  const toast = useToast();
  const { setNotificationsOpen } = useUI();
  const dismissed = data.dismissedAlerts.length;

  return (
    <Section id="notifications" icon={<Bell size={16} />} title="Notifications" subtitle="Alerts appear in the bell menu while Keel is open.">
      <div className="settings-rows">
        <div className="settings-rowitem">
          <div className="settings-rowtext">
            <p className="settings-rowtitle">Active alerts</p>
            <p className="settings-rowdesc">
              {alerts.length ? `${attentionText(countAlerts(alerts), true)}.` : 'Nothing needs your attention right now.'}
            </p>
          </div>
          <Button variant="secondary" onClick={() => setNotificationsOpen(true)}>
            View alerts
          </Button>
        </div>
        <div className="settings-rowitem">
          <div className="settings-rowtext">
            <p className="settings-rowtitle">Dismissed alerts</p>
            <p className="settings-rowdesc">
              {dismissed
                ? `You've dismissed ${dismissed} alert${dismissed === 1 ? '' : 's'}. Restore them to see them again if they still apply.`
                : "You haven't dismissed any alerts."}
            </p>
          </div>
          <Button
            variant="secondary"
            icon={<RotateCcw size={15} />}
            disabled={!dismissed}
            onClick={() => {
              actions.restoreAlerts();
              toast({ title: `Restored ${dismissed} alert${dismissed === 1 ? '' : 's'}` });
            }}
          >
            Restore{dismissed ? ` ${dismissed}` : ''}
          </Button>
        </div>
      </div>
    </Section>
  );
}

function DataSection() {
  const data = useData();
  const actions = useActions();
  const toast = useToast();
  const confirm = useConfirm();
  const fileRef = useRef<HTMLInputElement>(null);
  const [eraseOpen, setEraseOpen] = useState(false);

  const counts = [
    { n: data.subscriptions.length, label: 'subscriptions & bills' },
    { n: data.documents.length, label: 'documents' },
    { n: data.purchases.length, label: 'purchases' },
    { n: data.tasks.length, label: 'tasks' },
  ];
  const total = counts.reduce((a, c) => a + c.n, 0);
  const bytes = useMemo(() => new Blob([JSON.stringify(data)]).size, [data]);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    if (fileRef.current) fileRef.current.value = '';
    let parsed: unknown;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      toast({ title: "Couldn't read that file", description: 'Choose a .json backup exported from Keel.', tone: 'danger' });
      return;
    }
    const result = validateImport(parsed);
    if (!result.ok) {
      toast({ title: 'Import failed', description: result.error, tone: 'danger' });
      return;
    }
    const d = result.data;
    const ok = await confirm({
      title: 'Replace your data with this backup?',
      description: `"${file.name}" has ${d.subscriptions.length} subscriptions & bills, ${d.documents.length} documents, ${d.purchases.length} purchases and ${d.tasks.length} tasks. Everything currently in Keel will be replaced. Export a backup first if you might want it back.`,
      confirmLabel: 'Replace my data',
      danger: true,
    });
    if (!ok) return;
    actions.replaceAll({ ...d, settings: { ...d.settings, onboarded: true } });
    toast({ title: 'Backup imported', description: `${d.subscriptions.length + d.documents.length + d.purchases.length + d.tasks.length} items restored.` });
  };

  const loadSample = async () => {
    const ok = await confirm({
      title: 'Load sample data?',
      description: total
        ? `This replaces your ${total} items with a sample household so you can explore. Export a backup first if you want to keep what you have.`
        : 'This fills Keel with a sample household so you can explore every feature.',
      confirmLabel: 'Load sample data',
      danger: total > 0,
    });
    if (!ok) return;
    actions.loadSample();
    toast({ title: 'Sample data loaded', description: 'Explore freely. Erase it any time from Settings.' });
  };

  return (
    <Section id="data" icon={<Database size={16} />} title="Your data" subtitle="Back up, move or reset everything Keel knows.">
      <div className="settings-datastats">
        {counts.map((c) => (
          <div key={c.label} className="settings-datastat">
            <span className="tabular">{c.n}</span>
            {c.label}
          </div>
        ))}
        <div className="settings-datastat is-muted">
          <span className="tabular">{bytes > 1024 ? `${Math.round(bytes / 1024)} KB` : `${bytes} B`}</span>
          stored on this device
        </div>
      </div>
      <div className="settings-rows">
        <DataRow icon={<FileJson size={18} />} title="Export backup" desc="Download everything as a JSON file. Keep it somewhere safe, or use it to move to another browser.">
          <Button
            variant="secondary"
            icon={<Download size={15} />}
            onClick={() => {
              const name = exportBackup(data);
              toast({ title: 'Backup downloaded', description: name });
            }}
          >
            Export JSON
          </Button>
        </DataRow>
        <DataRow icon={<Upload size={18} />} title="Import backup" desc="Restore from a Keel JSON backup. You'll be asked before anything is replaced.">
          <input ref={fileRef} type="file" accept="application/json,.json" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => onFile(e.target.files?.[0])} />
          <Button variant="secondary" icon={<Upload size={15} />} onClick={() => fileRef.current?.click()}>
            Import JSON
          </Button>
        </DataRow>
        <DataRow icon={<FileSpreadsheet size={18} />} title="Export subscriptions" desc="A spreadsheet of every subscription and bill with monthly and yearly cost, for Excel, Numbers or Sheets.">
          <Button
            variant="secondary"
            icon={<Download size={15} />}
            disabled={!data.subscriptions.length}
            onClick={() => {
              const name = exportSubscriptionsCSV(data);
              toast({ title: 'Spreadsheet downloaded', description: name });
            }}
          >
            Export CSV
          </Button>
        </DataRow>
        <DataRow icon={<Sparkles size={18} />} title="Load sample data" desc="Fill Keel with a realistic example household to try things out.">
          <Button variant="secondary" onClick={loadSample}>
            Load sample
          </Button>
        </DataRow>
        <DataRow icon={<Trash2 size={18} />} title="Erase everything" desc="Permanently delete all items and settings from this device and start over." danger>
          <Button variant="danger" icon={<Trash2 size={15} />} onClick={() => setEraseOpen(true)}>
            Erase all data
          </Button>
        </DataRow>
      </div>
      <EraseModal open={eraseOpen} onClose={() => setEraseOpen(false)} total={total} />
    </Section>
  );
}

function DataRow({ icon, title, desc, children, danger }: { icon: ReactNode; title: string; desc: string; children: ReactNode; danger?: boolean }) {
  return (
    <div className={cx('settings-rowitem', danger && 'is-danger')}>
      <span className="settings-rowicon" aria-hidden>
        {icon}
      </span>
      <div className="settings-rowtext">
        <p className="settings-rowtitle">{title}</p>
        <p className="settings-rowdesc">{desc}</p>
      </div>
      <div className="settings-rowaction">{children}</div>
    </div>
  );
}

function EraseModal({ open, onClose, total }: { open: boolean; onClose: () => void; total: number }) {
  const actions = useActions();
  const toast = useToast();
  const [text, setText] = useState('');
  const id = useId();
  useEffect(() => {
    if (open) setText('');
  }, [open]);
  const ready = text.trim() === 'DELETE';
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!ready) return;
    onClose();
    actions.resetAll();
    toast({ title: 'All data erased', description: 'Keel is empty. Start fresh whenever you like.', tone: 'info' });
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      icon={<Trash2 size={20} />}
      title="Erase everything?"
      description={`This permanently deletes ${total ? `all ${total} items` : 'everything'}, your household and your preferences from this device. It can't be undone.`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" type="submit" form={id} disabled={!ready}>
            Erase everything
          </Button>
        </>
      }
    >
      <form id={id} onSubmit={submit} noValidate>
        <Field label={<>Type <strong className="settings-code">DELETE</strong> to confirm</>} htmlFor={`${id}-input`}>
          <Input id={`${id}-input`} value={text} onChange={(e) => setText(e.target.value)} autoComplete="off" autoCapitalize="characters" spellCheck={false} data-autofocus placeholder="DELETE" />
        </Field>
      </form>
    </Modal>
  );
}

function AboutSection() {
  const data = useData();
  return (
    <Section id="about" icon={<Info size={16} />} title="About & privacy">
      <div className="settings-privacy">
        <span className="settings-privacy-icon" aria-hidden>
          <ShieldCheck size={20} />
        </span>
        <div>
          <p className="settings-rowtitle">Your data never leaves this device</p>
          <p className="settings-rowdesc">
            Keel has no accounts, no servers and no tracking. Everything you enter is saved in this browser's local storage and nowhere else. That also means
            clearing your browser data erases it, so export a backup now and then.
          </p>
        </div>
      </div>
      <ul className="settings-facts">
        <li>
          <Lock size={14} aria-hidden /> No sign-up, no cloud sync, no analytics
        </li>
        <li>
          <Download size={14} aria-hidden /> Export everything any time, in open formats (JSON & CSV)
        </li>
        <li>
          <Trash2 size={14} aria-hidden /> Erase it all with one action
        </li>
      </ul>
      <p className="settings-version">
        Keel {APP_VERSION} · data format v{data.version}
      </p>
    </Section>
  );
}
