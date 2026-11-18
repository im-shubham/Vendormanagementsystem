import { useState, type FormEvent } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, RotateCcw, Upload } from 'lucide-react';
import { useAsync } from '@/hooks/useAsync';
import { vendorService } from '@/services/vendorService';
import { AppError } from '@/lib/errors';
import { useToast } from '@/context/ToastContext';
import { useAuth } from '@/context/AuthContext';
import { Card, CardHeader, DetailItem } from '@/components/ui/Card';
import { Alert, ErrorState, PageLoader } from '@/components/ui/Feedback';
import { Button } from '@/components/ui/Button';
import { TextArea, TextField } from '@/components/ui/Field';
import { PodStatusBadge } from '@/components/ui/StatusBadge';
import { DocumentViewer } from '@/components/pod/DocumentViewer';
import { StatusTimeline } from '@/components/pod/StatusTimeline';
import { FileDropzone } from '@/components/pod/FileDropzone';
import { ACCEPTED_PHOTO_TYPES, ACCEPTED_POD_TYPES } from '@/utils/constants';
import { formatDate, formatDateTime, todayIso } from '@/utils/format';
import type { Submission } from '@/types';

function ReuploadForm({ submission, onDone }: { submission: Submission; onDone: () => void }) {
  const toast = useToast();
  const { user } = useAuth();
  const [progress, setProgress] = useState(0);
  const [pod, setPod] = useState<File | null>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [fields, setFields] = useState({
    poNumber: submission.poNumber,
    invoiceNumber: submission.invoiceNumber,
    deliveryDate: submission.deliveryDate,
    note: '',
  });
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const set = (k: keyof typeof fields) => (e: { target: { value: string } }) => setFields((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!pod) errs.podDocument = 'Please attach the corrected POD document';
    if (!fields.poNumber.trim()) errs.poNumber = 'PO Number is required';
    if (!fields.invoiceNumber.trim()) errs.invoiceNumber = 'Invoice Number is required';
    if (!fields.deliveryDate) errs.deliveryDate = 'Delivery date is required';
    else if (fields.deliveryDate > todayIso()) errs.deliveryDate = 'Delivery date cannot be in the future';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    const edits: { poNumber?: string; invoiceNumber?: string; deliveryDate?: string; note?: string } = {};
    if (fields.poNumber.trim() !== submission.poNumber) edits.poNumber = fields.poNumber.trim();
    if (fields.invoiceNumber.trim() !== submission.invoiceNumber) edits.invoiceNumber = fields.invoiceNumber.trim();
    if (fields.deliveryDate !== submission.deliveryDate) edits.deliveryDate = fields.deliveryDate;
    if (fields.note.trim()) edits.note = fields.note.trim();
    setLoading(true);
    setError(null);
    setProgress(0);
    try {
      const r = await vendorService.reupload(user!.vendor!.id, submission, edits, { podDocument: pod!, supportingPhoto: photo }, setProgress);
      toast(`Corrected POD uploaded (version ${r.version}). It is now under review.`);
      onDone();
    } catch (err) {
      if (err instanceof AppError) {
        setError(err.message);
        setErrors(err.fields);
      } else setError('Upload failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-5 px-5 pb-6 pt-4 sm:px-6">
      {error && <Alert kind="error">{error}</Alert>}
      <p className="text-sm text-slate-600">
        Upload the corrected document. The previous version (v{submission.currentVersion}) is kept for reference — nothing is overwritten.
      </p>
      <div className="grid gap-4 sm:grid-cols-3">
        <TextField label="PO Number" required value={fields.poNumber} onChange={set('poNumber')} error={errors.poNumber} maxLength={50} />
        <TextField label="Invoice Number" required value={fields.invoiceNumber} onChange={set('invoiceNumber')} error={errors.invoiceNumber} maxLength={50} />
        <TextField label="Delivery Date" required type="date" max={todayIso()} value={fields.deliveryDate} onChange={set('deliveryDate')} error={errors.deliveryDate} />
      </div>
      <FileDropzone label="Corrected POD Document" required file={pod} onChange={setPod} accept={ACCEPTED_POD_TYPES} error={errors.podDocument} />
      <FileDropzone label="Supporting Photograph" file={photo} onChange={setPhoto} accept={ACCEPTED_PHOTO_TYPES} />
      <TextArea label="Note to reviewer" optional rows={3} maxLength={500} placeholder="Briefly describe what was corrected" value={fields.note} onChange={set('note')} />
      <div className="flex justify-end">
        <Button type="submit" size="lg" loading={loading} icon={<Upload className="h-5 w-5" />}>
          {loading ? (progress < 100 ? `Uploading… ${progress}%` : 'Verifying…') : 'Submit Corrected POD'}
        </Button>
      </div>
    </form>
  );
}

export default function VendorSubmissionDetailPage() {
  const { id = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const { user } = useAuth();
  const { data, error, loading, reload } = useAsync(() => vendorService.getSubmission(user!.vendor!.id, id), [id]);
  const showReupload = params.get('reupload') === '1';

  if (loading && !data) return <PageLoader />;
  if (error && !data) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return null;
  const { submission: s, documents, history } = data;

  return (
    <div className="space-y-6">
      <Link to="/vendor/submissions" className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-navy-800">
        <ArrowLeft className="h-4 w-4" /> My Submissions
      </Link>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex flex-wrap items-center gap-3 text-2xl font-extrabold text-navy-900 sm:text-[28px]">
            {s.submissionNumber} <PodStatusBadge status={s.status} className="text-sm" />
          </h1>
          <p className="mt-1 text-slate-500">Submitted {formatDateTime(s.submittedAt)} · Version {s.currentVersion}</p>
        </div>
        {s.status === 'REJECTED' && !showReupload && (
          <Button variant="danger" icon={<RotateCcw className="h-4 w-4" />} onClick={() => setParams({ reupload: '1' })}>
            Re-upload Corrected POD
          </Button>
        )}
      </div>

      {s.status === 'REJECTED' && s.adminRemarks && (
        <Alert kind="error" title="Rejected by RCPL — action required">
          <p className="text-[15px]">
            <b>Reason:</b> {s.adminRemarks}
          </p>
          {s.reviewedAt && <p className="mt-1 text-xs opacity-80">Reviewed on {formatDateTime(s.reviewedAt)}</p>}
        </Alert>
      )}
      {s.status === 'APPROVED' && (
        <Alert kind="success" title="POD approved">
          Approved on {formatDateTime(s.reviewedAt)}
          {s.adminRemarks && ` · ${s.adminRemarks}`}
        </Alert>
      )}
      {s.status === 'UNDER_REVIEW' && <Alert kind="warning">This POD is under review by RCPL. You'll be notified once it is approved or rejected.</Alert>}

      {s.status === 'REJECTED' && showReupload && (
        <Card className="border-red-200">
          <CardHeader title="Re-upload corrected POD" icon={<RotateCcw className="h-5 w-5 text-brand-red" />} action={<Button variant="ghost" size="sm" onClick={() => setParams({})}>Cancel</Button>} />
          <ReuploadForm
            submission={s}
            onDone={() => {
              setParams({});
              void reload();
            }}
          />
        </Card>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card>
          <CardHeader title="POD Document" />
          <div className="p-5 sm:p-6">
            <DocumentViewer key={documents.length} documents={documents} />
          </div>
        </Card>
        <div className="space-y-6">
          <Card>
            <CardHeader title="Delivery Details" />
            <dl className="grid grid-cols-2 gap-5 p-5 sm:p-6">
              <DetailItem label="PO Number">{s.poNumber}</DetailItem>
              <DetailItem label="Invoice Number">{s.invoiceNumber}</DetailItem>
              <DetailItem label="Delivery Date">{formatDate(s.deliveryDate)}</DetailItem>
              <DetailItem label="Reference">{s.deliveryReference}</DetailItem>
            </dl>
          </Card>
          <Card>
            <CardHeader title="Status History" />
            <div className="p-5 pl-8 sm:p-6 sm:pl-9">
              <StatusTimeline history={history} />
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
