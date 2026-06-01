export const dynamic = 'force-dynamic';

import { Suspense } from 'react';
import { AuditLogClient } from '@/components/audit/AuditLogClient';

export default function AuditLogPage({ params }: { params: { locale: string } }) {
  const isAr = params.locale === 'ar';
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          {isAr ? 'سجل المراجعة' : 'Audit Log'}
        </h1>
        <p className="text-slate-500 text-sm mt-0.5">
          {isAr
            ? 'سجل كامل لكل العمليات الحساسة — إنشاء، تعديل، حذف'
            : 'Complete trail of all sensitive operations — create, update, delete'}
        </p>
      </div>

      <Suspense fallback={
        <div className="h-64 flex items-center justify-center">
          <div className="w-8 h-8 border-4 border-brand-600 border-t-transparent rounded-full animate-spin" />
        </div>
      }>
        <AuditLogClient locale={params.locale} />
      </Suspense>
    </div>
  );
}
