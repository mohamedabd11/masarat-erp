'use client';

import { useLocale } from 'next-intl';
import { MessageCircle, Mail, Clock, Zap } from 'lucide-react';

const WHATSAPP_NUMBER = '249969837823';
const SUPPORT_EMAIL   = 'mohamed@masarat-erp.com';

function whatsappUrl(msgAr: string) {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(msgAr)}`;
}

export default function HelpPage() {
  const locale = useLocale();
  const isAr = locale === 'ar';

  return (
    <div className="max-w-xl mx-auto space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          {isAr ? 'الدعم الفني' : 'Technical Support'}
        </h1>
        <p className="text-slate-500 text-sm mt-1">
          {isAr
            ? 'فريق مسارات جاهز لمساعدتك — تواصل معنا مباشرةً'
            : 'The Masarat team is ready to help — reach us directly'}
        </p>
      </div>

      {/* WhatsApp — primary card */}
      <a
        href={whatsappUrl(isAr ? 'مرحباً، أحتاج مساعدة في نظام مسارات' : 'Hello, I need help with Masarat ERP')}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-4 p-6 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 rounded-2xl text-white transition-colors group cursor-pointer"
      >
        <div className="p-3 bg-white/20 rounded-xl flex-shrink-0">
          <MessageCircle size={24} className="text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-lg leading-tight">
            {isAr ? 'تواصل عبر واتساب' : 'Chat on WhatsApp'}
          </p>
          <p className="text-emerald-100 text-sm mt-0.5" dir="ltr">
            +{WHATSAPP_NUMBER}
          </p>
        </div>
        <div className="text-white/70 group-hover:text-white transition-colors text-2xl">
          ←
        </div>
      </a>

      {/* Info cards row */}
      <div className="grid grid-cols-2 gap-3">
        {/* Response time */}
        <div className="p-5 bg-white rounded-2xl border border-slate-200 flex gap-3 items-start">
          <div className="p-2.5 bg-brand-50 rounded-xl flex-shrink-0">
            <Zap size={18} className="text-brand-600" />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-slate-900 text-sm">
              {isAr ? 'وقت الاستجابة' : 'Response Time'}
            </p>
            <p className="text-slate-500 text-xs mt-1 leading-snug">
              {isAr ? 'خلال ساعات العمل' : 'Within working hours'}
            </p>
          </div>
        </div>

        {/* Hours */}
        <div className="p-5 bg-white rounded-2xl border border-slate-200 flex gap-3 items-start">
          <div className="p-2.5 bg-purple-50 rounded-xl flex-shrink-0">
            <Clock size={18} className="text-purple-600" />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-slate-900 text-sm">
              {isAr ? 'أوقات العمل' : 'Hours'}
            </p>
            <p className="text-slate-500 text-xs mt-1 leading-snug">
              {isAr ? 'الأحد – الخميس' : 'Sun – Thu'}
              <br />9:00 – 18:00
            </p>
          </div>
        </div>
      </div>

      {/* Email — secondary */}
      <a
        href={`mailto:${SUPPORT_EMAIL}`}
        className="flex items-center gap-4 p-5 bg-white hover:bg-slate-50 rounded-2xl border border-slate-200 transition-colors group"
      >
        <div className="p-2.5 bg-slate-100 rounded-xl flex-shrink-0">
          <Mail size={18} className="text-slate-500" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-slate-900 text-sm">
            {isAr ? 'البريد الإلكتروني' : 'Email'}
          </p>
          <p className="text-slate-500 text-sm mt-0.5 truncate" dir="ltr">
            {SUPPORT_EMAIL}
          </p>
        </div>
      </a>

      {/* Footer note */}
      <p className="text-xs text-slate-400 text-center pb-2">
        {isAr
          ? 'سيتم إضافة قنوات دعم إضافية قريباً'
          : 'Additional support channels coming soon'}
      </p>
    </div>
  );
}
