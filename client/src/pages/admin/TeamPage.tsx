import { useEffect, useMemo, useState } from 'react';
import { Ban, Mail, Pencil, Plus, RotateCcw, Search } from 'lucide-react';
import clsx from 'clsx';
import { useAsync } from '@/hooks/useAsync';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { adminService } from '@/services/adminService';
import { AppError } from '@/lib/errors';
import { Card, PageHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Select, TextField } from '@/components/ui/Field';
import { Alert, EmptyState, ErrorState, Spinner } from '@/components/ui/Feedback';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { CategoryPicker, CategoryTags } from '@/components/ui/CategoryChips';
import { ROLE_LABELS } from '@/utils/constants';
import { formatDate } from '@/utils/format';
import type { Category, StaffRole, StaffUser } from '@/types';

const ROLE_OPTIONS = [
  { value: 'CATEGORY', label: 'Category Team' },
  { value: 'BILLING', label: 'Billing Team' },
  { value: 'ADMIN', label: 'Admin' },
];
const ROLE_HELP: Record<StaffRole, string> = {
  CATEGORY: 'Sees PODs of the selected categories, uploads PODs for those vendors, forwards to billing or sends back.',
  BILLING: 'Sees PODs forwarded to billing (all categories), marks them billed or sends back.',
  ADMIN: 'Full access: vendors, registrations, team, and all PODs.',
};

/** Admin: manage RCPL staff logins (Category team, Billing team, Admins). */
export default function TeamPage() {
  const { user } = useAuth();
  const toast = useToast();
  const { data, error, loading, reload } = useAsync(() => adminService.listStaff(), []);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [editing, setEditing] = useState<StaffUser | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [toggling, setToggling] = useState<StaffUser | null>(null);

  const items = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data ?? []).filter((u) => (!roleFilter || u.role === roleFilter) && (!q || `${u.fullName} ${u.email}`.toLowerCase().includes(q)));
  }, [data, search, roleFilter]);

  const resend = async (u: StaffUser) => {
    try {
      await adminService.sendInvite(u.email);
      toast(`Password setup email sent to ${u.email}`);
    } catch (e) {
      toast(e instanceof AppError ? e.message : 'Could not send the email', 'error');
    }
  };

  return (
    <div>
      <PageHeader
        title="Team & Access"
        subtitle="RCPL staff logins: Category teams, Billing team and Admins. New users receive an email to set their own password."
        action={<Button icon={<Plus className="h-5 w-5" />} onClick={() => { setEditing(null); setFormOpen(true); }}>Add Team Member</Button>}
      />
      <Card className="overflow-hidden">
        <div className="grid gap-3 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_220px] sm:px-6">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or email" className="field pl-10" aria-label="Search team" />
          </div>
          <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className="field" aria-label="Role">
            <option value="">All roles</option>
            {ROLE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        {loading && !data && <Spinner className="py-16" />}
        {error && <ErrorState message={error} onRetry={reload} />}
        {data && !error && (items.length === 0 ? (
          <EmptyState title="No team members found" message="Add Category and Billing team members to get started." />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="border-y border-slate-100">
                  <th className="th">Name</th>
                  <th className="th">Role</th>
                  <th className="th">Categories</th>
                  <th className="th">Status</th>
                  <th className="th">Added</th>
                  <th className="th sticky right-0 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((u) => (
                  <tr key={u.uid} className={clsx('hover:bg-slate-50/70', !u.active && 'opacity-60')}>
                    <td className="td">
                      <span className="font-semibold text-slate-800">{u.fullName}</span>
                      {u.uid === user?.uid && <span className="ml-2 rounded bg-royal-50 px-1.5 py-0.5 text-[11px] font-semibold text-royal-700">You</span>}
                      <span className="block text-xs text-slate-400">{u.email}</span>
                    </td>
                    <td className="td">{ROLE_LABELS[u.role]}</td>
                    <td className="td whitespace-normal">{u.role === 'CATEGORY' ? <CategoryTags categories={u.categories} max={4} /> : <span className="text-xs text-slate-400">{u.role === 'BILLING' ? 'All (forwarded PODs)' : 'All'}</span>}</td>
                    <td className="td">
                      <span className={clsx('rounded-lg px-2.5 py-1 text-xs font-semibold ring-1 ring-inset', u.active ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-slate-200 text-slate-700 ring-slate-300')}>
                        {u.active ? 'Active' : 'Deactivated'}
                      </span>
                    </td>
                    <td className="td">{formatDate(u.createdAt)}</td>
                    <td className="td sticky right-0 bg-white">
                      <div className="flex justify-end gap-1">
                        <button onClick={() => resend(u)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-navy-800" title="Resend password email" aria-label={`Resend invite to ${u.fullName}`}>
                          <Mail className="h-4 w-4" />
                        </button>
                        <button onClick={() => { setEditing(u); setFormOpen(true); }} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-navy-800" title="Edit" aria-label={`Edit ${u.fullName}`}>
                          <Pencil className="h-4 w-4" />
                        </button>
                        {u.uid !== user?.uid && (
                          <button
                            onClick={() => setToggling(u)}
                            className={clsx('rounded-lg p-2', u.active ? 'text-brand-red hover:bg-red-50' : 'text-emerald-600 hover:bg-emerald-50')}
                            title={u.active ? 'Deactivate' : 'Reactivate'}
                            aria-label={`${u.active ? 'Deactivate' : 'Reactivate'} ${u.fullName}`}
                          >
                            {u.active ? <Ban className="h-4 w-4" /> : <RotateCcw className="h-4 w-4" />}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </Card>

      <StaffFormModal
        open={formOpen}
        staff={editing}
        onClose={() => setFormOpen(false)}
        onSaved={(msg) => {
          toast(msg);
          void reload();
        }}
      />
      <ConfirmDialog
        open={!!toggling}
        onClose={() => setToggling(null)}
        title={toggling?.active ? 'Deactivate team member?' : 'Reactivate team member?'}
        tone={toggling?.active ? 'danger' : 'success'}
        confirmLabel={toggling?.active ? 'Deactivate' : 'Reactivate'}
        onConfirm={async () => {
          if (!toggling) return;
          await adminService.setStaffActive(toggling.uid, !toggling.active);
          toast(`${toggling.fullName} ${toggling.active ? 'deactivated' : 'reactivated'}`);
          void reload();
        }}
      >
        <p className="text-sm text-slate-600">
          {toggling?.active ? `${toggling?.fullName} will lose access immediately. Their past actions stay in the POD history.` : `${toggling?.fullName} will be able to log in again.`}
        </p>
      </ConfirmDialog>
    </div>
  );
}

function StaffFormModal({ open, staff, onClose, onSaved }: { open: boolean; staff: StaffUser | null; onClose: () => void; onSaved: (msg: string) => void }) {
  const [form, setForm] = useState({ fullName: '', email: '', role: 'CATEGORY' as StaffRole, categories: [] as Category[] });
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(staff ? { fullName: staff.fullName, email: staff.email, role: staff.role, categories: staff.categories } : { fullName: '', email: '', role: 'CATEGORY', categories: [] });
    setErrors({});
    setError(null);
  }, [open, staff]);

  const save = async () => {
    const e: Record<string, string> = {};
    if (!form.fullName.trim()) e.fullName = 'Name is required';
    if (!staff && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email.trim())) e.email = 'Enter a valid email address';
    if (form.role === 'CATEGORY' && form.categories.length === 0) e.categories = 'Select at least one category';
    setErrors(e);
    if (Object.keys(e).length) return;
    setSaving(true);
    setError(null);
    try {
      const payload = { fullName: form.fullName.trim(), role: form.role, categories: form.role === 'CATEGORY' ? form.categories : [] };
      if (staff) {
        await adminService.updateStaff(staff.uid, payload);
        onSaved(`${payload.fullName} updated`);
      } else {
        await adminService.createStaff({ ...payload, email: form.email.trim().toLowerCase() });
        onSaved(`${payload.fullName} added. A "set your password" email has been sent to ${form.email.trim()}.`);
      }
      onClose();
    } catch (err) {
      if (err instanceof AppError) {
        setError(err.message);
        setErrors(err.fields);
      } else setError('Could not save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={staff ? 'Edit Team Member' : 'Add Team Member'}
      description={staff ? staff.email : 'They will receive an email to set their own password.'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} loading={saving}>
            {staff ? 'Save Changes' : 'Add & Send Invite'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <Alert kind="error">{error}</Alert>}
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Full Name" required value={form.fullName} onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))} error={errors.fullName} maxLength={120} />
          <TextField label="Email" required type="email" value={form.email} disabled={!!staff} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} error={errors.email} hint={staff ? 'Email cannot be changed.' : 'Use their RCPL email.'} />
        </div>
        <Select label="Role" value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as StaffRole }))} options={ROLE_OPTIONS} hint={ROLE_HELP[form.role]} />
        {form.role === 'CATEGORY' && (
          <CategoryPicker required label="Categories this person handles" value={form.categories} onChange={(c) => setForm((f) => ({ ...f, categories: c }))} error={errors.categories} />
        )}
      </div>
    </Modal>
  );
}
