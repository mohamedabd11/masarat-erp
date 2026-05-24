'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/Button';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-muted">
      <div className="text-center max-w-md px-6">
        <div className="w-16 h-16 bg-red-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
          <span className="text-3xl">⚠️</span>
        </div>
        <h2 className="text-xl font-bold text-slate-900 mb-2">حدث خطأ غير متوقع</h2>
        <p className="text-sm text-slate-500 mb-2">Something went wrong</p>
        {error.message && error.message !== 'An error occurred in the Server Components render.' && (
          <p className="text-xs text-red-500 font-mono mb-2 break-all">{error.message}</p>
        )}
        {error.digest && (
          <p className="text-xs text-slate-400 font-mono mb-6">Code: {error.digest}</p>
        )}
        <Button onClick={reset} className="mx-auto">
          إعادة المحاولة / Try Again
        </Button>
      </div>
    </div>
  );
}
