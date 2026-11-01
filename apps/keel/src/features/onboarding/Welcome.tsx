import { useId, useRef, useState, type ChangeEvent, type FormEvent, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, BellRing, CalendarClock, FileText, FileUp, Lock, PiggyBank, Plus, ShieldCheck, Sparkles, X } from 'lucide-react';
import { Logo } from '@/app/Shell';
import { useUI } from '@/app/ui';
import { Button, Field, Input, Select, cx, useToast } from '@/components/ui';
import { CURRENCIES } from '@/lib/meta';
import { formatMoney } from '@/lib/money';
import { useActions } from '@/store/store';
import { validateImport } from '@/store/persistence';
import { CURRENCY_NAMES, LOCALES } from '@/features/settings/locales';
import './welcome.css';

const CURRENCY_BY_REGION: Record<string, string> = {
  US: 'USD',
  GB: 'GBP',
  CA: 'CAD',
  AU: 'AUD',
  NZ: 'NZD',
  IN: 'INR',
  JP: 'JPY',
  MX: 'MXN',
  BR: 'BRL',
  CH: 'CHF',
  SE: 'SEK',
  DE: 'EUR',
  FR: 'EUR',
  ES: 'EUR',
  IT: 'EUR',
  NL: 'EUR',
  IE: 'EUR',
  AT: 'EUR',
  BE: 'EUR',
  PT: 'EUR',
  FI: 'EUR',
};

function guessLocale(): { locale: string; currency: string } {
  const lang = typeof navigator !== 'undefined' ? navigator.language : 'en-US';
  const region = lang.split('-')[1]?.toUpperCase() ?? '';
  const locale = LOCALES.find((l) => l.id.toLowerCase() === lang.toLowerCase())?.id ?? LOCALES.find((l) => l.id.split('-')[0] === lang.split('-')[0])?.id ?? 'en-US';
  const currency = CURRENCY_BY_REGION[region] ?? CURRENCY_BY_REGION[locale.split('-')[1]] ?? 'USD';
  return { locale, currency };
}

const VALUES = [
  { icon: BellRing, title: 'Heads-up before every charge', text: 'See renewals, bills and free trials coming, with time to cancel.' },
  { icon: FileText, title: 'IDs and documents renewed on time', text: 'Passports, licences and registrations flagged months ahead.' },
  { icon: PiggyBank, title: 'Find money you are wasting', text: 'Spot unused subscriptions, overlaps and price rises.' },
];

export function Welcome() {
  const actions = useActions();
  const toast = useToast();
  const navigate = useNavigate();
  const { openEditor } = useUI();
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [name, setName] = useState('');
  const [members, setMembers] = useState<string[]>([]);
  const [restoreError, setRestoreError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const [memberDraft, setMemberDraft] = useState('');
  const [memberError, setMemberError] = useState('');
  const guessed = useRef(guessLocale()).current;
  const [currency, setCurrency] = useState(guessed.currency);
  const [locale, setLocale] = useState(guessed.locale);
  const id = useId();

  const explore = () => {
    actions.loadSample();
    navigate('/');
    toast({ title: 'Sample household loaded', description: 'Have a look around. You can erase it from Settings whenever you are ready.' });
  };

  const restore = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setRestoreError('');
    try {
      const result = validateImport(JSON.parse(await file.text()));
      if (!result.ok) {
        setRestoreError(result.error);
        return;
      }
      const { data } = result;
      actions.replaceAll({ ...data, settings: { ...data.settings, onboarded: true } });
      navigate('/');
      const n = data.subscriptions.length + data.documents.length + data.purchases.length + data.tasks.length;
      toast({ title: 'Backup restored', description: `${n} item${n === 1 ? '' : 's'} loaded from ${file.name}.` });
    } catch {
      setRestoreError('That file could not be read. Choose a .json backup exported from Keel.');
    }
  };

  const addMember = () => {
    const v = memberDraft.trim();
    if (!v) return;
    const me = name.trim() || 'Me';
    if (v.length > 30) {
      setMemberError('Keep names under 30 characters.');
      return;
    }
    if ([me, ...members].some((m) => m.toLowerCase() === v.toLowerCase())) {
      setMemberError(`${v} is already on the list.`);
      return;
    }
    setMembers([...members, v]);
    setMemberDraft('');
    setMemberError('');
  };

  const onMemberKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (memberDraft.trim()) addMember();
      else setStep(2);
    } else if (e.key === 'Backspace' && !memberDraft && members.length) {
      setMembers(members.slice(0, -1));
    }
  };

  const finish = (e: FormEvent) => {
    e.preventDefault();
    const me = name.trim() || 'Me';
    const household = [me, ...members.filter((m) => m.toLowerCase() !== me.toLowerCase())];
    actions.updateSettings({ displayName: name.trim(), householdMembers: household, currency, locale, onboarded: true });
    navigate('/');
    toast({
      title: name.trim() ? `Welcome to Keel, ${name.trim()}` : 'Welcome to Keel',
      description: 'Start by adding a subscription or bill you pay regularly.',
      action: { label: 'Add one', onClick: () => openEditor({ kind: 'subscription' }) },
      duration: 9000,
    });
  };

  return (
    <div className={cx('welcome', step > 0 && 'is-setup')}>
      <section className="welcome-left">
        <div className="welcome-left-inner">
          <Logo />
          <h1 className="welcome-headline">Never get surprised by a renewal, expiry or deadline again.</h1>
          <p className="welcome-lede">Keel keeps your household's subscriptions, bills, IDs and warranties in one calm place, and tells you what needs doing before it costs you.</p>
          <ul className="welcome-values">
            {VALUES.map((v) => (
              <li key={v.title}>
                <span className="welcome-value-icon" aria-hidden>
                  <v.icon size={17} />
                </span>
                <span>
                  <strong>{v.title}</strong>
                  <span>{v.text}</span>
                </span>
              </li>
            ))}
          </ul>
          <HeroIllustration />
          <p className="welcome-privacy">
            <Lock size={14} aria-hidden />
            Private by design. Everything stays in this browser. No account, no tracking.
          </p>
        </div>
      </section>

      <section className="welcome-right" aria-label="Get started">
        <div className="welcome-card">
          {step === 0 ? (
            <>
              <h2 className="welcome-card-title">Get started</h2>
              <p className="welcome-card-sub">Take a look around first, or set Keel up for your household. It takes under a minute.</p>
              <button type="button" className="welcome-option is-primary" onClick={explore}>
                <span className="welcome-option-icon" aria-hidden>
                  <Sparkles size={18} />
                </span>
                <span className="welcome-option-text">
                  <strong>Explore with sample data</strong>
                  <span>A realistic household with subscriptions, IDs, purchases and tasks.</span>
                </span>
                <ArrowRight size={18} className="welcome-option-arrow" aria-hidden />
              </button>
              <div className="welcome-or" role="separator">
                <span>or</span>
              </div>
              <button type="button" className="welcome-option" onClick={() => setStep(1)}>
                <span className="welcome-option-icon is-quiet" aria-hidden>
                  <Plus size={18} />
                </span>
                <span className="welcome-option-text">
                  <strong>Start fresh</strong>
                  <span>Add your own things, one at a time.</span>
                </span>
                <ArrowRight size={18} className="welcome-option-arrow" aria-hidden />
              </button>
              <div className="welcome-restore">
                <button type="button" className="welcome-restore-btn" onClick={() => fileRef.current?.click()}>
                  <FileUp size={15} aria-hidden />
                  Restore from a backup file
                </button>
                <input ref={fileRef} type="file" accept="application/json,.json" className="sr-only" tabIndex={-1} aria-hidden onChange={restore} />
                {restoreError && (
                  <p className="welcome-restore-error" role="alert">
                    {restoreError}
                  </p>
                )}
              </div>
              <p className="welcome-card-foot">
                <ShieldCheck size={14} aria-hidden /> Nothing is uploaded. You can export or erase your data at any time.
              </p>
            </>
          ) : (
            <>
              <div className="welcome-steps" aria-label={`Step ${step} of 2`}>
                <span className={cx('welcome-step', step >= 1 && 'is-done')} />
                <span className={cx('welcome-step', step >= 2 && 'is-done')} />
                <span className="welcome-steps-label">Step {step} of 2</span>
              </div>
              {step === 1 ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    setStep(2);
                  }}
                  noValidate
                >
                  <h2 className="welcome-card-title">About your household</h2>
                  <p className="welcome-card-sub">So you can see who each subscription or document belongs to.</p>
                  <div className="welcome-fields">
                    <Field label="Your first name" htmlFor={`${id}-name`} optional>
                      <Input id={`${id}-name`} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Alex" autoComplete="given-name" maxLength={40} autoFocus />
                    </Field>
                    <Field label="Who else is in your household?" htmlFor={`${id}-member`} error={memberError} hint="Press Enter after each name, or leave it as just you." optional>
                      <div className={cx('welcome-chips', memberError && 'is-invalid')} onClick={() => document.getElementById(`${id}-member`)?.focus()}>
                        <span className="welcome-chip is-you">{name.trim() || 'You'}</span>
                        {members.map((m) => (
                          <span key={m} className="welcome-chip">
                            {m}
                            <button type="button" aria-label={`Remove ${m}`} onClick={() => setMembers(members.filter((x) => x !== m))}>
                              <X size={12} />
                            </button>
                          </span>
                        ))}
                        <input
                          id={`${id}-member`}
                          value={memberDraft}
                          onChange={(e) => {
                            setMemberDraft(e.target.value);
                            if (memberError) setMemberError('');
                          }}
                          onKeyDown={onMemberKey}
                          onBlur={() => memberDraft.trim() && addMember()}
                          placeholder={members.length ? 'Add another…' : 'Add a name…'}
                          maxLength={40}
                        />
                      </div>
                    </Field>
                  </div>
                  <div className="welcome-actions">
                    <Button variant="ghost" icon={<ArrowLeft size={16} />} onClick={() => setStep(0)}>
                      Back
                    </Button>
                    <Button type="submit" variant="primary" iconRight={<ArrowRight size={16} />}>
                      Continue
                    </Button>
                  </div>
                </form>
              ) : (
                <form onSubmit={finish} noValidate>
                  <h2 className="welcome-card-title">Money and dates</h2>
                  <p className="welcome-card-sub">You can change these later in Settings.</p>
                  <div className="welcome-fields">
                    <Field label="Currency" htmlFor={`${id}-cur`}>
                      <Select id={`${id}-cur`} value={currency} onChange={(e) => setCurrency(e.target.value)} autoFocus>
                        {CURRENCIES.map((c) => (
                          <option key={c} value={c}>
                            {c} — {CURRENCY_NAMES[c] ?? c}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Language & region" htmlFor={`${id}-loc`} hint={`Amounts will look like ${formatMoney(1234.5, currency, locale)}`}>
                      <Select id={`${id}-loc`} value={locale} onChange={(e) => setLocale(e.target.value)}>
                        {LOCALES.map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.label}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </div>
                  <div className="welcome-actions">
                    <Button variant="ghost" icon={<ArrowLeft size={16} />} onClick={() => setStep(1)}>
                      Back
                    </Button>
                    <Button type="submit" variant="primary">
                      Finish setup
                    </Button>
                  </div>
                </form>
              )}
            </>
          )}
        </div>
      </section>
    </div>
  );
}

function HeroIllustration() {
  return (
    <div className="welcome-hero" aria-hidden>
      <div className="welcome-mock">
        <div className="welcome-mock-head">
          <span>Coming up</span>
          <span className="welcome-mock-pill">Next 7 days</span>
        </div>
        <div className="welcome-mock-row">
          <span className="welcome-mock-mono" style={{ color: '#2563eb', background: '#2563eb14' }}>
            N
          </span>
          <span className="welcome-mock-text">
            <strong>Netflix</strong>
            <span>Renews in 3 days</span>
          </span>
          <span className="welcome-mock-amt">$17.99</span>
        </div>
        <div className="welcome-mock-row">
          <span className="welcome-mock-mono" style={{ color: '#ca8a04', background: '#ca8a0414' }}>
            D
          </span>
          <span className="welcome-mock-text">
            <strong>Duolingo trial ends</strong>
            <span className="is-warn">Tomorrow · cancel to avoid charge</span>
          </span>
          <span className="welcome-mock-amt">$12.99</span>
        </div>
        <div className="welcome-mock-row">
          <span className="welcome-mock-mono" style={{ color: '#0d9488', background: '#0d948814' }}>
            E
          </span>
          <span className="welcome-mock-text">
            <strong>Electric bill</strong>
            <span>Friday · Autopay</span>
          </span>
          <span className="welcome-mock-amt">$96.40</span>
        </div>
      </div>
      <div className="welcome-float welcome-float-a">
        <span className="welcome-float-icon is-blue">
          <CalendarClock size={15} />
        </span>
        <span>
          <strong>Passport</strong>
          <span>Renew within 4 months</span>
        </span>
      </div>
      <div className="welcome-float welcome-float-b">
        <span className="welcome-float-icon is-green">
          <PiggyBank size={15} />
        </span>
        <span>
          <strong>$288/yr</strong>
          <span>Unused app found</span>
        </span>
      </div>
    </div>
  );
}
