'use client';

import { useLocale } from 'next-intl';
import { cn, formatCurrency, formatDate } from '@/lib/utils';
import { Printer, Download } from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface InvoiceLine {
  id: string;
  nameAr: string;
  nameEn: string;
  quantity: number;
  unitCode: string;
  unitPriceExclVatHalalas: number;
  totalExclVatHalalas: number;
  vatRate: number;
  vatAmountHalalas: number;
  totalInclVatHalalas: number;
}

interface PrintableInvoiceData {
  invoiceNumber: string;
  uuid: string;
  issueDate: Date;
  dueDate?: Date;
  invoiceTypeCode: '388' | '381' | '383';
  currency: 'SAR';

  seller: {
    nameAr: string;
    nameEn: string;
    vatNumber: string;
    crNumber: string;
    isVatRegistered?: boolean;
    address: {
      streetName: string;
      buildingNumber: string;
      district: string;
      city: string;
      postalCode: string;
    };
    phone?: string;
    email?: string;
  };

  buyer: {
    nameAr: string;
    nameEn?: string;
    vatNumber?: string;
    phone?: string;
    address?: { city?: string; countryCode?: string };
  };

  lines: InvoiceLine[];

  totals: {
    subtotalExclVatHalalas: number;
    totalVatHalalas: number;
    grandTotalHalalas: number;
  };

  qrCodeData?: string;
  digitalSignature?: string;
  zatcaStatus?: string;
  notes?: string;
}

interface PrintableInvoiceProps {
  invoice: PrintableInvoiceData;
  onClose?: () => void;
}

const INVOICE_TYPE_LABELS: Record<string, { ar: string; en: string }> = {
  '388': { ar: 'فاتورة ضريبية',    en: 'Tax Invoice' },
  '381': { ar: 'إشعار دائن',       en: 'Credit Note' },
  '383': { ar: 'إشعار مدين',       en: 'Debit Note' },
};

export function PrintableInvoice({ invoice, onClose }: PrintableInvoiceProps) {
  const locale = useLocale();
  const isAr = locale === 'ar';
  const isVatRegistered = invoice.seller.isVatRegistered === true;
  const typeLabel = isVatRegistered
    ? (INVOICE_TYPE_LABELS[invoice.invoiceTypeCode] ?? INVOICE_TYPE_LABELS['388']!)
    : { ar: 'فاتورة تجارية', en: 'Commercial Invoice' };

  function handlePrint() {
    window.print();
  }

  return (
    <>
      {/* Action bar — hidden when printing */}
      <div className="print:hidden flex items-center justify-between mb-6 p-4 bg-white border-b border-surface-border sticky top-0 z-10">
        <div className="flex items-center gap-2">
          {onClose && (
            <Button variant="ghost" size="sm" onClick={onClose}>
              {isAr ? 'إغلاق' : 'Close'}
            </Button>
          )}
          <span className="text-sm font-mono font-medium text-slate-700">{invoice.invoiceNumber}</span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handlePrint}>
            <Download size={15} />
            {isAr ? 'حفظ PDF' : 'Save PDF'}
          </Button>
          <Button size="sm" onClick={handlePrint}>
            <Printer size={15} />
            {isAr ? 'طباعة' : 'Print'}
          </Button>
        </div>
      </div>

      {/* Invoice document */}
      <div
        id="printable-invoice"
        className={cn(
          'bg-white mx-auto shadow-lg print:shadow-none',
          'w-full max-w-3xl',
          'p-8 print:p-6',
          'font-arabic print:text-sm'
        )}
        style={{ fontFamily: "'Tajawal', 'Arial', sans-serif" }}
        dir="rtl"
      >
        {/* ── Header ── */}
        <div className="flex items-start justify-between mb-8 pb-6 border-b-2 border-brand-600">
          {/* Logo + agency name */}
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-xl bg-brand-600 flex items-center justify-center flex-shrink-0">
              <span className="text-3xl font-bold text-white">م</span>
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900">{invoice.seller.nameAr}</h2>
              <p className="text-sm text-slate-500 mt-0.5" dir="ltr">{invoice.seller.nameEn}</p>
            </div>
          </div>

          {/* Invoice type + number */}
          <div className="text-end">
            <h1 className="text-2xl font-bold text-brand-700">{typeLabel.ar}</h1>
            <p className="text-base font-medium text-slate-600 mt-0.5">{typeLabel.en}</p>
            <p className="text-xl font-mono font-bold text-slate-900 mt-2">{invoice.invoiceNumber}</p>
          </div>
        </div>

        {/* ── Invoice meta ── */}
        <div className="grid grid-cols-2 gap-6 mb-8">
          <div className="space-y-2">
            {[
              ...(isVatRegistered ? [{ labelAr: 'رقم UUID', labelEn: 'UUID', value: invoice.uuid, mono: true, truncate: true }] : []),
              { labelAr: 'تاريخ الإصدار', labelEn: 'Issue Date', value: formatDate(invoice.issueDate, 'ar-SA') },
              ...(invoice.dueDate ? [{ labelAr: 'تاريخ الاستحقاق', labelEn: 'Due Date', value: formatDate(invoice.dueDate, 'ar-SA') }] : []),
              { labelAr: 'العملة', labelEn: 'Currency', value: 'SAR — ريال سعودي' },
            ].map(field => (
              <div key={field.labelAr} className="flex justify-between items-baseline gap-2">
                <span className="text-xs text-slate-400">{field.labelEn}</span>
                <span className={cn(
                  'text-sm font-medium text-slate-800',
                  field.mono && 'font-mono text-xs',
                  field.truncate && 'truncate max-w-[200px]'
                )}>
                  {field.value}
                </span>
              </div>
            ))}
          </div>

          {/* QR code — only for VAT-registered agencies */}
          {isVatRegistered ? (
            <div className="flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-xl p-4">
              <div className="w-24 h-24 bg-slate-50 rounded flex items-center justify-center">
                <span className="text-xs text-slate-300 text-center">QR Code<br/>Placeholder</span>
              </div>
              <p className="text-xs text-slate-400 mt-2 text-center">امسح لتحقق ZATCA<br/><span dir="ltr">Scan to verify</span></p>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center rounded-xl p-4 bg-slate-50 border border-slate-100">
              <p className="text-xs text-slate-400 text-center leading-relaxed">
                إيصال خدمة<br/>
                <span className="text-slate-300">غير خاضع لضريبة القيمة المضافة</span><br/>
                <span dir="ltr" className="text-slate-300">Service Receipt — VAT Exempt</span>
              </p>
            </div>
          )}
        </div>

        {/* ── Parties ── */}
        <div className="grid grid-cols-2 gap-6 mb-8">
          {/* Seller */}
          <div className="p-4 rounded-xl bg-brand-50 border border-brand-100">
            <p className="text-xs font-bold text-brand-700 uppercase tracking-wider mb-3">
              البائع / Supplier
            </p>
            <p className="font-bold text-slate-900 mb-1">{invoice.seller.nameAr}</p>
            <p className="text-sm text-slate-600 mb-0.5" dir="ltr">{invoice.seller.nameEn}</p>
            <div className="mt-2 space-y-1 text-xs text-slate-600">
              <p>الرقم الضريبي / VAT: <span className="font-mono font-semibold">{invoice.seller.vatNumber}</span></p>
              <p>س.ت / CR: <span className="font-mono font-semibold">{invoice.seller.crNumber}</span></p>
              <p>{invoice.seller.address.streetName}، {invoice.seller.address.district}، {invoice.seller.address.city}</p>
              {invoice.seller.phone && <p>هاتف: {invoice.seller.phone}</p>}
            </div>
          </div>

          {/* Buyer */}
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
              المشتري / Buyer
            </p>
            <p className="font-bold text-slate-900 mb-1">{invoice.buyer.nameAr}</p>
            {invoice.buyer.nameEn && <p className="text-sm text-slate-600 mb-0.5">{invoice.buyer.nameEn}</p>}
            {invoice.buyer.vatNumber && (
              <div className="mt-2 text-xs text-slate-600">
                <p>الرقم الضريبي / VAT: <span className="font-mono font-semibold">{invoice.buyer.vatNumber}</span></p>
              </div>
            )}
            {invoice.buyer.phone && (
              <p className="text-xs text-slate-600 mt-1">هاتف: {invoice.buyer.phone}</p>
            )}
          </div>
        </div>

        {/* ── Line items ── */}
        <table className="w-full mb-6 text-sm" dir="rtl">
          <thead>
            <tr className="bg-brand-600 text-white">
              <th className="text-start pe-3 ps-4 py-3 font-semibold rounded-s-lg">الوصف / Description</th>
              <th className="text-center px-3 py-3 font-semibold">الكمية / Qty</th>
              <th className="text-end px-3 py-3 font-semibold">سعر الوحدة / Unit Price</th>
              {isVatRegistered && <th className="text-center px-3 py-3 font-semibold">VAT %</th>}
              {isVatRegistered && <th className="text-end px-3 py-3 font-semibold">VAT</th>}
              <th className="text-end px-3 pe-4 py-3 font-semibold rounded-e-lg">الإجمالي / Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {invoice.lines.map((line, idx) => (
              <tr key={line.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                <td className="pe-3 ps-4 py-3">
                  <p className="font-medium text-slate-900">{line.nameAr}</p>
                  <p className="text-xs text-slate-400">{line.nameEn}</p>
                </td>
                <td className="px-3 py-3 text-center text-slate-700">
                  {line.quantity} {line.unitCode}
                </td>
                <td className="px-3 py-3 text-end text-slate-700">
                  {formatCurrency(line.unitPriceExclVatHalalas, 'ar-SA')}
                </td>
                {isVatRegistered && (
                  <td className="px-3 py-3 text-center">
                    {line.vatRate === 0 ? (
                      <span className="text-xs bg-slate-200 text-slate-600 px-2 py-0.5 rounded">معفى</span>
                    ) : (
                      <span className="text-slate-700">{(line.vatRate * 100).toFixed(0)}%</span>
                    )}
                  </td>
                )}
                {isVatRegistered && (
                  <td className="px-3 py-3 text-end text-slate-700">
                    {formatCurrency(line.vatAmountHalalas, 'ar-SA')}
                  </td>
                )}
                <td className="px-3 pe-4 py-3 text-end font-semibold text-slate-900">
                  {formatCurrency(isVatRegistered ? line.totalInclVatHalalas : line.totalExclVatHalalas, 'ar-SA')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* ── Totals ── */}
        <div className="flex justify-end mb-8">
          <div className="w-72 space-y-2">
            {isVatRegistered && (
              <>
                <div className="flex justify-between text-sm text-slate-600 py-1">
                  <span>المجموع قبل الضريبة / Subtotal excl. VAT</span>
                  <span className="font-medium">{formatCurrency(invoice.totals.subtotalExclVatHalalas, 'ar-SA')}</span>
                </div>
                <div className="flex justify-between text-sm text-slate-600 py-1">
                  <span>ضريبة القيمة المضافة 15% / VAT 15%</span>
                  <span className="font-medium">{formatCurrency(invoice.totals.totalVatHalalas, 'ar-SA')}</span>
                </div>
              </>
            )}
            <div className="flex justify-between font-bold text-base text-white bg-brand-600 rounded-xl px-4 py-3 mt-2">
              <span>{isVatRegistered ? 'الإجمالي شامل الضريبة / Total incl. VAT' : 'إجمالي المبلغ / Total Amount'}</span>
              <span>{formatCurrency(invoice.totals.grandTotalHalalas, 'ar-SA')}</span>
            </div>
          </div>
        </div>

        {/* ── Notes ── */}
        {invoice.notes && (
          <div className="mb-6 p-4 rounded-xl bg-amber-50 border border-amber-100">
            <p className="text-xs font-semibold text-amber-700 mb-1">ملاحظات / Notes</p>
            <p className="text-sm text-slate-700">{invoice.notes}</p>
          </div>
        )}

        {/* ── Footer ── */}
        <div className="border-t-2 border-slate-200 pt-6">
          <div className="flex items-start justify-between gap-4">
            <div className="text-xs text-slate-500 space-y-1 max-w-sm">
              {isVatRegistered ? (
                <>
                  <p className="font-semibold text-slate-700 mb-2">إشعار الامتثال لـ ZATCA / ZATCA Compliance Notice</p>
                  <p>هذه الفاتورة متوافقة مع متطلبات هيئة الزكاة والضريبة والجمارك (ZATCA) — المرحلة الثانية من الفوترة الإلكترونية.</p>
                  <p className="mt-1" dir="ltr">This invoice complies with ZATCA Phase 2 e-invoicing requirements (UBL 2.1).</p>
                  {invoice.zatcaStatus && invoice.zatcaStatus !== 'not_applicable' && (
                    <p className="mt-1 font-medium text-emerald-700">
                      حالة ZATCA: {invoice.zatcaStatus === 'cleared' ? 'مخلصة ✓' : invoice.zatcaStatus}
                    </p>
                  )}
                </>
              ) : (
                <>
                  <p className="font-semibold text-slate-700 mb-2">فاتورة تجارية — غير خاضع لضريبة القيمة المضافة</p>
                  <p>هذه الفاتورة صادرة عن منشأة غير مسجّلة في نظام ضريبة القيمة المضافة لدى هيئة الزكاة والضريبة والجمارك.</p>
                  <p className="mt-1" dir="ltr">Commercial Invoice — Issued by a non-VAT registered entity.</p>
                </>
              )}
            </div>
            <div className="text-end text-xs text-slate-400">
              <p className="font-mono">{invoice.invoiceNumber}</p>
              {isVatRegistered && <p className="font-mono text-xs">{invoice.uuid.substring(0, 18)}...</p>}
              <p className="mt-1">نظام مسارات ERP © 2026</p>
            </div>
          </div>
        </div>
      </div>

      {/* Print styles injected via style tag */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #printable-invoice, #printable-invoice * { visibility: visible; }
          #printable-invoice {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            max-width: 100%;
            padding: 20px;
            box-shadow: none;
          }
          @page {
            size: A4;
            margin: 10mm;
          }
        }
      `}</style>
    </>
  );
}
