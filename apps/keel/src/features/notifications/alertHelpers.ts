import { useCallback, useEffect, useRef } from 'react';
import { useToast } from '@/components/ui';
import type { Alert } from '@/lib/engine';
import type { AppData } from '@/lib/types';
import { useActions, useData } from '@/store/store';

export interface AlertCounts {
  attention: number;
  urgent: number;
  total: number;
}

export function countAlerts(alerts: Alert[]): AlertCounts {
  const urgent = alerts.filter((a) => a.severity === 'critical').length;
  const attention = urgent + alerts.filter((a) => a.severity === 'warning').length;
  return { attention, urgent, total: alerts.length };
}

export function attentionText(c: AlertCounts, withUrgent = false): string {
  const urgent = withUrgent && c.urgent ? ` (${c.urgent} urgent)` : '';
  const head = c.attention ? `${c.attention} need${c.attention === 1 ? 's' : ''} attention${urgent}` : 'Nothing needs attention';
  return `${head} · ${c.total} alert${c.total === 1 ? '' : 's'} total`;
}

const latest: { current: AppData | null } = { current: null };

export function useDismissWithUndo() {
  const data = useData();
  const actions = useActions();
  const toast = useToast();
  const own = useRef(data);
  own.current = data;
  useEffect(() => {
    latest.current = data;
  }, [data]);

  const undismiss = useCallback(
    (keys: string[]) => {
      const cur = latest.current ?? own.current;
      const drop = new Set(keys);
      actions.replaceAll({ ...cur, dismissedAlerts: cur.dismissedAlerts.filter((d) => !drop.has(d.key)) });
    },
    [actions],
  );

  return useCallback(
    (list: Alert | Alert[], title?: string) => {
      const items = Array.isArray(list) ? list : [list];
      if (!items.length) return;
      items.forEach((a) => actions.dismissAlert(a.key));
      toast({
        title: title ?? 'Alert dismissed',
        description: items.length === 1 ? items[0].title : 'Restore them any time in Settings.',
        tone: 'info',
        action: { label: 'Undo', onClick: () => undismiss(items.map((a) => a.key)) },
      });
    },
    [actions, toast, undismiss],
  );
}
