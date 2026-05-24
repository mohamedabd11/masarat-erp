'use client';

import Link from 'next/link';
import { useLocale } from 'next-intl';
import { LockKeyhole, Zap, Phone, Mail } from 'lucide-react';

const PLANS = [
  {
    key:   'starter',
    ar:    'باقة المبتدئ',
    en:    'Starter',
    price: '199',
    features: {
      ar: ['حتى 3 مستخدمين', 'حتى 500 حجز/شهر', 'الوحدات الأساسية', 'دعم عبر البريد'],
      en: ['Up to 3 users', 'Up to 500 bookings/mo', 'Core modules', 'Email support'],
    },
  },
  {
    key:      'professional',
    ar:       'باقة الاحترافي',
    en:       'Professional',
    price:    '399',
    featured: true,
    features: {
      ar: ['مستخدمون غير محدودين', 'حجوزات غير محدودة', 'جميع الوحدات + ZATCA', 'دعم ذو أولوية'],
      en: ['Unlimited users', 'Unlimited bookings', 'All modules + ZATCA', 'Priority support'],
    },
  },
];

export function SubscriptionExpiredOverlay() {
  const locale = useLocale();
  const isAr   = locale === 'ar';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/95 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="w-full max-w-2xl my-auto">

        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-red-100 rounded-full mb-4">
            <LockKeyhole size={32} className="text-red-600" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">
            {isAr ? 'انتهت الفترة التجريبية' : 'Your Free Trial Has Ended'}
          </h1>
          <p className="text-slate-400 text-sm max-w-md mx-auto">
            {isAr
              ? 'لمتابعة استخدام نظام مسارات والوصول إلى بياناتك، يرجى تفعيل اشتراكك'
              : 'To continue using Masarat ERP and access your data, please activate your subscription'}
          </p>
        </div>

        {/* Plans */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          {PLANS.map(plan => (
            <div
              key={plan.key}
              className={`relative rounded-2xl p-5 border-2 ${
                plan.featured
                  ? 'bg-brand-600 border-brand-500'
                  : 'bg-slate-800 border-slate-700'
              }`}
            >
              {plan.featured && (
                <div className="absolute -top-3 start-1/2 -translate-x-1/2 rtl:translate-x-1/2">
                  <span className="bg-amber-400 text-amber-900 text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest">
                    {isAr ? 'الأكثر شيوعاً' : 'Most Popular'}
                  </span>
                </div>
              )}
              <div className="mb-4">
                <p className={`font-bold text-base ${plan.featured ? 'text-white' : 'text-slate-200'}`}>
                  {isAr ? plan.ar : plan.en}
                </p>
                <p className={`text-2xl font-black mt-1 ${plan.featured ? 'text-white' : 'text-slate-100'}`}>
                  {plan.price}
                  <span className={`text-sm font-normal ms-1 ${plan.featured ? 'text-brand-200' : 'text-slate-400'}`}>
                    {isAr ? 'ريال/شهر' : 'SAR/mo'}
                  </span>
                </p>
              </div>
              <ul className="space-y-1.5 mb-5">
                {(isAr ? plan.features.ar : plan.features.en).map(f => (
                  <li key={f} className="flex items-center gap-2 text-xs">
                    <Zap size={11} className={plan.featured ? 'text-brand-200' : 'text-slate-400'} />
                    <span className={plan.featured ? 'text-brand-100' : 'text-slate-300'}>{f}</span>
                  </li>
                ))}
              </ul>
              <Link
                href={`/${locale}/settings?tab=billing`}
                className={`block text-center py-2.5 rounded-xl text-sm font-bold transition-colors ${
                  plan.featured
                    ? 'bg-white text-brand-700 hover:bg-brand-50'
                    : 'bg-slate-700 text-slate-200 hover:bg-slate-600'
                }`}
              >
                {isAr ? 'اشترك الآن' : 'Subscribe Now'}
              </Link>
            </div>
          ))}
        </div>

        {/* Contact */}
        <div className="text-center text-sm text-slate-500 space-y-1">
          <p>{isAr ? 'تحتاج مساعدة؟ تواصل معنا:' : 'Need help? Contact us:'}</p>
          <div className="flex items-center justify-center gap-4">
            <a href="tel:+966" className="flex items-center gap-1.5 text-slate-400 hover:text-white transition-colors">
              <Phone size={13} />
              <span dir="ltr">+966 5X XXX XXXX</span>
            </a>
            <a href="mailto:support@masarat.app" className="flex items-center gap-1.5 text-slate-400 hover:text-white transition-colors">
              <Mail size={13} />
              support@masarat.app
            </a>
          </div>
        </div>

      </div>
    </div>
  );
}
