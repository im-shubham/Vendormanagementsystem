import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, XCircle } from 'lucide-react';
import { useAsync } from '@/hooks/useAsync';
import { adminService } from '@/services/adminService';
import { useToast } from '@/context/ToastContext';
import { Card, CardHeader, DetailItem } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Alert, ErrorState, PageLoader } from '@/components/ui/Feedback';
import { PodStatusBadge } from '@/components/ui/StatusBadge';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { DocumentViewer } from '@/components/pod/DocumentViewer';
import { StatusTimeline } from '@/components/pod/StatusTimeline';
import { formatDate, formatDateTime } from '@/utils/format';

const REJECTION_REASONS = ['Receiving stamp/seal not visible', 'Signature missing or unreadable', 'Document is blurred or cropped', 'Invoice / PO number mismatch', 'Incomplete POD — pages missing'];

export default function SubmissionReviewPage() {
  const { id = '' } = useParams();
  const toast = useToast();
  const { data, error, loading, reload } = useAsync(() => adminService.getSubmission(id), [id]);
  const [action, setAction] = useState<'approve' | 'reject' | null>(null);

  if (loading && !data) return <PageLoader />;
  if (error && !data) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return null;
  const { submission: s, vendor, documents, history } = data;
  const canReview = s.status === 'UNDER_REVIEW';

  return (
    <div className="space-y-6">
      <Link to="/admin/submissions" className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-navy-800">
        <ArrowLeft className="h-4 w-4" /> POD Submissions
      </Link>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="flex flex-wrap items-center gap-3 text-2xl font-extrabold text-navy-900 sm:text-[28px]">
            {s.submissionNumber} <PodStatusBadge status={s.status} className="text-sm" />
          </h1>
          <p className="mt-1 text-slate-500">
            {vendor.name} · Submitted {formatDateTime(s.submittedAt)} · Version {s.currentVersion}
          </p>
        </div>
        {canReview && (
          <div className="flex flex-wrap gap-2">
            <Button variant="danger" size="lg" icon={<XCircle className="h-5 w-5" />} onClick={() => setAction('reject')}>
              Reject
            </Button>
            <Button variant="success" size="lg" icon={<CheckCircle2 className="h-5 w-5" />} onClick={() => setAction('approve')}>
              Approve
            </Button>
          </div>
        )}
      </div>

      {s.currentVersion > 1 && canReview && <Alert kind="info">This is a re-submission (version {s.currentVersion}). Earlier versions remain available in the document viewer.</Alert>}
      {s.status === 'REJECTED' && <Alert kind="error" title="Rejected — awaiting corrected document from vendor">{s.adminRemarks}</Alert>}
      {s.status === 'APPROVED' && (
        <Alert kind="success" title="Approved">
          {formatDateTime(s.reviewedAt)}
          {s.reviewerName && ` by ${s.reviewerName}`}
          {s.adminRemarks && ` · ${s.adminRemarks}`}
        </Alert>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
        <Card>
          <CardHeader title="Uploaded Documents" subtitle="Check that the POD is clear, complete, stamped and signed." />
          <div className="p-5 sm:p-6">
            <DocumentViewer key={documents.length} documents={documents} />
          </div>
        </Card>
        <div className="space-y-6">
          <Card>
            <CardHeader title="Submission Details" />
            <dl className="grid grid-cols-2 gap-5 p-5 sm:p-6">
              <DetailItem label="PO Number">{s.poNumber}</DetailItem>
              <DetailItem label="Invoice Number">{s.invoiceNumber}</DetailItem>
              <DetailItem label="Delivery Date">{formatDate(s.deliveryDate)}</DetailItem>
              <DetailItem label="Reference">{s.deliveryReference}</DetailItem>
            </dl>
          </Card>
          <Card>
            <CardHeader title="Vendor" action={<Link to={`/admin/vendors/${s.vendorId}`} className="link text-sm">View vendor</Link>} />
            <dl className="grid grid-cols-2 gap-5 p-5 sm:p-6">
              <DetailItem label="Name">{vendor.name}</DetailItem>
              <DetailItem label="Code">{vendor.code}</DetailItem>
              <DetailItem label="Contact">{vendor.contactPerson}</DetailItem>
              <DetailItem label="Mobile">{vendor.mobileNumber}</DetailItem>
              <div className="col-span-2">
                <DetailItem label="Email">{vendor.email}</DetailItem>
              </div>
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

      <ConfirmDialog
        open={action === 'approve'}
        onClose={() => setAction(null)}
        title="Approve this POD?"
        tone="success"
        confirmLabel="Approve POD"
        remarks="optional"
        remarksPlaceholder="Optional note for the vendor"
        onConfirm={async (remarks) => {
          await adminService.approveSubmission(s.id, remarks || undefined);
          toast(`${s.submissionNumber} approved. The vendor has been notified.`);
          void reload();
        }}
      >
        <p className="text-sm text-slate-600">
          Confirm that the POD for invoice <b>{s.invoiceNumber}</b> is clear, complete, stamped and signed.
        </p>
      </ConfirmDialog>
      <RejectDialog
        open={action === 'reject'}
        onClose={() => setAction(null)}
        onConfirm={async (remarks) => {
          await adminService.rejectSubmission(s.id, remarks);
          toast(`${s.submissionNumber} rejected. The vendor has been notified with your remarks.`);
          void reload();
        }}
      />
    </div>
  );
}

function RejectDialog({ open, onClose, onConfirm }: { open: boolean; onClose: () => void; onConfirm: (r: string) => Promise<void> }) {
  const [preset, setPreset] = useState<string[]>([]);
  return (
    <ConfirmDialog
      open={open}
      onClose={() => {
        setPreset([]);
        onClose();
      }}
      title="Reject this POD?"
      description="The vendor will see your remarks and can re-upload a corrected document."
      tone="danger"
      confirmLabel="Reject POD"
      remarks={preset.length ? 'optional' : 'required'}
      remarksLabel={preset.length ? 'Additional remarks' : 'Rejection remarks'}
      remarksPlaceholder="Explain what needs to be corrected"
      onConfirm={async (r) => {
        const text = [...preset, r].filter(Boolean).join('. ');
        await onConfirm(text);
        setPreset([]);
      }}
    >
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Common reasons</p>
        <div className="flex flex-wrap gap-2">
          {REJECTION_REASONS.map((r) => {
            const on = preset.includes(r);
            return (
              <button
                key={r}
                type="button"
                onClick={() => setPreset((p) => (on ? p.filter((x) => x !== r) : [...p, r]))}
                className={on ? 'rounded-full bg-red-100 px-3 py-1.5 text-xs font-semibold text-red-800 ring-1 ring-red-300' : 'rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-200'}
              >
                {r}
              </button>
            );
          })}
        </div>
      </div>
    </ConfirmDialog>
  );
}
