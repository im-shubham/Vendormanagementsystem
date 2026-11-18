import { api } from './apiClient';
import type {
  AdminDashboard, ListParams, Paginated, RegistrationRequest, Submission, SubmissionDetail, Vendor, VendorDetail, VendorInput,
} from '@/types';

export const adminService = {
  dashboard: () => api.get<AdminDashboard>('/admin/dashboard'),

  listVendors: (params: ListParams) => api.get<Paginated<Vendor>>('/admin/vendors', { ...params }),
  getVendor: (id: string) => api.get<VendorDetail>(`/admin/vendors/${id}`),
  createVendor: (data: VendorInput) => api.post<{ vendor: Vendor }>('/admin/vendors', data),
  updateVendor: (id: string, data: VendorInput) => api.put<{ vendor: Vendor }>(`/admin/vendors/${id}`, data),
  deactivateVendor: (id: string) => api.post<{ vendor: Vendor }>(`/admin/vendors/${id}/deactivate`),
  reactivateVendor: (id: string) => api.post<{ vendor: Vendor }>(`/admin/vendors/${id}/reactivate`),

  listRegistrations: (params: ListParams) => api.get<Paginated<RegistrationRequest>>('/admin/registrations', { ...params }),
  approveRegistration: (id: string) => api.post<{ vendor: Vendor }>(`/admin/registrations/${id}/approve`),
  rejectRegistration: (id: string, remarks: string) => api.post<{ vendor: Vendor }>(`/admin/registrations/${id}/reject`, { remarks }),

  listSubmissions: (params: ListParams) => api.get<Paginated<Submission>>('/admin/submissions', { ...params }),
  getSubmission: (id: string) => api.get<SubmissionDetail>(`/admin/submissions/${id}`),
  approveSubmission: (id: string, remarks?: string) => api.post<{ submission: Submission }>(`/admin/submissions/${id}/approve`, { remarks }),
  rejectSubmission: (id: string, remarks: string) => api.post<{ submission: Submission }>(`/admin/submissions/${id}/reject`, { remarks }),
};
