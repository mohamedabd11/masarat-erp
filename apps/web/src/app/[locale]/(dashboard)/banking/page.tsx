export const dynamic = 'force-dynamic';
import { BankingClient } from '@/components/banking/BankingClient';
import { Landmark, CreditCard, Wallet, RefreshCw } from 'lucide-react';

export default function BankingPage({ params }: { params: { locale: string } }) {
  const isAr = params.locale === 'ar';
  return (
    <div className="space-y-6">
      <div className="flex items-start gap-4">
        <div className="p-3 bg-brand-50 rounded-2xl border border-brand-100">
          <Landmark size={24} className="text-brand-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {isAr ? 'البنوك والصناديق' : 'Banks & Cash'}
          </h1>
          <p className="text-slate-500 text-sm">
            {isAr
              ? 'إدارة الحسابات البنكية والصناديق النقدية والتحويلات الداخلية'
              : 'Manage bank accounts, cash boxes, and internal transfers'}
          </p>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            {[
              { icon: Landmark,   label: isAr ? 'بنكي' : 'Bank',         cls: 'bg-brand-50 text-brand-700' },
              { icon: Wallet,     label: isAr ? 'نقدي' : 'Cash Box',     cls: 'bg-emerald-50 text-emerald-700' },
              { icon: CreditCard, label: isAr ? 'عهدة' : 'Petty Cash',   cls: 'bg-amber-50 text-amber-700' },
              { icon: RefreshCw,  label: isAr ? 'مطابقة' : 'Reconciled', cls: 'bg-slate-50 text-slate-700' },
            ].map(chip => (
              <span key={chip.label} className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold ${chip.cls}`}>
                <chip.icon size={11} />{chip.label}
              </span>
            ))}
          </div>
        </div>
      </div>
      <BankingClient locale={params.locale} />
    </div>
  );
}
