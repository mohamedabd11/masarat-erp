'use client';

import { useLocale } from 'next-intl';
import Link from 'next/link';

export default function NotFound() {
  const locale = useLocale();
  const isAr = locale === 'ar';

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-muted">
      <div className="text-center max-w-md px-6">
        <div className="text-8xl font-bold text-brand-200 mb-4">404</div>
        <h1 className="text-2xl font-bold text-slate-900 mb-2">
          {isAr ? 'الصفحة غير موجودة' : 'Page Not Found'}
        </h1>
        <p className="text-sm text-slate-400 mb-8">
          {isAr ? 'الصفحة التي تبحث عنها غير موجودة أو تم نقلها.' : 'The page you are looking for does not exist or has moved.'}
        </p>
        <div className="flex justify-center">
          <Link
            href={`/${locale}/dashboard`}
            className="inline-flex items-center justify-center px-6 py-2.5 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 transition-colors"
          >
            {isAr ? 'العودة إلى لوحة التحكم' : 'Go to Dashboard'}
          </Link>
        </div>
      </div>
    </div>
  );
}
