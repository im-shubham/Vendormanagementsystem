import { Link, Navigate } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { AuthLayout } from '@/layouts/AuthLayout';
import { useAuth } from '@/context/AuthContext';
import { LoginForm } from './VendorLoginPage';

export default function AdminLoginPage() {
  const { user, loading } = useAuth();
  if (!loading && user) return <Navigate to={user.role === 'ADMIN' ? '/admin' : '/vendor'} replace />;
  return (
    <AuthLayout variant="admin">
      <div className="mt-6 text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-navy-50 px-3 py-1 text-xs font-bold uppercase tracking-wider text-navy-700">
          <ShieldCheck className="h-3.5 w-3.5" /> RCPL Internal
        </span>
        <h1 className="mt-3 text-3xl font-extrabold text-navy-900 sm:text-[34px]">Admin Login</h1>
        <p className="mt-1.5 text-slate-500">Access the POD Management Admin Portal</p>
      </div>
      <LoginForm portal="admin" />
      <p className="mt-8 text-center text-sm text-slate-500">
        Are you a vendor?{' '}
        <Link to="/login" className="link">
          Vendor login
        </Link>
      </p>
    </AuthLayout>
  );
}
