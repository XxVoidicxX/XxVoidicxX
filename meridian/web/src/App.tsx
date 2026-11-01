import { Suspense, lazy, type ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "@/lib/auth";
import { ToastProvider } from "@/components/ui/toast";
import { AppShell } from "@/components/layout/AppShell";
import { LoginPage } from "@/pages/LoginPage";
import { NotFoundPage } from "@/pages/NotFoundPage";
import { PageLoader } from "@/components/ui";

const DashboardPage = lazy(() => import("@/pages/DashboardPage"));
const VendorsPage = lazy(() => import("@/pages/vendors/VendorsPage"));
const VendorDetailPage = lazy(() => import("@/pages/vendors/VendorDetailPage"));
const VendorNewPage = lazy(() => import("@/pages/vendors/VendorNewPage"));
const ContractsPage = lazy(() => import("@/pages/contracts/ContractsPage"));
const ContractDetailPage = lazy(() => import("@/pages/contracts/ContractDetailPage"));
const AssessmentsPage = lazy(() => import("@/pages/assessments/AssessmentsPage"));
const AssessmentDetailPage = lazy(() => import("@/pages/assessments/AssessmentDetailPage"));
const DocumentsPage = lazy(() => import("@/pages/documents/DocumentsPage"));
const FindingsPage = lazy(() => import("@/pages/findings/FindingsPage"));
const FindingDetailPage = lazy(() => import("@/pages/findings/FindingDetailPage"));
const ApprovalsPage = lazy(() => import("@/pages/approvals/ApprovalsPage"));
const ApprovalDetailPage = lazy(() => import("@/pages/approvals/ApprovalDetailPage"));
const ReportsPage = lazy(() => import("@/pages/ReportsPage"));
const AuditLogPage = lazy(() => import("@/pages/AuditLogPage"));
const SettingsPage = lazy(() => import("@/pages/settings/SettingsPage"));

const qc = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 15_000 } } });

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <div className="min-h-full flex items-center justify-center"><PageLoader /></div>;
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname + loc.search }} />;
  return <>{children}</>;
}

export default function App() {
  return (
    <QueryClientProvider client={qc}>
      <AuthProvider>
        <ToastProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route element={<RequireAuth><AppShell /></RequireAuth>}>
                <Route index element={<Suspense fallback={<PageLoader />}><DashboardPage /></Suspense>} />
                <Route path="vendors" element={<Suspense fallback={<PageLoader />}><VendorsPage /></Suspense>} />
                <Route path="vendors/new" element={<Suspense fallback={<PageLoader />}><VendorNewPage /></Suspense>} />
                <Route path="vendors/:id" element={<Suspense fallback={<PageLoader />}><VendorDetailPage /></Suspense>} />
                <Route path="contracts" element={<Suspense fallback={<PageLoader />}><ContractsPage /></Suspense>} />
                <Route path="contracts/:id" element={<Suspense fallback={<PageLoader />}><ContractDetailPage /></Suspense>} />
                <Route path="assessments" element={<Suspense fallback={<PageLoader />}><AssessmentsPage /></Suspense>} />
                <Route path="assessments/:id" element={<Suspense fallback={<PageLoader />}><AssessmentDetailPage /></Suspense>} />
                <Route path="documents" element={<Suspense fallback={<PageLoader />}><DocumentsPage /></Suspense>} />
                <Route path="findings" element={<Suspense fallback={<PageLoader />}><FindingsPage /></Suspense>} />
                <Route path="findings/:id" element={<Suspense fallback={<PageLoader />}><FindingDetailPage /></Suspense>} />
                <Route path="approvals" element={<Suspense fallback={<PageLoader />}><ApprovalsPage /></Suspense>} />
                <Route path="approvals/:id" element={<Suspense fallback={<PageLoader />}><ApprovalDetailPage /></Suspense>} />
                <Route path="reports" element={<Suspense fallback={<PageLoader />}><ReportsPage /></Suspense>} />
                <Route path="audit-log" element={<Suspense fallback={<PageLoader />}><AuditLogPage /></Suspense>} />
                <Route path="settings" element={<Suspense fallback={<PageLoader />}><SettingsPage /></Suspense>} />
                <Route path="*" element={<NotFoundPage />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </ToastProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
