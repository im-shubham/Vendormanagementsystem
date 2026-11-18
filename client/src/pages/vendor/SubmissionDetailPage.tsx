import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, RotateCcw } from 'lucide-react';
import { useAsync } from '@/hooks/useAsync';
import { useAuth } from '@/context/AuthContext';
import { vendorService } from '@/services/vendorService';
import { Card, CardHeader, DetailItem } from '@/components/ui/Card';
import { Alert, ErrorState, PageLoader } from '@/components/ui/Feedback';
import { Button } from '@/components/ui/Button';
import { PodStatusBadge } from '@/components/ui/StatusBadge';
import { DocumentViewer } from '@/components/pod/DocumentViewer';
import { StatusTimeline } from '@/components/pod/StatusTimeline';
import { ReuploadForm } from '@/components/pod/ReuploadForm';
import { categoryLabel, ROLE_LABELS } from '@/utils/constants';
import { formatDate, formatDateTime } from '@/utils/format';

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
          <p className="mt-1 text-slate-500">
            {categoryLabel(s.category)} · Submitted {formatDateTime(s.submittedAt)} · Version {s.currentVersion}
          </p>
        </div>
        {s.status === 'RESUBMISSION_REQUESTED' && !showReupload && (
          <Button variant="danger" icon={<RotateCcw className="h-4 w-4" />} onClick={() => setParams({ reupload: '1' })}>
            Upload New Copy
          </Button>
        )}
      </div>

      {s.status === 'RESUBMISSION_REQUESTED' && (
        <Alert kind="error" title="RCPL has requested a new POD copy">
          {s.lastRemarks && (
            <p className="text-[15px]">
              <b>Reason:</b> {s.lastRemarks}
            </p>
          )}
          {s.lastActionAt && (
            <p className="mt-1 text-xs opacity-80">
              {formatDateTime(s.lastActionAt)}
              {s.lastActionByRole && ` · ${ROLE_LABELS[s.lastActionByRole]}`}
            </p>
          )}
        </Alert>
      )}
      {s.status === 'SUBMITTED' && <Alert kind="warning">Your POD is with the RCPL {categoryLabel(s.category)} category team.</Alert>}
      {s.status === 'FORWARDED_TO_BILLING' && <Alert kind="info">Your POD has been forwarded to the RCPL billing team.</Alert>}
      {s.status === 'BILLED' && <Alert kind="success" title="Billing completed">Processed by RCPL billing on {formatDateTime(s.billedAt)}.</Alert>}

      {s.status === 'RESUBMISSION_REQUESTED' && showReupload && (
        <Card className="border-red-200">
          <CardHeader title="Upload a new POD copy" icon={<RotateCcw className="h-5 w-5 text-brand-red" />} action={<Button variant="ghost" size="sm" onClick={() => setParams({})}>Cancel</Button>} />
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
              <DetailItem label="Category">{categoryLabel(s.category)}</DetailItem>
              <DetailItem label="Uploaded By">{s.uploadedByRole === 'VENDOR' ? 'You' : `RCPL ${s.uploadedByRole ? ROLE_LABELS[s.uploadedByRole] : ''}`}</DetailItem>
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
