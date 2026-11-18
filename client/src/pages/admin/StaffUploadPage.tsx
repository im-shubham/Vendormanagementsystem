import { useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CheckCircle2, FileCheck2, Search, Send } from 'lucide-react';
import { useAsync } from '@/hooks/useAsync';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { adminService } from '@/services/adminService';
import { AppError } from '@/lib/errors';
import { Button } from '@/components/ui/Button';
import { Select, TextField } from '@/components/ui/Field';
import { Alert, ErrorState, PageLoader } from '@/components/ui/Feedback';
import { PageHeader } from '@/components/ui/Card';
import { FileDropzone } from '@/components/pod/FileDropzone';
import { GuidelinesCard } from '@/components/dashboard/GuidelinesCard';
import { ACCEPTED_PHOTO_TYPES, ACCEPTED_POD_TYPES, categoryLabel } from '@/utils/constants';
import { todayIso } from '@/utils/format';
import type { Category } from '@/types';

type Fields = { vendorId: string; category: string; poNumber: string; invoiceNumber: string; deliveryDate: string; deliveryReference: string };
type Errors = Partial<Record<keyof Fields | 'podDocument', string>>;
const blank: Fields = { vendorId: '', category: '', poNumber: '', invoiceNumber: '', deliveryDate: '', deliveryReference: '' };

/**
 * Category team / Admin uploads a POD on a vendor's behalf — e.g. a copy
 * received on WhatsApp or email. Optionally forwards it to billing at once.
 */
export default function StaffUploadPage() {
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const vendorsQ = useAsync(() => adminService.uploadVendors(), []);
  const [vendorSearch, setVendorSearch] = useState('');
  const [fields, setFields] = useState<Fields>(blank);
  const [forwardNow, setForwardNow] = useState(false);
  const [pod, setPod] = useState<File | null>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ id: string; number: string; status: string; vendor: string } | null>(null);

  const vendors = vendorsQ.data ?? [];
  const filtered = useMemo(() => {
    const q = vendorSearch.trim().toLowerCase();
    return q ? vendors.filter((v) => `${v.vendorName} ${v.vendorCode}`.toLowerCase().includes(q)) : vendors;
  }, [vendors, vendorSearch]);
  const vendor = vendors.find((v) => v.id === fields.vendorId);
  const set = (k: keyof Fields) => (e: { target: { value: string } }) => setFields((f) => ({ ...f, [k]: e.target.value }));

  const chooseVendor = (id: string) => {
    const v = vendors.find((x) => x.id === id);
    setFields((f) => ({ ...f, vendorId: id, category: v && v.categories.length === 1 ? v.categories[0] : '' }));
  };

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    const e: Errors = {};
    if (!fields.vendorId) e.vendorId = 'Select the vendor';
    if (!fields.category) e.category = 'Select the category';
    if (!fields.poNumber.trim()) e.poNumber = 'PO Number is required';
    if (!fields.invoiceNumber.trim()) e.invoiceNumber = 'Invoice Number is required';
    if (!fields.deliveryDate) e.deliveryDate = 'Delivery date is required';
    else if (fields.deliveryDate > todayIso()) e.deliveryDate = 'Delivery date cannot be in the future';
    if (!pod) e.podDocument = 'Please attach the POD document';
    setErrors(e);
    if (Object.keys(e).length) return setError('Please complete the highlighted fields.');
    setSubmitting(true);
    setError(null);
    setProgress(0);
    try {
      const r = await adminService.uploadForVendor(
        fields.vendorId,
        {
          category: fields.category as Category,
          poNumber: fields.poNumber.trim(),
          invoiceNumber: fields.invoiceNumber.trim(),
          deliveryDate: fields.deliveryDate,
          deliveryReference: fields.deliveryReference.trim() || undefined,
          forwardNow,
        },
        { podDocument: pod!, supportingPhoto: photo },
        setProgress,
      );
      setResult({ id: r.submissionId, number: r.submissionNumber, status: r.status, vendor: vendor?.vendorName ?? '' });
      toast(`POD uploaded: ${r.submissionNumber}`);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      if (err instanceof AppError) {
        setError(err.message);
        setErrors(err.fields as Errors);
      } else setError('Upload failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (vendorsQ.loading && !vendorsQ.data) return <PageLoader />;
  if (vendorsQ.error) return <ErrorState message={vendorsQ.error} onRetry={vendorsQ.reload} />;

  if (result) {
    return (
      <div className="mx-auto max-w-2xl">
        <div className="card animate-fade-in px-6 py-10 text-center sm:px-10">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-50 ring-8 ring-emerald-50/50">
            <CheckCircle2 className="h-9 w-9 text-emerald-600" />
          </div>
          <h1 className="mt-5 text-2xl font-extrabold text-navy-900">POD uploaded</h1>
          <p className="mt-2 text-slate-600">
            <b>{result.number}</b> for {result.vendor} is now {result.status === 'FORWARDED_TO_BILLING' ? 'with the billing team' : 'with the category team'}. The vendor has been notified.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Button variant="secondary" onClick={() => navigate(`/admin/submissions/${result.id}`)}>
              View POD
            </Button>
            <Button
              icon={<FileCheck2 className="h-4 w-4" />}
              onClick={() => {
                setResult(null);
                setFields(blank);
                setPod(null);
                setPhoto(null);
                setForwardNow(false);
              }}
            >
              Upload Another
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Upload POD for a Vendor" subtitle="Upload POD copies received on WhatsApp, email or other channels. The vendor will see it in their portal." />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <form onSubmit={submit} noValidate className="space-y-6">
          {error && <Alert kind="error">{error}</Alert>}
          {vendors.length === 0 && (
            <Alert kind="warning">
              No vendors found{user?.role === 'CATEGORY' ? ' for your categories' : ''}. {user?.role === 'ADMIN' ? <Link to="/admin/vendors?new=1" className="underline">Add a vendor</Link> : 'Ask the admin to add vendors to your categories.'}
            </Alert>
          )}
          <section className="card p-5 sm:p-6">
            <h2 className="mb-5 flex items-center gap-3 text-lg font-bold text-navy-900">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-royal-800 text-sm font-bold text-white">1</span> Vendor & delivery
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="label">
                  Vendor <span className="text-brand-red">*</span>
                </label>
                <div className="relative mb-2">
                  <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input value={vendorSearch} onChange={(e) => setVendorSearch(e.target.value)} placeholder="Search vendor name or code" className="field pl-10" aria-label="Search vendor" />
                </div>
                <select value={fields.vendorId} onChange={(e) => chooseVendor(e.target.value)} className={`field ${errors.vendorId ? 'field-error' : ''}`} aria-label="Vendor">
                  <option value="">{filtered.length ? `Select vendor (${filtered.length})…` : 'No matching vendors'}</option>
                  {filtered.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.vendorName} — {v.vendorCode}
                    </option>
                  ))}
                </select>
                {errors.vendorId && <p className="mt-1.5 text-sm text-brand-red">{errors.vendorId}</p>}
              </div>
              <div className="sm:col-span-2">
                <Select
                  label="Category *"
                  value={fields.category}
                  onChange={set('category')}
                  error={errors.category}
                  disabled={!vendor}
                  options={[{ value: '', label: vendor ? 'Select category…' : 'Select a vendor first' }, ...(vendor?.categories ?? []).map((c) => ({ value: c, label: categoryLabel(c) }))]}
                />
              </div>
              <TextField label="PO Number" required placeholder="e.g. PO-25678" value={fields.poNumber} onChange={set('poNumber')} error={errors.poNumber} maxLength={50} />
              <TextField label="Invoice Number" required placeholder="e.g. INV-78452" value={fields.invoiceNumber} onChange={set('invoiceNumber')} error={errors.invoiceNumber} maxLength={50} />
              <TextField label="Delivery Date" required type="date" max={todayIso()} value={fields.deliveryDate} onChange={set('deliveryDate')} error={errors.deliveryDate} />
              <TextField label="Dispatch / Delivery Reference" optional placeholder="LR / e-way bill / vehicle no." value={fields.deliveryReference} onChange={set('deliveryReference')} maxLength={100} />
            </div>
          </section>
          <section className="card p-5 sm:p-6">
            <h2 className="mb-5 flex items-center gap-3 text-lg font-bold text-navy-900">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-royal-800 text-sm font-bold text-white">2</span> Documents
            </h2>
            <div className="space-y-6">
              <FileDropzone label="POD Document" required file={pod} onChange={(f) => { setPod(f); setErrors((x) => ({ ...x, podDocument: undefined })); }} accept={ACCEPTED_POD_TYPES} error={errors.podDocument} />
              <FileDropzone label="Supporting Photograph" file={photo} onChange={setPhoto} accept={ACCEPTED_PHOTO_TYPES} />
            </div>
          </section>
          <label className="card flex cursor-pointer items-start gap-3 p-5">
            <input type="checkbox" checked={forwardNow} onChange={(e) => setForwardNow(e.target.checked)} className="mt-1 h-5 w-5 rounded border-slate-300 text-royal-700 focus:ring-royal-500" />
            <span>
              <span className="block font-semibold text-navy-900">Forward to billing now</span>
              <span className="block text-sm text-slate-500">Tick this if you have already checked the POD. Otherwise it stays with the category team for review.</span>
            </span>
          </label>
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Link to="/admin/submissions" className="inline-flex h-12 items-center justify-center rounded-xl px-5 font-semibold text-slate-600 hover:bg-slate-100">
              Cancel
            </Link>
            <Button type="submit" size="lg" loading={submitting} icon={<Send className="h-5 w-5" />}>
              {submitting ? (progress < 100 ? `Uploading… ${progress}%` : 'Verifying…') : forwardNow ? 'Upload & Forward' : 'Upload POD'}
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
