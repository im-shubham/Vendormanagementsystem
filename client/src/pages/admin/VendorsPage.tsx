import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Ban, Eye, Pencil, Plus, RotateCcw, Search } from 'lucide-react';
import { usePagedQuery } from '@/hooks/usePagedQuery';
import { useDebounce } from '@/hooks/useDebounce';
import { adminService } from '@/services/adminService';
import { useToast } from '@/context/ToastContext';
import { Card, PageHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { EmptyState, ErrorState, Spinner } from '@/components/ui/Feedback';
import { Pagination } from '@/components/ui/Pagination';
import { ACCOUNT_STATUS_OPTIONS, AccountStatusBadge } from '@/components/ui/StatusBadge';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { formatDate } from '@/utils/format';
import type { Vendor } from '@/types';
import { VendorFormModal } from './VendorFormModal';

const PAGE_SIZE = 10;

export default function VendorsPage() {
  const toast = useToast();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState(params.get('status') ?? '');
  const [formOpen, setFormOpen] = useState(params.get('new') === '1');
  const [editing, setEditing] = useState<Vendor | null>(null);
  const [toggling, setToggling] = useState<Vendor | null>(null);
  const q = useDebounce(search);

  const { data, error, loading, reload, page, setPage } = usePagedQuery((after) => adminService.listVendors({ pageSize: PAGE_SIZE, search: q, status }, after), [q, status]);

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const closeForm = () => {
    setFormOpen(false);
    if (params.get('new')) setParams(status ? { status } : {}, { replace: true });
  };
  const deactivating = toggling && toggling.accountStatus !== 'DEACTIVATED' && toggling.accountStatus !== 'REJECTED';

  return (
    <div>
      <PageHeader
        title="Vendor Management"
        subtitle="Create and maintain the vendor master. Deactivation preserves all historical POD records."
        action={<Button icon={<Plus className="h-5 w-5" />} onClick={openCreate}>Add Vendor</Button>}
      />
      <Card className="overflow-hidden">
        <div className="grid gap-3 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_220px] sm:px-6">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by vendor name, code or email" className="field pl-10" aria-label="Search vendors" />
          </div>
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setParams(e.target.value ? { status: e.target.value } : {}, { replace: true });
            }}
            className="field"
            aria-label="Account status"
          >
            {ACCOUNT_STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        {loading && !data && <Spinner className="py-16" label="Loading vendors…" />}
        {error && <ErrorState message={error} onRetry={reload} />}
        {data && !error && (
          <div className={loading ? 'opacity-60' : undefined}>
            {data.items.length === 0 ? (
              <EmptyState title={q || status ? 'No matching vendors' : 'No vendors yet'} message={q || status ? 'Try a different search or status.' : 'Add your first vendor to get started.'} />
            ) : (
              <>
                <div className="hidden overflow-x-auto md:block">
                  <table className="min-w-full">
                    <thead>
                      <tr className="border-y border-slate-100">
                        <th className="th">Vendor Code</th>
                        <th className="th">Vendor Name</th>
                        <th className="th">Email</th>
                        <th className="th">Contact Number</th>
                        <th className="th">Registration Date</th>
                        <th className="th">Account Status</th>
                        <th className="th sticky right-0 text-right shadow-[-8px_0_12px_-10px_rgba(15,31,90,0.25)]">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.items.map((v) => (
                        <tr key={v.id} className="hover:bg-slate-50/70">
                          <td className="td font-semibold text-navy-800">{v.vendorCode}</td>
                          <td className="td">
                            <Link to={`/admin/vendors/${v.id}`} className="link">
                              {v.vendorName}
                            </Link>
                            <span className="block text-xs text-slate-400">{v.contactPerson}</span>
                          </td>
                          <td className="td max-w-[220px] truncate" title={v.email}>{v.email}</td>
                          <td className="td">{v.mobileNumber}</td>
                          <td className="td">{formatDate(v.registeredAt)}</td>
                          <td className="td">
                            <AccountStatusBadge status={v.accountStatus} />
                          </td>
                          <td className="td sticky right-0 bg-white shadow-[-8px_0_12px_-10px_rgba(15,31,90,0.25)]">
                            <div className="flex justify-end gap-1">
                              <button onClick={() => navigate(`/admin/vendors/${v.id}`)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-navy-800" title="View" aria-label={`View ${v.vendorName}`}>
                                <Eye className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => {
                                  setEditing(v);
                                  setFormOpen(true);
                                }}
                                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-navy-800"
                                title="Edit"
                                aria-label={`Edit ${v.vendorName}`}
                              >
                                <Pencil className="h-4 w-4" />
                              </button>
                              {v.accountStatus === 'DEACTIVATED' || v.accountStatus === 'REJECTED' ? (
                                <button onClick={() => setToggling(v)} className="rounded-lg p-2 text-emerald-600 hover:bg-emerald-50" title="Reactivate" aria-label={`Reactivate ${v.vendorName}`}>
                                  <RotateCcw className="h-4 w-4" />
                                </button>
                              ) : (
                                <button onClick={() => setToggling(v)} className="rounded-lg p-2 text-brand-red hover:bg-red-50" title="Deactivate" aria-label={`Deactivate ${v.vendorName}`}>
                                  <Ban className="h-4 w-4" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <ul className="divide-y divide-slate-100 md:hidden">
                  {data.items.map((v) => (
                    <li key={v.id}>
                      <Link to={`/admin/vendors/${v.id}`} className="flex items-start justify-between gap-3 px-4 py-4">
                        <span className="min-w-0">
                          <span className="block font-semibold text-navy-900">{v.vendorName}</span>
                          <span className="block text-sm text-slate-500">
                            {v.vendorCode} · {v.email}
                          </span>
                        </span>
                        <AccountStatusBadge status={v.accountStatus} />
                      </Link>
                    </li>
                  ))}
                </ul>
              </>
            )}
            <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onChange={setPage} />
          </div>
        )}
      </Card>

      <VendorFormModal
        open={formOpen}
        onClose={closeForm}
        vendor={editing}
        onSaved={(v) => {
          toast(editing ? `${v.vendorName} updated` : `${v.vendorName} created. Share the vendor code ${v.vendorCode} and registered email with the vendor for first-time login.`);
          void reload();
        }}
      />
      <ConfirmDialog
        open={!!toggling}
        onClose={() => setToggling(null)}
        title={deactivating ? 'Deactivate vendor?' : 'Reactivate vendor?'}
        tone={deactivating ? 'danger' : 'success'}
        confirmLabel={deactivating ? 'Deactivate' : 'Reactivate'}
        onConfirm={async () => {
          if (!toggling) return;
          const r = deactivating ? await adminService.deactivateVendor(toggling.id) : await adminService.reactivateVendor(toggling.id);
          toast(`${toggling.vendorName} is now ${r.accountStatus.replace('_', ' ').toLowerCase()}`);
          void reload();
        }}
      >
        <p className="text-sm text-slate-600">
          {deactivating ? (
            <>
              <b>{toggling?.vendorName}</b> will immediately lose portal access. All historical POD submissions are preserved and the vendor can be reactivated later.
            </>
          ) : (
            <>
              <b>{toggling?.vendorName}</b> will regain access to the vendor portal (or be able to activate their login if they never registered).
            </>
          )}
        </p>
      </ConfirmDialog>
    </div>
  );
}
