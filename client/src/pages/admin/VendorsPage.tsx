import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Ban, Eye, Link2, Pencil, Plus, RotateCcw, Search } from 'lucide-react';
import clsx from 'clsx';
import { usePagedQuery } from '@/hooks/usePagedQuery';
import { useAsync } from '@/hooks/useAsync';
import { useDebounce } from '@/hooks/useDebounce';
import { useAuth } from '@/context/AuthContext';
import { adminService } from '@/services/adminService';
import { useToast } from '@/context/ToastContext';
import { Card, PageHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { EmptyState, ErrorState, Spinner } from '@/components/ui/Feedback';
import { Pagination } from '@/components/ui/Pagination';
import { ACCOUNT_STATUS_OPTIONS, AccountStatusBadge } from '@/components/ui/StatusBadge';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { CategoryTags } from '@/components/ui/CategoryChips';
import { categoryLabel } from '@/utils/constants';
import { formatDate } from '@/utils/format';
import type { Vendor } from '@/types';
import { VendorFormModal } from './VendorFormModal';
import { LinkVendorModal } from './LinkVendorModal';

const PAGE_SIZE = 10;

/** Vendor master — Admin: all vendors; Category team: vendors of their categories. */
export default function VendorsPage() {
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState(params.get('status') ?? '');
  const [category, setCategory] = useState(params.get('category') ?? '');
  const [formOpen, setFormOpen] = useState(params.get('new') === '1');
  const [linkOpen, setLinkOpen] = useState(false);
  const [editing, setEditing] = useState<Vendor | null>(null);
  const [toggling, setToggling] = useState<Vendor | null>(null);
  const q = useDebounce(search);
  const isCategory = user?.role === 'CATEGORY';

  const counts = useAsync(() => adminService.categoryVendorCounts(user!), [user?.categories.join()]);
  const { data, error, loading, reload, page, setPage } = usePagedQuery(
    (after) => adminService.listVendors(user!, { pageSize: PAGE_SIZE, search: q, status, category }, after),
    [q, status, category, user?.categories.join()],
  );
  const refresh = () => {
    void reload();
    void counts.reload();
  };

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
        subtitle={
          isCategory
            ? `Vendors supplying your categories (${user!.categories.map(categoryLabel).join(', ')}). A vendor can supply several categories.`
            : 'Vendor master across all categories. Deactivation preserves all historical POD records.'
        }
        action={
          <>
            {isCategory && (
              <Button variant="secondary" icon={<Link2 className="h-5 w-5" />} onClick={() => setLinkOpen(true)}>
                Add Existing Vendor
              </Button>
            )}
            <Button icon={<Plus className="h-5 w-5" />} onClick={openCreate}>
              New Vendor
            </Button>
          </>
        }
      />

      {/* Category-wise vendor counts */}
      {counts.data && (
        <div className="mb-5 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Vendors by category">
          {!isCategory || user!.categories.length > 1 ? (
            <button
              role="tab"
              aria-selected={!category}
              onClick={() => setCategory('')}
              className={clsx('whitespace-nowrap rounded-xl border px-4 py-2.5 text-sm font-semibold transition', !category ? 'border-navy-800 bg-navy-800 text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-royal-300')}
            >
              All
            </button>
          ) : null}
          {counts.data.map((c) => (
            <button
              key={c.category}
              role="tab"
              aria-selected={category === c.category}
              onClick={() => setCategory(category === c.category ? '' : c.category)}
              className={clsx(
                'flex items-center gap-2 whitespace-nowrap rounded-xl border px-4 py-2.5 text-sm font-semibold transition',
                category === c.category ? 'border-navy-800 bg-navy-800 text-white' : 'border-slate-200 bg-white text-slate-700 hover:border-royal-300',
              )}
            >
              {categoryLabel(c.category)}
              <span className={clsx('rounded-full px-2 py-0.5 text-xs tabular-nums', category === c.category ? 'bg-white/20' : 'bg-slate-100 text-slate-500')}>{c.count}</span>
            </button>
          ))}
        </div>
      )}

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
              <EmptyState
                title={q || status || category ? 'No matching vendors' : 'No vendors yet'}
                message={q || status || category ? 'Try a different search, status or category.' : 'Add your first vendor to get started.'}
              />
            ) : (
              <>
                <div className="hidden overflow-x-auto md:block">
                  <table className="min-w-full">
                    <thead>
                      <tr className="border-y border-slate-100">
                        <th className="th">Vendor Code</th>
                        <th className="th">Vendor Name</th>
                        <th className="th">Categories</th>
                        <th className="th">Contact (Email / Mobile)</th>
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
                          <td className="td min-w-[170px] max-w-[240px] whitespace-normal">
                            <CategoryTags categories={v.categories} max={3} />
                          </td>
                          <td className="td max-w-[220px]">
                            <span className="block truncate" title={v.email}>{v.email}</span>
                            <span className="block text-xs text-slate-400">{v.mobileNumber}</span>
                          </td>
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
                          <span className="mt-1 block">
                            <CategoryTags categories={v.categories} max={4} />
                          </span>
                        </span>
                        <AccountStatusBadge status={v.accountStatus} />
                      </Link>
                    </li>
                  ))}
                </ul>
              </>
            )}
            <Pagination page={page} pageSize={data.pageSize ?? PAGE_SIZE} total={data.total} onChange={setPage} />
          </div>
        )}
      </Card>

      <VendorFormModal
        open={formOpen}
        onClose={closeForm}
        vendor={editing}
        onSaved={(v) => {
          toast(editing ? `${v.vendorName} updated` : `${v.vendorName} created. Share the vendor code ${v.vendorCode} and registered email with the vendor for first-time login.`);
          refresh();
        }}
      />
      <LinkVendorModal
        open={linkOpen}
        onClose={() => setLinkOpen(false)}
        onLinked={(name) => {
          toast(`${name} now also supplies your category.`);
          refresh();
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
          refresh();
        }}
      >
        <p className="text-sm text-slate-600">
          {deactivating ? (
            <>
              <b>{toggling?.vendorName}</b> will immediately lose portal access{toggling && toggling.categories.length > 1 ? ' for all categories' : ''}. All historical POD submissions are preserved and the vendor can be reactivated later.
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
