import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { usePagedQuery } from '@/hooks/usePagedQuery';
import { useAuth } from '@/context/AuthContext';
import { useDebounce } from '@/hooks/useDebounce';
import { vendorService } from '@/services/vendorService';
import { Card, PageHeader } from '@/components/ui/Card';
import { EmptyState, ErrorState, Spinner } from '@/components/ui/Feedback';
import { Pagination } from '@/components/ui/Pagination';
import { SubmissionFilters, type FilterValues } from '@/components/pod/SubmissionFilters';
import { SubmissionsTable } from '@/components/pod/SubmissionsTable';

const PAGE_SIZE = 10;

export default function MySubmissionsPage() {
  const [params, setParams] = useSearchParams();
  const [filters, setFilters] = useState<FilterValues>({ search: '', status: params.get('status') ?? '', from: '', to: '' });
  const { user } = useAuth();
  const po = useDebounce(filters.search);

  const { data, error, loading, reload, page, setPage } = usePagedQuery(
    (after) => vendorService.listSubmissions(user!.vendor!.id, { pageSize: PAGE_SIZE, status: filters.status, from: filters.from, to: filters.to, po }, after),
    [filters.status, filters.from, filters.to, po],
  );

  const onFilters = (v: FilterValues) => {
    setFilters(v);
    setParams(v.status ? { status: v.status } : {}, { replace: true });
  };
  const filtered = Object.values(filters).some(Boolean);

  return (
    <div>
      <PageHeader
        title="My Submissions"
        subtitle="Track the status of every POD you have submitted."
        action={
          <Link to="/vendor/upload" className="inline-flex h-11 items-center gap-2 rounded-xl bg-royal-800 px-4 font-semibold text-white hover:bg-royal-700">
            <Plus className="h-5 w-5" /> Upload POD
          </Link>
        }
      />
      <Card className="overflow-hidden">
        <SubmissionFilters values={filters} onChange={onFilters} searchPlaceholder="Search by PO number" />
        <div className="relative min-h-[200px]">
          {loading && !data && <Spinner className="py-16" label="Loading submissions…" />}
          {error && <ErrorState message={error} onRetry={reload} />}
          {data && !error && (
            <div className={loading ? 'opacity-60 transition' : undefined}>
              {data.items.length ? (
                <SubmissionsTable items={data.items} basePath="/vendor/submissions" viewer="VENDOR" showRemarks />
              ) : (
                <EmptyState
                  title={filtered ? 'No matching submissions' : 'No submissions yet'}
                  message={filtered ? 'Try changing or clearing the filters.' : 'Upload a POD to get started.'}
                />
              )}
              <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onChange={setPage} />
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
