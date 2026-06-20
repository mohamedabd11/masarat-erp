'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useLocale } from 'next-intl';
import { useAuth } from '@masarat/firebase';
import {
  Building2, FileText, Users, CheckCircle2, ChevronRight, X, Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface Step {
  id: string;
  ar: string;
  en: string;
  descAr: string;
  descEn: string;
  href: string;
  icon: React.ReactNode;
  done: boolean;
}

const DISMISSED_KEY = 'masarat_onboarding_dismissed';

export function OnboardingBanner() {
  const locale  = useLocale();
  const isAr    = locale === 'ar';
  const { user } = useAuth();
  const agencyId = user?.agencyId ?? null;

  const [steps, setSteps]           = useState<Step[]>([]);
  const [loading, setLoading]       = useState(true);
  const [dismissed, setDismissed]   = useState(false);
  const [allDone, setAllDone]       = useState(false);

  // Check if permanently dismissed
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setDismissed(localStorage.getItem(DISMISSED_KEY) === '1');
    }
  }, []);

  // Load agency data and derive steps
  useEffect(() => {
    if (!agencyId || dismissed) { setLoading(false); return; }
    let cancelled = false;

    async function load() {
      try {
        const { apiFetch } = await import('@/lib/api-client');
        const data = await apiFetch<{
          agency: { nameAr?: string; crNumber?: string; city?: string; contactPhone?: string; contactEmail?: string; isVatRegistered?: boolean; vatNumber?: string };
          users: unknown[];
        }>('/api/settings');

        if (cancelled) return;

        const ag           = data.agency;
        const hasName      = !!ag.nameAr;
        const hasCR        = !!ag.crNumber;
        const hasCity      = !!ag.city;
        const hasContact   = !!(ag.contactPhone || ag.contactEmail);
        const hasMoreUsers = data.users.length > 1;

        const built: Step[] = [
          {
            id:     'profile',
            ar:     'أكمل بيانات الوكالة',
            en:     'Complete Agency Profile',
            descAr: 'السجل التجاري، العنوان، معلومات التواصل',
            descEn: 'CR number, address, contact info',
            href:   `/${locale}/settings?tab=agency`,
            icon:   <Building2 size={16} />,
            done:   hasName && hasCR && hasCity && hasContact,
          },
          {
            id:     'invoice',
            ar:     'حدد نوع الفواتير',
            en:     'Configure Invoice Type',
            descAr: ag.isVatRegistered
              ? 'أنت مسجّل بضريبة القيمة المضافة — تأكد من الرقم الضريبي'
              : 'اختر: فاتورة تجارية (سجل تجاري) أو فاتورة ضريبية (VAT)',
            descEn: ag.isVatRegistered
              ? 'VAT registered — verify your VAT number is entered'
              : 'Choose: commercial invoice (CR only) or tax invoice (VAT)',
            href:   `/${locale}/settings?tab=agency`,
            icon:   <FileText size={16} />,
            done:   hasCR && (ag.isVatRegistered ? !!ag.vatNumber : true),
          },
          {
            id:     'team',
            ar:     'أضف أعضاء الفريق',
            en:     'Add Team Members',
            descAr: 'ادعُ موظفيك للنظام (اختياري)',
            descEn: 'Invite your staff to the system (optional)',
            href:   `/${locale}/settings?tab=users`,
            icon:   <Users size={16} />,
            done:   hasMoreUsers,
          },
        ];

        const doneCount = built.filter(s => s.done).length;
        if (cancelled) return;
        setSteps(built);
        setAllDone(doneCount === built.length);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => { cancelled = true; };
  }, [agencyId, locale, dismissed]);

  function handleDismiss() {
    localStorage.setItem(DISMISSED_KEY, '1');
    setDismissed(true);
  }

  // Don't render if dismissed, loading, or all done
  if (dismissed || loading || allDone) return null;

  const doneCount = steps.filter(s => s.done).length;
  const pct       = steps.length > 0 ? Math.round((doneCount / steps.length) * 100) : 0;

  return (
    <div className="rounded-2xl border-2 border-brand-200 bg-gradient-to-br from-brand-50 to-white overflow-hidden mb-6">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-brand-100">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-brand-600 flex items-center justify-center flex-shrink-0">
            <Sparkles size={17} className="text-white" />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-900">
              {isAr ? 'أكمل إعداد وكالتك' : 'Complete Your Agency Setup'}
            </p>
            <p className="text-xs text-slate-500 mt-0.5">
              {isAr
                ? `${doneCount} من ${steps.length} خطوات مكتملة`
                : `${doneCount} of ${steps.length} steps complete`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Progress ring */}
          <div className="hidden sm:flex items-center gap-2">
            <div className="w-24 h-2 bg-brand-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-brand-600 rounded-full transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="text-xs font-bold text-brand-700">{pct}%</span>
          </div>

          <button
            onClick={handleDismiss}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            aria-label={isAr ? 'إغلاق' : 'Dismiss'}
          >
            <X size={15} />
          </button>
        </div>
      </div>

      {/* Steps */}
      <div className="px-5 py-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {steps.map((step, i) => (
            <Link
              key={step.id}
              href={step.href}
              className={cn(
                'group flex items-start gap-3 p-3.5 rounded-xl border transition-all duration-200',
                step.done
                  ? 'border-emerald-200 bg-emerald-50/60 cursor-default pointer-events-none'
                  : 'border-brand-200 bg-white hover:border-brand-400 hover:shadow-sm cursor-pointer',
              )}
            >
              {/* Step number / checkmark */}
              <div className={cn(
                'w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 text-xs font-bold',
                step.done
                  ? 'bg-emerald-500 text-white'
                  : 'bg-brand-100 text-brand-700',
              )}>
                {step.done ? <CheckCircle2 size={14} /> : i + 1}
              </div>

              {/* Content */}
              <div className="min-w-0 flex-1">
                <p className={cn(
                  'text-sm font-semibold leading-tight',
                  step.done ? 'text-emerald-700 line-through decoration-emerald-400' : 'text-slate-800',
                )}>
                  {isAr ? step.ar : step.en}
                </p>
                <p className="text-xs text-slate-500 mt-0.5 leading-snug">
                  {isAr ? step.descAr : step.descEn}
                </p>
              </div>

              {/* Arrow */}
              {!step.done && (
                <ChevronRight
                  size={14}
                  className={cn(
                    'flex-shrink-0 mt-1 text-brand-400 transition-transform',
                    'group-hover:translate-x-0.5',
                    isAr && 'rotate-180',
                  )}
                />
              )}
            </Link>
          ))}
        </div>

        {/* Footer hint */}
        <p className="text-[11px] text-slate-400 text-center mt-3">
          {isAr
            ? 'يمكنك إغلاق هذه اللافتة في أي وقت — ستجد الإعدادات دائماً في قسم الإعدادات'
            : 'You can dismiss this banner anytime — settings are always available in the Settings section'}
        </p>
      </div>
    </div>
  );
}
