import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Ban, CheckCircle2, Pencil, RotateCcw, XCircle } from 'lucide-react';
import { useAsync } from '@/hooks/useAsync';
import { useAuth } from '@/context/AuthContext';
import { adminService } from '@/services/adminService';
import { useToast } from '@/context/ToastContext';
import { Card, CardHeader, DetailItem } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Alert, EmptyState, ErrorState, PageLoader } from '@/components/ui/Feedback';
import { AccountStatusBadge, PodStatusBadge, RegistrationStatusBadge } from '@/components/ui/StatusBadge';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { formatDate, formatDateTime } from '@/utils/format';
import { CategoryTags } from '@/components/ui/CategoryChips';
import { VendorFormModal } from './VendorFormModal';

type Action = 'approve' | 'reject' | 'deactivate' | 'reactivate' | null;

export default function VendorDetailPage() {
  const { id = '' } = useParams();
  const toast = useToast();
  const { user } = useAuth();
  const { data, error, loading, reload } = useAsync(() => adminService.getVendor(user!, id), [id]);
  const [editOpen, setEditOpen] = useState(false);
  const [action, setAction] = useState<Action>(null);

  if (loading && !data) return <PageLoader />;
  if (error && !data) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return null;
  const { vendor: v, stats, registrations, recentSubmissions } = data;
  const pendingReg = registrations.find((r) => r.approvalStatus === 'PENDING');

  const dialogs: Record<Exclude<Action, null>, { title: string; label: string; tone: 'danger' | 'success'; remarks?: 'optional'; run: (r: string) => Promise<unknown>; done: string; body: string }> = {
    approve: { title: 'Approve registration?', label: 'Approve', tone: 'success', run: () => adminService.approveRegistration(pendingReg!.id), done: 'Vendor approved — they can now log in.', body: `${v.vendorName} will be able to log in and upload POD documents.` },
    reject: { title: 'Reject registration?', label: 'Reject', tone: 'danger', remarks: 'optional', run: (r) => adminService.rejectRegistration(pendingReg!.id, r), done: 'Registration rejected.', body: `${v.vendorName} will not be able to access the vendor portal.` },
    deactivate: { title: 'Deactivate vendor?', label: 'Deactivate', tone: 'danger', run: () => adminService.deactivateVendor(v.id), done: 'Vendor deactivated.', body: 'The vendor immediately loses portal access. Historical POD records are preserved.' },
    reactivate: { title: 'Reactivate vendor?', label: 'Reactivate', tone: 'success', run: () => adminService.reactivateVendor(v.id), done: 'Vendor reactivated.', body: 'The vendor regains access to the portal.' },
  };
  const d = action ? dialogs[action] : null;

  return (
    <div className="space-y-6">
      <Link to="/admin/vendors" className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-navy-800">
        <ArrowLeft className="h-4 w-4" /> Vendors
      </Link>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="flex flex-wrap items-center gap-3 text-2xl font-extrabold text-navy-900 sm:text-[28px]">
            {v.vendorName} <AccountStatusBadge status={v.accountStatus} />
          </h1>
          <p className="mt-1 text-slate-500">Vendor code {v.vendorCode} · Created {formatDate(v.createdAt)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" icon={<Pencil className="h-4 w-4" />} onClick={() => setEditOpen(true)}>
            Edit
          </Button>
          {v.accountStatus === 'DEACTIVATED' || v.accountStatus === 'REJECTED' ? (
            <Button variant="success" icon={<RotateCcw className="h-4 w-4" />} onClick={() => setAction('reactivate')}>
              Reactivate
            </Button>
          ) : (
            <Button variant="secondary" className="!text-brand-red" icon={<Ban className="h-4 w-4" />} onClick={() => setAction('deactivate')}>
              Deactivate
            </Button>
          )}
        </div>
      </div>

      {pendingReg && (
        <Alert kind="warning" title="Registration awaiting your approval">
          <p>
            {v.vendorName} created their password on {formatDateTime(pendingReg.requestedAt)}.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="success" icon={<CheckCircle2 className="h-4 w-4" />} onClick={() => setAction('approve')}>
              Approve
            </Button>
            <Button size="sm" variant="danger" icon={<XCircle className="h-4 w-4" />} onClick={() => setAction('reject')}>
              Reject
            </Button>
          </div>
        </Alert>
      )}
      {v.accountStatus === 'NOT_REGISTERED' && (
        <Alert kind="info">This vendor has not created a password yet. Share the vendor code <b>{v.vendorCode}</b> and registered email so they can use “First-Time Login”.</Alert>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <Card>
          <CardHeader title="Vendor Details" />
          <dl className="grid gap-5 p-5 sm:grid-cols-2 sm:p-6">
            <div className="sm:col-span-2">
              <DetailItem label="Categories"><CategoryTags categories={v.categories} max={10} /></DetailItem>
            </div>
            <DetailItem label="Vendor Code">{v.vendorCode}</DetailItem>
            <DetailItem label="Registered Email">{v.email}</DetailItem>
            <DetailItem label="Contact Person">{v.contactPerson}</DetailItem>
            <DetailItem label="Mobile Number">{v.mobileNumber}</DetailItem>
            <DetailItem label="Registration Date">{formatDateTime(v.registeredAt)}</DetailItem>
            <DetailItem label="Last Updated">{formatDateTime(v.updatedAt)}</DetailItem>
            <div className="sm:col-span-2">
              <DetailItem label="Company Address">{v.address}</DetailItem>
            </div>
          </dl>
        </Card>
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ['With Category', stats.SUBMITTED, 'text-amber-600'],
              ['With Billing', stats.FORWARDED_TO_BILLING, 'text-royal-700'],
              ['Billed', stats.BILLED, 'text-emerald-600'],
              ['Re-upload Req.', stats.RESUBMISSION_REQUESTED, 'text-brand-red'],
            ].map(([label, n, cls]) => (
              <div key={label as string} className="card px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
                <p className={`text-2xl font-extrabold tabular-nums ${cls}`}>{n}</p>
              </div>
            ))}
          </div>
          <Card className="overflow-hidden">
            <CardHeader title="Recent Submissions" action={stats.total > 0 && <Link to={`/admin/submissions?vendorId=${v.id}`} className="link text-sm">View all</Link>} />
            {recentSubmissions.length ? (
              <ul className="mt-3 divide-y divide-slate-100">
                {recentSubmissions.map((s) => (
                  <li key={s.id}>
                    <Link to={`/admin/submissions/${s.id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-slate-50 sm:px-6">
                      <span className="min-w-0">
                        <span className="block font-semibold text-royal-800">{s.submissionNumber}</span>
                        <span className="block truncate text-sm text-slate-500">
                          {s.poNumber} · {s.invoiceNumber} · {formatDate(s.deliveryDate)}
                        </span>
                      </span>
                      <PodStatusBadge status={s.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="No submissions" message="This vendor has not submitted any POD yet." />
            )}
          </Card>
        </div>
      </div>

      <Card className="overflow-hidden">
        <CardHeader title="Registration History" />
        {registrations.length ? (
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="border-y border-slate-100">
                  <th className="th">Requested</th>
                  <th className="th">Status</th>
                  <th className="th">Reviewed</th>
                  <th className="th">Reviewed By</th>
                  <th className="th">Remarks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {registrations.map((r) => (
                  <tr key={r.id}>
                    <td className="td">{formatDateTime(r.requestedAt)}</td>
                    <td className="td"><RegistrationStatusBadge status={r.approvalStatus} /></td>
                    <td className="td">{formatDateTime(r.reviewedAt)}</td>
                    <td className="td">{r.reviewerName ?? '—'}</td>
                    <td className="td whitespace-normal">{r.remarks ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No registration yet" message="The vendor has not activated their login." />
        )}
      </Card>

      <VendorFormModal open={editOpen} onClose={() => setEditOpen(false)} vendor={v} onSaved={() => { toast('Vendor updated'); void reload(); }} />
      {d && (
        <ConfirmDialog
          open
          onClose={() => setAction(null)}
          title={d.title}
          tone={d.tone}
          confirmLabel={d.label}
          remarks={d.remarks}
          remarksLabel="Reason"
          remarksPlaceholder="Shared with the vendor administration record"
          onConfirm={async (r) => {
            await d.run(r);
            toast(d.done);
            void reload();
          }}
        >
          <p className="text-sm text-slate-600">{d.body}</p>
        </ConfirmDialog>
      )}
    </div>
  );
}
