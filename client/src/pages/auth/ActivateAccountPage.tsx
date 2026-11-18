import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Hash, Hourglass, Lock, Mail } from 'lucide-react';
import { AuthLayout } from '@/layouts/AuthLayout';
import { Button } from '@/components/ui/Button';
import { PasswordField, TextField } from '@/components/ui/Field';
import { Alert } from '@/components/ui/Feedback';
import { authService } from '@/services/authService';
import { AppError } from '@/lib/errors';
import { PasswordRules, passwordValid } from './PasswordRules';

type Form = { email: string; vendorCode: string; password: string; confirmPassword: string };

export default function ActivateAccountPage() {
  const [form, setForm] = useState<Form>({ email: '', vendorCode: '', password: '', confirmPassword: '' });
  const [errors, setErrors] = useState<Partial<Record<keyof Form, string>>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const set = (k: keyof Form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const errs: typeof errors = {};
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email.trim())) errs.email = 'Enter your registered email address';
    if (!/^[A-Za-z0-9_-]{2,30}$/.test(form.vendorCode.trim())) errs.vendorCode = 'Enter the vendor code provided by RCPL';
    if (!passwordValid(form.password)) errs.password = 'Password does not meet the requirements below';
    if (form.password !== form.confirmPassword) errs.confirmPassword = 'Passwords do not match';
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setLoading(true);
    setError(null);
    try {
      await authService.activate({ ...form, email: form.email.trim(), vendorCode: form.vendorCode.trim() });
      setDone(true);
    } catch (err) {
      if (err instanceof AppError) {
        setError(err.message);
        setErrors(err.fields as typeof errors);
      } else setError('Activation failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <AuthLayout>
        <div className="mt-8 text-center">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-amber-50 ring-8 ring-amber-50/50">
            <Hourglass className="h-8 w-8 text-amber-500" />
          </div>
          <h1 className="mt-5 text-2xl font-extrabold text-navy-900">Password created</h1>
          <p className="mx-auto mt-2 max-w-sm text-slate-600">
            Your account has been created and sent to RCPL for verification. <b>Your account is awaiting administrator approval.</b>
          </p>
          <p className="mx-auto mt-2 max-w-sm text-sm text-slate-500">You will be able to log in once an administrator approves your registration.</p>
          <Link to="/login" className="mt-8 inline-flex h-12 items-center gap-2 rounded-xl bg-royal-800 px-6 font-semibold text-white hover:bg-royal-700">
            <ArrowLeft className="h-4 w-4" /> Back to login
          </Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <div className="mt-6 text-center">
        <h1 className="text-2xl font-extrabold text-navy-900 sm:text-3xl">First-Time Login</h1>
        <p className="mt-1.5 text-slate-500">Create your password using the details registered with RCPL</p>
      </div>
      <form onSubmit={submit} noValidate className="mt-7 space-y-4">
        {error && <Alert kind="error">{error}</Alert>}
        <TextField label="Registered Email" required type="email" placeholder="name@company.com" icon={<Mail className="h-5 w-5" />} autoComplete="email" value={form.email} onChange={set('email')} error={errors.email} />
        <TextField label="Vendor Code" required placeholder="e.g. V1001" icon={<Hash className="h-5 w-5" />} value={form.vendorCode} onChange={set('vendorCode')} error={errors.vendorCode} hint="Provided by RCPL when your vendor record was created." />
        <PasswordField label="New Password" required placeholder="Create a strong password" icon={<Lock className="h-5 w-5" />} autoComplete="new-password" value={form.password} onChange={set('password')} error={errors.password} />
        <PasswordRules password={form.password} />
        <PasswordField label="Confirm Password" required placeholder="Re-enter your password" icon={<Lock className="h-5 w-5" />} autoComplete="new-password" value={form.confirmPassword} onChange={set('confirmPassword')} error={errors.confirmPassword} />
        <Button type="submit" size="lg" block loading={loading} className="!mt-6">
          Create Password
        </Button>
        <p className="text-center text-sm text-slate-500">
          Already activated?{' '}
          <Link to="/login" className="link">
            Back to login
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
}
