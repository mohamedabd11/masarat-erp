import { InvoicesClient } from '@/components/invoices/InvoicesClient';

export default function InvoicesPage({ params }: { params: { locale: string } }) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          {params.locale === 'ar' ? 'الفواتير' : 'Invoices'}
        </h1>
        <p className="text-slate-500 text-sm mt-0.5">
          {params.locale === 'ar' ? 'إدارة فواتير العملاء والمدفوعات' : 'Manage customer invoices and payments'}
        </p>
      </div>
      <InvoicesClient locale={params.locale} />
    </div>
  );
}
