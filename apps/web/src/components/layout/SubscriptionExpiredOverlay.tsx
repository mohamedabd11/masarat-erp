'use client';

import { useLocale } from 'next-intl';
import { LockKeyhole, MessageCircle, Mail } from 'lucide-react';
import { useSubscription } from '@/providers/SubscriptionProvider';

const WA_NUMBER    = '249969837823';
const CONTACT_EMAIL = 'mohamed@masarat-erp.com';

export function SubscriptionExpiredOverlay() {
  const locale  = useLocale();
  const isAr    = locale === 'ar';
  const { agencyName, status } = useSubscription();

  const isSuspended = status === 'suspended';

  const waMsg = agencyName
    ? (isAr
        ? `مرحباً فريق مسارات، أرغب في تفعيل اشتراك وكالتي (${agencyName}).`
        : `Hello Masarat team, I'd like to activate my agency subscription (${agencyName}).`)
    : (isAr
        ? 'مرحباً فريق مسارات، أرغب في تفعيل الاشتراك.'
        : 'Hello Masarat team, I would like to activate my subscription.');

  const waLink = `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(waMsg)}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/97 backdrop-blur-md p-6">
      <div className="w-full max-w-md text-center">

        {/* Icon */}
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-red-500/10 border border-red-500/20 mb-6">
          <LockKeyhole size={38} className="text-red-400" />
        </div>

        {/* Title */}
        <h1 className="text-2xl font-bold text-white mb-3">
          {isSuspended
            ? (isAr ? 'تم إيقاف الوصول للنظام' : 'System Access Suspended')
            : (isAr ? 'انتهت الفترة التجريبية' : 'Free Trial Ended')}
        </h1>

        {/* Message */}
        <p className="text-slate-400 text-sm leading-relaxed mb-2">
          {isSuspended
            ? (isAr
                ? 'تم إيقاف اشتراك وكالتك مؤقتاً من قبل إدارة النظام.'
                : 'Your agency subscription has been temporarily suspended by the system administrator.')
            : (isAr
                ? 'انتهت الفترة التجريبية المجانية.'
                : 'Your free trial period has ended.')}
        </p>
        <p className="text-slate-300 text-base font-semibold mb-8">
          {isAr
            ? 'تواصل مع فريق المبيعات لتفعيل اشتراكك'
            : 'Contact our sales team to activate your subscription'}
        </p>

        {/* Agency name */}
        {agencyName && (
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800/60 border border-slate-700 rounded-xl text-slate-300 text-sm mb-8">
            <span className="text-slate-500">{isAr ? 'الوكالة:' : 'Agency:'}</span>
            <span className="font-semibold">{agencyName}</span>
          </div>
        )}

        {/* CTA buttons */}
        <div className="space-y-3">
          <a
            href={waLink}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2.5 w-full py-3.5 bg-emerald-500 hover:bg-emerald-400 text-white font-bold rounded-2xl text-sm transition-colors shadow-lg shadow-emerald-900/30"
          >
            <MessageCircle size={18} />
            {isAr ? 'تواصل معنا عبر واتساب' : 'Contact Us on WhatsApp'}
          </a>

          <a
            href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(isAr ? `تفعيل اشتراك - ${agencyName ?? ''}` : `Subscription Activation - ${agencyName ?? ''}`)}`}
            className="flex items-center justify-center gap-2.5 w-full py-3 bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-200 font-medium rounded-2xl text-sm transition-colors"
          >
            <Mail size={16} />
            {CONTACT_EMAIL}
          </a>
        </div>

        <p className="text-slate-600 text-xs mt-6">
          {isAr ? 'بياناتك محفوظة وجاهزة عند التفعيل' : 'Your data is safe and ready when you activate'}
        </p>
      </div>
    </div>
  );
}
