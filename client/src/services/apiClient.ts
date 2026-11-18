import type { Session } from '@/types';

const API_BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '') + '/api';
const STORAGE_KEY = 'rcpl.pod.session';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    public details?: { fields?: Record<string, string>; [k: string]: unknown },
  ) {
    super(message);
  }
  get fields() {
    return this.details?.fields ?? {};
  }
}

// ---- Session storage --------------------------------------------------
export const sessionStore = {
  get(): Session | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as Session) : null;
    } catch {
      return null;
    }
  },
  set(s: Session | null) {
    try {
      if (s) localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* storage unavailable */
    }
    window.dispatchEvent(new CustomEvent('rcpl:session', { detail: s }));
  },
};

let refreshing: Promise<boolean> | null = null;

async function refreshSession(): Promise<boolean> {
  const current = sessionStore.get();
  if (!current?.refreshToken) return false;
  refreshing ??= (async () => {
    try {
      const res = await fetch(`${API_BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: current.refreshToken }),
      });
      if (!res.ok) return false;
      sessionStore.set((await res.json()) as Session);
      return true;
    } catch {
      return false;
    } finally {
      setTimeout(() => (refreshing = null), 0);
    }
  })();
  return refreshing;
}

async function toError(res: Response): Promise<ApiError> {
  let body: any = null;
  try {
    body = await res.json();
  } catch {
    /* non-JSON */
  }
  const e = body?.error;
  return new ApiError(res.status, e?.message ?? `Request failed (${res.status})`, e?.code, e?.details);
}

type Query = Record<string, string | number | undefined | null>;

export function buildQuery(q?: Query) {
  if (!q) return '';
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
}

async function raw(path: string, init: RequestInit = {}, retry = true): Promise<Response> {
  const session = sessionStore.get();
  const headers = new Headers(init.headers);
  if (session) headers.set('Authorization', `Bearer ${session.accessToken}`);
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  } catch {
    throw new ApiError(0, 'Unable to reach the server. Please check your connection and try again.', 'NETWORK');
  }
  if (res.status === 401 && session && retry && !path.startsWith('/auth/login')) {
    if (await refreshSession()) return raw(path, init, false);
    sessionStore.set(null);
  }
  // Account deactivated / no longer approved while logged in → drop the session
  if (res.status === 403 && session?.user.role === 'VENDOR') {
    const clone = res.clone();
    const body = await clone.json().catch(() => null);
    if (/^ACCOUNT_/.test(body?.error?.code ?? '')) {
      sessionStore.set(null);
      window.dispatchEvent(new CustomEvent('rcpl:account-blocked', { detail: body.error }));
    }
  }
  return res;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await raw(path, init);
  if (!res.ok) throw await toError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string, query?: Query) => request<T>(path + buildQuery(query)),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}) }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}) }),
  upload: <T>(path: string, form: FormData) => request<T>(path, { method: 'POST', body: form }),
  /** Authenticated binary download (documents are never public URLs). */
  blob: async (path: string) => {
    const res = await raw(path);
    if (!res.ok) throw await toError(res);
    return res.blob();
  },
};
