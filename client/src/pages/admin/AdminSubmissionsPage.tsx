import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { X } from 'lucide-react';
import { useAsync } from '@/hooks/useAsync';
import { useDebounce } from '@/hooks/useDebounce';
import { adminService } from '@/services/adminService';
import { Card, PageHeader } from '@/components/ui/Card';
import { EmptyState, ErrorState, Spinner } from '@/components/ui/Feedback';
import { Pagination } from '@/components/ui/Pagination';
import { SubmissionFilters, type FilterValues } from '@/components/pod/SubmissionFilters';
import { SubmissionsTable } from '@/components/pod/SubmissionsTable';

const PAGE_SIZE = 15;

export default function AdminSubmissionsPage() {
  const [params, setParams] = useSearchParams();
  const vendorId = params.get('vendorId') ?? '';
  const [filters, setFilters] = useState<FilterValues>({ search: '', status: params.get('status') ?? '', from: '', to: '' });
  const [page, setPage] = useState(1);
  const search = useDebounce(filters.search);

  const { data, error, loading, reload } = useAsync(
    () => adminService.listSubmissions({ page, pageSize: PAGE_SIZE, search, status: filters.status, from: filters.from, to: filters.to, vendorId: vendorId || undefined }),
    [page, search, filters.status, filters.from, filters.to, vendorId],
  );

  const onFilters = (v: FilterValues) => {
    setFilters(v);
    setPage(1);
    const next: Record<string, string> = {};
    if (v.status) next.status = v.status;
    if (vendorId) next.vendorId = vendorId;
    setParams(next, { replace: true });
  };

  return (
    <div>
      <PageHeader title="POD Submissions" subtitle="Review vendor Proof of Delivery documents and approve or reject them." />
      {vendorId && data?.items[0] && (
        <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-royal-50 py-1.5 pl-4 pr-2 text-sm font-medium text-royal-800">
          Vendor: {data.items[0].vendorName}
          <button onClick={() => setParams(filters.status ? { status: filters.status } : {})} className="rounded-full p-1 hover:bg-royal-100" aria-label="Clear vendor filter">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
      <Card className="overflow-hidden">
        <SubmissionFilters values={filters} onChange={onFilters} searchPlaceholder="Search submission ID, vendor, PO or invoice" />
        {loading && !data && <Spinner className="py-16" label="Loading submissions…" />}
        {error && <ErrorState message={error} onRetry={reload} />}
        {data && !error && (
          <div className={loading ? 'opacity-60' : undefined}>
            {data.items.length ? (
              <SubmissionsTable items={data.items} basePath="/admin/submissions" showVendor admin />
            ) : (
              <EmptyState title="No submissions found" message={filters.status === 'UNDER_REVIEW' ? 'Nothing waiting for review. 🎉' : 'Try changing the filters.'} />
            )}
            <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onChange={setPage} />
          </div>
        )}
      </Card>
    </div>
  );
}
