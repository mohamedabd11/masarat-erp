'use client';

import { useEffect } from 'react';
import { useLocale } from 'next-intl';
import { Button } from '@/components/ui/Button';
import { captureAppError } from '@/lib/error-reporting';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const isAr = useLocale() === 'ar';

  useEffect(() => {
    captureAppError(error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-muted">
      <div className="text-center max-w-md px-6">
        <div className="w-16 h-16 bg-red-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
          <span className="text-3xl">⚠️</span>
        </div>
        <h2 className="text-xl font-bold text-slate-900 mb-2">
          {isAr ? 'حدث خطأ غير متوقع' : 'Something went wrong'}
        </h2>
        {error.digest && (
          <p className="text-xs text-slate-400 font-mono mb-6">{isAr ? 'رمز الخطأ' : 'Error code'}: {error.digest}</p>
        )}
        <Button onClick={reset} className="mx-auto">
          {isAr ? 'إعادة المحاولة' : 'Try Again'}
        </Button>
      </div>
    </div>
  );
}
