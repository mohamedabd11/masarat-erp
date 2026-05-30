'use client';

import { useLocale } from 'next-intl';
import { LockKeyhole, Zap, MessageCircle } from 'lucide-react';
import { useSubscription } from '@/providers/SubscriptionProvider';

const WA_NUMBER = '249969837823';
const CONTACT_EMAIL = 'mohamed@masarat-erp.com';

const PLANS = [
  {
    key:   'starter',
    ar:    'باقة المبتدئ',
    en:    'Starter',
    features: {
      ar: ['حتى 3 مستخدمين', 'حتى 500 حجز/شهر', 'الوحدات الأساسية', 'دعم عبر البريد'],
      en: ['Up to 3 users', 'Up to 500 bookings/mo', 'Core modules', 'Email support'],
    },
  },
  {
    key:      'professional',
    ar:       'باقة الاحترافي',
    en:       'Professional',
    featured: true,
    features: {
      ar: ['مستخدمون غير محدودين', 'حجوزات غير محدودة', 'جميع الوحدات + ZATCA', 'دعم ذو أولوية'],
      en: ['Unlimited users', 'Unlimited bookings', 'All modules + ZATCA', 'Priority support'],
    },
  },
  {
    key:   'enterprise',
    ar:    'باقة المؤسسات',
    en:    'Enterprise',
    features: {
      ar: ['كل ميزات الاحترافي', 'تكامل مخصص', 'تدريب ودعم مخصص', 'SLA مضمون'],
      en: ['Everything in Professional', 'Custom integrations', 'Dedicated training', 'Guaranteed SLA'],
    },
  },
];

export function SubscriptionExpiredOverlay() {
  const locale = useLocale();
  const isAr   = locale === 'ar';
  const { agencyName } = useSubscription();

  function waLink(planAr: string) {
    const msg = agencyName
      ? `مرحباً فريق مسارات، أرغب في ترقية اشتراك وكالتي (${agencyName}) إلى ${planAr}.`
      : `مرحباً فريق مسارات، أرغب في الاشتراك في ${planAr}.`;
    return `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(msg)}`;
  }

  const generalWaLink = `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(
    agencyName
      ? `مرحباً فريق مسارات، أرغب في تفعيل اشتراك وكالتي (${agencyName}).`
      : 'مرحباً فريق مسارات، أرغب في تفعيل الاشتراك.',
  )}`;

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
              ? 'لمتابعة استخدام نظام مسارات والوصول إلى بياناتك، تواصل معنا لتفعيل اشتراكك'
              : 'To continue using Masarat ERP, contact us to activate your subscription'}
          </p>

          {/* Primary WhatsApp CTA */}
          <a
            href={generalWaLink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 mt-5 px-6 py-3 bg-emerald-500 hover:bg-emerald-400 text-white font-bold rounded-2xl text-sm transition-colors shadow-lg"
          >
            <MessageCircle size={18} />
            {isAr ? 'تواصل معنا عبر واتساب' : 'Contact Us on WhatsApp'}
          </a>
        </div>

        {/* Plans — no prices, just features */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
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
              <p className={`font-bold text-base mb-4 ${plan.featured ? 'text-white' : 'text-slate-200'}`}>
                {isAr ? plan.ar : plan.en}
              </p>
              <ul className="space-y-1.5 mb-5">
                {(isAr ? plan.features.ar : plan.features.en).map(f => (
                  <li key={f} className="flex items-center gap-2 text-xs">
                    <Zap size={11} className={plan.featured ? 'text-brand-200' : 'text-slate-400'} />
                    <span className={plan.featured ? 'text-brand-100' : 'text-slate-300'}>{f}</span>
                  </li>
                ))}
              </ul>
              <a
                href={waLink(isAr ? plan.ar : plan.en)}
                target="_blank"
                rel="noopener noreferrer"
                className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-colors ${
                  plan.featured
                    ? 'bg-white text-brand-700 hover:bg-brand-50'
                    : 'bg-slate-700 text-slate-200 hover:bg-slate-600'
                }`}
              >
                <MessageCircle size={15} />
                {isAr ? 'تواصل عبر واتساب' : 'WhatsApp'}
              </a>
            </div>
          ))}
        </div>

        {/* Contact footer */}
        <div className="text-center text-xs text-slate-500">
          <p className="mb-1">{isAr ? 'أو تواصل معنا مباشرة:' : 'Or reach us directly:'}</p>
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className="text-slate-400 hover:text-white transition-colors"
          >
            {CONTACT_EMAIL}
          </a>
        </div>

      </div>
    </div>
  );
}
