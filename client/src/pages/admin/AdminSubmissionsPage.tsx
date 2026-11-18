import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Plus, X } from 'lucide-react';
import clsx from 'clsx';
import { usePagedQuery } from '@/hooks/usePagedQuery';
import { useDebounce } from '@/hooks/useDebounce';
import { useAuth } from '@/context/AuthContext';
import { adminService } from '@/services/adminService';
import { Card, PageHeader } from '@/components/ui/Card';
import { EmptyState, ErrorState, Spinner } from '@/components/ui/Feedback';
import { Pagination } from '@/components/ui/Pagination';
import { SubmissionFilters, type FilterValues } from '@/components/pod/SubmissionFilters';
import { SubmissionsTable } from '@/components/pod/SubmissionsTable';
import { CATEGORIES, categoryLabel } from '@/utils/constants';

const PAGE_SIZE = 15;

export default function AdminSubmissionsPage() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const vendorId = params.get('vendorId') ?? '';
  const [category, setCategory] = useState(params.get('category') ?? '');
  const [filters, setFilters] = useState<FilterValues>({ search: '', status: params.get('status') ?? '', from: '', to: '' });
  const search = useDebounce(filters.search);
  const role = user!.role;
  const categoryOptions = role === 'CATEGORY' ? user!.categories : CATEGORIES.map((c) => c.value);

  const { data, error, loading, reload, page, setPage } = usePagedQuery(
    (after) => adminService.listSubmissions(user!, { pageSize: PAGE_SIZE, search, status: filters.status, from: filters.from, to: filters.to, vendorId: vendorId || undefined, category: category || undefined }, after),
    [search, filters.status, filters.from, filters.to, vendorId, category, user?.categories.join()],
  );

  const sync = (status: string, cat: string) => {
    const next: Record<string, string> = {};
    if (status) next.status = status;
    if (cat) next.category = cat;
    if (vendorId) next.vendorId = vendorId;
    setParams(next, { replace: true });
  };
  const onFilters = (v: FilterValues) => {
    setFilters(v);
    sync(v.status, category);
  };
  const onCategory = (c: string) => {
    setCategory(c);
    sync(filters.status, c);
  };

  return (
    <div>
      <PageHeader
        title={role === 'BILLING' ? 'PODs for Billing' : 'POD Submissions'}
        subtitle={
          role === 'BILLING'
            ? 'PODs forwarded by the category teams. Mark them as billed, or send back if a new copy is needed.'
            : role === 'CATEGORY'
              ? 'PODs for your categories. Forward correct PODs to billing, or send back for a new copy.'
              : 'All PODs across categories.'
        }
        action={
          role !== 'BILLING' && (
            <Link to="/admin/upload" className="inline-flex h-11 items-center gap-2 rounded-xl bg-royal-800 px-4 font-semibold text-white hover:bg-royal-700">
              <Plus className="h-5 w-5" /> Upload POD
            </Link>
          )
        }
      />
      {vendorId && data?.items[0] && (
        <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-royal-50 py-1.5 pl-4 pr-2 text-sm font-medium text-royal-800">
          Vendor: {data.items[0].vendorName}
          <button onClick={() => setParams(filters.status ? { status: filters.status } : {})} className="rounded-full p-1 hover:bg-royal-100" aria-label="Clear vendor filter">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
      <Card className="overflow-hidden">
        {categoryOptions.length > 1 && (
          <div className="flex gap-2 overflow-x-auto border-b border-slate-100 px-5 pt-4 pb-3 sm:px-6" role="tablist" aria-label="Category">
            {['', ...categoryOptions].map((c) => (
              <button
                key={c || 'all'}
                role="tab"
                aria-selected={category === c}
                onClick={() => onCategory(c)}
                className={clsx(
                  'whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-semibold transition',
                  category === c ? 'bg-navy-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
                )}
              >
                {c ? categoryLabel(c) : role === 'CATEGORY' ? 'All my categories' : 'All categories'}
              </button>
            ))}
          </div>
        )}
        <SubmissionFilters values={filters} onChange={onFilters} searchPlaceholder="Search submission ID, vendor, PO or invoice" />
        {loading && !data && <Spinner className="py-16" label="Loading submissions…" />}
        {error && <ErrorState message={error} onRetry={reload} />}
        {data && !error && (
          <div className={loading ? 'opacity-60' : undefined}>
            {data.items.length ? (
              <SubmissionsTable items={data.items} basePath="/admin/submissions" viewer={role} showVendor showRemarks />
            ) : (
              <EmptyState title="No PODs found" message={filters.status ? 'Nothing here right now.' : 'Try changing the filters.'} />
            )}
            <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onChange={setPage} />
          </div>
        )}
      </Card>
    </div>
  );
}
