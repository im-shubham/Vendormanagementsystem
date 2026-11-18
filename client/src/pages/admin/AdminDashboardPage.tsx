import { Link } from 'react-router-dom';
import { ArrowRight, ClipboardCheck, FileStack, Hourglass, ReceiptText, RotateCcw, Send, ShieldCheck, UploadCloud, UserCheck, UserPlus, Users } from 'lucide-react';
import { useAsync } from '@/hooks/useAsync';
import { useAuth } from '@/context/AuthContext';
import { adminService } from '@/services/adminService';
import { Card, CardHeader } from '@/components/ui/Card';
import { EmptyState, ErrorState, PageLoader } from '@/components/ui/Feedback';
import { CategoryTags } from '@/components/ui/CategoryChips';
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

const SUB = '/admin/submissions';

/** One dashboard for Admin, Category team and Billing team — content follows the role. */
export default function AdminDashboardPage() {
  const { user } = useAuth();
  const { data, error, loading, reload } = useAsync(() => adminService.dashboard(user!), [user?.uid, user?.categories.join()]);
  if (loading && !data) return <PageLoader />;
  if (error && !data) return <ErrorState message={error} onRetry={reload} />;
  if (!data || !user) return null;
  const { vendors, pods, recentSubmissions, pendingRegistrations } = data;
  const role = user.role;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-navy-900 sm:text-[28px]">Welcome, {user.fullName}</h1>
        <p className="mt-1 flex flex-wrap items-center gap-2 text-slate-500">
          {role === 'CATEGORY' && (
            <>
              Your categories: <CategoryTags categories={user.categories} max={10} />
            </>
          )}
          {role === 'BILLING' && 'PODs forwarded to billing by the category teams.'}
          {role === 'ADMIN' && 'Live overview of vendors and PODs across all categories.'}
        </p>
      </div>

      {vendors && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <KpiCard label={role === 'CATEGORY' ? 'My Vendors' : 'Total Vendors'} value={vendors.total} tone="blue" icon={<Users className="h-7 w-7" />} to="/admin/vendors" hint={`${vendors.notRegistered} not yet registered`} />
          <KpiCard label="Active Vendors" value={vendors.active} tone="green" icon={<UserCheck className="h-7 w-7" />} to="/admin/vendors?status=ACTIVE" />
          <KpiCard label="Pending Vendor Approvals" value={vendors.pendingApproval} tone="violet" icon={<UserPlus className="h-7 w-7" />} to="/admin/registrations" />
        </div>
      )}

      {role === 'BILLING' ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <KpiCard label="To Be Billed" value={pods.FORWARDED_TO_BILLING} tone="violet" icon={<Send className="h-7 w-7" />} to={`${SUB}?status=FORWARDED_TO_BILLING`} />
          <KpiCard label="Billed" value={pods.BILLED} tone="green" icon={<ReceiptText className="h-7 w-7" />} to={`${SUB}?status=BILLED`} />
          <KpiCard label="Sent Back (awaiting new copy)" value={pods.RESUBMISSION_REQUESTED} tone="red" icon={<RotateCcw className="h-7 w-7" />} to={`${SUB}?status=RESUBMISSION_REQUESTED`} />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <KpiCard label="Total PODs" value={pods.total} tone="blue" icon={<FileStack className="h-7 w-7" />} to={SUB} />
          <KpiCard label={role === 'CATEGORY' ? 'Waiting for You' : 'With Category Team'} value={pods.SUBMITTED} tone="amber" icon={<Hourglass className="h-7 w-7" />} to={`${SUB}?status=SUBMITTED`} />
          <KpiCard label="Re-upload Requested" value={pods.RESUBMISSION_REQUESTED} tone="red" icon={<RotateCcw className="h-7 w-7" />} to={`${SUB}?status=RESUBMISSION_REQUESTED`} />
          <KpiCard label="With Billing" value={pods.FORWARDED_TO_BILLING} tone="violet" icon={<Send className="h-7 w-7" />} to={`${SUB}?status=FORWARDED_TO_BILLING`} />
          <KpiCard label="Billed" value={pods.BILLED} tone="green" icon={<ReceiptText className="h-7 w-7" />} to={`${SUB}?status=BILLED`} />
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="POD Status" />
          <div className="px-5 pb-6 pt-5 sm:px-6">
            <DonutChart stats={pods} centerLabel="PODs" />
          </div>
        </Card>
        <Card>
          <CardHeader title="Quick Actions" />
          <div className="grid grid-cols-2 gap-3 p-5 sm:p-6">
            {role === 'BILLING' ? (
              <>
                <QuickAction to={`${SUB}?status=FORWARDED_TO_BILLING`} icon={<ClipboardCheck className="h-8 w-8" />} label="Process PODs" highlight />
                <QuickAction to={`${SUB}?status=BILLED`} icon={<ReceiptText className="h-8 w-8" />} label="Billed PODs" />
              </>
            ) : (
              <>
                <QuickAction to={`${SUB}?status=SUBMITTED`} icon={<ClipboardCheck className="h-8 w-8" />} label="Review PODs" highlight />
                <QuickAction to="/admin/upload" icon={<UploadCloud className="h-8 w-8" />} label="Upload POD" />
                {role === 'ADMIN' ? (
                  <>
                    <QuickAction to="/admin/vendors?new=1" icon={<Users className="h-8 w-8" />} label="Add Vendor" />
                    <QuickAction to="/admin/team" icon={<ShieldCheck className="h-8 w-8" />} label="Team & Access" />
                  </>
                ) : (
                  <>
                    <QuickAction to={`${SUB}?status=RESUBMISSION_REQUESTED`} icon={<RotateCcw className="h-8 w-8" />} label="Awaiting New Copy" />
                    <QuickAction to={`${SUB}?status=FORWARDED_TO_BILLING`} icon={<Send className="h-8 w-8" />} label="Sent to Billing" />
                  </>
                )}
              </>
            )}
          </div>
        </Card>
      </div>

      <div className={vendors ? 'grid gap-6 2xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]' : ''}>
        <Card className="overflow-hidden">
          <CardHeader title="Recent PODs" action={recentSubmissions.length > 0 && <ViewAllLink to={SUB} />} />
          <div className="mt-4">
            {recentSubmissions.length ? (
              <SubmissionsTable compact items={recentSubmissions} basePath={SUB} viewer={role} showVendor />
            ) : (
              <EmptyState title="No PODs yet" message={role === 'BILLING' ? 'PODs forwarded by the category teams will appear here.' : 'Vendor POD uploads will appear here.'} />
            )}
          </div>
        </Card>
        {vendors && (
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
        )}
      </div>
    </div>
  );
}
