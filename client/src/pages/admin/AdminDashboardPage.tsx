import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle2, ClipboardCheck, FileStack, Hourglass, UserCheck, UserPlus, Users, XCircle } from 'lucide-react';
import { useAsync } from '@/hooks/useAsync';
import { adminService } from '@/services/adminService';
import { Card, CardHeader } from '@/components/ui/Card';
import { EmptyState, ErrorState, PageLoader } from '@/components/ui/Feedback';
import { KpiCard } from '@/components/dashboard/KpiCard';
import { DonutChart } from '@/components/dashboard/DonutChart';
import { SubmissionsTable, ViewAllLink } from '@/components/pod/SubmissionsTable';
import { timeAgo } from '@/utils/format';

function QuickAction({ to, icon, label, highlight }: { to: string; icon: React.ReactNode; label: string; highlight?: boolean }) {
  return (
    <Link
      to={to}
      className={
        'flex flex-col items-center justify-center gap-3 rounded-2xl border px-3 py-5 text-center text-[15px] font-semibold transition ' +
        (highlight ? 'border-royal-200 bg-royal-50 text-royal-800 hover:bg-royal-100' : 'border-slate-200 bg-white text-slate-700 hover:border-royal-200 hover:bg-slate-50')
      }
    >
      <span className={highlight ? 'text-royal-700' : 'text-navy-700'}>{icon}</span>
      {label}
    </Link>
  );
}

export default function AdminDashboardPage() {
  const { data, error, loading, reload } = useAsync(() => adminService.dashboard(), []);
  if (loading && !data) return <PageLoader />;
  if (error && !data) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return null;
  const { vendors, pods, recentSubmissions, pendingRegistrations } = data;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-navy-900 sm:text-[28px]">Dashboard</h1>
        <p className="mt-1 text-slate-500">Live overview of vendors and POD verification.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <KpiCard label="Total Vendors" value={vendors.total} tone="blue" icon={<Users className="h-7 w-7" />} to="/admin/vendors" hint={`${vendors.notRegistered} not yet registered`} />
        <KpiCard label="Active Vendors" value={vendors.active} tone="green" icon={<UserCheck className="h-7 w-7" />} to="/admin/vendors?status=ACTIVE" />
        <KpiCard label="Pending Vendor Approvals" value={vendors.pendingApproval} tone="violet" icon={<UserPlus className="h-7 w-7" />} to="/admin/registrations" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Total POD Submissions" value={pods.total} tone="blue" icon={<FileStack className="h-7 w-7" />} to="/admin/submissions" />
        <KpiCard label="PODs Under Review" value={pods.UNDER_REVIEW} tone="amber" icon={<Hourglass className="h-7 w-7" />} to="/admin/submissions?status=UNDER_REVIEW" />
        <KpiCard label="Approved PODs" value={pods.APPROVED} tone="green" icon={<CheckCircle2 className="h-7 w-7" />} to="/admin/submissions?status=APPROVED" />
        <KpiCard label="Rejected PODs" value={pods.REJECTED} tone="red" icon={<XCircle className="h-7 w-7" />} to="/admin/submissions?status=REJECTED" />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="POD Submission Status" />
          <div className="px-5 pb-6 pt-5 sm:px-6">
            <DonutChart stats={pods} />
          </div>
        </Card>
        <Card>
          <CardHeader title="Quick Actions" />
          <div className="grid grid-cols-2 gap-3 p-5 sm:grid-cols-4 sm:p-6 xl:grid-cols-2 2xl:grid-cols-4">
            <QuickAction to="/admin/submissions?status=UNDER_REVIEW" icon={<ClipboardCheck className="h-8 w-8" />} label="Verify POD" highlight />
            <QuickAction to="/admin/registrations" icon={<UserPlus className="h-8 w-8" />} label="Approve Vendors" />
            <QuickAction to="/admin/vendors?new=1" icon={<Users className="h-8 w-8" />} label="Add Vendor" />
            <QuickAction to="/admin/submissions?status=REJECTED" icon={<XCircle className="h-8 w-8" />} label="Rejected PODs" />
          </div>
        </Card>
      </div>

      <div className="grid gap-6 2xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card className="overflow-hidden">
          <CardHeader title="Recent POD Submissions" action={recentSubmissions.length > 0 && <ViewAllLink to="/admin/submissions" />} />
          <div className="mt-4">
            {recentSubmissions.length ? (
              <SubmissionsTable compact items={recentSubmissions} basePath="/admin/submissions" showVendor admin />
            ) : (
              <EmptyState title="No submissions yet" message="Vendor POD submissions will appear here." />
            )}
          </div>
        </Card>
        <Card className="overflow-hidden">
          <CardHeader title="Pending Approvals" subtitle="First-time vendor registrations" action={pendingRegistrations.length > 0 && <ViewAllLink to="/admin/registrations" />} />
          {pendingRegistrations.length ? (
            <ul className="mt-3 divide-y divide-slate-100">
              {pendingRegistrations.map((r) => (
                <li key={r.id}>
                  <Link to={`/admin/vendors/${r.vendorId}`} className="flex items-center gap-3 px-5 py-3.5 hover:bg-slate-50 sm:px-6">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-violet-100 font-bold text-violet-700">{r.vendorName.charAt(0)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold text-slate-800">{r.vendorName}</span>
                      <span className="block truncate text-xs text-slate-500">
                        {r.vendorCode} · {timeAgo(r.requestedAt)}
                      </span>
                    </span>
                    <ArrowRight className="h-4 w-4 text-slate-400" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={<UserCheck className="h-7 w-7" />} title="No pending approvals" message="New vendor registrations will appear here." />
          )}
        </Card>
      </div>
    </div>
  );
}
