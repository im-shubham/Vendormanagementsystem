import { api } from './apiClient';
import type { ListParams, Paginated, Submission, SubmissionDetail, VendorDashboard } from '@/types';

export const vendorService = {
  dashboard: () => api.get<VendorDashboard>('/vendor/dashboard'),
  listSubmissions: (params: ListParams) => api.get<Paginated<Submission>>('/vendor/submissions', { ...params }),
  getSubmission: (id: string) => api.get<SubmissionDetail>(`/vendor/submissions/${id}`),
  createSubmission: (form: FormData) => api.upload<{ submission: Submission; message: string }>('/vendor/submissions', form),
  reupload: (id: string, form: FormData) =>
    api.upload<{ submission: Submission; message: string }>(`/vendor/submissions/${id}/reupload`, form),
};
