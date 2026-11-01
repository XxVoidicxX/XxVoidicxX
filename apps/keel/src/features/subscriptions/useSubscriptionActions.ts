import { useMemo } from 'react';
import { useUI } from '@/app/ui';
import { useConfirm, useToast } from '@/components/ui';
import { useActions } from '@/store/store';
import type { Subscription, SubscriptionStatus } from '@/lib/types';

export interface SubscriptionCommands {
  edit(s: Subscription): void;
  setStatus(s: Subscription, status: SubscriptionStatus): void;
  togglePause(s: Subscription): void;
  cancel(s: Subscription): Promise<boolean>;
  reactivate(s: Subscription): void;
  remind(s: Subscription): void;
  remove(s: Subscription, after?: () => void): void;
}

export function useSubscriptionActions(): SubscriptionCommands {
  const actions = useActions();
  const toast = useToast();
  const confirm = useConfirm();
  const { openEditor } = useUI();

  return useMemo<SubscriptionCommands>(() => {
    const setStatus = (s: Subscription, status: SubscriptionStatus) => {
      actions.saveSubscription({ ...s, status, cancelledOn: status === 'cancelled' ? s.cancelledOn : undefined });
    };
    const restoreTo = (s: Subscription) => () => actions.saveSubscription({ ...s });

    return {
      edit: (s) => openEditor({ kind: 'subscription', id: s.id }),
      setStatus,
      togglePause: (s) => {
        if (s.status === 'paused') {
          setStatus(s, 'active');
          toast({ title: `${s.name} resumed`, description: 'Keel is counting its charges again.', action: { label: 'Undo', onClick: restoreTo(s) } });
        } else {
          setStatus(s, 'paused');
          toast({
            title: `${s.name} paused`,
            description: 'Charges are left out of your totals until you resume it.',
            tone: 'info',
            action: { label: 'Undo', onClick: restoreTo(s) },
          });
        }
      },
      cancel: async (s) => {
        const ok = await confirm({
          title: `Mark ${s.name} as cancelled?`,
          description:
            'Keel will stop showing future charges for it and count it toward your savings. This does not cancel it with the provider, so make sure you have cancelled it there too.',
          confirmLabel: 'Mark cancelled',
          danger: true,
        });
        if (!ok) return false;
        setStatus(s, 'cancelled');
        toast({ title: `${s.name} marked as cancelled`, action: { label: 'Undo', onClick: restoreTo(s) } });
        return true;
      },
      reactivate: (s) => {
        setStatus(s, 'active');
        toast({ title: `${s.name} is active again`, action: { label: 'Undo', onClick: restoreTo(s) } });
      },
      remind: (s) =>
        openEditor({
          kind: 'task',
          defaults: { title: `Review ${s.name}`, link: { kind: 'subscription', id: s.id } },
        }),
      remove: (s, after) => {
        const snap = actions.remove('subscriptions', s.id);
        after?.();
        if (!snap) return;
        toast({
          title: `${s.name} deleted`,
          tone: 'info',
          action: { label: 'Undo', onClick: () => actions.restore(snap) },
        });
      },
    };
  }, [actions, toast, confirm, openEditor]);
}
