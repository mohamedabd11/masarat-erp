export const dynamic = 'force-dynamic';
import { QuotesClient } from '@/components/quotes/QuotesClient';
import { FileText, Send, CheckCircle, TrendingUp } from 'lucide-react';

export default function QuotesPage({ params }: { params: { locale: string } }) {
  const isAr = params.locale === 'ar';
  return (
    <div className="space-y-6">
      <div className="flex items-start gap-4">
        <div className="p-3 bg-indigo-50 rounded-2xl border border-indigo-100">
          <FileText size={24} className="text-indigo-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {isAr ? 'عروض الأسعار' : 'Quotations'}
          </h1>
          <p className="text-slate-500 text-sm">
            {isAr
              ? 'إنشاء وإرسال عروض أسعار احترافية للعملاء وتحويلها إلى حجوزات'
              : 'Create and send professional price quotes to clients and convert them to bookings'}
          </p>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            {[
              { icon: FileText,    label: isAr ? 'مسودة' : 'Draft',           cls: 'bg-slate-50 text-slate-700' },
              { icon: Send,        label: isAr ? 'مُرسَل' : 'Sent',           cls: 'bg-blue-50 text-blue-700' },
              { icon: CheckCircle, label: isAr ? 'مقبول' : 'Accepted',        cls: 'bg-emerald-50 text-emerald-700' },
              { icon: TrendingUp,  label: isAr ? 'محوّل لحجز' : 'Converted',  cls: 'bg-purple-50 text-purple-700' },
            ].map(chip => (
              <span key={chip.label} className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold ${chip.cls}`}>
                <chip.icon size={11} />{chip.label}
              </span>
            ))}
          </div>
        </div>
      </div>
      <QuotesClient locale={params.locale} />
    </div>
  );
}
