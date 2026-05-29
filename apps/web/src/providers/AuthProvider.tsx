'use client';

import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@masarat/firebase';
import { apiFetch } from '@/lib/api-client';

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const syncedUidRef = useRef<string | null>(null);

  const isAuthPage = pathname?.includes('/login')
                  || pathname?.includes('/register')
                  || pathname?.includes('/reset-password')
                  || pathname?.includes('/action');   // /auth/action (password reset) and /action (email verify)

  // /admin handles its own auth + 403 logic — don't redirect away from it
  const isStandalonePage = pathname?.includes('/admin');

  // Sync Firebase Auth user to Postgres on first login (and on token refresh)
  useEffect(() => {
    if (!user || syncedUidRef.current === user.uid) return;
    syncedUidRef.current = user.uid;
    apiFetch('/api/auth/sync', { method: 'POST' }).catch(() => {
      // Non-fatal — sync will retry on next page load
    });
  }, [user]);

  useEffect(() => {
    if (loading) return;

    if (!user && !isAuthPage && !isStandalonePage) {
      // Extract locale from pathname (e.g., /ar/dashboard → ar)
      const locale = pathname?.split('/')[1] ?? 'ar';
      router.push(`/${locale}/login`);
    }

    if (user && isAuthPage) {
      const locale = pathname?.split('/')[1] ?? 'ar';
      router.push(`/${locale}/dashboard`);
    }
  }, [user, loading, isAuthPage, isStandalonePage, pathname, router]);

  // Block render while auth state is resolving — prevents dashboard flash
  if (loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-white z-50">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-brand-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-slate-500 font-medium">جارٍ التحقق من الهوية...</p>
        </div>
      </div>
    );
  }

  // Unauthenticated on protected route: render nothing while redirect fires
  if (!user && !isAuthPage && !isStandalonePage) {
    return null;
  }

  return <>{children}</>;
}
