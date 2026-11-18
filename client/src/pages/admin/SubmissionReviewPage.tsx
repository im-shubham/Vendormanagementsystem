import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ReceiptText, RotateCcw, Send, Upload } from 'lucide-react';
import { useAsync } from '@/hooks/useAsync';
import { useAuth } from '@/context/AuthContext';
import { adminService } from '@/services/adminService';
import { useToast } from '@/context/ToastContext';
import { Card, CardHeader, DetailItem } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Alert, ErrorState, PageLoader } from '@/components/ui/Feedback';
import { PodStatusBadge } from '@/components/ui/StatusBadge';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { DocumentViewer } from '@/components/pod/DocumentViewer';
import { StatusTimeline } from '@/components/pod/StatusTimeline';
import { ReuploadForm } from '@/components/pod/ReuploadForm';
import { categoryLabel, ROLE_LABELS } from '@/utils/constants';
import { formatDate, formatDateTime } from '@/utils/format';

const SEND_BACK_REASONS = [
  'Receiving stamp/seal not visible',
  'Signature missing or unreadable',
  'Document is blurred or cropped',
  'Invoice / PO number mismatch',
  'Incomplete POD — pages missing',
];

type Action = 'forward' | 'billed' | 'sendBack' | null;

export default function SubmissionReviewPage() {
  const { id = '' } = useParams();
  const { user } = useAuth();
  const toast = useToast();
  const { data, error, loading, reload } = useAsync(() => adminService.getSubmission(user!, id), [id]);
  const [action, setAction] = useState<Action>(null);
  const [showUpload, setShowUpload] = useState(false);

  if (loading && !data) return <PageLoader />;
  if (error && !data) return <ErrorState message={error} onRetry={reload} />;
  if (!data || !user) return null;
  const { submission: s, vendor, documents, history } = data;
  const role = user.role;

  const canCategory = role === 'ADMIN' || role === 'CATEGORY';
  const canBilling = role === 'ADMIN' || role === 'BILLING';
  const canForward = canCategory && s.status === 'SUBMITTED';
  const canBill = canBilling && s.status === 'FORWARDED_TO_BILLING';
  const canSendBack = (canCategory && s.status === 'SUBMITTED') || (canBilling && s.status === 'FORWARDED_TO_BILLING');
  const canUpload = canCategory && s.status === 'RESUBMISSION_REQUESTED';

  return (
    <div className="space-y-6">
      <Link to="/admin/submissions" className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-navy-800">
        <ArrowLeft className="h-4 w-4" /> {role === 'BILLING' ? 'PODs for Billing' : 'POD Submissions'}
      </Link>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="flex flex-wrap items-center gap-3 text-2xl font-extrabold text-navy-900 sm:text-[28px]">
            {s.submissionNumber} <PodStatusBadge status={s.status} className="text-sm" />
          </h1>
          <p className="mt-1 text-slate-500">
            {vendor.name} · {categoryLabel(s.category)} · Submitted {formatDateTime(s.submittedAt)} · Version {s.currentVersion}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canSendBack && (
            <Button variant="secondary" size="lg" className="!text-brand-red" icon={<RotateCcw className="h-5 w-5" />} onClick={() => setAction('sendBack')}>
              Send Back
            </Button>
          )}
          {canForward && (
            <Button size="lg" icon={<Send className="h-5 w-5" />} onClick={() => setAction('forward')}>
              Forward to Billing
            </Button>
          )}
          {canBill && (
            <Button variant="success" size="lg" icon={<ReceiptText className="h-5 w-5" />} onClick={() => setAction('billed')}>
              Mark as Billed
            </Button>
          )}
          {canUpload && !showUpload && (
            <Button size="lg" icon={<Upload className="h-5 w-5" />} onClick={() => setShowUpload(true)}>
              Upload New Copy
            </Button>
          )}
        </div>
      </div>

      {s.status === 'RESUBMISSION_REQUESTED' && (
        <Alert kind="error" title="Sent back — waiting for a new POD copy">
          {s.lastRemarks}
          <p className="mt-1 text-xs opacity-80">
            {s.lastActionByName} ({s.lastActionByRole ? ROLE_LABELS[s.lastActionByRole] : ''}) · {formatDateTime(s.lastActionAt)}. The vendor or the category team can upload the new copy.
          </p>
        </Alert>
      )}
      {s.status === 'SUBMITTED' && s.currentVersion > 1 && <Alert kind="info">This is a new copy (version {s.currentVersion}). Earlier versions remain available in the document viewer.</Alert>}
      {s.status === 'FORWARDED_TO_BILLING' && role === 'CATEGORY' && <Alert kind="info">Forwarded to billing on {formatDateTime(s.forwardedAt)}.</Alert>}
      {s.status === 'BILLED' && <Alert kind="success" title="Billed">Processed by {s.lastActionByName ?? 'billing'} on {formatDateTime(s.billedAt)}.</Alert>}

      {canUpload && showUpload && (
        <Card className="border-royal-200">
          <CardHeader title="Upload a new POD copy" icon={<Upload className="h-5 w-5 text-royal-700" />} action={<Button variant="ghost" size="sm" onClick={() => setShowUpload(false)}>Cancel</Button>} />
          <ReuploadForm
            staff
            submission={s}
            onDone={() => {
              setShowUpload(false);
              void reload();
            }}
          />
        </Card>
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
              <DetailItem label="Category">{categoryLabel(s.category)}</DetailItem>
              <DetailItem label="Uploaded By">
                {s.uploadedByName}
                {s.uploadedByRole && <span className="block text-xs font-normal text-slate-500">{ROLE_LABELS[s.uploadedByRole]}</span>}
              </DetailItem>
              <DetailItem label="PO Number">{s.poNumber}</DetailItem>
              <DetailItem label="Invoice Number">{s.invoiceNumber}</DetailItem>
              <DetailItem label="Delivery Date">{formatDate(s.deliveryDate)}</DetailItem>
              <DetailItem label="Reference">{s.deliveryReference}</DetailItem>
            </dl>
          </Card>
          <Card>
            <CardHeader title="Vendor" action={role === 'ADMIN' && <Link to={`/admin/vendors/${s.vendorId}`} className="link text-sm">View vendor</Link>} />
            <dl className="grid grid-cols-2 gap-5 p-5 sm:p-6">
              <DetailItem label="Name">{vendor.name}</DetailItem>
              <DetailItem label="Code">{vendor.code}</DetailItem>
              {role !== 'BILLING' && (
                <>
                  <DetailItem label="Contact">{vendor.contactPerson}</DetailItem>
                  <DetailItem label="Mobile">{vendor.mobileNumber}</DetailItem>
                  <div className="col-span-2">
                    <DetailItem label="Email">{vendor.email}</DetailItem>
                  </div>
                </>
              )}
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
        open={action === 'forward'}
        onClose={() => setAction(null)}
        title="Forward to billing?"
        confirmLabel="Forward to Billing"
        remarks="optional"
        remarksLabel="Note for billing"
        onConfirm={async (r) => {
          await adminService.forward(s.id, r);
          toast(`${s.submissionNumber} forwarded to billing.`);
          void reload();
        }}
      >
        <p className="text-sm text-slate-600">
          The billing team will receive POD <b>{s.submissionNumber}</b> for invoice <b>{s.invoiceNumber}</b>.
        </p>
      </ConfirmDialog>
      <ConfirmDialog
        open={action === 'billed'}
        onClose={() => setAction(null)}
        title="Mark as billed?"
        tone="success"
        confirmLabel="Mark as Billed"
        remarks="optional"
        remarksLabel="Billing note (e.g. document number)"
        onConfirm={async (r) => {
          await adminService.markBilled(s.id, r);
          toast(`${s.submissionNumber} marked as billed.`);
          void reload();
        }}
      >
        <p className="text-sm text-slate-600">
          Confirm that billing for invoice <b>{s.invoiceNumber}</b> is complete.
        </p>
      </ConfirmDialog>
      <SendBackDialog
        open={action === 'sendBack'}
        onClose={() => setAction(null)}
        onConfirm={async (remarks) => {
          await adminService.sendBack(s.id, remarks);
          toast(`${s.submissionNumber} sent back. The vendor and category team have been notified.`);
          void reload();
        }}
      />
    </div>
  );
}

function SendBackDialog({ open, onClose, onConfirm }: { open: boolean; onClose: () => void; onConfirm: (r: string) => Promise<void> }) {
  const [preset, setPreset] = useState<string[]>([]);
  return (
    <ConfirmDialog
      open={open}
      onClose={() => {
        setPreset([]);
        onClose();
      }}
      title="Send back for a new copy?"
      description="The vendor and the category team will see your reason. Either of them can upload a new POD copy."
      tone="danger"
      confirmLabel="Send Back"
      remarks={preset.length ? 'optional' : 'required'}
      remarksLabel={preset.length ? 'Additional remarks' : 'Reason'}
      remarksPlaceholder="Explain what needs to be corrected"
      onConfirm={async (r) => {
        await onConfirm([...preset, r].filter(Boolean).join('. '));
        setPreset([]);
      }}
    >
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Common reasons</p>
        <div className="flex flex-wrap gap-2">
          {SEND_BACK_REASONS.map((r) => {
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
