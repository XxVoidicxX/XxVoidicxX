import { DocumentEditor } from '@/features/documents/DocumentEditor';
import { PurchaseEditor } from '@/features/purchases/PurchaseEditor';
import { SubscriptionEditor } from '@/features/subscriptions/SubscriptionEditor';
import { TaskEditor } from '@/features/tasks/TaskEditor';
import { useUI } from './ui';

export function GlobalEditors() {
  const { editor, closeEditor } = useUI();
  return (
    <>
      <SubscriptionEditor
        open={editor?.kind === 'subscription'}
        id={editor?.kind === 'subscription' ? editor.id : undefined}
        defaults={editor?.kind === 'subscription' ? editor.defaults : undefined}
        onClose={closeEditor}
      />
      <DocumentEditor
        open={editor?.kind === 'document'}
        id={editor?.kind === 'document' ? editor.id : undefined}
        defaults={editor?.kind === 'document' ? editor.defaults : undefined}
        onClose={closeEditor}
      />
      <PurchaseEditor
        open={editor?.kind === 'purchase'}
        id={editor?.kind === 'purchase' ? editor.id : undefined}
        defaults={editor?.kind === 'purchase' ? editor.defaults : undefined}
        onClose={closeEditor}
      />
      <TaskEditor
        open={editor?.kind === 'task'}
        id={editor?.kind === 'task' ? editor.id : undefined}
        defaults={editor?.kind === 'task' ? editor.defaults : undefined}
        onClose={closeEditor}
      />
    </>
  );
}
