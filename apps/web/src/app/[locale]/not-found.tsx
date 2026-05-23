import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-surface-muted">
      <div className="text-center max-w-md px-6">
        <div className="text-8xl font-bold text-brand-200 mb-4">404</div>
        <h1 className="text-2xl font-bold text-slate-900 mb-2">الصفحة غير موجودة</h1>
        <p className="text-slate-500 mb-2">Page Not Found</p>
        <p className="text-sm text-slate-400 mb-8">
          الصفحة التي تبحث عنها غير موجودة أو تم نقلها.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/ar/dashboard"
            className="inline-flex items-center justify-center px-6 py-2.5 rounded-lg bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 transition-colors"
          >
            العودة للوحة التحكم
          </Link>
          <Link
            href="/en/dashboard"
            className="inline-flex items-center justify-center px-6 py-2.5 rounded-lg border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-50 transition-colors"
          >
            Go to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
