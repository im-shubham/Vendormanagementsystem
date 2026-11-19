import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { AuthLayout } from '@/layouts/AuthLayout';
import { Button } from '@/components/ui/Button';
import { PasswordField } from '@/components/ui/Field';
import { Alert, Spinner } from '@/components/ui/Feedback';
import { authService } from '@/services/authService';
import { AppError } from '@/lib/errors';
import { PasswordRules, passwordValid } from './PasswordRules';

/**
 * Custom Firebase Auth action handler for password resets.
 * Configure in Firebase Console → Authentication → Templates → Password reset
 * → "Customize action URL" = https://<your-domain>/reset-password
 * (Firebase appends ?mode=resetPassword&oobCode=...).
 */
export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const oobCode = params.get('oobCode') ?? '';
  const [email, setEmail] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!oobCode || (params.get('mode') && params.get('mode') !== 'resetPassword')) {
      setError('This reset link is invalid or incomplete. Please request a new one.');
      setChecking(false);
      return;
    }
    authService
      .verifyResetCode(oobCode)
      .then(setEmail)
      .catch((e) => setError(e instanceof AppError ? e.message : 'This reset link is invalid.'))
      .finally(() => setChecking(false));
  }, [oobCode, params]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const errs: typeof errors = {};
    if (!passwordValid(password)) errs.password = 'Password does not meet the requirements';
    if (password !== confirm) errs.confirm = 'Passwords do not match';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setLoading(true);
    setError(null);
    try {
      const r = await authService.resetPassword(oobCode, password);
      // Staff links continue to /admin/login, vendor links to /login.
      let next = '/login';
      try {
        const c = new URL(params.get('continueUrl') ?? '', window.location.origin);
        if (c.origin === window.location.origin && (c.pathname === '/admin/login' || c.pathname === '/login')) next = c.pathname;
      } catch {
        /* default */
      }
      navigate(next, { replace: true, state: { notice: `${r.message}${next === '/login' ? ' After logging in, your account goes to RCPL for approval.' : ''}` } });
    } catch (err) {
      setError(err instanceof AppError ? err.message : 'Reset failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const ready = !!email && !checking;
  return (
    <AuthLayout>
      <div className="mt-6 text-center">
        <h1 className="text-2xl font-extrabold text-navy-900 sm:text-3xl">Set Your Password</h1>
        <p className="mt-1.5 text-slate-500">{email ? <>for <b className="text-slate-700">{email}</b></> : 'Choose a strong password for your account'}</p>
      </div>
      {checking ? (
        <Spinner className="py-12" label="Checking reset link…" />
      ) : (
        <form onSubmit={submit} noValidate className="mt-7 space-y-4">
          {error && <Alert kind="error">{error}</Alert>}
          <PasswordField label="New Password" icon={<Lock className="h-5 w-5" />} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} error={errors.password} disabled={!ready} />
          <PasswordRules password={password} />
          <PasswordField label="Confirm Password" icon={<Lock className="h-5 w-5" />} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} error={errors.confirm} disabled={!ready} />
          <Button type="submit" size="lg" block loading={loading} disabled={!ready}>
            Update Password
          </Button>
          <p className="text-center text-sm">
            <Link to="/forgot-password" className="link">
              Request a new link
            </Link>
          </p>
        </form>
      )}
    </AuthLayout>
  );
}
