import type { EditorProps } from '@/app/ui';
import type { Task } from '@/lib/types';
import { Modal } from '@/components/ui';

export function TaskEditor({ open, onClose }: EditorProps<Task>) {
  return (
    <Modal open={open} onClose={onClose} title="Coming soon">
      <p>Editor not built yet.</p>
    </Modal>
  );
}
