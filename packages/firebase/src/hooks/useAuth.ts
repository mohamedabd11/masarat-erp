/**
 * @masarat/firebase — useAuth Hook
 * إدارة حالة المصادقة مع Firebase Auth + Custom Claims
 */

import { useState, useEffect } from 'react';
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  type User,
} from 'firebase/auth';
import { getApp } from '../config';

export interface MasaratClaims {
  agencyId: string;
  role: string;
  enabledModules: string[];
  subscriptionPlan: 'free' | 'starter' | 'professional' | 'enterprise';
  subscriptionStatus: 'active' | 'suspended' | 'trial';
  // صلاحيات محسوبة
  [key: `perm_${string}`]: unknown;
}

export interface AuthUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  agencyId: string;
  claims: MasaratClaims;
}

export interface UseAuthReturn {
  user: AuthUser | null;
  loading: boolean;
  error: string | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  hasPermission: (resource: string, action: string) => boolean;
  isModuleEnabled: (moduleId: string) => boolean;
}

export function useAuth(): UseAuthReturn {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const auth = getAuth(getApp());

    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        setUser(null);
        setLoading(false);
        return;
      }

      try {
        // جلب الـ Custom Claims من الـ token
        let token = await firebaseUser.getIdTokenResult();
        let claims = token.claims as unknown as MasaratClaims;

        // If agencyId is missing (e.g. freshly-set custom claims not yet in cached token),
        // force-refresh once so the latest claims are included.
        if (!claims.agencyId) {
          token  = await firebaseUser.getIdTokenResult(true);
          claims = token.claims as unknown as MasaratClaims;
        }

        setUser({
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          displayName: firebaseUser.displayName,
          agencyId: claims.agencyId ?? '',
          claims,
        });
      } catch {
        setError('فشل تحميل صلاحيات المستخدم');
      } finally {
        setLoading(false);
      }
    });

    return () => unsub();
  }, []);

  async function signIn(email: string, password: string): Promise<void> {
    setError(null);
    try {
      const auth = getAuth(getApp());
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err: unknown) {
      const msg = (err as { code?: string })?.code;
      if (msg === 'auth/invalid-credential') {
        setError('البريد الإلكتروني أو كلمة المرور غير صحيحة');
      } else if (msg === 'auth/too-many-requests') {
        setError('تم تجاوز عدد المحاولات المسموحة. حاول لاحقاً.');
      } else {
        setError('حدث خطأ أثناء تسجيل الدخول');
      }
      throw err;
    }
  }

  async function signOut(): Promise<void> {
    const auth = getAuth(getApp());
    await firebaseSignOut(auth);
    setUser(null);
  }

  function hasPermission(resource: string, action: string): boolean {
    if (!user) return false;
    const key = `perm_${resource}_${action}` as const;
    const value = user.claims[key];
    // 'all' | 'own_team' | 'own' | true → مسموح
    return value === true || value === 'all' || value === 'own_team' || value === 'own';
  }

  function isModuleEnabled(moduleId: string): boolean {
    if (!user) return false;
    return user.claims.enabledModules?.includes(moduleId) ?? false;
  }

  return { user, loading, error, signIn, signOut, hasPermission, isModuleEnabled };
}
