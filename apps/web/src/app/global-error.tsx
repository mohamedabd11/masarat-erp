'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { captureAppError } from '@/lib/error-reporting';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const pathname = usePathname();
  const isAr = !pathname?.startsWith('/en');

  useEffect(() => {
    captureAppError(error);
  }, [error]);

  return (
    <html lang={isAr ? 'ar' : 'en'} dir={isAr ? 'rtl' : 'ltr'}>
      <body style={{ margin: 0, background: '#f8fafc', color: '#0f172a', fontFamily: 'sans-serif' }}>
        <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: '24px' }}>
          <section style={{ width: '100%', maxWidth: '420px', textAlign: 'center' }}>
            <div aria-hidden="true" style={{ fontSize: '40px', marginBottom: '16px' }}>⚠️</div>
            <h1 style={{ fontSize: '22px', margin: '0 0 8px' }}>
              {isAr ? 'تعذّر تحميل الصفحة' : 'The page could not be loaded'}
            </h1>
            <p style={{ color: '#475569', lineHeight: 1.7, margin: '0 0 24px' }}>
              {isAr
                ? 'أعد المحاولة، وإذا استمرت المشكلة فتواصل مع مسؤول النظام.'
                : 'Try again. If the issue continues, contact your system administrator.'}
            </p>
            {error.digest ? (
              <p style={{ color: '#64748b', fontSize: '12px', margin: '0 0 16px' }}>
                {isAr ? 'رمز الخطأ' : 'Error code'}: {error.digest}
              </p>
            ) : null}
            <button
              type="button"
              onClick={reset}
              style={{
                border: 0,
                borderRadius: '10px',
                background: '#0f766e',
                color: '#fff',
                cursor: 'pointer',
                fontSize: '15px',
                fontWeight: 700,
                padding: '11px 22px',
              }}
            >
              {isAr ? 'إعادة المحاولة' : 'Try again'}
            </button>
          </section>
        </main>
      </body>
    </html>
  );
}
