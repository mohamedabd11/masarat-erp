import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { InvoiceStatusBadge } from '@/components/ui/StatusBadge';
import { formatCurrency, formatDate } from '@/lib/utils';
import {
  FileText,
  Search,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Download,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type ZatcaStatus = 'pending' | 'submitted' | 'cleared' | 'reported' | 'failed';
type InvoiceStatus = 'draft' | 'pending' | 'paid' | 'overdue' | 'cancelled' | 'refunded';

interface DemoInvoice {
  id: string;
  invoiceNumber: string;
  customerNameAr: string;
  customerNameEn: string;
  bookingId: string;
  issueDate: Date;
  dueDate: Date;
  grandTotalHalalas: number;
  status: InvoiceStatus;
  zatcaStatus: ZatcaStatus;
}

// ─── Demo data ────────────────────────────────────────────────────────────────
// Production: invoices are generated from bookings via Cloud Functions / Firestore

const demoInvoices: DemoInvoice[] = [
  {
    id: 'INV-001',
    invoiceNumber: 'INV-2026-000248',
    customerNameAr: 'أحمد محمد العمري',
    customerNameEn: 'Ahmed Al-Omari',
    bookingId: 'BK-2026-000248',
    issueDate: new Date('2026-05-20'),
    dueDate: new Date('2026-06-05'),
    grandTotalHalalas: 902500,
    status: 'paid',
    zatcaStatus: 'cleared',
  },
  {
    id: 'INV-002',
    invoiceNumber: 'INV-2026-000247',
    customerNameAr: 'فاطمة علي الزهراني',
    customerNameEn: 'Fatima Al-Zahrani',
    bookingId: 'BK-2026-000247',
    issueDate: new Date('2026-05-21'),
    dueDate: new Date('2026-06-06'),
    grandTotalHalalas: 253000,
    status: 'pending',
    zatcaStatus: 'submitted',
  },
  {
    id: 'INV-003',
    invoiceNumber: 'INV-2026-000246',
    customerNameAr: 'خالد إبراهيم السعد',
    customerNameEn: 'Khalid Al-Saad',
    bookingId: 'BK-2026-000246',
    issueDate: new Date('2026-05-21'),
    dueDate: new Date('2026-05-28'),
    grandTotalHalalas: 517500,
    status: 'overdue',
    zatcaStatus: 'cleared',
  },
  {
    id: 'INV-004',
    invoiceNumber: 'INV-2026-000245',
    customerNameAr: 'منى عبدالله القحطاني',
    customerNameEn: 'Mona Al-Qahtani',
    bookingId: 'BK-2026-000245',
    issueDate: new Date('2026-05-22'),
    dueDate: new Date('2026-06-07'),
    grandTotalHalalas: 1380000,
    status: 'paid',
    zatcaStatus: 'reported',
  },
  {
    id: 'INV-005',
    invoiceNumber: 'INV-2026-000244',
    customerNameAr: 'سعود محمد الغامدي',
    customerNameEn: 'Saud Al-Ghamdi',
    bookingId: 'BK-2026-000244',
    issueDate: new Date('2026-05-22'),
    dueDate: new Date('2026-06-07'),
    grandTotalHalalas: 86250,
    status: 'draft',
    zatcaStatus: 'pending',
  },
  {
    id: 'INV-006',
    invoiceNumber: 'INV-2026-000240',
    customerNameAr: 'نورة سعد الشمري',
    customerNameEn: 'Noura Al-Shammari',
    bookingId: 'BK-2026-000240',
    issueDate: new Date('2026-05-10'),
    dueDate: new Date('2026-05-17'),
    grandTotalHalalas: 345000,
    status: 'overdue',
    zatcaStatus: 'failed',
  },
];

// ─── ZATCA display maps ───────────────────────────────────────────────────────

const zatcaColors: Record<ZatcaStatus, string> = {
  pending:   'bg-amber-400',
  submitted: 'bg-sky-400',
  cleared:   'bg-emerald-500',
  reported:  'bg-emerald-500',
  failed:    'bg-red-500',
};

const zatcaLabels: Record<ZatcaStatus, { ar: string; en: string }> = {
  pending:   { ar: 'بانتظار الإرسال', en: 'Pending' },
  submitted: { ar: 'تم الإرسال',      en: 'Submitted' },
  cleared:   { ar: 'مخلصة',           en: 'Cleared' },
  reported:  { ar: 'مبلغ عنها',       en: 'Reported' },
  failed:    { ar: 'فشل الإرسال',     en: 'Failed' },
};

// ─── Filter tab definitions ───────────────────────────────────────────────────

const filterTabs = [
  { key: 'all',     ar: 'الكل',   en: 'All' },
  { key: 'pending', ar: 'معلق',   en: 'Pending' },
  { key: 'paid',    ar: 'مدفوع',  en: 'Paid' },
  { key: 'overdue', ar: 'متأخر',  en: 'Overdue' },
] as const;

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function InvoicesPage({
  params,
}: {
  params: { locale: string };
}) {
  const t = await getTranslations('invoices');
  const locale = params.locale;
  const isAr = locale === 'ar';
  const fmtLocale = isAr ? 'ar-SA' : 'en-SA';

  // Aggregate stats
  const paid    = demoInvoices.filter((i) => i.status === 'paid');
  const pending = demoInvoices.filter((i) => i.status === 'pending');
  const overdue = demoInvoices.filter((i) => i.status === 'overdue');

  const paidTotal    = paid.reduce((s, i) => s + i.grandTotalHalalas, 0);
  const pendingTotal = pending.reduce((s, i) => s + i.grandTotalHalalas, 0);
  const overdueTotal = overdue.reduce((s, i) => s + i.grandTotalHalalas, 0);

  return (
    <div className="space-y-6">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-slate-900">{t('title')}</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            {isAr
              ? `${demoInvoices.length} فاتورة في النظام`
              : `${demoInvoices.length} invoices in system`}
          </p>
        </div>

        {/* New Invoice — disabled with tooltip; invoices are auto-generated */}
        <div className="relative group">
          <button
            disabled
            aria-label={isAr ? 'فاتورة جديدة (معطل)' : 'New Invoice (disabled)'}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium
                       bg-brand-600 text-white opacity-50 cursor-not-allowed select-none"
          >
            <FileText size={16} />
            {isAr ? 'فاتورة جديدة' : 'New Invoice'}
          </button>

          {/* Tooltip */}
          <div
            role="tooltip"
            className="pointer-events-none absolute end-0 top-full mt-2 z-20
                       hidden group-hover:block
                       w-60 rounded-lg bg-slate-800 px-3 py-2 text-xs text-white shadow-lg"
          >
            {isAr
              ? 'تُنشأ الفواتير تلقائياً عند تأكيد الحجز'
              : 'Invoices are generated automatically from confirmed bookings'}
            {/* Arrow */}
            <span className="absolute -top-1 end-4 block w-2 h-2 rotate-45 bg-slate-800" />
          </div>
        </div>
      </div>

      {/* ── Stats row ───────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">

        {/* Paid */}
        <Card className="flex items-center gap-4">
          <div className="p-3 rounded-xl bg-emerald-50 flex-shrink-0">
            <CheckCircle2 size={20} className="text-emerald-600" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-slate-500 mb-0.5">
              {isAr ? 'مدفوعة' : 'Paid'}
            </p>
            <p className="text-xl font-bold text-slate-900 truncate">
              {formatCurrency(paidTotal, fmtLocale)}
            </p>
            <p className="text-xs text-slate-400">
              {paid.length}{' '}
              {isAr ? 'فاتورة' : 'invoices'}
            </p>
          </div>
        </Card>

        {/* Pending */}
        <Card className="flex items-center gap-4">
          <div className="p-3 rounded-xl bg-amber-50 flex-shrink-0">
            <Clock size={20} className="text-amber-600" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-slate-500 mb-0.5">
              {isAr ? 'معلقة' : 'Pending'}
            </p>
            <p className="text-xl font-bold text-slate-900 truncate">
              {formatCurrency(pendingTotal, fmtLocale)}
            </p>
            <p className="text-xs text-slate-400">
              {pending.length}{' '}
              {isAr ? 'فاتورة' : 'invoices'}
            </p>
          </div>
        </Card>

        {/* Overdue */}
        <Card className="flex items-center gap-4">
          <div className="p-3 rounded-xl bg-red-50 flex-shrink-0">
            <AlertTriangle size={20} className="text-red-500" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-slate-500 mb-0.5">
              {isAr ? 'متأخرة' : 'Overdue'}
            </p>
            <p className="text-xl font-bold text-red-600 truncate">
              {formatCurrency(overdueTotal, fmtLocale)}
            </p>
            <p className="text-xs text-slate-400">
              {overdue.length}{' '}
              {isAr ? 'فاتورة' : 'invoices'}
            </p>
          </div>
        </Card>
      </div>

      {/* ── Search + Filter bar ─────────────────────────────────────────────── */}
      <Card padding="sm">
        <div className="flex flex-col sm:flex-row gap-3">

          {/* Search input */}
          <div className="flex-1 relative">
            <Search
              size={16}
              className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
            />
            <input
              type="search"
              placeholder={
                isAr
                  ? 'ابحث برقم الفاتورة أو اسم العميل...'
                  : 'Search by invoice # or customer name...'
              }
              className="w-full rounded-lg border border-slate-200 bg-white ps-9 pe-4 py-2
                         text-sm text-slate-700 placeholder:text-slate-400
                         focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
            />
          </div>

          {/* Status filter tabs */}
          <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100">
            {filterTabs.map((tab, idx) => (
              <button
                key={tab.key}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  idx === 0
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {isAr ? tab.ar : tab.en}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* ── Table ───────────────────────────────────────────────────────────── */}
      <Card padding="none">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-surface-border bg-slate-50/50">
                <th className="text-start ps-6 pe-4 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  {t('invoiceNumber')}
                </th>
                <th className="text-start px-4 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  {t('customer')}
                </th>
                <th className="text-start px-4 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden lg:table-cell">
                  {t('invoiceDate')}
                </th>
                <th className="text-start px-4 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden lg:table-cell">
                  {t('dueDate')}
                </th>
                <th className="text-end px-4 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  {t('amount')}
                </th>
                <th className="text-start px-4 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  {t('status')}
                </th>
                <th className="text-start px-4 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden md:table-cell">
                  ZATCA
                </th>
                <th className="text-end ps-4 pe-6 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider" />
              </tr>
            </thead>

            <tbody className="divide-y divide-surface-border">
              {demoInvoices.map((inv) => (
                <tr
                  key={inv.id}
                  className="hover:bg-slate-50/50 transition-colors"
                >
                  {/* Invoice # + booking link */}
                  <td className="ps-6 pe-4 py-4">
                    <Link
                      href={`/${locale}/invoices/${inv.id}`}
                      className="font-mono text-sm font-medium text-brand-700 hover:underline"
                    >
                      {inv.invoiceNumber}
                    </Link>
                    <p className="text-xs text-slate-400 mt-0.5">
                      <Link
                        href={`/${locale}/bookings/${inv.bookingId}`}
                        className="hover:text-brand-600"
                      >
                        {inv.bookingId}
                      </Link>
                    </p>
                  </td>

                  {/* Customer */}
                  <td className="px-4 py-4">
                    <p className="text-sm text-slate-900">
                      {isAr ? inv.customerNameAr : inv.customerNameEn}
                    </p>
                  </td>

                  {/* Issue date */}
                  <td className="px-4 py-4 hidden lg:table-cell">
                    <span className="text-sm text-slate-600">
                      {formatDate(inv.issueDate, fmtLocale)}
                    </span>
                  </td>

                  {/* Due date — red when overdue */}
                  <td className="px-4 py-4 hidden lg:table-cell">
                    <span
                      className={`text-sm ${
                        inv.status === 'overdue'
                          ? 'text-red-600 font-medium'
                          : 'text-slate-600'
                      }`}
                    >
                      {formatDate(inv.dueDate, fmtLocale)}
                    </span>
                  </td>

                  {/* Amount */}
                  <td className="px-4 py-4 text-end">
                    <span className="text-sm font-semibold text-slate-900">
                      {formatCurrency(inv.grandTotalHalalas, fmtLocale)}
                    </span>
                  </td>

                  {/* Invoice status badge */}
                  <td className="px-4 py-4">
                    <InvoiceStatusBadge status={inv.status} locale={locale} />
                  </td>

                  {/* ZATCA status dot + label */}
                  <td className="px-4 py-4 hidden md:table-cell">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`w-2 h-2 rounded-full flex-shrink-0 ${zatcaColors[inv.zatcaStatus]}`}
                      />
                      <span className="text-xs text-slate-500">
                        {isAr
                          ? zatcaLabels[inv.zatcaStatus].ar
                          : zatcaLabels[inv.zatcaStatus].en}
                      </span>
                    </div>
                  </td>

                  {/* Actions */}
                  <td className="ps-4 pe-6 py-4 text-end">
                    <div className="flex items-center justify-end gap-1">
                      <Link
                        href={`/${locale}/invoices/${inv.id}`}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg
                                   text-xs font-medium text-slate-600 hover:bg-slate-100 transition-colors"
                      >
                        {isAr ? 'عرض' : 'View'}
                      </Link>
                      <button
                        aria-label={isAr ? 'تحميل PDF' : 'Download PDF'}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg
                                   text-xs font-medium text-slate-600 hover:bg-slate-100 transition-colors"
                      >
                        <Download size={13} />
                        PDF
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Table footer — row count */}
        <div className="px-6 py-3 border-t border-surface-border bg-slate-50/30">
          <p className="text-xs text-slate-400">
            {isAr
              ? `عرض ${demoInvoices.length} من ${demoInvoices.length} فاتورة`
              : `Showing ${demoInvoices.length} of ${demoInvoices.length} invoices`}
          </p>
        </div>
      </Card>
    </div>
  );
}
