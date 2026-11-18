import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { PageLoader } from '../ui/Feedback';
import type { Role } from '@/types';

/** UI guard only — every API route is independently protected on the server and in the DB. */
export function ProtectedRoute({ role, children }: { role: Role; children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <PageLoader />;
  const loginPath = role === 'ADMIN' ? '/admin/login' : '/login';
  if (!user) return <Navigate to={loginPath} replace state={{ from: location.pathname }} />;
  if (user.role !== role) return <Navigate to={user.role === 'ADMIN' ? '/admin' : '/vendor'} replace />;
  if (role === 'VENDOR' && user.vendor?.status !== 'ACTIVE') return <Navigate to="/account-status" replace state={{ code: user.vendor?.status }} />;
  return <>{children}</>;
}
