'use client';

import { useLocale } from 'next-intl';
import Link from 'next/link';
import { Lock, MessageCircle, ArrowUpRight } from 'lucide-react';
import { useSubscription } from '@/providers/SubscriptionProvider';
import { type FeatureKey, FEATURE_LABEL } from '@/lib/plan-features';

interface UpgradeGateProps {
  feature: FeatureKey;
  children: React.ReactNode;
}

const WHATSAPP_NUMBER = '249969837823';

const REQUIRED_PLAN_LABEL: Record<number, { ar: string; en: string }> = {
  1: { ar: 'باقة التشغيل أو أعلى', en: 'Operations plan or higher' },
  2: { ar: 'باقة الأعمال أو أعلى',  en: 'Business plan or higher' },
  3: { ar: 'باقة المؤسسات',          en: 'Enterprise plan' },
};

const PLAN_LABEL: Record<string, { ar: string; en: string }> = {
  operations:   { ar: 'التشغيل',    en: 'Operations' },
  starter:      { ar: 'التشغيل',    en: 'Operations' },
  business:     { ar: 'الأعمال',    en: 'Business' },
  professional: { ar: 'الأعمال',    en: 'Business' },
  enterprise:   { ar: 'المؤسسات',   en: 'Enterprise' },
  lifetime:     { ar: 'مدى الحياة', en: 'Lifetime' },
  trial:        { ar: 'التجريبية',  en: 'Trial' },
};

export function UpgradeGate({ feature, children }: UpgradeGateProps) {
  const { canAccess, isLoading, plan } = useSubscription();
  const locale = useLocale();
  const isAr = locale === 'ar';

  if (isLoading || canAccess(feature)) return <>{children}</>;

  const label = FEATURE_LABEL[feature];
  const waMsg = encodeURIComponent(
    isAr
      ? `مرحباً فريق مسارات، أرغب في الترقية للوصول إلى ميزة ${label.ar}`
      : `Hello Masarat team, I'd like to upgrade to access ${label.en}`,
  );

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-6">
      <div className="max-w-sm w-full text-center space-y-6">

        <div className="mx-auto w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center">
          <Lock size={28} className="text-slate-400" />
        </div>

        <div className="space-y-2">
          <h2 className="text-xl font-bold text-slate-900">
            {isAr ? label.ar : label.en}
          </h2>
          <p className="text-slate-500 text-sm leading-relaxed">
            {isAr
              ? 'هذه الميزة غير متاحة ضمن اشتراكك الحالي. تواصل معنا للترقية.'
              : 'This feature is not available on your current plan. Contact us to upgrade.'}
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <a
            href={`https://wa.me/${WHATSAPP_NUMBER}?text=${waMsg}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 px-5 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl transition-colors"
          >
            <MessageCircle size={18} />
            {isAr ? 'تواصل للترقية' : 'Contact to Upgrade'}
          </a>

          <Link
            href={`/${locale}/settings?tab=billing`}
            className="flex items-center justify-center gap-2 px-5 py-3 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-medium rounded-xl transition-colors text-sm"
          >
            <ArrowUpRight size={16} />
            {isAr ? 'مقارنة الباقات' : 'Compare Plans'}
          </Link>
        </div>

        <p className="text-xs text-slate-400">
          {isAr
            ? `باقتك الحالية: ${PLAN_LABEL[plan]?.ar ?? plan}`
            : `Your current plan: ${PLAN_LABEL[plan]?.en ?? plan}`}
        </p>
      </div>
    </div>
  );
}
