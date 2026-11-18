import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle2, Clock, FileText, Hourglass, UploadCloud, XCircle } from 'lucide-react';
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
  const { data, error, loading, reload } = useAsync(() => vendorService.dashboard(), []);

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
          <p className="mt-1 text-sm text-slate-400">Vendor code: {user?.vendor?.code}</p>
        </div>
      </section>

      {stats.REJECTED > 0 && (
        <Alert kind="warning" title={`${stats.REJECTED} POD ${stats.REJECTED === 1 ? 'submission needs' : 'submissions need'} your attention`}>
          Review the rejection remarks and re-upload the corrected document.{' '}
          <Link to="/vendor/submissions?status=REJECTED" className="font-semibold underline">
            View rejected PODs
          </Link>
        </Alert>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <KpiCard label="Total Deliveries" value={stats.total} tone="blue" icon={<FileText className="h-7 w-7" />} to="/vendor/submissions" />
        <KpiCard label="POD Approved" value={stats.APPROVED} tone="green" icon={<CheckCircle2 className="h-7 w-7" />} to="/vendor/submissions?status=APPROVED" />
        <KpiCard label="Under Review" value={stats.UNDER_REVIEW} tone="amber" icon={<Hourglass className="h-7 w-7" />} to="/vendor/submissions?status=UNDER_REVIEW" />
        <KpiCard label="Rejected" value={stats.REJECTED} tone="red" icon={<XCircle className="h-7 w-7" />} to="/vendor/submissions?status=REJECTED" />
        <KpiCard label="Pending POD" value={stats.PENDING} tone="slate" icon={<Clock className="h-7 w-7" />} to="/vendor/submissions?status=PENDING" />
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
            <DonutChart stats={stats} centerLabel="Deliveries" />
          </div>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.8fr)_minmax(0,1fr)]">
        <Card className="overflow-hidden">
          <CardHeader title="Recent Submissions" action={recentSubmissions.length > 0 && <ViewAllLink to="/vendor/submissions" />} />
          <div className="mt-4">
            {recentSubmissions.length ? (
              <SubmissionsTable compact items={recentSubmissions} basePath="/vendor/submissions" />
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
