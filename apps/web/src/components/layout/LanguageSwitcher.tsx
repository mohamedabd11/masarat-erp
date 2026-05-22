'use client';

import { useRouter, usePathname } from 'next/navigation';
import { useLocale } from 'next-intl';
import { cn } from '@/lib/utils';

export function LanguageSwitcher({ className }: { className?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const locale = useLocale();

  function switchLocale(newLocale: string) {
    // Replace current locale prefix with new locale
    const segments = pathname.split('/');
    segments[1] = newLocale;
    router.push(segments.join('/'));
  }

  return (
    <div className={cn('flex items-center rounded-lg bg-slate-100 p-1', className)}>
      <button
        onClick={() => switchLocale('ar')}
        className={cn(
          'px-3 py-1 rounded-md text-sm font-medium transition-colors duration-150',
          locale === 'ar'
            ? 'bg-white text-slate-900 shadow-sm'
            : 'text-slate-500 hover:text-slate-700'
        )}
      >
        العربية
      </button>
      <button
        onClick={() => switchLocale('en')}
        className={cn(
          'px-3 py-1 rounded-md text-sm font-medium transition-colors duration-150',
          locale === 'en'
            ? 'bg-white text-slate-900 shadow-sm'
            : 'text-slate-500 hover:text-slate-700'
        )}
      >
        English
      </button>
    </div>
  );
}
