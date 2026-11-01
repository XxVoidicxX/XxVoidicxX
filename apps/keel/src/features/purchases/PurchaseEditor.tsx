import type { EditorProps } from '@/app/ui';
import type { Purchase } from '@/lib/types';
import { Modal } from '@/components/ui';

export function PurchaseEditor({ open, onClose }: EditorProps<Purchase>) {
  return (
    <Modal open={open} onClose={onClose} title="Coming soon">
      <p>Editor not built yet.</p>
    </Modal>
  );
}
