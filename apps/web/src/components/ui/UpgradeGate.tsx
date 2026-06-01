'use client';

import { useLocale } from 'next-intl';
import Link from 'next/link';
import { Lock, MessageCircle } from 'lucide-react';
import { useSubscription } from '@/providers/SubscriptionProvider';
import { type FeatureKey, FEATURE_LABEL } from '@/lib/plan-features';

interface UpgradeGateProps {
  feature: FeatureKey;
  children: React.ReactNode;
}

const WHATSAPP_NUMBER = '249969837823';

export function UpgradeGate({ feature, children }: UpgradeGateProps) {
  const { canAccess, isLoading } = useSubscription();
  const locale = useLocale();
  const isAr = locale === 'ar';

  if (isLoading || canAccess(feature)) return <>{children}</>;

  const label = FEATURE_LABEL[feature];
  const waMsg = encodeURIComponent(
    isAr
      ? `مرحباً فريق مسارات، أرغب في تفعيل ميزة ${label.ar} لوكالتي.`
      : `Hello Masarat team, I'd like to enable the ${label.en} feature for my agency.`,
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
              ? 'هذه الميزة غير مفعّلة لحسابك. يرجى التواصل مع إدارة النظام.'
              : 'This feature is not enabled for your account. Please contact your system administrator.'}
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
            {isAr ? 'تواصل لتفعيل اشتراكك' : 'Activate Your Subscription'}
          </a>

          <Link
            href={`/${locale}/settings?tab=billing`}
            className="flex items-center justify-center gap-2 px-5 py-3 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-medium rounded-xl transition-colors text-sm"
          >
            {isAr ? 'عرض حالة الاشتراك' : 'View Subscription Status'}
          </Link>
        </div>
      </div>
    </div>
  );
}
