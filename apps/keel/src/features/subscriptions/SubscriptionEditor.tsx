import type { EditorProps } from '@/app/ui';
import type { Subscription } from '@/lib/types';
import { Modal } from '@/components/ui';

export function SubscriptionEditor({ open, onClose }: EditorProps<Subscription>) {
  return (
    <Modal open={open} onClose={onClose} title="Coming soon">
      <p>Editor not built yet.</p>
    </Modal>
  );
}
