'use client';

import { useLocale } from 'next-intl';
import Link from 'next/link';
import { Lock, MessageCircle, ArrowUpRight } from 'lucide-react';
import { useSubscription } from '@/providers/SubscriptionProvider';
import { type FeatureKey } from '@/lib/plan-features';

interface UpgradeGateProps {
  feature: FeatureKey;
  children: React.ReactNode;
}

const WHATSAPP_NUMBER = '249969837823';

const FEATURE_LABEL: Record<FeatureKey, { ar: string; en: string }> = {
  dashboard:         { ar: 'لوحة التحكم',       en: 'Dashboard' },
  bookings:          { ar: 'الحجوزات',           en: 'Bookings' },
  customers:         { ar: 'العملاء',            en: 'Customers' },
  suppliers:         { ar: 'الموردين',           en: 'Suppliers' },
  invoices:          { ar: 'الفواتير',           en: 'Invoices' },
  quotes:            { ar: 'عروض الأسعار',       en: 'Quotations' },
  payments:          { ar: 'المدفوعات',          en: 'Payments' },
  settings:          { ar: 'الإعدادات',          en: 'Settings' },
  help:              { ar: 'المساعدة',           en: 'Help' },
  receipt_vouchers:  { ar: 'سندات القبض',        en: 'Receipt Vouchers' },
  supplier_payments: { ar: 'سندات الصرف',        en: 'Payment Vouchers' },
  cheques:           { ar: 'الشيكات',            en: 'Cheques' },
  banking:           { ar: 'البنوك والصناديق',   en: 'Banks & Cash' },
  accounting:        { ar: 'المحاسبة',           en: 'Accounting' },
  employees:         { ar: 'إدارة الموظفين',     en: 'Employees' },
  reports:           { ar: 'التقارير',           en: 'Reports' },
};

const PLAN_LABEL: Record<string, { ar: string; en: string }> = {
  starter:      { ar: 'المبتدئة',     en: 'Starter' },
  professional: { ar: 'الاحترافية',  en: 'Professional' },
  lifetime:     { ar: 'مدى الحياة',  en: 'Lifetime' },
  trial:        { ar: 'التجريبية',   en: 'Trial' },
};

export function UpgradeGate({ feature, children }: UpgradeGateProps) {
  const { canAccess, isLoading, plan } = useSubscription();
  const locale = useLocale();
  const isAr = locale === 'ar';

  if (isLoading || canAccess(feature)) return <>{children}</>;

  const label = FEATURE_LABEL[feature];
  const waMsg = encodeURIComponent(
    isAr
      ? `مرحباً، أريد الترقية إلى مسارات الاحترافي للوصول إلى ${label.ar}`
      : `Hello, I'd like to upgrade to Masarat Professional to access ${label.en}`,
  );

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-6">
      <div className="max-w-sm w-full text-center space-y-6">

        {/* Icon */}
        <div className="mx-auto w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center">
          <Lock size={28} className="text-slate-400" />
        </div>

        {/* Text */}
        <div className="space-y-2">
          <h2 className="text-xl font-bold text-slate-900">
            {isAr ? `${label.ar} — الخطة الاحترافية` : `${label.en} — Professional Plan`}
          </h2>
          <p className="text-slate-500 text-sm leading-relaxed">
            {isAr
              ? 'هذه الميزة متاحة في خطة مسارات الاحترافية. تواصل معنا للترقية والاستمتاع بجميع أدوات الإدارة المالية المتقدمة.'
              : 'This feature is available on the Masarat Professional plan. Contact us to upgrade and unlock all advanced financial management tools.'}
          </p>
        </div>

        {/* Actions */}
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
            {isAr ? 'مقارنة الخطط' : 'Compare Plans'}
          </Link>
        </div>

        {/* Plan badge */}
        <p className="text-xs text-slate-400">
          {isAr
            ? `خطتك الحالية: ${PLAN_LABEL[plan]?.ar ?? plan}`
            : `Your current plan: ${PLAN_LABEL[plan]?.en ?? plan}`}
        </p>
      </div>
    </div>
  );
}
