import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { sessionStore } from '@/services/apiClient';
import { authService } from '@/services/authService';
import type { Session, User } from '@/types';

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (identifier: string, password: string, portal: 'vendor' | 'admin') => Promise<User>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(() => sessionStore.get());
  const [loading, setLoading] = useState(true);

  // Keep React state in sync with token refreshes / forced logouts
  useEffect(() => {
    const onChange = (e: Event) => setSession((e as CustomEvent<Session | null>).detail);
    window.addEventListener('rcpl:session', onChange);
    return () => window.removeEventListener('rcpl:session', onChange);
  }, []);

  // Validate the stored session on first load (also re-checks vendor approval)
  useEffect(() => {
    const current = sessionStore.get();
    if (!current) {
      setLoading(false);
      return;
    }
    authService
      .me()
      .then(({ user }) => {
        const latest = sessionStore.get();
        if (latest) sessionStore.set({ ...latest, user });
      })
      .catch(() => sessionStore.set(null))
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (identifier: string, password: string, portal: 'vendor' | 'admin') => {
    const s = await authService.login(identifier, password, portal);
    sessionStore.set(s);
    return s.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await authService.logout();
    } catch {
      /* ignore */
    }
    sessionStore.set(null);
  }, []);

  const value = useMemo(() => ({ user: session?.user ?? null, loading, login, logout }), [session, loading, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
