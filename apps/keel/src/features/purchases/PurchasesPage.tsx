import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Clock, PackageCheck, Plus, SearchX, ShieldCheck, ShoppingBag, Undo2 } from 'lucide-react';
import { useUI } from '@/app/ui';
import { Badge, Button, EmptyState, PageHeader, SearchInput, Segmented, Select, StatCard, cx } from '@/components/ui';
import { compareISO, diffDays, formatDate, relativeDays } from '@/lib/dates';
import { purchaseStatus, returnDeadline, warrantyEnd, type CoverageStatus } from '@/lib/engine';
import { PURCHASE_CATEGORIES, purchaseCategoryMeta } from '@/lib/meta';
import type { Purchase, PurchaseCategory } from '@/lib/types';
import { useMoney } from '@/store/selectors';
import { useData, useToday } from '@/store/store';
import { CoverageMini } from './CoverageBar';
import { PurchaseDrawer } from './PurchaseDrawer';
import { PURCHASE_ICONS, coverageBadge, nextDeadline } from './purchaseMeta';
import './purchases.css';

type Filter = 'all' | 'returnable' | 'warranty' | 'expired' | 'returned';
type Sort = 'deadline' | 'newest' | 'oldest' | 'price_desc' | 'price_asc' | 'name';

const FILTER_MATCH: Record<Filter, (s: CoverageStatus) => boolean> = {
  all: () => true,
  returnable: (s) => s === 'returnable',
  warranty: (s) => s === 'under_warranty',
  expired: (s) => s === 'expired' || s === 'no_coverage',
  returned: (s) => s === 'returned',
};

const EMPTY_HINT: Record<Filter, string> = {
  all: 'Try a different search or clear the filters.',
  returnable: 'Nothing is inside its return window right now.',
  warranty: 'None of your purchases are under warranty right now.',
  expired: 'Nothing has run out of coverage yet.',
  returned: 'Items you mark as returned will show up here.',
};

const SORTS: { id: Sort; label: string }[] = [
  { id: 'deadline', label: 'Next deadline' },
  { id: 'newest', label: 'Newest first' },
  { id: 'oldest', label: 'Oldest first' },
  { id: 'price_desc', label: 'Price: high to low' },
  { id: 'price_asc', label: 'Price: low to high' },
  { id: 'name', label: 'Name A–Z' },
];

function sortPurchases(list: Purchase[], sort: Sort, today: string): Purchase[] {
  const out = [...list];
  switch (sort) {
    case 'deadline':
      return out.sort((a, b) => {
        const da = nextDeadline(a, today);
        const db = nextDeadline(b, today);
        if (da && db) return compareISO(da, db);
        if (da) return -1;
        if (db) return 1;
        return compareISO(b.purchaseDate, a.purchaseDate);
      });
    case 'newest':
      return out.sort((a, b) => compareISO(b.purchaseDate, a.purchaseDate));
    case 'oldest':
      return out.sort((a, b) => compareISO(a.purchaseDate, b.purchaseDate));
    case 'price_desc':
      return out.sort((a, b) => b.price - a.price);
    case 'price_asc':
      return out.sort((a, b) => a.price - b.price);
    case 'name':
      return out.sort((a, b) => a.item.localeCompare(b.item));
  }
}

export function PurchasesPage() {
  const data = useData();
  const today = useToday();
  const money = useMoney();
  const { openEditor } = useUI();
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [category, setCategory] = useState<PurchaseCategory | 'all'>('all');
  const [sort, setSort] = useState<Sort>('deadline');

  const purchases = data.purchases;
  const locale = data.settings.locale;
  const openId = params.get('open');
  const openItem = openId ? purchases.find((p) => p.id === openId) : undefined;

  const setOpen = (id: string | null) => {
    const next = new URLSearchParams(params);
    if (id) next.set('open', id);
    else next.delete('open');
    setParams(next, { replace: true });
  };

  const stats = useMemo(() => {
    let covered = 0;
    let coveredCount = 0;
    let closing = 0;
    let closingValue = 0;
    let ending = 0;
    let returned = 0;
    for (const p of purchases) {
      if (p.returned) {
        returned += 1;
        continue;
      }
      const we = warrantyEnd(p);
      if (we && compareISO(we, today) >= 0) {
        covered += p.price;
        coveredCount += 1;
        if (diffDays(we, today) <= 90) ending += 1;
      }
      const rd = returnDeadline(p);
      if (rd) {
        const n = diffDays(rd, today);
        if (n >= 0 && n <= 7) {
          closing += 1;
          closingValue += p.price;
        }
      }
    }
    return { covered, coveredCount, closing, closingValue, ending, returned, tracked: purchases.length - returned };
  }, [purchases, today]);

  const base = useMemo(() => {
    const q = query.trim().toLowerCase();
    return purchases.filter((p) => {
      if (category !== 'all' && p.category !== category) return false;
      if (!q) return true;
      return [p.item, p.brand, p.retailer, p.serial, p.notes, purchaseCategoryMeta(p.category).label]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [purchases, query, category]);

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: base.length, returnable: 0, warranty: 0, expired: 0, returned: 0 };
    for (const p of base) {
      const st = purchaseStatus(p, today);
      (Object.keys(FILTER_MATCH) as Filter[]).forEach((f) => {
        if (f !== 'all' && FILTER_MATCH[f](st)) c[f] += 1;
      });
    }
    return c;
  }, [base, today]);

  const visible = useMemo(
    () => sortPurchases(base.filter((p) => FILTER_MATCH[filter](purchaseStatus(p, today))), sort, today),
    [base, filter, sort, today],
  );
  const visibleTotal = visible.reduce((a, p) => a + p.price, 0);

  const filtersActive = query.trim() !== '' || filter !== 'all' || category !== 'all';
  const clearFilters = () => {
    setQuery('');
    setFilter('all');
    setCategory('all');
  };
  const add = () => openEditor({ kind: 'purchase', defaults: category !== 'all' ? { category } : undefined });

  return (
    <div className="buy-page">
      <PageHeader
        title="Purchases & warranties"
        description="Keep receipts, return windows and warranties together — so you know when you can still send something back or get it fixed for free."
        actions={
          <Button variant="primary" icon={<Plus size={16} />} onClick={add}>
            Add purchase
          </Button>
        }
      />

      {purchases.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<ShoppingBag size={22} />}
            title="Track what you buy, and what’s still covered"
            description="Add a recent purchase and Keel will remind you before the return window closes and before the warranty runs out."
            action={
              <Button variant="primary" icon={<Plus size={16} />} onClick={add}>
                Add your first purchase
              </Button>
            }
          />
        </div>
      ) : (
        <>
          <div className="grid grid-4 buy-stats">
            <StatCard
              label="Items tracked"
              value={stats.tracked}
              hint={stats.returned ? `Plus ${stats.returned} returned` : `${money(purchases.reduce((a, p) => a + p.price, 0), { whole: true })} in purchases`}
              icon={<PackageCheck size={16} />}
              tone="brand"
            />
            <StatCard
              label="Value under warranty"
              value={money(stats.covered, { whole: true })}
              hint={`${stats.coveredCount} ${stats.coveredCount === 1 ? 'item' : 'items'} still covered`}
              icon={<ShieldCheck size={16} />}
              tone="success"
              onClick={() => setFilter('warranty')}
            />
            <StatCard
              label="Returns closing in 7 days"
              value={stats.closing}
              hint={stats.closing ? `${money(stats.closingValue, { whole: true })} you could still send back` : 'No return windows closing soon'}
              icon={<Undo2 size={16} />}
              tone={stats.closing ? 'warning' : 'neutral'}
              onClick={() => {
                setFilter('returnable');
                setSort('deadline');
              }}
            />
            <StatCard
              label="Warranties ending in 90 days"
              value={stats.ending}
              hint={stats.ending ? 'Check them over while covered' : 'Nothing ending soon'}
              icon={<Clock size={16} />}
              tone={stats.ending ? 'warning' : 'neutral'}
              onClick={() => {
                setFilter('warranty');
                setSort('deadline');
              }}
            />
          </div>

          <div className="toolbar buy-toolbar">
            <SearchInput value={query} onChange={setQuery} placeholder="Search item, brand, store, serial…" ariaLabel="Search purchases" />
            <Segmented<Filter>
              ariaLabel="Filter by coverage"
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'all', label: 'All', count: counts.all },
                { value: 'returnable', label: 'Returnable', count: counts.returnable },
                { value: 'warranty', label: 'Under warranty', count: counts.warranty },
                { value: 'expired', label: 'Expired', count: counts.expired },
                { value: 'returned', label: 'Returned', count: counts.returned },
              ]}
            />
            <div className="buy-toolbar-end">
              <Select
                value={category}
                onChange={(e) => setCategory(e.target.value as PurchaseCategory | 'all')}
                aria-label="Filter by category"
              >
                <option value="all">All categories</option>
                {PURCHASE_CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </Select>
              <Select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort purchases">
                {SORTS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          {visible.length === 0 ? (
            <div className="card">
              <EmptyState
                compact
                icon={<SearchX size={22} />}
                title="No purchases match"
                description={
                  query.trim() || category !== 'all'
                    ? 'Try a different search or clear the filters.'
                    : EMPTY_HINT[filter]
                }
                action={filtersActive ? <Button onClick={clearFilters}>Clear filters</Button> : undefined}
              />
            </div>
          ) : (
            <>
              <div className="card buy-table-card">
                <div className="table-wrap">
                  <table className="table buy-table">
                    <thead>
                      <tr>
                        <th scope="col">Item</th>
                        <th scope="col">Retailer</th>
                        <th scope="col" className="num">
                          Price
                        </th>
                        <th scope="col">Purchased</th>
                        <th scope="col">Coverage</th>
                        <th scope="col">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visible.map((p) => {
                        const Icon = PURCHASE_ICONS[p.category];
                        const badge = coverageBadge(p, today);
                        return (
                          <tr
                            key={p.id}
                            className={cx('is-clickable', p.returned && 'buy-row-returned')}
                            onClick={() => setOpen(p.id)}
                          >
                            <td>
                              <div className="buy-item">
                                <span className="buy-icon" aria-hidden>
                                  <Icon size={17} />
                                </span>
                                <div className="buy-item-text">
                                  <button
                                    type="button"
                                    className="buy-item-name truncate"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setOpen(p.id);
                                    }}
                                  >
                                    {p.item}
                                  </button>
                                  <span className="buy-item-sub truncate">{p.brand || purchaseCategoryMeta(p.category).label}</span>
                                </div>
                              </div>
                            </td>
                            <td className="buy-retailer">{p.retailer || <span className="muted">—</span>}</td>
                            <td className="num buy-price">{money(p.price)}</td>
                            <td className="buy-date">
                              <span>{formatDate(p.purchaseDate, 'medium', locale)}</span>
                              <span className="buy-date-rel">{relativeDays(p.purchaseDate, today)}</span>
                            </td>
                            <td className="buy-coverage-cell">
                              <CoverageMini p={p} today={today} locale={locale} />
                            </td>
                            <td>
                              <Badge tone={badge.tone} dot>
                                {badge.label}
                              </Badge>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="buy-table-foot">
                  <span>
                    Showing {visible.length} of {purchases.length} {purchases.length === 1 ? 'purchase' : 'purchases'}
                  </span>
                  <span className="tabular">Total {money(visibleTotal)}</span>
                </div>
              </div>

              <ul className="buy-cards">
                {visible.map((p) => {
                  const Icon = PURCHASE_ICONS[p.category];
                  const badge = coverageBadge(p, today);
                  return (
                    <li key={p.id}>
                      <button type="button" className={cx('card', 'buy-mcard', p.returned && 'buy-row-returned')} onClick={() => setOpen(p.id)}>
                        <div className="buy-mcard-top">
                          <span className="buy-icon" aria-hidden>
                            <Icon size={17} />
                          </span>
                          <div className="buy-item-text">
                            <span className="buy-mcard-name truncate">{p.item}</span>
                            <span className="buy-item-sub truncate">
                              {[p.brand, p.retailer].filter(Boolean).join(' · ') || purchaseCategoryMeta(p.category).label}
                            </span>
                          </div>
                          <div className="buy-mcard-price">
                            <span className="tabular">{money(p.price)}</span>
                            <span className="buy-date-rel">{formatDate(p.purchaseDate, 'short', locale)}</span>
                          </div>
                        </div>
                        <CoverageMini p={p} today={today} locale={locale} />
                        <div className="buy-mcard-foot">
                          <Badge tone={badge.tone} dot>
                            {badge.label}
                          </Badge>
                        </div>
                      </button>
                    </li>
                  );
                })}
                <li className="buy-cards-total">
                  {visible.length} {visible.length === 1 ? 'item' : 'items'} · <span className="tabular">{money(visibleTotal)}</span>
                </li>
              </ul>
            </>
          )}
        </>
      )}

      {openItem && <PurchaseDrawer purchase={openItem} onClose={() => setOpen(null)} />}
    </div>
  );
}
