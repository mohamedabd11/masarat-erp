'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@masarat/firebase';

interface AuthProviderProps {
  children: React.ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const isAuthPage = pathname?.includes('/login') || pathname?.includes('/reset-password');

  useEffect(() => {
    if (loading) return;

    if (!user && !isAuthPage) {
      // Extract locale from pathname (e.g., /ar/dashboard → ar)
      const locale = pathname?.split('/')[1] ?? 'ar';
      router.push(`/${locale}/login`);
    }

    if (user && isAuthPage) {
      const locale = pathname?.split('/')[1] ?? 'ar';
      router.push(`/${locale}/dashboard`);
    }
  }, [user, loading, isAuthPage, pathname, router]);

  return <>{children}</>;
}
