import { useEffect, useState, type FormEvent } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { TextArea, TextField } from '@/components/ui/Field';
import { Alert } from '@/components/ui/Feedback';
import { adminService } from '@/services/adminService';
import { AppError } from '@/lib/errors';
import type { Vendor, VendorInput } from '@/types';
import { CategoryPicker } from '@/components/ui/CategoryChips';

const empty: VendorInput = { vendorName: '', vendorCode: '', email: '', contactPerson: '', mobileNumber: '', address: '', categories: [] };

function validate(v: VendorInput) {
  const e: Partial<Record<keyof VendorInput, string>> = {};
  if (!v.vendorName.trim()) e.vendorName = 'Vendor name is required';
  if (!/^[A-Za-z0-9_-]{2,30}$/.test(v.vendorCode.trim())) e.vendorCode = '2–30 letters, numbers, - or _';
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.email.trim())) e.email = 'Enter a valid email address';
  if (!v.contactPerson.trim()) e.contactPerson = 'Contact person is required';
  if (!/^\+?[0-9][0-9\s-]{8,16}$/.test(v.mobileNumber.trim())) e.mobileNumber = 'Enter a valid mobile number';
  if (!v.address.trim()) e.address = 'Address is required';
  if (!v.categories.length) e.categories = 'Select at least one category';
  return e;
}

export function VendorFormModal({ open, onClose, vendor, onSaved }: { open: boolean; onClose: () => void; vendor?: Vendor | null; onSaved: (v: VendorInput) => void }) {
  const [form, setForm] = useState<VendorInput>(empty);
  const [errors, setErrors] = useState<Partial<Record<keyof VendorInput, string>>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const emailLocked = !!vendor && vendor.accountStatus !== 'NOT_REGISTERED';

  useEffect(() => {
    if (!open) return;
    setForm(
      vendor
        ? {
            vendorName: vendor.vendorName,
            vendorCode: vendor.vendorCode,
            email: vendor.email,
            contactPerson: vendor.contactPerson ?? '',
            mobileNumber: vendor.mobileNumber ?? '',
            address: vendor.address ?? '',
            categories: vendor.categories ?? [],
          }
        : empty,
    );
    setErrors({});
    setError(null);
  }, [open, vendor]);

  const set = (k: Exclude<keyof VendorInput, 'categories'>) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    const errs = validate(form);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    setError(null);
    const payload: VendorInput = {
      vendorName: form.vendorName.trim(),
      vendorCode: form.vendorCode.trim(),
      email: form.email.trim(),
      contactPerson: form.contactPerson.trim(),
      mobileNumber: form.mobileNumber.trim(),
      address: form.address.trim(),
      categories: form.categories,
    };
    try {
      if (vendor) await adminService.updateVendor(vendor.id, payload);
      else await adminService.createVendor(payload);
      onSaved({ ...payload, vendorCode: payload.vendorCode.toUpperCase() });
      onClose();
    } catch (err) {
      if (err instanceof AppError) {
        setError(err.message);
        setErrors(err.fields as typeof errors);
      } else setError('Could not save the vendor. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={vendor ? 'Edit Vendor' : 'Add Vendor'}
      description={vendor ? `${vendor.vendorName} · ${vendor.vendorCode}` : 'The vendor will use the registered email and vendor code to create their password.'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => submit()} loading={saving}>
            {vendor ? 'Save Changes' : 'Create Vendor'}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} noValidate className="space-y-4">
        {error && <Alert kind="error">{error}</Alert>}
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Vendor Name" required value={form.vendorName} onChange={set('vendorName')} error={errors.vendorName} maxLength={200} />
          <TextField label="Vendor Code" required value={form.vendorCode} onChange={set('vendorCode')} error={errors.vendorCode} placeholder="e.g. V1005" className="uppercase" maxLength={30} />
          <TextField
            label="Registered Email"
            required
            type="email"
            value={form.email}
            onChange={set('email')}
            error={errors.email}
            disabled={emailLocked}
            hint={emailLocked ? 'Locked — the vendor has already activated their login with this email.' : undefined}
          />
          <TextField label="Contact Person" required value={form.contactPerson} onChange={set('contactPerson')} error={errors.contactPerson} maxLength={120} />
          <TextField label="Mobile Number" required type="tel" value={form.mobileNumber} onChange={set('mobileNumber')} error={errors.mobileNumber} placeholder="+91 98XXX XXXXX" />
        </div>
        <TextArea label="Company Address" required rows={3} value={form.address} onChange={set('address')} error={errors.address} maxLength={500} />
        <CategoryPicker required label="Categories supplied" value={form.categories} onChange={(c) => setForm((f) => ({ ...f, categories: c }))} error={errors.categories} />
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
}
