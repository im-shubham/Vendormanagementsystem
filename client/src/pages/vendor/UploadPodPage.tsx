import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CheckCircle2, FileCheck2, Send } from 'lucide-react';
import { vendorService } from '@/services/vendorService';
import { ApiError } from '@/services/apiClient';
import { useToast } from '@/context/ToastContext';
import { notifyNotificationsChanged } from '@/hooks/useNotifications';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/Field';
import { Alert } from '@/components/ui/Feedback';
import { PageHeader } from '@/components/ui/Card';
import { FileDropzone } from '@/components/pod/FileDropzone';
import { GuidelinesCard } from '@/components/dashboard/GuidelinesCard';
import { ACCEPTED_PHOTO_TYPES, ACCEPTED_POD_TYPES } from '@/utils/constants';
import { todayIso } from '@/utils/format';
import type { Submission } from '@/types';

type Fields = { poNumber: string; invoiceNumber: string; deliveryDate: string; deliveryReference: string };
type Errors = Partial<Record<keyof Fields | 'podDocument', string>>;

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="card p-5 sm:p-6">
      <h2 className="mb-5 flex items-center gap-3 text-lg font-bold text-navy-900">
        <span className="grid h-8 w-8 place-items-center rounded-full bg-royal-800 text-sm font-bold text-white">{n}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

export default function UploadPodPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const [fields, setFields] = useState<Fields>({ poNumber: '', invoiceNumber: '', deliveryDate: '', deliveryReference: '' });
  const [pod, setPod] = useState<File | null>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<Submission | null>(null);

  const set = (k: keyof Fields) => (e: { target: { value: string } }) => setFields((f) => ({ ...f, [k]: e.target.value }));

  const validate = (): Errors => {
    const e: Errors = {};
    if (!fields.poNumber.trim()) e.poNumber = 'PO Number is required';
    if (!fields.invoiceNumber.trim()) e.invoiceNumber = 'Invoice Number is required';
    if (!fields.deliveryDate) e.deliveryDate = 'Delivery date is required';
    else if (fields.deliveryDate > todayIso()) e.deliveryDate = 'Delivery date cannot be in the future';
    if (!pod) e.podDocument = 'Please attach the POD document';
    return e;
  };

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    const errs = validate();
    setErrors(errs);
    if (Object.keys(errs).length) {
      setError('Please complete the highlighted fields.');
      return;
    }
    setSubmitting(true);
    setError(null);
    const form = new FormData();
    form.append('poNumber', fields.poNumber.trim());
    form.append('invoiceNumber', fields.invoiceNumber.trim());
    form.append('deliveryDate', fields.deliveryDate);
    if (fields.deliveryReference.trim()) form.append('deliveryReference', fields.deliveryReference.trim());
    form.append('podDocument', pod!);
    if (photo) form.append('supportingPhoto', photo);
    try {
      const r = await vendorService.createSubmission(form);
      setResult(r.submission);
      toast(r.message);
      notifyNotificationsChanged();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        setErrors(err.fields as Errors);
      } else setError('Upload failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const reset = () => {
    setFields({ poNumber: '', invoiceNumber: '', deliveryDate: '', deliveryReference: '' });
    setPod(null);
    setPhoto(null);
    setErrors({});
    setResult(null);
  };

  if (result) {
    return (
      <div className="mx-auto max-w-2xl">
        <div className="card animate-fade-in px-6 py-10 text-center sm:px-10">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-50 ring-8 ring-emerald-50/50">
            <CheckCircle2 className="h-9 w-9 text-emerald-600" />
          </div>
          <h1 className="mt-5 text-2xl font-extrabold text-navy-900">POD submitted successfully</h1>
          <p className="mt-2 text-slate-600">Your document has been received and is now under review by RCPL.</p>
          <div className="mx-auto mt-6 grid max-w-md grid-cols-2 gap-4 rounded-2xl bg-slate-50 p-5 text-left">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Submission ID</p>
              <p className="text-lg font-bold text-royal-800">{result.submissionNumber}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Status</p>
              <p className="text-lg font-bold text-amber-600">Under Review</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">PO Number</p>
              <p className="font-semibold text-slate-800">{result.poNumber}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Invoice</p>
              <p className="font-semibold text-slate-800">{result.invoiceNumber}</p>
            </div>
          </div>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Button onClick={() => navigate(`/vendor/submissions/${result.id}`)} variant="secondary">
              View Submission
            </Button>
            <Button onClick={reset} icon={<FileCheck2 className="h-4 w-4" />}>
              Upload Another POD
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Upload POD" subtitle="Submit the Proof of Delivery for a completed dispatch. Fields marked * are mandatory." />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <form onSubmit={submit} noValidate className="space-y-6">
          {error && <Alert kind="error">{error}</Alert>}
          <Step n={1} title="Delivery details">
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField label="PO Number" required placeholder="e.g. PO-25678" value={fields.poNumber} onChange={set('poNumber')} error={errors.poNumber} maxLength={50} />
              <TextField label="Invoice Number" required placeholder="e.g. INV-78452" value={fields.invoiceNumber} onChange={set('invoiceNumber')} error={errors.invoiceNumber} maxLength={50} />
              <TextField label="Delivery Date" required type="date" max={todayIso()} value={fields.deliveryDate} onChange={set('deliveryDate')} error={errors.deliveryDate} />
              <TextField label="Dispatch / Delivery Reference" optional placeholder="LR / e-way bill / vehicle no." value={fields.deliveryReference} onChange={set('deliveryReference')} error={errors.deliveryReference} maxLength={100} />
            </div>
          </Step>
          <Step n={2} title="Documents">
            <div className="space-y-6">
              <FileDropzone
                label="POD Document"
                required
                file={pod}
                onChange={(f) => {
                  setPod(f);
                  setErrors((e) => ({ ...e, podDocument: undefined }));
                }}
                accept={ACCEPTED_POD_TYPES}
                error={errors.podDocument}
                hint="Scanned POD with receiving stamp/seal and signature. All pages in one PDF if possible."
              />
              <FileDropzone label="Additional Supporting Photograph" file={photo} onChange={setPhoto} accept={ACCEPTED_PHOTO_TYPES} hint="e.g. photo of unloaded goods or the stamped POD." />
            </div>
          </Step>
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Link to="/vendor" className="inline-flex h-12 items-center justify-center rounded-xl px-5 font-semibold text-slate-600 hover:bg-slate-100">
              Cancel
            </Link>
            <Button type="submit" size="lg" loading={submitting} icon={<Send className="h-5 w-5" />}>
              {submitting ? 'Submitting…' : 'Submit POD'}
            </Button>
          </div>
        </form>
        <aside className="space-y-6 xl:sticky xl:top-28 xl:self-start">
          <GuidelinesCard compact />
        </aside>
      </div>
    </div>
  );
}
