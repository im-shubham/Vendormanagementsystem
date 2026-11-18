import { useState, type FormEvent } from 'react';
import { Upload } from 'lucide-react';
import { vendorService } from '@/services/vendorService';
import { AppError } from '@/lib/errors';
import { useToast } from '@/context/ToastContext';
import { Alert } from '../ui/Feedback';
import { Button } from '../ui/Button';
import { TextArea, TextField } from '../ui/Field';
import { FileDropzone } from './FileDropzone';
import { ACCEPTED_PHOTO_TYPES, ACCEPTED_POD_TYPES } from '@/utils/constants';
import { todayIso } from '@/utils/format';
import type { Submission } from '@/types';

/**
 * Upload a new POD copy after it was sent back. Used by the vendor and by the
 * category team (e.g. a copy received on WhatsApp). Earlier versions are kept.
 */
export function ReuploadForm({ submission, onDone, staff }: { submission: Submission; onDone: () => void; staff?: boolean }) {
  const toast = useToast();
  const [progress, setProgress] = useState(0);
  const [pod, setPod] = useState<File | null>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [fields, setFields] = useState({ poNumber: submission.poNumber, invoiceNumber: submission.invoiceNumber, deliveryDate: submission.deliveryDate, note: '' });
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const set = (k: keyof typeof fields) => (e: { target: { value: string } }) => setFields((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!pod) errs.podDocument = 'Please attach the new POD copy';
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
      const r = await vendorService.reupload(submission, edits, { podDocument: pod!, supportingPhoto: photo }, setProgress);
      toast(`New POD copy uploaded (version ${r.version}). It is now with the category team.`);
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
        {staff ? 'Upload the corrected copy you received (WhatsApp, email, etc.).' : 'Upload the corrected POD copy.'} The previous version (v{submission.currentVersion}) is kept — nothing is overwritten.
      </p>
      <div className="grid gap-4 sm:grid-cols-3">
        <TextField label="PO Number" required value={fields.poNumber} onChange={set('poNumber')} error={errors.poNumber} maxLength={50} />
        <TextField label="Invoice Number" required value={fields.invoiceNumber} onChange={set('invoiceNumber')} error={errors.invoiceNumber} maxLength={50} />
        <TextField label="Delivery Date" required type="date" max={todayIso()} value={fields.deliveryDate} onChange={set('deliveryDate')} error={errors.deliveryDate} />
      </div>
      <FileDropzone label="New POD Copy" required file={pod} onChange={setPod} accept={ACCEPTED_POD_TYPES} error={errors.podDocument} />
      <FileDropzone label="Supporting Photograph" file={photo} onChange={setPhoto} accept={ACCEPTED_PHOTO_TYPES} />
      <TextArea label="Note" optional rows={3} maxLength={500} placeholder="Briefly describe what was corrected" value={fields.note} onChange={set('note')} />
      <div className="flex justify-end">
        <Button type="submit" size="lg" loading={loading} icon={<Upload className="h-5 w-5" />}>
          {loading ? (progress < 100 ? `Uploading… ${progress}%` : 'Verifying…') : 'Upload New Copy'}
        </Button>
      </div>
    </form>
  );
}
