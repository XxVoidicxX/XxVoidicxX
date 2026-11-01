import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ConfirmProvider, ToastProvider } from '@/components/ui';
import { CalendarPage } from '@/features/calendar/CalendarPage';
import { CommandPalette } from '@/features/command/CommandPalette';
import { DashboardPage } from '@/features/dashboard/DashboardPage';
import { DocumentsPage } from '@/features/documents/DocumentsPage';
import { InsightsPage } from '@/features/insights/InsightsPage';
import { NotificationsPanel } from '@/features/notifications/NotificationsPanel';
import { Welcome } from '@/features/onboarding/Welcome';
import { PurchasesPage } from '@/features/purchases/PurchasesPage';
import { SettingsPage } from '@/features/settings/SettingsPage';
import { SubscriptionsPage } from '@/features/subscriptions/SubscriptionsPage';
import { TasksPage } from '@/features/tasks/TasksPage';
import { ROUTES } from '@/lib/routes';
import { StoreProvider, useData } from '@/store/store';
import { GlobalEditors } from './GlobalEditors';
import { Shell } from './Shell';
import { UIProvider } from './ui';

function Gate() {
  const { settings } = useData();
  if (!settings.onboarded) return <Welcome />;
  return (
    <Shell>
      <Routes>
        <Route path={ROUTES.dashboard} element={<DashboardPage />} />
        <Route path={ROUTES.subscriptions} element={<SubscriptionsPage />} />
        <Route path={ROUTES.documents} element={<DocumentsPage />} />
        <Route path={ROUTES.purchases} element={<PurchasesPage />} />
        <Route path={ROUTES.calendar} element={<CalendarPage />} />
        <Route path={ROUTES.insights} element={<InsightsPage />} />
        <Route path={ROUTES.tasks} element={<TasksPage />} />
        <Route path={ROUTES.settings} element={<SettingsPage />} />
        <Route path="*" element={<Navigate to={ROUTES.dashboard} replace />} />
      </Routes>
      <GlobalEditors />
      <CommandPalette />
      <NotificationsPanel />
    </Shell>
  );
}

export function App() {
  return (
    <StoreProvider>
      <ToastProvider>
        <ConfirmProvider>
          <UIProvider>
            <HashRouter>
              <Gate />
            </HashRouter>
          </UIProvider>
        </ConfirmProvider>
      </ToastProvider>
    </StoreProvider>
  );
}
