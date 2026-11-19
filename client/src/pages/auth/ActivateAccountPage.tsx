import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Hash, Mail, MailCheck } from 'lucide-react';
import { AuthLayout } from '@/layouts/AuthLayout';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/Field';
import { Alert } from '@/components/ui/Feedback';
import { authService } from '@/services/authService';
import { AppError } from '@/lib/errors';
import { SUPPORT_EMAIL } from '@/utils/constants';

/**
 * New vendors receive a "set your password" email when RCPL adds them.
 * This page only re-sends that email (registered email + vendor code must
 * match). Passwords are set exclusively from the email link.
 */
export default function ActivateAccountPage() {
  const [email, setEmail] = useState('');
  const [vendorCode, setVendorCode] = useState('');
  const [errors, setErrors] = useState<{ email?: string; vendorCode?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const errs: typeof errors = {};
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) errs.email = 'Enter your registered email address';
    if (!/^[A-Za-z0-9_-]{2,30}$/.test(vendorCode.trim())) errs.vendorCode = 'Enter the vendor code provided by RCPL';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setLoading(true);
    setError(null);
    try {
      const r = await authService.requestSetupEmail(email.trim().toLowerCase(), vendorCode.trim().toUpperCase());
      setSentTo(r.email);
    } catch (err) {
      setError(err instanceof AppError ? err.message : 'Could not send the email. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (sentTo) {
    return (
      <AuthLayout>
        <div className="mt-8 text-center">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-50 ring-8 ring-emerald-50/50">
            <MailCheck className="h-8 w-8 text-emerald-600" />
          </div>
          <h1 className="mt-5 text-2xl font-extrabold text-navy-900">Check your email</h1>
          <p className="mx-auto mt-2 max-w-sm text-slate-600">
            We sent a <b>“Set your password”</b> link to <b>{sentTo}</b>.
          </p>
          <ol className="mx-auto mt-5 max-w-sm space-y-2 text-left text-sm text-slate-600">
            <li>1. Open the email (check Spam/Junk too) and click the link.</li>
            <li>2. Choose your password.</li>
            <li>3. Log in with your email and that password — your account then goes to RCPL for approval.</li>
          </ol>
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
        <h1 className="text-2xl font-extrabold text-navy-900 sm:text-3xl">New Vendor Account</h1>
        <p className="mx-auto mt-1.5 max-w-md text-slate-500">
          When RCPL adds you as a vendor, you receive a <b>“Set your password”</b> email. Didn’t get it? Enter your details and we’ll send it again.
        </p>
      </div>
      <form onSubmit={submit} noValidate className="mt-7 space-y-4">
        {error && <Alert kind="error">{error}</Alert>}
        <TextField label="Registered Email" required type="email" placeholder="name@company.com" icon={<Mail className="h-5 w-5" />} autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} error={errors.email} />
        <TextField label="Vendor Code" required placeholder="e.g. V1001" icon={<Hash className="h-5 w-5" />} value={vendorCode} onChange={(e) => setVendorCode(e.target.value)} error={errors.vendorCode} hint="Provided by RCPL when your vendor record was created." />
        <Button type="submit" size="lg" block loading={loading} className="!mt-6">
          Send Password Setup Email
        </Button>
        <p className="text-center text-sm text-slate-500">
          Already set your password?{' '}
          <Link to="/login" className="link">
            Log in
          </Link>
        </p>
        <p className="text-center text-xs text-slate-400">
          Still no email? Ask your RCPL contact for a password setup link, or write to <a className="link font-medium" href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
        </p>
      </form>
    </AuthLayout>
  );
}
