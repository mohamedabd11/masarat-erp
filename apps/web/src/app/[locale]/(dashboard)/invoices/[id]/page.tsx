import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { InvoiceStatusBadge } from '@/components/ui/StatusBadge';
import { formatCurrency, formatDate } from '@/lib/utils';
import {
  ArrowRight,
  ArrowLeft,
  Printer,
  Download,
  Building2,
  User,
  CalendarDays,
  Hash,
  ShieldCheck,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type ZatcaStatus = 'pending' | 'submitted' | 'cleared' | 'reported' | 'failed';
type InvoiceStatus = 'draft' | 'pending' | 'paid' | 'overdue' | 'cancelled' | 'refunded';

interface LineItem {
  descriptionAr: string;
  descriptionEn: string;
  qty: number;
  unitPriceHalalas: number;   // excl. VAT
  vatPercent: number;         // e.g. 15
}

interface InvoiceDetail {
  id: string;
  invoiceNumber: string;
  customerNameAr: string;
  customerNameEn: string;
  customerPhone: string;
  customerVatNumber?: string;
  bookingId: string;
  issueDate: Date;
  dueDate: Date;
  status: InvoiceStatus;
  zatcaStatus: ZatcaStatus;
  zatcaUuid?: string;
  lineItems: LineItem[];
}

// ─── Demo data ────────────────────────────────────────────────────────────────
// INV-001 full detail (matches the list page entry for Ahmed Al-Omari)

const demoInvoiceDetail: InvoiceDetail = {
  id: 'INV-001',
  invoiceNumber: 'INV-2026-000248',
  customerNameAr: 'أحمد محمد العمري',
  customerNameEn: 'Ahmed Al-Omari',
  customerPhone: '0501234567',
  bookingId: 'BK-2026-000248',
  issueDate: new Date('2026-05-20'),
  dueDate: new Date('2026-06-05'),
  status: 'paid',
  zatcaStatus: 'cleared',
  zatcaUuid: 'ZT-2026-A3F9B2C1-D4E5',
  lineItems: [
    {
      descriptionAr: 'باقة عمرة (2 مسافر) — رحلة طيران ذهاب وإياب + فندق 5 ليالي',
      descriptionEn: 'Umrah Package (2 pax) — Round-trip flights + 5-night hotel',
      qty: 1,
      unitPriceHalalas: 160000,   // 1,600 SAR excl. VAT per item (×2 pax line)
      vatPercent: 15,
    },
    {
      descriptionAr: 'رسوم التأشيرة (2 مسافر)',
      descriptionEn: 'Visa Fees (2 pax)',
      qty: 2,
      unitPriceHalalas: 15000,    // 150 SAR each
      vatPercent: 0,              // Visa fees zero-rated
    },
    {
      descriptionAr: 'رسوم الخدمة والإدارة',
      descriptionEn: 'Service & Handling Fee',
      qty: 1,
      unitPriceHalalas: 25000,    // 250 SAR
      vatPercent: 15,
    },
    {
      descriptionAr: 'تأمين السفر (2 مسافر)',
      descriptionEn: 'Travel Insurance (2 pax)',
      qty: 2,
      unitPriceHalalas: 7500,     // 75 SAR each
      vatPercent: 15,
    },
  ],
};

// ─── Seller constants ─────────────────────────────────────────────────────────

const SELLER = {
  nameAr: 'مسارات للسياحة والسفر',
  nameEn: 'Masarat Tourism & Travel',
  vatNumber: '300000000000003',
  crNumber: '1010000000',
  addressAr: 'الرياض، المملكة العربية السعودية',
  addressEn: 'Riyadh, Saudi Arabia',
  phone: '+966 11 000 0000',
  email: 'info@masarat.sa',
};

// ─── ZATCA badge helpers ──────────────────────────────────────────────────────

const zatcaBgClass: Record<ZatcaStatus, string> = {
  pending:   'bg-amber-50  text-amber-700  ring-amber-200',
  submitted: 'bg-sky-50    text-sky-700    ring-sky-200',
  cleared:   'bg-emerald-50 text-emerald-700 ring-emerald-200',
  reported:  'bg-emerald-50 text-emerald-700 ring-emerald-200',
  failed:    'bg-red-50    text-red-700    ring-red-200',
};

const zatcaDotClass: Record<ZatcaStatus, string> = {
  pending:   'bg-amber-400',
  submitted: 'bg-sky-400',
  cleared:   'bg-emerald-500',
  reported:  'bg-emerald-500',
  failed:    'bg-red-500',
};

const zatcaLabels: Record<ZatcaStatus, { ar: string; en: string }> = {
  pending:   { ar: 'بانتظار الإرسال', en: 'Pending Submission' },
  submitted: { ar: 'تم الإرسال',      en: 'Submitted' },
  cleared:   { ar: 'مخلصة',           en: 'Cleared' },
  reported:  { ar: 'مبلغ عنها',       en: 'Reported' },
  failed:    { ar: 'فشل الإرسال',     en: 'Submission Failed' },
};

// ─── Totals calculator ────────────────────────────────────────────────────────

function calcTotals(items: LineItem[]) {
  let subtotalHalalas = 0;
  let vatHalalas = 0;

  const rows = items.map((item) => {
    const lineNet   = item.qty * item.unitPriceHalalas;
    const lineVat   = Math.round(lineNet * item.vatPercent / 100);
    const lineTotal = lineNet + lineVat;
    subtotalHalalas += lineNet;
    vatHalalas      += lineVat;
    return { ...item, lineNet, lineVat, lineTotal };
  });

  return { rows, subtotalHalalas, vatHalalas, grandTotalHalalas: subtotalHalalas + vatHalalas };
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function InvoiceDetailPage({
  params,
}: {
  params: { locale: string; id: string };
}) {
  const t        = await getTranslations('invoices');
  const tCommon  = await getTranslations('common');
  const locale   = params.locale;
  const isAr     = locale === 'ar';
  const fmtLocale = isAr ? 'ar-SA' : 'en-SA';

  // In production: fetch by params.id from Firestore.
  // For demo, only INV-001 is detailed; everything else 404s.
  if (params.id !== 'INV-001') notFound();

  const inv = demoInvoiceDetail;
  const { rows, subtotalHalalas, vatHalalas, grandTotalHalalas } = calcTotals(inv.lineItems);

  const BackIcon = isAr ? ArrowRight : ArrowLeft;

  return (
    <div className="max-w-4xl mx-auto space-y-6">

      {/* ── Page header ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        {/* Back + title */}
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <Link
            href={`/${locale}/invoices`}
            className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors flex-shrink-0"
            aria-label={tCommon('back')}
          >
            <BackIcon size={18} />
          </Link>
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-slate-900 font-mono truncate">
              {inv.invoiceNumber}
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              <Link
                href={`/${locale}/bookings/${inv.bookingId}`}
                className="hover:text-brand-600 hover:underline"
              >
                {inv.bookingId}
              </Link>
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            aria-label={isAr ? 'طباعة' : 'Print'}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200
                       text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
          >
            <Printer size={15} />
            {isAr ? 'طباعة' : 'Print'}
          </button>
          <button
            aria-label={isAr ? 'تحميل PDF' : 'Download PDF'}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg
                       bg-brand-600 text-white text-sm font-medium hover:bg-brand-700 transition-colors"
          >
            <Download size={15} />
            {isAr ? 'تحميل PDF' : 'Download PDF'}
          </button>
        </div>
      </div>

      {/* ── Invoice header card ─────────────────────────────────────────────── */}
      <Card>
        <div className="flex flex-col sm:flex-row sm:items-start gap-6">

          {/* Left: invoice meta */}
          <div className="flex-1 space-y-4">
            {/* Number + status */}
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-mono text-lg font-bold text-slate-900">
                {inv.invoiceNumber}
              </span>
              <InvoiceStatusBadge status={inv.status} locale={locale} />
              {/* ZATCA badge */}
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ring-1 ring-inset ${zatcaBgClass[inv.zatcaStatus]}`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${zatcaDotClass[inv.zatcaStatus]}`} />
                ZATCA: {isAr ? zatcaLabels[inv.zatcaStatus].ar : zatcaLabels[inv.zatcaStatus].en}
              </span>
            </div>

            {/* Dates grid */}
            <div className="grid grid-cols-2 gap-x-8 gap-y-3">
              <div className="flex items-start gap-2">
                <CalendarDays size={15} className="text-slate-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-xs text-slate-400">
                    {isAr ? 'تاريخ الإصدار' : 'Issue Date'}
                  </p>
                  <p className="text-sm text-slate-700 font-medium">
                    {formatDate(inv.issueDate, fmtLocale)}
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <CalendarDays size={15} className="text-slate-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-xs text-slate-400">
                    {isAr ? 'تاريخ الاستحقاق' : 'Due Date'}
                  </p>
                  <p className={`text-sm font-medium ${
                    inv.status === 'overdue' ? 'text-red-600' : 'text-slate-700'
                  }`}>
                    {formatDate(inv.dueDate, fmtLocale)}
                  </p>
                </div>
              </div>
              {inv.zatcaUuid && (
                <div className="col-span-2 flex items-start gap-2">
                  <Hash size={15} className="text-slate-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-xs text-slate-400">
                      {isAr ? 'معرف ZATCA' : 'ZATCA UUID'}
                    </p>
                    <p className="text-xs font-mono text-slate-600 break-all">
                      {inv.zatcaUuid}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right: QR code placeholder */}
          <div className="flex flex-col items-center gap-2 flex-shrink-0">
            <div
              className="w-28 h-28 rounded-lg border-2 border-dashed border-slate-200
                         bg-slate-50 flex items-center justify-center"
              aria-label={isAr ? 'رمز QR للفاتورة' : 'Invoice QR code'}
            >
              <div className="text-center">
                <div className="grid grid-cols-3 gap-0.5 mb-1 mx-auto w-fit">
                  {Array.from({ length: 9 }).map((_, i) => (
                    <div
                      key={i}
                      className={`w-2.5 h-2.5 rounded-sm ${
                        [0, 2, 6, 8, 4].includes(i) ? 'bg-slate-400' : 'bg-slate-200'
                      }`}
                    />
                  ))}
                </div>
                <p className="text-[9px] text-slate-400 mt-1">
                  {isAr ? 'رمز QR' : 'QR Code'}
                </p>
              </div>
            </div>
            <p className="text-[10px] text-slate-400 text-center max-w-[7rem]">
              {isAr ? 'امسح للتحقق من الفاتورة' : 'Scan to verify invoice'}
            </p>
          </div>
        </div>
      </Card>

      {/* ── Seller + Buyer info ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

        {/* Seller */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 size={16} className="text-brand-600" />
              {isAr ? 'بيانات البائع' : 'Seller Details'}
            </CardTitle>
          </CardHeader>
          <dl className="space-y-2 text-sm">
            <div>
              <dt className="text-xs text-slate-400">
                {isAr ? 'اسم الشركة' : 'Company Name'}
              </dt>
              <dd className="text-slate-900 font-semibold mt-0.5">
                {isAr ? SELLER.nameAr : SELLER.nameEn}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-400">
                {isAr ? 'الرقم الضريبي' : 'VAT Number'}
              </dt>
              <dd className="text-slate-700 font-mono mt-0.5">{SELLER.vatNumber}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-400">
                {isAr ? 'رقم السجل التجاري' : 'CR Number'}
              </dt>
              <dd className="text-slate-700 font-mono mt-0.5">{SELLER.crNumber}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-400">
                {isAr ? 'العنوان' : 'Address'}
              </dt>
              <dd className="text-slate-700 mt-0.5">
                {isAr ? SELLER.addressAr : SELLER.addressEn}
              </dd>
            </div>
            <div className="flex gap-4">
              <div>
                <dt className="text-xs text-slate-400">{isAr ? 'الهاتف' : 'Phone'}</dt>
                <dd className="text-slate-700 font-mono text-xs mt-0.5" dir="ltr">
                  {SELLER.phone}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-400">{isAr ? 'البريد' : 'Email'}</dt>
                <dd className="text-slate-700 text-xs mt-0.5">{SELLER.email}</dd>
              </div>
            </div>
          </dl>
        </Card>

        {/* Buyer */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User size={16} className="text-slate-500" />
              {isAr ? 'بيانات المشتري' : 'Buyer Details'}
            </CardTitle>
          </CardHeader>
          <dl className="space-y-2 text-sm">
            <div>
              <dt className="text-xs text-slate-400">
                {isAr ? 'الاسم' : 'Name'}
              </dt>
              <dd className="text-slate-900 font-semibold mt-0.5">
                {isAr ? inv.customerNameAr : inv.customerNameEn}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-slate-400">
                {isAr ? 'رقم الهاتف' : 'Phone'}
              </dt>
              <dd className="text-slate-700 font-mono mt-0.5" dir="ltr">
                {inv.customerPhone}
              </dd>
            </div>
            {inv.customerVatNumber && (
              <div>
                <dt className="text-xs text-slate-400">
                  {isAr ? 'الرقم الضريبي' : 'VAT Number'}
                </dt>
                <dd className="text-slate-700 font-mono mt-0.5">
                  {inv.customerVatNumber}
                </dd>
              </div>
            )}
            <div>
              <dt className="text-xs text-slate-400">
                {isAr ? 'رقم الحجز' : 'Booking Ref'}
              </dt>
              <dd className="mt-0.5">
                <Link
                  href={`/${locale}/bookings/${inv.bookingId}`}
                  className="text-brand-700 font-mono hover:underline text-sm"
                >
                  {inv.bookingId}
                </Link>
              </dd>
            </div>
          </dl>
        </Card>
      </div>

      {/* ── Line items table ─────────────────────────────────────────────────── */}
      <Card padding="none">
        <div className="px-6 py-4 border-b border-surface-border">
          <h2 className="text-base font-semibold text-slate-900">
            {isAr ? 'بنود الفاتورة' : 'Invoice Items'}
          </h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-border bg-slate-50/60">
                <th className="text-start ps-6 pe-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  {isAr ? 'الوصف' : 'Description'}
                </th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider w-16">
                  {isAr ? 'الكمية' : 'Qty'}
                </th>
                <th className="text-end px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  {isAr ? 'سعر الوحدة' : 'Unit Price'}
                </th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider w-20">
                  {isAr ? 'ض.ق.م %' : 'VAT %'}
                </th>
                <th className="text-end px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  {isAr ? 'مبلغ الضريبة' : 'VAT Amt'}
                </th>
                <th className="text-end ps-4 pe-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  {isAr ? 'الإجمالي' : 'Total'}
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-surface-border">
              {rows.map((row, idx) => (
                <tr key={idx} className="hover:bg-slate-50/40 transition-colors">
                  <td className="ps-6 pe-4 py-4">
                    <p className="text-slate-900 font-medium">
                      {isAr ? row.descriptionAr : row.descriptionEn}
                    </p>
                  </td>
                  <td className="px-4 py-4 text-center text-slate-600">
                    {row.qty.toLocaleString(fmtLocale)}
                  </td>
                  <td className="px-4 py-4 text-end text-slate-600">
                    {formatCurrency(row.unitPriceHalalas, fmtLocale)}
                  </td>
                  <td className="px-4 py-4 text-center">
                    {row.vatPercent === 0 ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-500">
                        {isAr ? 'معفى' : 'Exempt'}
                      </span>
                    ) : (
                      <span className="text-slate-600">
                        {row.vatPercent}%
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-4 text-end text-slate-600">
                    {formatCurrency(row.lineVat, fmtLocale)}
                  </td>
                  <td className="ps-4 pe-6 py-4 text-end font-semibold text-slate-900">
                    {formatCurrency(row.lineTotal, fmtLocale)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* ── Totals section ──────────────────────────────────────────────── */}
        <div className="border-t border-surface-border">
          <div className="flex justify-end px-6 py-4">
            <div className="w-full sm:w-80 space-y-2">

              {/* Subtotal excl. VAT */}
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500">
                  {isAr ? 'المجموع (قبل الضريبة)' : 'Subtotal (excl. VAT)'}
                </span>
                <span className="text-slate-700 font-medium">
                  {formatCurrency(subtotalHalalas, fmtLocale)}
                </span>
              </div>

              {/* VAT */}
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500">
                  {isAr ? 'ضريبة القيمة المضافة (15%)' : 'VAT (15%)'}
                </span>
                <span className="text-slate-700 font-medium">
                  {formatCurrency(vatHalalas, fmtLocale)}
                </span>
              </div>

              {/* Divider */}
              <div className="border-t border-slate-200 pt-2 mt-1">
                <div className="flex items-center justify-between">
                  <span className="text-base font-bold text-slate-900">
                    {isAr ? 'الإجمالي الكلي' : 'Grand Total'}
                  </span>
                  <span className="text-xl font-bold text-brand-700">
                    {formatCurrency(grandTotalHalalas, fmtLocale)}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-1 text-end">
                  {isAr ? 'شامل ضريبة القيمة المضافة' : 'Inclusive of VAT'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* ── ZATCA compliance footer ──────────────────────────────────────────── */}
      <Card className="border-emerald-200 bg-emerald-50/40">
        <div className="flex items-start gap-3">
          <ShieldCheck size={20} className="text-emerald-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm space-y-1">
            <p className="font-semibold text-emerald-800">
              {isAr
                ? 'فاتورة إلكترونية متوافقة مع هيئة الزكاة والضريبة والجمارك (ZATCA)'
                : 'E-Invoice compliant with ZATCA (Zakat, Tax & Customs Authority)'}
            </p>
            <p className="text-emerald-700 text-xs leading-relaxed">
              {isAr
                ? `هذه الفاتورة صادرة وفق متطلبات نظام الفوترة الإلكترونية (فاتورة) المرحلة الثانية — تكامل مع منصة ZATCA. رقم UUID: ${inv.zatcaUuid ?? 'غير متوفر'}`
                : `This invoice is issued in compliance with ZATCA e-invoicing Phase 2 (Integration Phase). UUID: ${inv.zatcaUuid ?? 'N/A'}`}
            </p>
            <p className="text-emerald-600 text-xs">
              {isAr
                ? `حالة الإرسال: ${zatcaLabels[inv.zatcaStatus].ar}`
                : `Submission status: ${zatcaLabels[inv.zatcaStatus].en}`}
            </p>
          </div>
        </div>
      </Card>

    </div>
  );
}
