import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from '@/context/AuthContext';
import { ThemeProvider } from '@/context/ThemeContext';
import { ProtectedRoute, AdminRoute } from '@/components/ProtectedRoute';
import { Navbar } from '@/components/Navbar';
import { Footer } from '@/components/Footer';
import { FullPageSpinner } from '@/components/ui/Feedback';
import { LandingPage } from '@/pages/LandingPage';
import { NotFoundPage } from '@/pages/NotFoundPage';

const LoginPage = lazy(() => import('@/pages/auth/LoginPage').then(m => ({ default: m.LoginPage })));
const RegisterPage = lazy(() => import('@/pages/auth/RegisterPage').then(m => ({ default: m.RegisterPage })));
const ForgotPasswordPage = lazy(() => import('@/pages/auth/ForgotPasswordPage').then(m => ({ default: m.ForgotPasswordPage })));
const ResetPasswordPage = lazy(() => import('@/pages/auth/ResetPasswordPage').then(m => ({ default: m.ResetPasswordPage })));

const DashboardLayout = lazy(() => import('@/components/DashboardLayout').then(m => ({ default: m.DashboardLayout })));
const DashboardPage = lazy(() => import('@/pages/dashboard/DashboardPage').then(m => ({ default: m.DashboardPage })));
const TasksPage = lazy(() => import('@/pages/dashboard/TasksPage').then(m => ({ default: m.TasksPage })));
const MySubmissionsPage = lazy(() => import('@/pages/dashboard/MySubmissionsPage').then(m => ({ default: m.MySubmissionsPage })));
const TaskDetailPage = lazy(() => import('@/pages/dashboard/TaskDetailPage').then(m => ({ default: m.TaskDetailPage })));
const WalletPage = lazy(() => import('@/pages/dashboard/WalletPage').then(m => ({ default: m.WalletPage })));
const ReferralsPage = lazy(() => import('@/pages/dashboard/ReferralsPage').then(m => ({ default: m.ReferralsPage })));
const WithdrawPage = lazy(() => import('@/pages/dashboard/WithdrawPage').then(m => ({ default: m.WithdrawPage })));
const ProfilePage = lazy(() => import('@/pages/dashboard/ProfilePage').then(m => ({ default: m.ProfilePage })));
const NotificationsPage = lazy(() => import('@/pages/dashboard/NotificationsPage').then(m => ({ default: m.NotificationsPage })));

const AdminLayout = lazy(() => import('@/components/AdminLayout').then(m => ({ default: m.AdminLayout })));
const AdminDashboardPage = lazy(() => import('@/pages/admin/AdminDashboardPage').then(m => ({ default: m.AdminDashboardPage })));
const AdminUsersPage = lazy(() => import('@/pages/admin/AdminUsersPage').then(m => ({ default: m.AdminUsersPage })));
const AdminTasksPage = lazy(() => import('@/pages/admin/AdminTasksPage').then(m => ({ default: m.AdminTasksPage })));
const AdminSubmissionsPage = lazy(() => import('@/pages/admin/AdminSubmissionsPage').then(m => ({ default: m.AdminSubmissionsPage })));
const AdminWithdrawalsPage = lazy(() => import('@/pages/admin/AdminWithdrawalsPage').then(m => ({ default: m.AdminWithdrawalsPage })));
const AdminReferralsPage = lazy(() => import('@/pages/admin/AdminReferralsPage').then(m => ({ default: m.AdminReferralsPage })));
const AdminTransactionsPage = lazy(() => import('@/pages/admin/AdminTransactionsPage').then(m => ({ default: m.AdminTransactionsPage })));
const AdminSettingsPage = lazy(() => import('@/pages/admin/AdminSettingsPage').then(m => ({ default: m.AdminSettingsPage })));
const AdminAuditLogsPage = lazy(() => import('@/pages/admin/AdminAuditLogsPage').then(m => ({ default: m.AdminAuditLogsPage })));
const AdminFraudPage = lazy(() => import('@/pages/admin/AdminFraudPage').then(m => ({ default: m.AdminFraudPage })));

const TermsPage = lazy(() => import('@/pages/legal/LegalPages').then(m => ({ default: m.TermsPage })));
const PrivacyPage = lazy(() => import('@/pages/legal/LegalPages').then(m => ({ default: m.PrivacyPage })));
const ResponsibleEarningPage = lazy(() => import('@/pages/legal/LegalPages').then(m => ({ default: m.ResponsibleEarningPage })));
const ContactPage = lazy(() => import('@/pages/legal/LegalPages').then(m => ({ default: m.ContactPage })));
const SupportPage = lazy(() => import('@/pages/legal/LegalPages').then(m => ({ default: m.SupportPage })));
const AboutPage = lazy(() => import('@/pages/legal/LegalPages').then(m => ({ default: m.AboutPage })));

function LandingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <Suspense fallback={<FullPageSpinner message="Loading..." />}>
            <Routes>
              {/* Public landing */}
              <Route path="/" element={<LandingLayout><LandingPage /></LandingLayout>} />

              {/* Legal pages */}
              <Route path="/about" element={<AboutPage />} />
              <Route path="/terms" element={<TermsPage />} />
              <Route path="/privacy" element={<PrivacyPage />} />
              <Route path="/responsible-earning" element={<ResponsibleEarningPage />} />
              <Route path="/contact" element={<ContactPage />} />
              <Route path="/support" element={<SupportPage />} />

              {/* Auth */}
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
              <Route path="/forgot-password" element={<ForgotPasswordPage />} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />

              {/* User dashboard (protected) */}
              <Route path="/dashboard" element={<ProtectedRoute><DashboardLayout /></ProtectedRoute>}>
                <Route index element={<DashboardPage />} />
                <Route path="tasks" element={<TasksPage />} />
                <Route path="submissions" element={<MySubmissionsPage />} />
                <Route path="tasks/:id" element={<TaskDetailPage />} />
                <Route path="wallet" element={<WalletPage />} />
                <Route path="referrals" element={<ReferralsPage />} />
                <Route path="withdraw" element={<WithdrawPage />} />
                <Route path="profile" element={<ProfilePage />} />
                <Route path="notifications" element={<NotificationsPage />} />
              </Route>

              {/* Admin panel (protected + admin) */}
              <Route path="/admin" element={<AdminRoute><AdminLayout /></AdminRoute>}>
                <Route index element={<AdminDashboardPage />} />
                <Route path="users" element={<AdminUsersPage />} />
                <Route path="tasks" element={<AdminTasksPage />} />
                <Route path="submissions" element={<AdminSubmissionsPage />} />
                <Route path="withdrawals" element={<AdminWithdrawalsPage />} />
                <Route path="referrals" element={<AdminReferralsPage />} />
                <Route path="transactions" element={<AdminTransactionsPage />} />
                <Route path="settings" element={<AdminSettingsPage />} />
                <Route path="audit-logs" element={<AdminAuditLogsPage />} />
                <Route path="fraud" element={<AdminFraudPage />} />
              </Route>

              {/* Fallback */}
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}
