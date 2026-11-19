import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, KeyRound, Lock, Mail } from 'lucide-react';
import { AuthLayout } from '@/layouts/AuthLayout';
import { Button } from '@/components/ui/Button';
import { PasswordField, TextField } from '@/components/ui/Field';
import { Alert } from '@/components/ui/Feedback';
import { useAuth } from '@/context/AuthContext';
import { AppError } from '@/lib/errors';

export function LoginForm({ portal }: { portal: 'vendor' | 'admin' }) {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ identifier?: string; password?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const notice = (location.state as { notice?: string } | null)?.notice;
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const errs: typeof errors = {};
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(identifier.trim())) errs.identifier = 'Enter your registered email address';
    if (!password) errs.password = 'Password is required';
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setLoading(true);
    setError(null);
    try {
      const user = await login(identifier.trim(), password, portal);
      const from = (location.state as { from?: string } | null)?.from;
      const home = user.role === 'ADMIN' ? '/admin' : '/vendor';
      navigate(from && from.startsWith(home) ? from : home, { replace: true });
    } catch (err) {
      if (err instanceof AppError && err.code?.startsWith('ACCOUNT_')) {
        navigate('/account-status', { state: { code: err.code, message: err.message, ...(err.details ?? {}) } });
        return;
      }
      setError(err instanceof AppError ? err.message : 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className="mt-8 space-y-5">
      {notice && !error && <Alert kind="success">{notice}</Alert>}
      {error && <Alert kind="error">{error}</Alert>}
      <TextField
        label={portal === 'admin' ? 'Email' : 'Registered Email'}
        type="email"
        placeholder={portal === 'admin' ? 'Enter your RCPL email' : 'Enter your registered email'}
        icon={<Mail className="h-5 w-5" />}
        autoComplete="username"
        value={identifier}
        onChange={(e) => setIdentifier(e.target.value)}
        error={errors.identifier}
        autoFocus
      />
      <div>
        <PasswordField
          label="Password"
          placeholder="Enter your password"
          icon={<Lock className="h-5 w-5" />}
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={errors.password}
        />
        <div className="mt-2.5 text-right">
          <Link to="/forgot-password" className="link text-sm">
            Forgot Password?
          </Link>
        </div>
      </div>
      <Button type="submit" size="lg" block loading={loading} iconRight={<ArrowRight className="h-5 w-5" />}>
        Login
      </Button>
      {portal === 'vendor' && (
        <>
          <div className="flex items-center gap-3 pt-1 text-xs font-semibold uppercase tracking-wider text-slate-400">
            <span className="h-px flex-1 bg-slate-200" /> New to the portal? <span className="h-px flex-1 bg-slate-200" />
          </div>
          <Link
            to="/activate"
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border-2 border-royal-200 bg-royal-50/60 text-[15px] font-semibold text-royal-800 transition hover:border-royal-300 hover:bg-royal-50"
          >
            <KeyRound className="h-5 w-5" /> New vendor? Get your password setup email
          </Link>
        </>
      )}
    </form>
  );
}

export default function VendorLoginPage() {
  const { user, loading } = useAuth();
  if (!loading && user) return <Navigate to={user.role === 'ADMIN' ? '/admin' : '/vendor'} replace />;
  return (
    <AuthLayout>
      <div className="mt-6 text-center">
        <h1 className="text-3xl font-extrabold text-navy-900 sm:text-[34px]">Vendor Login</h1>
        <p className="mt-1.5 text-slate-500">Access the Vendor POD Portal</p>
      </div>
      <LoginForm portal="vendor" />
      <p className="mt-8 text-center text-sm text-slate-500">
        RCPL staff?{' '}
        <Link to="/admin/login" className="link">
          Staff login
        </Link>
      </p>
    </AuthLayout>
  );
}
