import { useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { AuthLayout } from '@/layouts/AuthLayout';
import { Button } from '@/components/ui/Button';
import { PasswordField } from '@/components/ui/Field';
import { Alert } from '@/components/ui/Feedback';
import { authService } from '@/services/authService';
import { ApiError } from '@/services/apiClient';
import { PasswordRules, passwordValid } from './PasswordRules';

/** Reset links carry the token in the URL fragment: #access_token=...&type=recovery */
export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const params = useMemo(() => new URLSearchParams(window.location.hash.replace(/^#/, '')), []);
  const token = params.get('access_token') ?? '';
  const linkError = params.get('error_description');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({});
  const [error, setError] = useState<string | null>(linkError ?? (token ? null : 'This reset link is invalid or incomplete. Please request a new one.'));
  const [loading, setLoading] = useState(false);

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
      const r = await authService.resetPassword(token, password, confirm);
      window.history.replaceState(null, '', window.location.pathname);
      navigate('/login', { replace: true, state: { message: r.message } });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Reset failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout>
      <div className="mt-6 text-center">
        <h1 className="text-2xl font-extrabold text-navy-900 sm:text-3xl">Set a New Password</h1>
        <p className="mt-1.5 text-slate-500">Choose a strong password for your account</p>
      </div>
      <form onSubmit={submit} noValidate className="mt-7 space-y-4">
        {error && <Alert kind="error">{error}</Alert>}
        <PasswordField label="New Password" icon={<Lock className="h-5 w-5" />} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} error={errors.password} disabled={!token} />
        <PasswordRules password={password} />
        <PasswordField label="Confirm Password" icon={<Lock className="h-5 w-5" />} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} error={errors.confirm} disabled={!token} />
        <Button type="submit" size="lg" block loading={loading} disabled={!token}>
          Update Password
        </Button>
        <p className="text-center text-sm">
          <Link to="/forgot-password" className="link">
            Request a new link
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
}
