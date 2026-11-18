export type Role = 'ADMIN' | 'VENDOR';
export type VendorAccountStatus = 'NOT_REGISTERED' | 'PENDING_APPROVAL' | 'ACTIVE' | 'REJECTED' | 'DEACTIVATED';
export type PodStatus = 'PENDING' | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED';
export type RegistrationStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface User {
  uid: string;
  role: Role;
  email: string;
  fullName: string | null;
  vendor: { id: string; name: string; code: string; status: VendorAccountStatus } | null;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface PodStats {
  total: number;
  PENDING: number;
  UNDER_REVIEW: number;
  APPROVED: number;
  REJECTED: number;
}

export interface Submission {
  id: string;
  submissionNumber: string;
  vendorId: string;
  vendorName?: string;
  vendorCode?: string;
  poNumber: string;
  invoiceNumber: string;
  deliveryDate: string;
  deliveryReference: string | null;
  submittedAt: string;
  status: PodStatus;
  currentVersion: number;
  adminRemarks: string | null;
  reviewedAt: string | null;
  reviewerName: string | null;
  updatedAt: string;
}

export interface PodDocument {
  id: string;
  documentType: 'POD' | 'SUPPORTING_PHOTO';
  fileName: string;
  storagePath: string;
  fileType: string;
  fileSize: number;
  versionNumber: number;
  uploadedAt: string;
}

export interface StatusHistoryEntry {
  id: string;
  previousStatus: PodStatus | null;
  newStatus: PodStatus;
  remarks: string | null;
  versionNumber: number | null;
  updatedAt: string;
  updatedByName: string | null;
  updatedByRole: Role | null;
}

export interface SubmissionDetail {
  submission: Submission;
  vendor: { name: string; code: string; email: string; contactPerson: string | null; mobileNumber: string | null };
  documents: PodDocument[];
  history: StatusHistoryEntry[];
}

export interface Vendor {
  id: string;
  vendorCode: string;
  vendorName: string;
  email: string;
  contactPerson: string | null;
  mobileNumber: string | null;
  address: string | null;
  accountStatus: VendorAccountStatus;
  registeredAt: string | null;
  createdAt: string;
  updatedAt: string;
  submissionCount?: number;
}

export type VendorInput = Pick<Vendor, 'vendorCode' | 'vendorName' | 'email'> & {
  contactPerson: string;
  mobileNumber: string;
  address: string;
};

export interface RegistrationRequest {
  id: string;
  vendorId: string;
  requestedAt: string;
  approvalStatus: RegistrationStatus;
  reviewedAt: string | null;
  reviewerName: string | null;
  remarks: string | null;
  vendor?: {
    vendorName: string;
    vendorCode: string;
    email: string;
    contactPerson: string | null;
    mobileNumber: string | null;
    accountStatus: VendorAccountStatus;
  };
}

export interface VendorDetail {
  vendor: Vendor;
  stats: PodStats;
  registrations: RegistrationRequest[];
  recentSubmissions: Array<Pick<Submission, 'id' | 'submissionNumber' | 'poNumber' | 'invoiceNumber' | 'deliveryDate' | 'submittedAt' | 'status'>>;
}

export interface AdminDashboard {
  vendors: { total: number; active: number; pendingApproval: number; notRegistered: number; deactivated: number };
  pods: PodStats;
  recentSubmissions: Submission[];
  pendingRegistrations: Array<{ id: string; requestedAt: string; vendorId: string; vendorName: string; vendorCode: string; email: string }>;
}

export interface VendorDashboard {
  stats: PodStats;
  recentSubmissions: Submission[];
}

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  link: string | null;
  isRead: boolean;
  createdAt: string;
}

export interface ListParams {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: string;
  from?: string;
  to?: string;
  po?: string;
  vendorId?: string;
}
