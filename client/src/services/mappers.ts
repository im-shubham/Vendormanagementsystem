import type { DocumentData, DocumentSnapshot, QueryDocumentSnapshot } from 'firebase/firestore';
import { iso } from '@/lib/firestore';
import type { AppNotification, PodDocument, RegistrationRequest, StaffUser, StatusHistoryEntry, Submission, Vendor } from '@/types';

type Snap = QueryDocumentSnapshot<DocumentData> | DocumentSnapshot<DocumentData>;
const d = (s: Snap) => s.data() ?? {};

export const toSubmission = (s: Snap): Submission => {
  const x = d(s);
  return {
    id: s.id,
    submissionNumber: x.submissionNumber,
    vendorId: x.vendorId,
    vendorName: x.vendorName,
    vendorCode: x.vendorCode,
    category: x.category,
    poNumber: x.poNumber,
    invoiceNumber: x.invoiceNumber,
    deliveryDate: x.deliveryDate,
    deliveryReference: x.deliveryReference ?? null,
    submittedAt: iso(x.submittedAt) ?? new Date().toISOString(),
    status: x.currentStatus,
    currentVersion: x.currentVersion ?? 1,
    lastRemarks: x.lastRemarks ?? null,
    uploadedByName: x.uploadedByName ?? null,
    uploadedByRole: x.uploadedByRole ?? null,
    lastActionByName: x.lastActionByName ?? null,
    lastActionByRole: x.lastActionByRole ?? null,
    lastActionAt: iso(x.lastActionAt),
    forwardedAt: iso(x.forwardedAt),
    billedAt: iso(x.billedAt),
    updatedAt: iso(x.updatedAt) ?? '',
  };
};

export const toDocument = (s: Snap): PodDocument => {
  const x = d(s);
  return {
    id: s.id,
    documentType: x.documentType,
    fileName: x.fileName,
    storagePath: x.storagePath,
    fileType: x.contentType,
    fileSize: x.size,
    versionNumber: x.versionNumber,
    uploadedAt: iso(x.uploadedAt) ?? '',
  };
};

export const toHistory = (s: Snap): StatusHistoryEntry => {
  const x = d(s);
  return {
    id: s.id,
    previousStatus: x.previousStatus ?? null,
    newStatus: x.newStatus,
    remarks: x.remarks ?? null,
    versionNumber: x.versionNumber ?? null,
    updatedAt: iso(x.updatedAt) ?? '',
    updatedByName: x.updatedByName ?? null,
    updatedByRole: x.updatedByRole ?? null,
  };
};

export const toVendor = (s: Snap): Vendor => {
  const x = d(s);
  return {
    id: s.id,
    vendorCode: x.vendorCode,
    vendorName: x.vendorName,
    email: x.email,
    contactPerson: x.contactPerson ?? null,
    mobileNumber: x.mobileNumber ?? null,
    address: x.address ?? null,
    accountStatus: x.accountStatus,
    categories: x.categories ?? [],
    registeredAt: iso(x.registeredAt),
    createdAt: iso(x.createdAt) ?? '',
    updatedAt: iso(x.updatedAt) ?? '',
  };
};

export const toRegistration = (s: Snap): RegistrationRequest => {
  const x = d(s);
  return {
    id: s.id,
    vendorId: x.vendorId,
    requestedAt: iso(x.requestedAt) ?? '',
    approvalStatus: x.approvalStatus,
    reviewedAt: iso(x.reviewedAt),
    reviewerName: x.reviewedByName ?? null,
    remarks: x.remarks ?? null,
    vendor: {
      vendorName: x.vendorName,
      vendorCode: x.vendorCode,
      email: x.email,
      contactPerson: x.contactPerson ?? null,
      mobileNumber: x.mobileNumber ?? null,
      accountStatus: x.accountStatus,
    },
  };
};

export const toStaff = (s: Snap): StaffUser => {
  const x = d(s);
  return {
    uid: s.id,
    role: x.role,
    fullName: x.fullName ?? x.email,
    email: x.email,
    categories: x.categories ?? [],
    active: x.active !== false,
    createdAt: iso(x.createdAt) ?? '',
  };
};

export const toNotification = (s: Snap): AppNotification => {
  const x = d(s);
  return { id: s.id, title: x.title, message: x.message, link: x.link ?? null, isRead: !!x.isRead, createdAt: iso(x.createdAt) ?? new Date().toISOString() };
};

export const byNewest = <T extends { [k: string]: unknown }>(key: keyof T) => (a: T, b: T) => String(b[key]).localeCompare(String(a[key]));
