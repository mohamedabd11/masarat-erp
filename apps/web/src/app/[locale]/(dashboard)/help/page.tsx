import { HelpCircle, Mail, Phone } from 'lucide-react';

export default function HelpPage({ params }: { params: { locale: string } }) {
  const isAr = params.locale === 'ar';
  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{isAr ? 'المساعدة والدعم' : 'Help & Support'}</h1>
        <p className="text-slate-500 text-sm mt-1">
          {isAr ? 'نحن هنا لمساعدتك' : 'We are here to help you'}
        </p>
      </div>
      <div className="grid gap-4">
        <div className="p-6 bg-white rounded-2xl border border-slate-200 flex gap-4 items-start">
          <div className="p-3 bg-brand-50 rounded-xl flex-shrink-0">
            <Mail size={20} className="text-brand-600" />
          </div>
          <div>
            <h2 className="font-semibold text-slate-900">{isAr ? 'البريد الإلكتروني' : 'Email Support'}</h2>
            <p className="text-slate-500 text-sm mt-1">support@masarat.sa</p>
          </div>
        </div>
        <div className="p-6 bg-white rounded-2xl border border-slate-200 flex gap-4 items-start">
          <div className="p-3 bg-emerald-50 rounded-xl flex-shrink-0">
            <Phone size={20} className="text-emerald-600" />
          </div>
          <div>
            <h2 className="font-semibold text-slate-900">{isAr ? 'الهاتف' : 'Phone Support'}</h2>
            <p className="text-slate-500 text-sm mt-1" dir="ltr">+966 11 000 0000</p>
          </div>
        </div>
        <div className="p-6 bg-white rounded-2xl border border-slate-200 flex gap-4 items-start">
          <div className="p-3 bg-purple-50 rounded-xl flex-shrink-0">
            <HelpCircle size={20} className="text-purple-600" />
          </div>
          <div>
            <h2 className="font-semibold text-slate-900">{isAr ? 'ساعات الدعم' : 'Support Hours'}</h2>
            <p className="text-slate-500 text-sm mt-1">
              {isAr ? 'الأحد — الخميس، 9ص — 6م' : 'Sun — Thu, 9AM — 6PM'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
