import { CheckSquare, CreditCard, FileClock, FileWarning, Hourglass, ShieldAlert, Undo2, type LucideIcon } from 'lucide-react';
import { EVENT_KINDS } from '@/lib/meta';
import type { EventKind } from '@/lib/types';
import './kinds.css';

export type KindGroup = 'charges' | 'trials' | 'documents' | 'returns' | 'warranties' | 'tasks';

export const KIND_GROUPS: { id: KindGroup; label: string; kinds: EventKind[] }[] = [
  { id: 'charges', label: 'Charges', kinds: ['charge'] },
  { id: 'trials', label: 'Trials', kinds: ['trial_end'] },
  { id: 'documents', label: 'Documents', kinds: ['doc_expiry', 'doc_renew_window'] },
  { id: 'returns', label: 'Returns', kinds: ['return_deadline'] },
  { id: 'warranties', label: 'Warranties', kinds: ['warranty_end'] },
  { id: 'tasks', label: 'Tasks', kinds: ['task_due'] },
];

const GROUP_OF: Record<EventKind, KindGroup> = {
  charge: 'charges',
  trial_end: 'trials',
  doc_expiry: 'documents',
  doc_renew_window: 'documents',
  return_deadline: 'returns',
  warranty_end: 'warranties',
  task_due: 'tasks',
};

const ICONS: Record<EventKind, LucideIcon> = {
  charge: CreditCard,
  trial_end: Hourglass,
  doc_expiry: FileWarning,
  doc_renew_window: FileClock,
  return_deadline: Undo2,
  warranty_end: ShieldAlert,
  task_due: CheckSquare,
};

export function kindGroup(kind: EventKind): KindGroup {
  return GROUP_OF[kind];
}

export function kindClass(kind: EventKind): string {
  return `cal-kind-${GROUP_OF[kind]}`;
}

export function kindLabel(kind: EventKind): string {
  return EVENT_KINDS[kind].label;
}

export function KindIcon({ kind, size = 32 }: { kind: EventKind; size?: number }) {
  const Icon = ICONS[kind];
  return (
    <span className={`cal-kind-icon ${kindClass(kind)}`} style={{ width: size, height: size }} aria-hidden>
      <Icon size={Math.round(size * 0.5)} strokeWidth={2} />
    </span>
  );
}
