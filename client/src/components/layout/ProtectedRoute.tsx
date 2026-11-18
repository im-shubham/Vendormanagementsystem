import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { PageLoader } from '../ui/Feedback';
import type { Role } from '@/types';

/** UI guard only — every API route is independently protected on the server and in the DB. */
export function ProtectedRoute({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <PageLoader />;
  const staffArea = !roles.includes('VENDOR');
  if (!user) return <Navigate to={staffArea ? '/admin/login' : '/login'} replace state={{ from: location.pathname }} />;
  if (!roles.includes(user.role)) return <Navigate to={user.role === 'VENDOR' ? '/vendor' : '/admin'} replace />;
  if (user.role === 'VENDOR' && user.vendor?.status !== 'ACTIVE') return <Navigate to="/account-status" replace state={{ code: user.vendor?.status }} />;
  return <>{children}</>;
}

/** Hides a page from staff roles that may not use it (UI only — functions/rules enforce). */
export function RoleGate({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { user } = useAuth();
  if (!user || !roles.includes(user.role)) return <Navigate to="/admin" replace />;
  return <>{children}</>;
}
