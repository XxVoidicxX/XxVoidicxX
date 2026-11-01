import type { EditorProps } from '@/app/ui';
import type { DocumentItem } from '@/lib/types';
import { Modal } from '@/components/ui';

export function DocumentEditor({ open, onClose }: EditorProps<DocumentItem>) {
  return (
    <Modal open={open} onClose={onClose} title="Coming soon">
      <p>Editor not built yet.</p>
    </Modal>
  );
}
