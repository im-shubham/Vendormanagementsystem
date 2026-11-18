import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Mail, MailCheck } from 'lucide-react';
import { AuthLayout } from '@/layouts/AuthLayout';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/Field';
import { Alert } from '@/components/ui/Feedback';
import { authService } from '@/services/authService';
import { ApiError } from '@/services/apiClient';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [fieldError, setFieldError] = useState<string>();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) return setFieldError('Enter your registered email address');
    setFieldError(undefined);
    setLoading(true);
    setError(null);
    try {
      setMessage((await authService.forgotPassword(email.trim())).message);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Request failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout>
      <div className="mt-6 text-center">
        <h1 className="text-2xl font-extrabold text-navy-900 sm:text-3xl">Forgot Password</h1>
        <p className="mt-1.5 text-slate-500">We'll email you a secure link to reset your password</p>
      </div>
      {message ? (
        <div className="mt-8 text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-emerald-50">
            <MailCheck className="h-7 w-7 text-emerald-600" />
          </div>
          <p className="mx-auto mt-4 max-w-sm text-slate-600">{message}</p>
        </div>
      ) : (
        <form onSubmit={submit} noValidate className="mt-7 space-y-5">
          {error && <Alert kind="error">{error}</Alert>}
          <TextField label="Registered Email" type="email" placeholder="name@company.com" icon={<Mail className="h-5 w-5" />} value={email} onChange={(e) => setEmail(e.target.value)} error={fieldError} autoFocus />
          <Button type="submit" size="lg" block loading={loading}>
            Send Reset Link
          </Button>
        </form>
      )}
      <p className="mt-8 text-center">
        <Link to="/login" className="link inline-flex items-center gap-1.5 text-sm">
          <ArrowLeft className="h-4 w-4" /> Back to login
        </Link>
      </p>
    </AuthLayout>
  );
}
