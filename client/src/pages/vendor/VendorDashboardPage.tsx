import { Link } from 'react-router-dom';
import { ArrowRight, FileText, Hourglass, ReceiptText, RotateCcw, Send, UploadCloud } from 'lucide-react';
import { CategoryTags } from '@/components/ui/CategoryChips';
import { useAuth } from '@/context/AuthContext';
import { useAsync } from '@/hooks/useAsync';
import { vendorService } from '@/services/vendorService';
import { Card, CardHeader } from '@/components/ui/Card';
import { EmptyState, ErrorState, PageLoader } from '@/components/ui/Feedback';
import { KpiCard } from '@/components/dashboard/KpiCard';
import { DonutChart } from '@/components/dashboard/DonutChart';
import { GuidelinesCard } from '@/components/dashboard/GuidelinesCard';
import { SubmissionsTable, ViewAllLink } from '@/components/pod/SubmissionsTable';
import { Alert } from '@/components/ui/Feedback';
import banner from '@/assets/warehouse-banner.jpg';

export default function VendorDashboardPage() {
  const { user } = useAuth();
  const { data, error, loading, reload } = useAsync(() => vendorService.dashboard(user!.vendor!.id), [user?.vendor?.id]);

  if (loading && !data) return <PageLoader />;
  if (error && !data) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return null;
  const { stats, recentSubmissions } = data;

  return (
    <div className="space-y-6">
      {/* Welcome */}
      <section className="relative overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-card">
        <img src={banner} alt="" className="absolute inset-y-0 right-0 hidden h-full w-[55%] object-cover md:block" />
        <div className="absolute inset-y-0 right-0 hidden w-[55%] bg-gradient-to-r from-white via-white/40 to-transparent md:block" />
        <div className="relative px-6 py-7 sm:px-8">
          <h1 className="text-2xl font-extrabold text-navy-900 sm:text-3xl">
            Welcome, {user?.vendor?.name} <span aria-hidden>👋</span>
          </h1>
          <p className="mt-1.5 text-slate-600">Reliance Consumer Products Limited – Vendor Portal</p>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-400">
            Vendor code: {user?.vendor?.code} <CategoryTags categories={user?.vendor?.categories ?? []} max={5} />
          </p>
        </div>
      </section>

      {stats.RESUBMISSION_REQUESTED > 0 && (
        <Alert kind="warning" title={`RCPL has requested a new copy for ${stats.RESUBMISSION_REQUESTED} POD${stats.RESUBMISSION_REQUESTED === 1 ? '' : 's'}`}>
          Check the reason and upload a corrected copy.{' '}
          <Link to="/vendor/submissions?status=RESUBMISSION_REQUESTED" className="font-semibold underline">
            View requests
          </Link>
        </Alert>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <KpiCard label="Total PODs" value={stats.total} tone="blue" icon={<FileText className="h-7 w-7" />} to="/vendor/submissions" />
        <KpiCard label="With Category Team" value={stats.SUBMITTED} tone="amber" icon={<Hourglass className="h-7 w-7" />} to="/vendor/submissions?status=SUBMITTED" />
        <KpiCard label="With Billing" value={stats.FORWARDED_TO_BILLING} tone="violet" icon={<Send className="h-7 w-7" />} to="/vendor/submissions?status=FORWARDED_TO_BILLING" />
        <KpiCard label="Billed" value={stats.BILLED} tone="green" icon={<ReceiptText className="h-7 w-7" />} to="/vendor/submissions?status=BILLED" />
        <KpiCard label="Re-upload Requested" value={stats.RESUBMISSION_REQUESTED} tone="red" icon={<RotateCcw className="h-7 w-7" />} to="/vendor/submissions?status=RESUBMISSION_REQUESTED" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        {/* Upload CTA */}
        <section className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-royal-200 bg-white px-6 py-10 text-center shadow-card">
          <UploadCloud className="h-14 w-14 text-royal-700" strokeWidth={1.6} />
          <h2 className="mt-3 text-2xl font-extrabold text-navy-900">Upload POD</h2>
          <p className="mt-1.5 text-slate-600">Submit POD, invoice and seal proof for your delivery</p>
          <Link to="/vendor/upload" className="mt-6 inline-flex h-12 items-center gap-2 rounded-xl bg-royal-800 px-8 text-[17px] font-semibold text-white shadow-sm hover:bg-royal-700">
            Upload Now <ArrowRight className="h-5 w-5" />
          </Link>
        </section>

        <Card>
          <CardHeader title="POD Submission Status" />
          <div className="px-5 pb-6 pt-5 sm:px-6">
            <DonutChart stats={stats} centerLabel="PODs" />
          </div>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.8fr)_minmax(0,1fr)]">
        <Card className="overflow-hidden">
          <CardHeader title="Recent Submissions" action={recentSubmissions.length > 0 && <ViewAllLink to="/vendor/submissions" />} />
          <div className="mt-4">
            {recentSubmissions.length ? (
              <SubmissionsTable compact items={recentSubmissions} basePath="/vendor/submissions" viewer="VENDOR" />
            ) : (
              <EmptyState
                title="No submissions yet"
                message="Your uploaded POD documents will appear here."
                action={
                  <Link to="/vendor/upload" className="link">
                    Upload your first POD
                  </Link>
                }
              />
            )}
          </div>
        </Card>
        <GuidelinesCard />
      </div>
    </div>
  );
}
