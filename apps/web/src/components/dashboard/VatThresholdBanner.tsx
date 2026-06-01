'use client';

import { useState, useEffect } from 'react';
import { useLocale } from 'next-intl';
import { AlertTriangle, X, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import { apiFetch } from '@/lib/api-client';

interface VatStatus {
  status:                'ok' | 'approaching' | 'mandatory' | 'registered';
  isVatRegistered:       boolean;
  rolling12MonthSar?:    number;
  percentOfMandatory?:   number;
  mandatoryThreshold:    number;
  voluntaryThreshold:    number;
  messageAr?:            string;
  messageEn?:            string;
}

export function VatThresholdBanner() {
  const locale  = useLocale();
  const isAr    = locale === 'ar';
  const [data,      setData]      = useState<VatStatus | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    apiFetch<VatStatus>('/api/accounting/vat-status')
      .then(d => setData(d))
      .catch(() => {}); // silent — banner is advisory
  }, []);

  if (!data || data.status === 'ok' || data.status === 'registered' || dismissed) return null;

  const isMandatory  = data.status === 'mandatory';
  const pct          = data.percentOfMandatory ?? 0;

  return (
    <div className={cn(
      'rounded-2xl border p-4 flex items-start gap-3',
      isMandatory
        ? 'bg-red-50 border-red-200'
        : 'bg-amber-50 border-amber-200',
    )}>
      <div className={cn(
        'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5',
        isMandatory ? 'bg-red-100' : 'bg-amber-100',
      )}>
        <AlertTriangle size={15} className={isMandatory ? 'text-red-600' : 'text-amber-600'} />
      </div>

      <div className="flex-1 min-w-0">
        <p className={cn('text-sm font-bold mb-1', isMandatory ? 'text-red-800' : 'text-amber-800')}>
          {isMandatory
            ? (isAr ? 'تسجيل ضريبة القيمة المضافة إلزامي' : 'VAT Registration Required')
            : (isAr ? 'اقتراب من عتبة ضريبة القيمة المضافة' : 'Approaching VAT Threshold')}
        </p>
        <p className={cn('text-xs leading-relaxed', isMandatory ? 'text-red-700' : 'text-amber-700')}>
          {isAr ? data.messageAr : data.messageEn}
        </p>

        {/* Progress bar */}
        <div className="mt-3 space-y-1">
          <div className="flex justify-between text-[11px] font-medium">
            <span className={isMandatory ? 'text-red-600' : 'text-amber-600'}>
              {isAr
                ? `${(data.rolling12MonthSar ?? 0).toLocaleString('ar-SA')} ر.س من أصل ${data.mandatoryThreshold.toLocaleString('ar-SA')} ر.س`
                : `SAR ${(data.rolling12MonthSar ?? 0).toLocaleString()} of SAR ${data.mandatoryThreshold.toLocaleString()}`}
            </span>
            <span className={isMandatory ? 'text-red-600 font-bold' : 'text-amber-600'}>{pct}%</span>
          </div>
          <div className="h-2 bg-white/60 rounded-full overflow-hidden border border-white/40">
            <div
              className={cn('h-full rounded-full transition-all duration-700', isMandatory ? 'bg-red-500' : 'bg-amber-400')}
              style={{ width: `${Math.min(100, pct)}%` }}
            />
          </div>
        </div>

        <a
          href={`/${locale}/settings?tab=zatca`}
          className={cn(
            'inline-flex items-center gap-1 mt-2 text-xs font-semibold underline underline-offset-2',
            isMandatory ? 'text-red-700' : 'text-amber-700',
          )}
        >
          {isAr ? 'إعداد بيانات التسجيل الضريبي' : 'Set up VAT registration'}
          <ExternalLink size={11} />
        </a>
      </div>

      <button
        onClick={() => setDismissed(true)}
        className={cn(
          'p-1 rounded flex-shrink-0',
          isMandatory ? 'text-red-400 hover:text-red-600 hover:bg-red-100' : 'text-amber-400 hover:text-amber-600 hover:bg-amber-100',
        )}
      >
        <X size={14} />
      </button>
    </div>
  );
}
