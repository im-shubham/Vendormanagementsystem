import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut, type User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { AppError, toAppError } from '@/lib/errors';
import type { Category, Role, User, VendorAccountStatus } from '@/types';

interface AuthState {
  user: User | null;
  loading: boolean;
  /** portal 'admin' = RCPL staff portal (Admin, Category team, Billing team) */
  login: (email: string, password: string, portal: 'vendor' | 'admin') => Promise<User>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

const STATUS_ERRORS: Partial<Record<VendorAccountStatus, { code: string; message: string }>> = {
  PENDING_APPROVAL: { code: 'ACCOUNT_PENDING', message: 'Your account is awaiting administrator approval.' },
  REJECTED: { code: 'ACCOUNT_REJECTED', message: 'Your registration request was not approved.' },
  DEACTIVATED: { code: 'ACCOUNT_DEACTIVATED', message: 'Your vendor account has been deactivated.' },
  NOT_REGISTERED: { code: 'ACCOUNT_PENDING', message: 'Your account is awaiting administrator approval.' },
};

/**
 * Role + vendorId come from the server-set custom claims in the ID token.
 * The vendor's approval status is read live from its vendor record, so
 * approval / deactivation take effect in the UI immediately. (Security does
 * not depend on this — rules and Cloud Functions enforce it independently.)
 */
async function resolveBase(fu: FirebaseUser) {
  const token = await fu.getIdTokenResult();
  const role = token.claims.role as Role | undefined;
  const vendorId = (token.claims.vendorId as string | undefined) ?? null;
  return { role, vendorId };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let unsubVendor: (() => void) | null = null;
    const unsub = onAuthStateChanged(auth, async (fu) => {
      unsubVendor?.();
      unsubVendor = null;
      if (!fu) {
        setUser(null);
        setLoading(false);
        return;
      }
      try {
        const { role, vendorId } = await resolveBase(fu);
        if (role === 'ADMIN' || role === 'CATEGORY' || role === 'BILLING') {
          // Live profile: category changes / deactivation apply immediately.
          unsubVendor = onSnapshot(
            doc(db, 'userProfiles', fu.uid),
            (snap) => {
              if (!snap.exists() || snap.get('active') === false || snap.get('role') !== role) {
                void signOut(auth);
                return;
              }
              setUser({
                uid: fu.uid,
                role,
                email: fu.email ?? '',
                fullName: snap.get('fullName') ?? fu.displayName,
                categories: (snap.get('categories') as Category[]) ?? [],
                vendor: null,
              });
              setLoading(false);
            },
            () => {
              setUser(null);
              setLoading(false);
            },
          );
        } else if (role === 'VENDOR' && vendorId) {
          unsubVendor = onSnapshot(
            doc(db, 'vendors', vendorId),
            (snap) => {
              const v = snap.data() ?? {};
              setUser({
                uid: fu.uid,
                role: 'VENDOR',
                email: fu.email ?? '',
                fullName: v.vendorName ?? fu.displayName,
                categories: [],
                vendor: { id: vendorId, name: v.vendorName ?? '', code: v.vendorCode ?? '', status: v.accountStatus ?? 'PENDING_APPROVAL', categories: v.categories ?? [] },
              });
              setLoading(false);
            },
            () => {
              setUser(null);
              setLoading(false);
            },
          );
        } else {
          // Signed in but no portal role (e.g. self-created account) → no access.
          await signOut(auth);
        }
      } catch {
        setUser(null);
        setLoading(false);
      }
    });
    return () => {
      unsub();
      unsubVendor?.();
    };
  }, []);

  const login = useCallback(async (email: string, password: string, portal: 'vendor' | 'admin'): Promise<User> => {
    let cred;
    try {
      cred = await signInWithEmailAndPassword(auth, email.trim().toLowerCase(), password);
    } catch (e) {
      throw toAppError(e, 'Login failed. Please try again.');
    }
    const fu = cred.user;
    const fail = async (err: AppError): Promise<never> => {
      await signOut(auth);
      throw err;
    };
    const { role, vendorId } = await resolveBase(fu);
    if (!role) return fail(new AppError('No portal profile is linked to this login. Please contact the administrator.', 'NO_PROFILE'));
    if (portal === 'admin' && role === 'VENDOR') return fail(new AppError('Vendors must sign in through the Vendor Portal.', 'WRONG_PORTAL'));
    if (portal === 'vendor' && role !== 'VENDOR') return fail(new AppError('RCPL staff must sign in through the Staff Portal.', 'WRONG_PORTAL'));

    if (role === 'VENDOR') {
      const v = await getDoc(doc(db, 'vendors', vendorId!));
      const status = v.get('accountStatus') as VendorAccountStatus;
      if (status !== 'ACTIVE') {
        const s = STATUS_ERRORS[status] ?? STATUS_ERRORS.PENDING_APPROVAL!;
        return fail(new AppError(s.message, s.code, { vendorName: v.get('vendorName'), vendorCode: v.get('vendorCode') }));
      }
      return {
        uid: fu.uid, role, email: fu.email ?? '', fullName: v.get('vendorName'), categories: [],
        vendor: { id: vendorId!, name: v.get('vendorName'), code: v.get('vendorCode'), status, categories: v.get('categories') ?? [] },
      };
    }
    const profile = await getDoc(doc(db, 'userProfiles', fu.uid));
    if (!profile.exists() || profile.get('active') === false) {
      return fail(new AppError('Your staff account is inactive. Please contact the administrator.', 'ACCOUNT_DEACTIVATED'));
    }
    return { uid: fu.uid, role, email: fu.email ?? '', fullName: profile.get('fullName') ?? fu.displayName, categories: profile.get('categories') ?? [], vendor: null };
  }, []);

  const logout = useCallback(async () => {
    await signOut(auth);
  }, []);

  const value = useMemo(() => ({ user, loading, login, logout }), [user, loading, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
