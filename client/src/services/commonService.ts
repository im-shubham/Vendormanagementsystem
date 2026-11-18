import { api } from './apiClient';
import type { AppNotification } from '@/types';

export const notificationService = {
  list: () => api.get<{ items: AppNotification[]; unread: number }>('/notifications'),
  markRead: (id: string) => api.post<void>(`/notifications/${id}/read`),
  markAllRead: () => api.post<void>('/notifications/read-all'),
};

export const documentService = {
  fetch: (id: string) => api.blob(`/documents/${id}/file`),
  async download(id: string, fileName: string) {
    const blob = await api.blob(`/documents/${id}/file?download=1`);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
};
