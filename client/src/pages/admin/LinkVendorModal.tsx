import { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/Field';
import { Alert } from '@/components/ui/Feedback';
import { CategoryPicker } from '@/components/ui/CategoryChips';
import { useAuth } from '@/context/AuthContext';
import { adminService } from '@/services/adminService';
import { AppError } from '@/lib/errors';
import type { Category } from '@/types';

/**
 * Category team: the vendor is already registered by another team — add your
 * category to it. Vendor code AND registered email must both match.
 */
export function LinkVendorModal({ open, onClose, onLinked }: { open: boolean; onClose: () => void; onLinked: (vendorName: string) => void }) {
  const { user } = useAuth();
  const mine = user?.categories ?? [];
  const [code, setCode] = useState('');
  const [email, setEmail] = useState('');
  const [categories, setCategories] = useState<Category[]>([]);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCode('');
    setEmail('');
    setCategories(mine.length === 1 ? [...mine] : []);
    setErrors({});
    setError(null);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    const e: Record<string, string> = {};
    if (!/^[A-Za-z0-9_-]{2,30}$/.test(code.trim())) e.vendorCode = 'Enter the vendor code';
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) e.email = 'Enter the vendor’s registered email';
    if (!categories.length) e.categories = 'Select at least one of your categories';
    setErrors(e);
    if (Object.keys(e).length) return;
    setSaving(true);
    setError(null);
    try {
      const r = await adminService.linkVendor(code.trim().toUpperCase(), email.trim().toLowerCase(), categories);
      onLinked(r.vendorName);
      onClose();
    } catch (err) {
      setError(err instanceof AppError ? err.message : 'Could not add the vendor.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add Existing Vendor"
      description="The vendor is already registered (e.g. by another category team). Enter its vendor code and registered email to add your category."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} loading={saving}>
            Add to My Category
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && <Alert kind="error">{error}</Alert>}
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Vendor Code" required value={code} onChange={(e) => setCode(e.target.value)} error={errors.vendorCode} className="uppercase" placeholder="e.g. V1001" />
          <TextField label="Registered Email" required type="email" value={email} onChange={(e) => setEmail(e.target.value)} error={errors.email} />
        </div>
        <CategoryPicker required label="Your categories this vendor supplies" options={mine} value={categories} onChange={setCategories} error={errors.categories} />
      </div>
    </Modal>
  );
}
