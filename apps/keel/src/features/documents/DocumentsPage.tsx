import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertOctagon, CalendarClock, FileStack, MapPin, Plus, RefreshCw, SearchX } from 'lucide-react';
import { useUI } from '@/app/ui';
import {
  Badge,
  Button,
  EmptyState,
  Monogram,
  PageHeader,
  Progress,
  SearchInput,
  Segmented,
  Select,
  StatCard,
  cx,
} from '@/components/ui';
import { compareISO, formatDate, relativeDays } from '@/lib/dates';
import { documentStatus, type DocStatus } from '@/lib/engine';
import { DOCUMENT_TYPES, documentTypeMeta } from '@/lib/meta';
import type { DocumentItem } from '@/lib/types';
import { useData, useToday } from '@/store/store';
import { DocumentDrawer } from './DocumentDrawer';
import { DOC_ICONS, DOC_STATUS, barTone, sortDocs, validity } from './docMeta';
import './documents.css';

type Filter = 'all' | 'needs' | 'valid' | 'none';
type GroupBy = 'holder' | 'type';

const FILTER_MATCH: Record<Filter, (s: DocStatus) => boolean> = {
  all: () => true,
  needs: (s) => s === 'expired' || s === 'renew_now',
  valid: (s) => s === 'ok',
  none: (s) => s === 'no_expiry',
};

export function DocumentsPage() {
  const data = useData();
  const today = useToday();
  const { openEditor } = useUI();
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [holder, setHolder] = useState('all');
  const [groupBy, setGroupBy] = useState<GroupBy>('holder');

  const docs = data.documents;
  const locale = data.settings.locale;
  const openId = params.get('open');
  const openDoc = openId ? docs.find((d) => d.id === openId) : undefined;

  const setOpen = (id: string | null) => {
    const next = new URLSearchParams(params);
    if (id) next.set('open', id);
    else next.delete('open');
    setParams(next, { replace: true });
  };

  const holders = useMemo(() => {
    const out = [...data.settings.householdMembers];
    for (const d of docs) if (d.holder && !out.includes(d.holder)) out.push(d.holder);
    return out;
  }, [data.settings.householdMembers, docs]);

  const stats = useMemo(() => {
    let expired = 0;
    let renew = 0;
    let next: DocumentItem | undefined;
    for (const d of docs) {
      const st = documentStatus(d, today);
      if (st === 'expired') expired += 1;
      if (st === 'renew_now') renew += 1;
      if (d.expiresOn && compareISO(d.expiresOn, today) >= 0 && (!next?.expiresOn || compareISO(d.expiresOn, next.expiresOn) < 0)) {
        next = d;
      }
    }
    const people = new Set(docs.map((d) => d.holder)).size;
    return { expired, renew, next, people };
  }, [docs, today]);

  const base = useMemo(() => {
    const q = query.trim().toLowerCase();
    return docs.filter((d) => {
      if (holder !== 'all' && d.holder !== holder) return false;
      if (!q) return true;
      return [d.name, d.holder, d.issuer, d.storedAt, d.numberLast4, documentTypeMeta(d.type).label, d.notes]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [docs, query, holder]);

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: base.length, needs: 0, valid: 0, none: 0 };
    for (const d of base) {
      const st = documentStatus(d, today);
      if (FILTER_MATCH.needs(st)) c.needs += 1;
      if (FILTER_MATCH.valid(st)) c.valid += 1;
      if (FILTER_MATCH.none(st)) c.none += 1;
    }
    return c;
  }, [base, today]);

  const visible = useMemo(
    () => sortDocs(base.filter((d) => FILTER_MATCH[filter](documentStatus(d, today))), today),
    [base, filter, today],
  );

  const groups = useMemo(() => {
    if (groupBy === 'holder') {
      return holders
        .map((h) => ({ key: h, label: h, kind: 'holder' as const, items: visible.filter((d) => d.holder === h) }))
        .filter((g) => g.items.length > 0);
    }
    return DOCUMENT_TYPES.map((t) => ({
      key: t.id,
      label: t.label,
      kind: 'type' as const,
      items: visible.filter((d) => d.type === t.id),
    })).filter((g) => g.items.length > 0);
  }, [groupBy, holders, visible]);

  const filtersActive = query.trim() !== '' || filter !== 'all' || holder !== 'all';
  const clearFilters = () => {
    setQuery('');
    setFilter('all');
    setHolder('all');
  };

  const add = () => openEditor({ kind: 'document', defaults: holder !== 'all' ? { holder } : undefined });

  return (
    <div className="docs-page">
      <PageHeader
        title="Documents & IDs"
        description="Passports, licenses, registrations and cards for everyone in your household — and when each one needs renewing."
        actions={
          <Button variant="primary" icon={<Plus size={16} />} onClick={add}>
            Add document
          </Button>
        }
      />

      {docs.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<FileStack size={22} />}
            title="Keep your IDs and documents in one place"
            description="Add a passport, driver’s license or registration and Keel will remind you well before it expires. Only the last 4 digits of any number are stored."
            action={
              <Button variant="primary" icon={<Plus size={16} />} onClick={add}>
                Add your first document
              </Button>
            }
          />
        </div>
      ) : (
        <>
          <div className="grid grid-4 docs-stats">
            <StatCard
              label="Documents"
              value={docs.length}
              hint={`For ${stats.people} ${stats.people === 1 ? 'person' : 'people'}`}
              icon={<FileStack size={16} />}
              tone="brand"
            />
            <StatCard
              label="Expired"
              value={stats.expired}
              hint={stats.expired ? 'Renew these first' : 'Nothing has lapsed'}
              icon={<AlertOctagon size={16} />}
              tone={stats.expired ? 'danger' : 'neutral'}
              onClick={stats.expired ? () => setFilter('needs') : undefined}
            />
            <StatCard
              label="Renew now"
              value={stats.renew}
              hint={stats.renew ? 'Inside their renewal window' : 'No renewals due yet'}
              icon={<RefreshCw size={16} />}
              tone={stats.renew ? 'warning' : 'neutral'}
              onClick={stats.renew ? () => setFilter('needs') : undefined}
            />
            <StatCard
              label="Next to expire"
              value={stats.next?.expiresOn ? relativeDays(stats.next.expiresOn, today) : '—'}
              hint={
                stats.next ? (
                  <span className="truncate docs-stat-hint">
                    {stats.next.holder}’s {stats.next.name}
                  </span>
                ) : (
                  'No upcoming expiry dates'
                )
              }
              icon={<CalendarClock size={16} />}
              tone="neutral"
              onClick={stats.next ? () => setOpen(stats.next!.id) : undefined}
            />
          </div>

          <div className="toolbar docs-toolbar">
            <SearchInput value={query} onChange={setQuery} placeholder="Search documents…" ariaLabel="Search documents" />
            <Segmented<Filter>
              ariaLabel="Filter by status"
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'all', label: 'All', count: counts.all },
                { value: 'needs', label: 'Needs action', count: counts.needs },
                { value: 'valid', label: 'Valid', count: counts.valid },
                { value: 'none', label: 'No expiry', count: counts.none },
              ]}
            />
            <div className="docs-toolbar-end">
              <Select
                value={holder}
                onChange={(e) => setHolder(e.target.value)}
                aria-label="Filter by person"
                className="docs-holder-select"
              >
                <option value="all">Everyone</option>
                {holders.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </Select>
              <Segmented<GroupBy>
                ariaLabel="Group documents"
                value={groupBy}
                onChange={setGroupBy}
                options={[
                  { value: 'holder', label: 'By person' },
                  { value: 'type', label: 'By type' },
                ]}
              />
            </div>
          </div>

          {groups.length === 0 ? (
            <div className="card">
              <EmptyState
                compact
                icon={<SearchX size={22} />}
                title="No documents match"
                description={
                  query.trim() || holder !== 'all'
                    ? 'Try a different search or clear the filters.'
                    : filter === 'needs'
                      ? 'Everything is up to date. Nothing needs renewing right now.'
                      : 'Nothing in this view yet.'
                }
                action={
                  filtersActive ? (
                    <Button onClick={clearFilters}>Clear filters</Button>
                  ) : (
                    <Button variant="primary" icon={<Plus size={16} />} onClick={add}>
                      Add document
                    </Button>
                  )
                }
              />
            </div>
          ) : (
            <div className="docs-groups">
              {groups.map((g) => {
                const needs = g.items.filter((d) => FILTER_MATCH.needs(documentStatus(d, today))).length;
                const Icon = g.kind === 'type' ? DOC_ICONS[g.key as DocumentItem['type']] : null;
                return (
                  <section key={g.key} className="docs-group" aria-labelledby={`docs-group-${g.key}`}>
                    <header className="docs-group-head">
                      {Icon ? (
                        <span className="docs-group-icon" aria-hidden>
                          <Icon size={16} />
                        </span>
                      ) : (
                        <Monogram name={g.label} size={28} />
                      )}
                      <h2 id={`docs-group-${g.key}`} className="docs-group-title">
                        {g.label}
                      </h2>
                      <span className="docs-group-count">
                        {g.items.length} {g.items.length === 1 ? 'document' : 'documents'}
                      </span>
                      {needs > 0 && (
                        <Badge tone="warning" dot>
                          {needs} need{needs === 1 ? 's' : ''} action
                        </Badge>
                      )}
                    </header>
                    <div className="docs-grid">
                      {g.items.map((d) => (
                        <DocumentCard
                          key={d.id}
                          doc={d}
                          today={today}
                          locale={locale}
                          showHolder={groupBy === 'type'}
                          onOpen={() => setOpen(d.id)}
                        />
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </>
      )}

      {openDoc && <DocumentDrawer doc={openDoc} onClose={() => setOpen(null)} />}
    </div>
  );
}

function DocumentCard({
  doc,
  today,
  locale,
  showHolder,
  onOpen,
}: {
  doc: DocumentItem;
  today: string;
  locale: string;
  showHolder: boolean;
  onOpen: () => void;
}) {
  const st = documentStatus(doc, today);
  const meta = DOC_STATUS[st];
  const Icon = DOC_ICONS[doc.type];
  const v = validity(doc, today);
  const typeLabel = documentTypeMeta(doc.type).label;
  const sub =
    [showHolder ? doc.holder : doc.name !== typeLabel ? typeLabel : null, doc.issuer].filter(Boolean).join(' · ') || typeLabel;
  return (
    <button type="button" className={cx('card', 'docs-card', `docs-card-${st}`)} onClick={onOpen}>
      <div className="docs-card-top">
        <span className={cx('docs-type-icon', `docs-type-${st}`)} aria-hidden>
          <Icon size={18} />
        </span>
        <div className="docs-card-heading">
          <span className="docs-card-name truncate">{doc.name}</span>
          <span className="docs-card-sub truncate">{sub}</span>
        </div>
        <Badge tone={meta.tone} dot>
          {meta.label}
        </Badge>
      </div>

      <div className="docs-card-number tabular" aria-label={doc.numberLast4 ? `Number ending in ${doc.numberLast4}` : 'No number saved'}>
        {doc.numberLast4 ? (
          <>
            <span className="docs-dots" aria-hidden>
              ••••
            </span>{' '}
            {doc.numberLast4}
          </>
        ) : (
          <span className="docs-card-faint">No number saved</span>
        )}
      </div>

      <div className="docs-card-expiry">
        {doc.expiresOn ? (
          <>
            <span>
              <span className="docs-card-faint">{st === 'expired' ? 'Expired ' : 'Expires '}</span>
              <span className="docs-card-date">{formatDate(doc.expiresOn, 'medium', locale)}</span>
            </span>
            <span className={cx('docs-rel', `docs-rel-${st}`)}>{relativeDays(doc.expiresOn, today)}</span>
          </>
        ) : (
          <span className="docs-card-faint">Doesn’t expire</span>
        )}
      </div>

      {v ? (
        <div className="docs-card-validity" title={v.hasIssued ? 'Share of the validity period used so far' : 'Time left, shown against the next 12 months'}>
          <Progress value={v.pct} tone={barTone(st)} size="sm" label={`Validity: ${v.caption}`} />
          <span className="docs-card-caption">{v.caption}</span>
        </div>
      ) : (
        <div className="docs-card-validity">
          <div className="docs-bar-none" aria-hidden />
          <span className="docs-card-caption">No reminders needed</span>
        </div>
      )}

      <div className="docs-card-foot">
        <MapPin size={13} aria-hidden />
        <span className="truncate">{doc.storedAt || 'Location not set'}</span>
      </div>
    </button>
  );
}
