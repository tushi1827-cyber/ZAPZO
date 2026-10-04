import { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { FullPageSpinner } from '@/components/ui/Feedback';
import { AdminPermission } from '@/types';
import { Shield, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  const location = useLocation();

  if (loading) return <FullPageSpinner message="Loading..." />;
  if (!session) return <Navigate to="/login" state={{ from: location }} replace />;

  return <>{children}</>;
}

export function AdminRoute({ children }: { children: ReactNode }) {
  const { session, isAdmin, loading } = useAuth();
  const location = useLocation();

  if (loading) return <FullPageSpinner message="Loading..." />;
  if (!session) return <Navigate to="/login" state={{ from: location }} replace />;
  if (!isAdmin) return <Navigate to="/dashboard" replace />;

  return <>{children}</>;
}

export function AdminPermissionRoute({ permission, children }: { permission: AdminPermission; children: ReactNode }) {
  const { isAdmin, hasPermission, loading } = useAuth();

  if (loading) return <FullPageSpinner message="Loading..." />;
  if (!isAdmin || !hasPermission(permission)) return <AccessDenied />;

  return <>{children}</>;
}

function AccessDenied() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <div className="grid h-16 w-16 place-items-center rounded-2xl bg-danger-500/10">
        <Shield className="h-8 w-8 text-danger-400" />
      </div>
      <h2 className="mt-4 text-xl font-bold text-white">Access Denied</h2>
      <p className="mt-2 max-w-sm text-sm text-ink-400">
        You don't have permission to access this page. Contact a super admin if you believe this is an error.
      </p>
      <Link
        to="/admin"
        className="mt-6 inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-brand-700"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Admin Dashboard
      </Link>
    </div>
  );
}
