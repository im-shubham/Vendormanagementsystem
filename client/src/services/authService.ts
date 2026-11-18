import { api } from './apiClient';
import type { Session, User } from '@/types';

export const authService = {
  login: (identifier: string, password: string, portal: 'vendor' | 'admin') =>
    api.post<Session>('/auth/login', { identifier, password, portal }),
  activate: (data: { email: string; vendorCode: string; password: string; confirmPassword: string }) =>
    api.post<{ status: string; message: string }>('/auth/activate', data),
  forgotPassword: (email: string) => api.post<{ message: string }>('/auth/forgot-password', { email }),
  resetPassword: (token: string, password: string, confirmPassword: string) =>
    api.post<{ message: string }>('/auth/reset-password', { token, password, confirmPassword }),
  me: () => api.get<{ user: User }>('/auth/me'),
  logout: () => api.post<void>('/auth/logout'),
};
