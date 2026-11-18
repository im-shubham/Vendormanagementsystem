import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Search, UserCheck, XCircle } from 'lucide-react';
import clsx from 'clsx';
import { usePagedQuery } from '@/hooks/usePagedQuery';
import { useDebounce } from '@/hooks/useDebounce';
import { adminService } from '@/services/adminService';
import { useToast } from '@/context/ToastContext';
import { Card, PageHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { EmptyState, ErrorState, Spinner } from '@/components/ui/Feedback';
import { Pagination } from '@/components/ui/Pagination';
import { RegistrationStatusBadge } from '@/components/ui/StatusBadge';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { formatDateTime } from '@/utils/format';
import type { RegistrationRequest } from '@/types';

const TABS = [
  { value: 'PENDING', label: 'Pending' },
  { value: 'APPROVED', label: 'Approved' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: '', label: 'All' },
];
const PAGE_SIZE = 10;

export default function RegistrationsPage() {
  const toast = useToast();
  const [tab, setTab] = useState('PENDING');
  const [search, setSearch] = useState('');
  const [acting, setActing] = useState<{ req: RegistrationRequest; kind: 'approve' | 'reject' } | null>(null);
  const q = useDebounce(search);
  const { data, error, loading, reload, page, setPage } = usePagedQuery((after) => adminService.listRegistrations({ pageSize: PAGE_SIZE, status: tab, search: q }, after), [tab, q]);

  return (
    <div>
      <PageHeader title="Registration Requests" subtitle="Vendors who completed first-time activation. Approve to grant portal access." />
      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1" role="tablist">
            {TABS.map((t) => (
              <button
                key={t.value}
                role="tab"
                aria-selected={tab === t.value}
                onClick={() => setTab(t.value)}
                className={clsx('whitespace-nowrap rounded-lg px-4 py-2 text-sm font-semibold transition', tab === t.value ? 'bg-white text-navy-900 shadow-sm' : 'text-slate-500 hover:text-slate-700')}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="relative sm:w-80">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search vendor name or code" className="field pl-10" aria-label="Search registrations" />
          </div>
        </div>
        {loading && !data && <Spinner className="py-16" />}
        {error && <ErrorState message={error} onRetry={reload} />}
        {data && !error && (
          <div className={loading ? 'opacity-60' : undefined}>
            {data.items.length === 0 ? (
              <EmptyState icon={<UserCheck className="h-7 w-7" />} title={tab === 'PENDING' ? 'No pending registrations' : 'No registrations found'} message={tab === 'PENDING' ? 'New first-time activations will appear here for approval.' : undefined} />
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead>
                    <tr className="border-y border-slate-100">
                      <th className="th">Vendor</th>
                      <th className="th">Email</th>
                      <th className="th">Contact</th>
                      <th className="th">Registration Date</th>
                      <th className="th">Approval Status</th>
                      <th className="th text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.items.map((r) => (
                      <tr key={r.id} className="hover:bg-slate-50/70">
                        <td className="td">
                          <Link to={`/admin/vendors/${r.vendorId}`} className="link">
                            {r.vendor?.vendorName}
                          </Link>
                          <span className="block text-xs text-slate-400">{r.vendor?.vendorCode}</span>
                        </td>
                        <td className="td">{r.vendor?.email}</td>
                        <td className="td">
                          {r.vendor?.contactPerson}
                          <span className="block text-xs text-slate-400">{r.vendor?.mobileNumber}</span>
                        </td>
                        <td className="td">{formatDateTime(r.requestedAt)}</td>
                        <td className="td">
                          <RegistrationStatusBadge status={r.approvalStatus} />
                          {r.reviewedAt && <span className="block pt-1 text-xs text-slate-400">{formatDateTime(r.reviewedAt)}</span>}
                        </td>
                        <td className="td">
                          {r.approvalStatus === 'PENDING' ? (
                            <div className="flex justify-end gap-2">
                              <Button size="sm" variant="success" icon={<CheckCircle2 className="h-4 w-4" />} onClick={() => setActing({ req: r, kind: 'approve' })}>
                                Approve
                              </Button>
                              <Button size="sm" variant="secondary" className="!text-brand-red" icon={<XCircle className="h-4 w-4" />} onClick={() => setActing({ req: r, kind: 'reject' })}>
                                Reject
                              </Button>
                            </div>
                          ) : (
                            <p className="max-w-[220px] whitespace-normal text-right text-xs text-slate-500">{r.remarks ?? '—'}</p>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onChange={setPage} />
          </div>
        )}
      </Card>
      <ConfirmDialog
        open={!!acting}
        onClose={() => setActing(null)}
        title={acting?.kind === 'approve' ? 'Approve vendor registration?' : 'Reject vendor registration?'}
        tone={acting?.kind === 'approve' ? 'success' : 'danger'}
        confirmLabel={acting?.kind === 'approve' ? 'Approve' : 'Reject'}
        remarks={acting?.kind === 'reject' ? 'optional' : undefined}
        remarksLabel="Reason"
        onConfirm={async (remarks) => {
          if (!acting) return;
          if (acting.kind === 'approve') await adminService.approveRegistration(acting.req.id);
          else await adminService.rejectRegistration(acting.req.id, remarks);
          toast(acting.kind === 'approve' ? `${acting.req.vendor?.vendorName} approved — the vendor can now log in.` : 'Registration rejected.');
          void reload();
        }}
      >
        <div className="rounded-xl bg-slate-50 p-4 text-sm">
          <p className="font-semibold text-slate-800">{acting?.req.vendor?.vendorName}</p>
          <p className="text-slate-500">
            {acting?.req.vendor?.vendorCode} · {acting?.req.vendor?.email}
          </p>
        </div>
      </ConfirmDialog>
    </div>
  );
}
