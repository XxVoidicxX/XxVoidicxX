import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarPlus, Check, Copy, ListChecks, Mail, Pencil, RotateCcw, ShieldAlert, Trash2, Undo2 } from 'lucide-react';
import { useUI } from '@/app/ui';
import { Badge, Button, Checkbox, DescriptionList, Drawer, Field, Modal, Textarea, cx, useToast } from '@/components/ui';
import { addDays, compareISO, diffDays, formatDate, maxISO } from '@/lib/dates';
import { purchaseStatus, returnDeadline, warrantyEnd } from '@/lib/engine';
import { purchaseCategoryMeta } from '@/lib/meta';
import { ROUTES } from '@/lib/routes';
import type { Purchase } from '@/lib/types';
import { useMoney } from '@/store/selectors';
import { useActions, useData, useToday } from '@/store/store';
import { useLinkedTaskFollowUp } from '@/features/tasks/useLinkedTaskFollowUp';
import { CoverageTimeline } from './CoverageBar';
import { PURCHASE_ICONS, copyText, coverageBadge, manufacturerEnd, monthsLabel, statusSentence } from './purchaseMeta';

export function PurchaseDrawer({ purchase: p, onClose }: { purchase: Purchase; onClose: () => void }) {
  const data = useData();
  const today = useToday();
  const actions = useActions();
  const toast = useToast();
  const money = useMoney();
  const { openEditor } = useUI();
  const followUp = useLinkedTaskFollowUp();
  const [claimOpen, setClaimOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const locale = data.settings.locale;
  const fmt = (iso: string) => formatDate(iso, 'medium', locale);

  const st = purchaseStatus(p, today);
  const badge = coverageBadge(p, today);
  const Icon = PURCHASE_ICONS[p.category];
  const rd = returnDeadline(p);
  const we = warrantyEnd(p);
  const mfg = manufacturerEnd(p);
  const tasks = data.tasks.filter((t) => t.link?.kind === 'purchase' && t.link.id === p.id);

  const setReturned = (returned: boolean) => {
    actions.savePurchase({ ...p, returned });
    toast({
      title: returned ? `${p.item} marked as returned` : `${p.item} is back on your list`,
      description: returned ? 'Reminders for it are turned off.' : undefined,
      tone: returned ? 'success' : 'info',
      action: { label: 'Undo', onClick: () => actions.savePurchase({ ...p, returned: !returned }) },
    });
    if (returned) followUp({ kind: 'purchase', id: p.id }, 'it is returned');
  };

  const remove = () => {
    const snap = actions.remove('purchases', p.id);
    onClose();
    if (snap) {
      toast({
        title: 'Purchase deleted',
        description: p.item,
        tone: 'info',
        action: { label: 'Undo', onClick: () => actions.restore(snap) },
      });
    }
  };

  const createTask = () => {
    let title = `Follow up on ${p.item}`;
    let dueDate: string | undefined;
    let priority: 'normal' | 'high' = 'normal';
    if (st === 'returnable' && rd) {
      title = `Decide whether to keep or return ${p.item}`;
      dueDate = maxISO(today, addDays(rd, -2));
      priority = diffDays(rd, today) <= 7 ? 'high' : 'normal';
    } else if (st === 'under_warranty' && we) {
      title = `Check ${p.item} over before the warranty ends`;
      dueDate = maxISO(today, addDays(we, -30));
    }
    openEditor({ kind: 'task', defaults: { title, dueDate, priority, link: { kind: 'purchase', id: p.id } } });
  };

  const copySerial = async () => {
    if (!p.serial) return;
    const ok = await copyText(p.serial);
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } else {
      toast({ title: 'Couldn’t copy', description: 'Select the serial number and copy it manually.', tone: 'warning' });
    }
  };

  const warrantyText = (() => {
    if (!we) return 'None';
    const ext = p.extendedWarrantyMonths ?? 0;
    const parts: string[] = [];
    if (p.warrantyMonths > 0) parts.push(`${monthsLabel(p.warrantyMonths)} manufacturer`);
    if (ext > 0) parts.push(`${monthsLabel(ext)} extended`);
    return (
      <span>
        {parts.join(' + ')}
        <span className="buy-dl-sub">
          {p.returned ? 'Not needed, item returned' : `${compareISO(we, today) >= 0 ? 'Until' : 'Ended'} ${fmt(we)}`}
          {ext > 0 && mfg ? ` · manufacturer part ends ${fmt(mfg)}` : ''}
        </span>
      </span>
    );
  })();

  return (
    <>
      <Drawer
        open
        onClose={onClose}
        width={560}
        title={p.item}
        subtitle={[p.brand, purchaseCategoryMeta(p.category).label].filter(Boolean).join(' · ')}
        headerExtra={
          <span className="buy-icon buy-icon-lg" aria-hidden>
            <Icon size={20} />
          </span>
        }
        footer={
          <>
            <Button variant="ghost" className="buy-delete" icon={<Trash2 size={16} />} onClick={remove}>
              Delete
            </Button>
            <Button icon={<CalendarPlus size={16} />} onClick={createTask}>
              Create task
            </Button>
            {p.returned ? (
              <Button icon={<RotateCcw size={16} />} onClick={() => setReturned(false)}>
                Undo returned
              </Button>
            ) : (
              <Button icon={<Undo2 size={16} />} onClick={() => setReturned(true)}>
                Mark returned
              </Button>
            )}
            <Button variant="primary" icon={<Pencil size={16} />} onClick={() => openEditor({ kind: 'purchase', id: p.id })}>
              Edit
            </Button>
          </>
        }
      >
        <div className="buy-drawer">
          <div className={cx('buy-callout', `buy-callout-${badge.tone}`)}>
            <div className="buy-callout-top">
              <Badge tone={badge.tone} dot>
                {badge.label}
              </Badge>
              <span className="buy-callout-price tabular">{money(p.price)}</span>
            </div>
            <p>{statusSentence(p, today, fmt)}</p>
            {!p.returned && (
              <div className="buy-callout-actions">
                <Button size="sm" variant={st === 'under_warranty' ? 'primary' : 'secondary'} icon={<ShieldAlert size={14} />} onClick={() => setClaimOpen(true)}>
                  Start a claim
                </Button>
              </div>
            )}
          </div>

          <section aria-labelledby="buy-tl-title">
            <h3 id="buy-tl-title" className="buy-section-title">
              Coverage
            </h3>
            <CoverageTimeline p={p} today={today} locale={locale} />
          </section>

          <section aria-labelledby="buy-facts-title">
            <h3 id="buy-facts-title" className="buy-section-title">
              Details
            </h3>
            <DescriptionList
              items={[
                { label: 'Brand / model', value: p.brand || '—' },
                { label: 'Category', value: purchaseCategoryMeta(p.category).label },
                { label: 'Retailer', value: p.retailer || '—' },
                { label: 'Price', value: <span className="tabular">{money(p.price)}</span> },
                { label: 'Purchased', value: fmt(p.purchaseDate) },
                {
                  label: 'Return window',
                  value: rd ? (
                    <span>
                      {p.returnDays} days
                      <span className="buy-dl-sub">
                        {p.returned ? 'Item returned' : `${compareISO(rd, today) >= 0 ? 'Until' : 'Closed'} ${fmt(rd)}`}
                      </span>
                    </span>
                  ) : (
                    'No returns'
                  ),
                },
                { label: 'Warranty', value: warrantyText },
                {
                  label: 'Serial number',
                  value: p.serial ? (
                    <span className="buy-serial">
                      <code>{p.serial}</code>
                      <Button
                        size="sm"
                        variant="ghost"
                        iconOnly
                        icon={copied ? <Check size={15} /> : <Copy size={15} />}
                        onClick={copySerial}
                        aria-label={copied ? 'Serial number copied' : 'Copy serial number'}
                        title={copied ? 'Copied' : 'Copy'}
                      />
                      <span className="sr-only" aria-live="polite">
                        {copied ? 'Copied to clipboard' : ''}
                      </span>
                    </span>
                  ) : (
                    <span className="muted">Not saved</span>
                  ),
                },
                { label: 'Receipt', value: p.receiptLocation || <span className="muted">Not saved</span> },
                ...(p.notes ? [{ label: 'Notes', value: <span className="buy-notes">{p.notes}</span> }] : []),
              ]}
            />
          </section>

          <section aria-labelledby="buy-tasks-title">
            <h3 id="buy-tasks-title" className="buy-section-title">
              <ListChecks size={15} aria-hidden /> Related tasks
            </h3>
            {tasks.length === 0 ? (
              <div className="buy-tasks-empty">
                <span className="muted">No tasks linked yet.</span>
                <Button size="sm" variant="subtle" icon={<CalendarPlus size={14} />} onClick={createTask}>
                  Create task
                </Button>
              </div>
            ) : (
              <ul className="buy-tasks">
                {tasks.map((t) => (
                  <li key={t.id} className={cx('buy-task', t.done && 'is-done')}>
                    <Checkbox checked={t.done} onChange={() => actions.toggleTask(t.id)} ariaLabel={`Mark “${t.title}” as ${t.done ? 'not done' : 'done'}`} />
                    <Link to={`${ROUTES.tasks}?open=${t.id}`} className="buy-task-title truncate">
                      {t.title}
                    </Link>
                    {t.dueDate && (
                      <span className={cx('buy-task-due', !t.done && compareISO(t.dueDate, today) < 0 && 'is-overdue')}>
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
      {claimOpen && <ClaimModal p={p} onClose={() => setClaimOpen(false)} />}
    </>
  );
}

function ClaimModal({ p, onClose }: { p: Purchase; onClose: () => void }) {
  const data = useData();
  const today = useToday();
  const money = useMoney();
  const toast = useToast();
  const [issue, setIssue] = useState('');
  const [copied, setCopied] = useState(false);
  const locale = data.settings.locale;
  const we = warrantyEnd(p);
  const covered = !!we && compareISO(we, today) >= 0;
  const name = data.settings.displayName.trim();

  const { subject, body } = useMemo(() => {
    const product = [p.brand, p.item].filter(Boolean).join(' ');
    const subj = `Warranty claim: ${product}${p.serial ? ` (serial ${p.serial})` : ''}`;
    const lines = [
      `Hello${p.brand ? ` ${p.brand.split(' ')[0]}` : ''} support team,`,
      '',
      `I’d like to make a warranty claim for my ${p.item}${p.brand ? ` (${p.brand})` : ''}.`,
      '',
      'Purchase details',
      `- Item: ${p.item}`,
      ...(p.brand ? [`- Brand / model: ${p.brand}`] : []),
      `- Serial number: ${p.serial || '[add serial number]'}`,
      `- Purchase date: ${formatDate(p.purchaseDate, 'long', locale)}`,
      `- Purchased from: ${p.retailer || '[add retailer]'}`,
      `- Price paid: ${money(p.price)}`,
      '',
      'What’s wrong',
      issue.trim() || '[Describe the problem: what happens, when it started, and anything you’ve already tried.]',
      '',
      we
        ? `${covered ? 'The item is still within its warranty period, which runs until' : 'The warranty period ran until'} ${formatDate(we, 'long', locale)}.`
        : 'Please let me know what coverage applies to this item.',
      'I have the original proof of purchase and can share a copy, along with photos if helpful.',
      '',
      'Could you let me know the next steps for a repair or replacement?',
      '',
      'Thank you,',
      name || '[Your name]',
    ];
    return { subject: subj, body: lines.join('\n') };
  }, [p, issue, locale, money, we, covered, name]);

  const ready = issue.trim().length > 0;
  const full = `Subject: ${subject}\n\n${body}`;
  const mailto = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  const copy = async () => {
    const ok = await copyText(full);
    if (ok) {
      setCopied(true);
      toast({ title: 'Claim message copied', description: 'Paste it into an email or the support form.' });
      window.setTimeout(() => setCopied(false), 2000);
    } else {
      toast({ title: 'Couldn’t copy', description: 'Select the message text and copy it manually.', tone: 'warning' });
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title="Start a warranty claim"
      description="Describe the problem and Keel will draft a message you can send to the manufacturer or retailer."
      footer={
        <>
          {!ready && (
            <span className="buy-claim-need" id="buy-claim-need">
              Describe the problem first
            </span>
          )}
          {ready ? (
            <a className="btn btn-secondary btn-md buy-mail" href={mailto}>
              <Mail size={16} aria-hidden /> Open in email
            </a>
          ) : (
            <Button icon={<Mail size={16} />} disabled aria-describedby="buy-claim-need">
              Open in email
            </Button>
          )}
          <Button variant="primary" icon={copied ? <Check size={16} /> : <Copy size={16} />} onClick={copy} disabled={!ready} aria-describedby={ready ? undefined : 'buy-claim-need'}>
            {copied ? 'Copied' : 'Copy message'}
          </Button>
        </>
      }
    >
      <div className="buy-claim">
        {!covered && (
          <div className="buy-claim-warn" role="note">
            <ShieldAlert size={16} aria-hidden />
            <span>
              {we
                ? `The warranty ended on ${formatDate(we, 'medium', locale)}. It can still be worth asking — some brands and card issuers help after the period ends.`
                : 'No warranty was recorded for this item. Check with the brand or your card issuer — some extend coverage.'}
            </span>
          </div>
        )}
        <Field label="What’s the problem?" htmlFor="buy-claim-issue" required hint={ready ? 'Be specific: what happens, when it started, and what you’ve tried.' : 'Required before you can copy or email the message.'}>
          <Textarea
            id="buy-claim-issue"
            rows={4}
            value={issue}
            onChange={(e) => setIssue(e.target.value)}
            placeholder="e.g. The left earcup stopped producing sound last week. I’ve reset and recharged it, and the issue continues."
            data-autofocus
            maxLength={2000}
          />
        </Field>
        <div className="buy-claim-preview">
          <div className="buy-claim-preview-head">
            <span>Message preview</span>
            <span className="muted truncate">{[p.brand, p.retailer].filter(Boolean).join(' · ')}</span>
          </div>
          <p className="buy-claim-subject">
            <span className="muted">Subject:</span> {subject}
          </p>
          <pre className="buy-claim-body" tabIndex={0} aria-label="Claim message">
            {body}
          </pre>
        </div>
      </div>
    </Modal>
  );
}
