import { useCallback } from 'react';
import { useToast } from '@/components/ui';
import type { TaskLink } from '@/lib/types';
import { useActions, useData } from '@/store/store';

export function useLinkedTaskFollowUp() {
  const { tasks } = useData();
  const actions = useActions();
  const toast = useToast();

  return useCallback(
    (link: TaskLink, what: string) => {
      const open = tasks.filter((t) => !t.done && t.link?.kind === link.kind && t.link.id === link.id);
      if (!open.length) return;
      const ids = open.map((t) => t.id);
      toast({
        title: open.length === 1 ? 'Linked task still open' : `${open.length} linked tasks still open`,
        description: open.length === 1 ? `"${open[0].title}". Done with it now that ${what}?` : `Done with them now that ${what}?`,
        tone: 'info',
        duration: 10000,
        action: {
          label: open.length === 1 ? 'Complete it' : 'Complete all',
          onClick: () => {
            ids.forEach((id) => actions.toggleTask(id));
            toast({
              title: open.length === 1 ? 'Task completed' : `${open.length} tasks completed`,
              tone: 'success',
              action: { label: 'Undo', onClick: () => ids.forEach((id) => actions.toggleTask(id)) },
            });
          },
        },
      });
    },
    [tasks, actions, toast],
  );
}
