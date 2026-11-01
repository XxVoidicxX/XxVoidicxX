import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarCheck, ShieldCheck, Undo2 } from 'lucide-react';
import type { EditorProps } from '@/app/ui';
import { Button, Field, Input, Modal, Select, Textarea, cx, useToast } from '@/components/ui';
import { compareISO, diffDays, formatDate, isValidISO, relativeDays } from '@/lib/dates';
import { returnDeadline, warrantyEnd } from '@/lib/engine';
import { PURCHASE_CATEGORIES } from '@/lib/meta';
import { parseAmount } from '@/lib/money';
import { ROUTES } from '@/lib/routes';
import type { Purchase, PurchaseCategory } from '@/lib/types';
import { useActions, useData, useToday } from '@/store/store';
import { monthYear } from './CoverageBar';
import './purchases.css';

const RETURN_CHIPS = [14, 30, 60, 90];
const WARRANTY_CHIPS = [0, 12, 24, 36];

interface Draft {
  item: string;
  brand: string;
  category: PurchaseCategory;
  retailer: string;
  price: string;
  purchaseDate: string;
  returnDays: string;
  warrantyMonths: string;
  extendedWarrantyMonths: string;
  serial: string;
  receiptLocation: string;
  notes: string;
}

type Errors = Partial<Record<keyof Draft, string>>;

function currencySymbol(currency: string, locale: string): string {
  try {
    const parts = new Intl.NumberFormat(locale, { style: 'currency', currency }).formatToParts(0);
    return parts.find((x) => x.type === 'currency')?.value ?? currency;
  } catch {
    return currency;
  }
}

function intIn(v: string, min: number, max: number): number | null {
  if (v.trim() === '') return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
}

export function PurchaseEditor(props: EditorProps<Purchase>) {
  if (!props.open) return null;
  return <PurchaseEditorForm key={props.id ?? 'new'} {...props} />;
}

function PurchaseEditorForm({ id, defaults, onClose }: EditorProps<Purchase>) {
  const data = useData();
  const today = useToday();
  const actions = useActions();
  const toast = useToast();
  const navigate = useNavigate();
  const existing = id ? data.purchases.find((p) => p.id === id) : undefined;
  const { currency, locale } = data.settings;

  const [draft, setDraft] = useState<Draft>(() => {
    const src: Partial<Purchase> = existing ?? defaults ?? {};
    return {
      item: src.item ?? '',
      brand: src.brand ?? '',
      category: src.category ?? 'electronics',
      retailer: src.retailer ?? '',
      price: src.price !== undefined ? String(src.price) : '',
      purchaseDate: src.purchaseDate ?? today,
      returnDays: String(src.returnDays ?? 30),
      warrantyMonths: String(src.warrantyMonths ?? 12),
      extendedWarrantyMonths: src.extendedWarrantyMonths ? String(src.extendedWarrantyMonths) : '',
      serial: src.serial ?? '',
      receiptLocation: src.receiptLocation ?? '',
      notes: src.notes ?? '',
    };
  });
  const [errors, setErrors] = useState<Errors>({});

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const retailers = useMemo(
    () => Array.from(new Set(data.purchases.map((p) => p.retailer).filter((r): r is string => !!r))).sort(),
    [data.purchases],
  );

  const validate = (): Errors => {
    const e: Errors = {};
    if (!draft.item.trim()) e.item = 'What did you buy?';
    const price = parseAmount(draft.price);
    if (draft.price.trim() === '' || price === null) e.price = 'Enter the price you paid.';
    else if (price < 0) e.price = 'The price can’t be negative.';
    if (!isValidISO(draft.purchaseDate)) e.purchaseDate = 'Enter the purchase date.';
    else if (compareISO(draft.purchaseDate, today) > 0) e.purchaseDate = 'The purchase date can’t be in the future.';
    if (intIn(draft.returnDays, 0, 730) === null) e.returnDays = 'Use a whole number of days (0 for no returns).';
    if (intIn(draft.warrantyMonths, 0, 600) === null) e.warrantyMonths = 'Use a whole number of months (0 for none).';
    if (draft.extendedWarrantyMonths.trim() !== '' && intIn(draft.extendedWarrantyMonths, 0, 600) === null) {
      e.extendedWarrantyMonths = 'Use a whole number of months.';
    }
    return e;
  };

  const submit = (ev: FormEvent) => {
    ev.preventDefault();
    const e = validate();
    setErrors(e);
    if (Object.values(e).some(Boolean)) return;
    const ext = intIn(draft.extendedWarrantyMonths, 0, 600) ?? 0;
    const saved = actions.savePurchase({
      id: existing?.id,
      item: draft.item.trim(),
      brand: draft.brand.trim() || undefined,
      category: draft.category,
      retailer: draft.retailer.trim() || undefined,
      price: parseAmount(draft.price) ?? 0,
      purchaseDate: draft.purchaseDate,
      returnDays: intIn(draft.returnDays, 0, 730) ?? 0,
      warrantyMonths: intIn(draft.warrantyMonths, 0, 600) ?? 0,
      extendedWarrantyMonths: ext > 0 ? ext : undefined,
      serial: draft.serial.trim() || undefined,
      receiptLocation: draft.receiptLocation.trim() || undefined,
      notes: draft.notes.trim() || undefined,
      returned: existing?.returned,
    });
    toast({
      title: existing ? 'Purchase updated' : 'Purchase added',
      description: saved.item,
      action: existing ? undefined : { label: 'View', onClick: () => navigate(`${ROUTES.purchases}?open=${saved.id}`) },
    });
    onClose();
  };

  const preview = useMemo(() => {
    if (!isValidISO(draft.purchaseDate)) return null;
    const probe: Purchase = {
      id: 'preview',
      item: '',
      category: draft.category,
      price: 0,
      purchaseDate: draft.purchaseDate,
      returnDays: intIn(draft.returnDays, 0, 730) ?? 0,
      warrantyMonths: intIn(draft.warrantyMonths, 0, 600) ?? 0,
      extendedWarrantyMonths: intIn(draft.extendedWarrantyMonths, 0, 600) ?? 0,
      createdAt: '',
      updatedAt: '',
    };
    return { rd: returnDeadline(probe), we: warrantyEnd(probe) };
  }, [draft.purchaseDate, draft.category, draft.returnDays, draft.warrantyMonths, draft.extendedWarrantyMonths]);

  const sameYear = (iso: string) => iso.slice(0, 4) === today.slice(0, 4);

  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      title={existing ? 'Edit purchase' : 'Add a purchase'}
      description={existing ? existing.item : 'Track the return window and warranty so nothing slips by.'}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="buy-editor-form">
            {existing ? 'Save changes' : 'Add purchase'}
          </Button>
        </>
      }
    >
      <form id="buy-editor-form" className="form-grid" onSubmit={submit} noValidate>
        <Field label="Item" htmlFor="buy-item" required error={errors.item}>
          <Input
            id="buy-item"
            value={draft.item}
            onChange={(e) => set('item', e.target.value)}
            placeholder="e.g. Noise-cancelling headphones"
            invalid={!!errors.item}
            maxLength={80}
            data-autofocus
          />
        </Field>
        <Field label="Brand / model" htmlFor="buy-brand" optional>
          <Input id="buy-brand" value={draft.brand} onChange={(e) => set('brand', e.target.value)} placeholder="e.g. Sony WH-1000XM6" maxLength={80} />
        </Field>

        <Field label="Category" htmlFor="buy-category">
          <Select id="buy-category" value={draft.category} onChange={(e) => set('category', e.target.value as PurchaseCategory)}>
            {PURCHASE_CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Retailer" htmlFor="buy-retailer" optional>
          <Input
            id="buy-retailer"
            value={draft.retailer}
            onChange={(e) => set('retailer', e.target.value)}
            placeholder="e.g. Best Buy"
            list="buy-retailer-list"
            maxLength={80}
          />
          <datalist id="buy-retailer-list">
            {retailers.map((r) => (
              <option key={r} value={r} />
            ))}
          </datalist>
        </Field>

        <Field label="Price" htmlFor="buy-price" required error={errors.price}>
          <Input
            id="buy-price"
            prefix={currencySymbol(currency, locale)}
            value={draft.price}
            onChange={(e) => set('price', e.target.value)}
            inputMode="decimal"
            placeholder="0.00"
            invalid={!!errors.price}
          />
        </Field>
        <Field
          label="Purchase date"
          htmlFor="buy-date"
          required
          error={errors.purchaseDate}
          hint={isValidISO(draft.purchaseDate) && compareISO(draft.purchaseDate, today) <= 0 ? relativeDays(draft.purchaseDate, today) : undefined}
        >
          <Input
            id="buy-date"
            type="date"
            value={draft.purchaseDate}
            max={today}
            onChange={(e) => set('purchaseDate', e.target.value)}
            invalid={!!errors.purchaseDate}
          />
        </Field>

        <p className="form-section span-2">Coverage</p>

        <Field label="Return window" htmlFor="buy-return" className="span-2" error={errors.returnDays}>
          <div className="buy-chip-row">
            <Input
              id="buy-return"
              className="buy-num-input"
              type="number"
              min={0}
              max={730}
              step={1}
              inputMode="numeric"
              suffix="days"
              value={draft.returnDays}
              onChange={(e) => set('returnDays', e.target.value)}
              invalid={!!errors.returnDays}
            />
            <div className="buy-chips" role="group" aria-label="Return window quick picks">
              <Chip active={draft.returnDays === '0'} onClick={() => set('returnDays', '0')}>
                No returns
              </Chip>
              {RETURN_CHIPS.map((n) => (
                <Chip key={n} active={Number(draft.returnDays) === n && draft.returnDays !== ''} onClick={() => set('returnDays', String(n))}>
                  {n} days
                </Chip>
              ))}
            </div>
          </div>
        </Field>

        <Field label="Manufacturer warranty" htmlFor="buy-warranty" className="span-2" error={errors.warrantyMonths}>
          <div className="buy-chip-row">
            <Input
              id="buy-warranty"
              className="buy-num-input"
              type="number"
              min={0}
              max={600}
              step={1}
              inputMode="numeric"
              suffix="months"
              value={draft.warrantyMonths}
              onChange={(e) => set('warrantyMonths', e.target.value)}
              invalid={!!errors.warrantyMonths}
            />
            <div className="buy-chips" role="group" aria-label="Warranty quick picks">
              {WARRANTY_CHIPS.map((n) => (
                <Chip key={n} active={draft.warrantyMonths !== '' && Number(draft.warrantyMonths) === n} onClick={() => set('warrantyMonths', String(n))}>
                  {n === 0 ? 'None' : n % 12 === 0 ? `${n / 12} yr${n > 12 ? 's' : ''}` : `${n} mo`}
                </Chip>
              ))}
            </div>
          </div>
        </Field>

        <Field
          label="Extended warranty"
          htmlFor="buy-ext"
          optional
          error={errors.extendedWarrantyMonths}
          hint="Store or card protection plans that start after the manufacturer warranty."
        >
          <Input
            id="buy-ext"
            type="number"
            min={0}
            max={600}
            step={1}
            inputMode="numeric"
            suffix="months"
            value={draft.extendedWarrantyMonths}
            onChange={(e) => set('extendedWarrantyMonths', e.target.value)}
            placeholder="0"
            invalid={!!errors.extendedWarrantyMonths}
          />
        </Field>
        <div className="buy-preview" aria-live="polite">
          {preview ? (
            <>
              <span className="buy-preview-row">
                <Undo2 size={15} aria-hidden />
                {preview.rd ? (
                  <span>
                    Return by <strong>{formatDate(preview.rd, sameYear(preview.rd) ? 'short' : 'medium', locale)}</strong>
                    <span className={cx('buy-preview-sub', compareISO(preview.rd, today) < 0 && 'is-past')}>
                      {compareISO(preview.rd, today) < 0
                        ? 'already closed'
                        : diffDays(preview.rd, today) === 0
                          ? 'closes today'
                          : `${diffDays(preview.rd, today)} days left`}
                    </span>
                  </span>
                ) : (
                  <span>No returns</span>
                )}
              </span>
              <span className="buy-preview-row">
                <ShieldCheck size={15} aria-hidden />
                {preview.we ? (
                  <span>
                    Warranty until <strong>{monthYear(preview.we, locale)}</strong>
                    <span className={cx('buy-preview-sub', compareISO(preview.we, today) < 0 && 'is-past')}>
                      {compareISO(preview.we, today) < 0 ? 'already ended' : relativeDays(preview.we, today).toLowerCase()}
                    </span>
                  </span>
                ) : (
                  <span>No warranty</span>
                )}
              </span>
            </>
          ) : (
            <span className="buy-preview-row">
              <CalendarCheck size={15} aria-hidden /> Add a purchase date to see coverage.
            </span>
          )}
        </div>

        <p className="form-section span-2">Records</p>

        <Field label="Serial number" htmlFor="buy-serial" optional>
          <Input id="buy-serial" className="buy-serial-input" value={draft.serial} onChange={(e) => set('serial', e.target.value)} autoComplete="off" spellCheck={false} maxLength={80} />
        </Field>
        <Field label="Receipt location" htmlFor="buy-receipt" optional>
          <Input
            id="buy-receipt"
            value={draft.receiptLocation}
            onChange={(e) => set('receiptLocation', e.target.value)}
            placeholder="e.g. Email — order #88213"
            maxLength={120}
          />
        </Field>
        <Field label="Notes" htmlFor="buy-notes" optional className="span-2">
          <Textarea
            id="buy-notes"
            rows={3}
            value={draft.notes}
            onChange={(e) => set('notes', e.target.value)}
            placeholder="Return conditions, protection plan details, anything you’ll want later…"
            maxLength={1000}
          />
        </Field>
      </form>
    </Modal>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" className={cx('buy-chip', active && 'is-active')} aria-pressed={active} onClick={onClick}>
      {children}
    </button>
  );
}
