import { useNavigate } from 'react-router-dom';
import { ArrowRight, BellOff, CircleAlert, CircleCheck, Info, TriangleAlert, X } from 'lucide-react';
import { useUI } from '@/app/ui';
import { Button, Drawer, EmptyState, cx, useToast } from '@/components/ui';
import { formatDate, relativeDays } from '@/lib/dates';
import type { Alert } from '@/lib/engine';
import { ROUTES, refPath } from '@/lib/routes';
import type { Severity } from '@/lib/types';
import { useAlerts, useMoney } from '@/store/selectors';
import { useActions, useData, useToday } from '@/store/store';
import { attentionText, countAlerts, useDismissWithUndo } from './alertHelpers';
import { useSubscriptionActions } from '@/features/subscriptions/useSubscriptionActions';
import './notifications.css';

const GROUPS: { severity: Severity; label: string; icon: typeof Info }[] = [
  { severity: 'critical', label: 'Urgent', icon: CircleAlert },
  { severity: 'warning', label: 'Needs attention soon', icon: TriangleAlert },
  { severity: 'info', label: 'Low priority', icon: Info },
];

export function NotificationsPanel() {
  const { notificationsOpen, setNotificationsOpen } = useUI();
  const alerts = useAlerts();
  const actions = useActions();
  const toast = useToast();
  const navigate = useNavigate();
  const data = useData();
  const close = () => setNotificationsOpen(false);
  const info = alerts.filter((a) => a.severity === 'info');
  const counts = countAlerts(alerts);
  const dismiss = useDismissWithUndo();
  const cmd = useSubscriptionActions();
  const paidHandler = (a: Alert) => {
    const m = /^manual:(.+):(\d{4}-\d{2}-\d{2})$/.exec(a.key);
    const sub = m ? data.subscriptions.find((x) => x.id === m[1]) : undefined;
    return m && sub ? () => cmd.markPaid(sub, m[2], true) : undefined;
  };

  const open = (a: Alert) => {
    close();
    navigate(refPath(a.ref));
  };

  const dismissAllInfo = () => {
    dismiss(info, `Cleared ${info.length} low-priority alert${info.length === 1 ? '' : 's'}`);
  };

  return (
    <Drawer
      open={notificationsOpen}
      onClose={close}
      width={440}
      title="Notifications"
      subtitle={alerts.length ? attentionText(counts, true) : 'Nothing needs you right now'}
      footer={
        alerts.length > 0 || data.dismissedAlerts.length > 0 ? (
          <div className="notif-foot">
            {data.dismissedAlerts.length > 0 ? (
              <button
                type="button"
                className="notif-linkbtn"
                onClick={() => {
                  close();
                  navigate(ROUTES.settings);
                }}
              >
                {data.dismissedAlerts.length} dismissed · manage
              </button>
            ) : (
              <span />
            )}
            {info.length > 0 && (
              <Button size="sm" variant="secondary" onClick={dismissAllInfo}>
                Clear low-priority
              </Button>
            )}
          </div>
        ) : undefined
      }
    >
      {alerts.length === 0 ? (
        <EmptyState
          icon={<BellOff size={22} />}
          title="You're all caught up"
          description="Keel will let you know here when a bill is due, a trial is ending, an ID needs renewing or a return window is closing."
          action={
            data.dismissedAlerts.length > 0 ? (
              <Button
                variant="secondary"
                onClick={() => {
                  actions.restoreAlerts();
                  toast({ title: 'Dismissed alerts restored' });
                }}
              >
                Restore {data.dismissedAlerts.length} dismissed
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="notif-groups">
          {GROUPS.map((g) => {
            const list = alerts.filter((a) => a.severity === g.severity);
            if (!list.length) return null;
            return (
              <section key={g.severity} className="notif-group" aria-labelledby={`notif-${g.severity}`}>
                <h3 id={`notif-${g.severity}`} className={cx('notif-group-title', `is-${g.severity}`)}>
                  <g.icon size={14} aria-hidden />
                  {g.label}
                  <span className="notif-count">{list.length}</span>
                </h3>
                <ul className="notif-list">
                  {list.map((a) => (
                    <AlertItem key={a.key} alert={a} onOpen={() => open(a)} onDismiss={() => dismiss(a)} onPaid={paidHandler(a)} />
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </Drawer>
  );
}

function AlertItem({ alert, onOpen, onDismiss, onPaid }: { alert: Alert; onOpen: () => void; onDismiss: () => void; onPaid?: () => void }) {
  const today = useToday();
  const money = useMoney();
  const { settings } = useData();
  return (
    <li className={cx('notif-item', `is-${alert.severity}`)}>
      <span className="notif-bar" aria-hidden />
      <div className="notif-main">
        <p className="notif-title">{alert.title}</p>
        <p className="notif-detail">{alert.detail}</p>
        <div className="notif-meta">
          {alert.date && (
            <span title={formatDate(alert.date, 'long', settings.locale)}>
              {/\b(ago|in \d|today|tomorrow)\b/i.test(alert.title + alert.detail) ? formatDate(alert.date, 'dayMonth', settings.locale) : `${relativeDays(alert.date, today)} · ${formatDate(alert.date, 'short', settings.locale)}`}
            </span>
          )}
          {alert.amount !== undefined && <span className="tabular">{money(alert.amount)}</span>}
        </div>
        <div className="notif-actions">
          <Button size="sm" variant={alert.severity === 'critical' ? 'primary' : 'secondary'} iconRight={<ArrowRight size={14} />} onClick={onOpen} className="notif-action">
            {alert.action ?? 'Open'}
          </Button>
          {onPaid && (
            <Button size="sm" variant="ghost" icon={<CircleCheck size={14} />} onClick={onPaid} className="notif-action">
              Mark paid
            </Button>
          )}
        </div>
      </div>
      <button type="button" className="notif-dismiss" onClick={onDismiss} aria-label={`Dismiss: ${alert.title}`} title="Dismiss">
        <X size={15} />
      </button>
    </li>
  );
}
