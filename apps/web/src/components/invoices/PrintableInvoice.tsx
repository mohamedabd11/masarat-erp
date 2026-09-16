'use client';

import { useLocale } from 'next-intl';
import { cn, formatCurrency, formatDate } from '@/lib/utils';
import { Printer, Download } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { invoiceDocumentLabel, vatCategoryLabel } from '@/lib/invoice-presentation';

// ─── Types ────────────────────────────────────────────────────────────────────

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
  vatCategory?: string;
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
    logoUrl?: string;
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

// ─── Helper: stacked info field ───────────────────────────────────────────────

function InfoField({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-[10px] text-slate-400 leading-none mb-0.5">{label}</p>
      <p className={cn('text-sm font-semibold text-slate-900', mono && 'font-mono text-xs')}>{value}</p>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function PrintableInvoice({ invoice, onClose }: PrintableInvoiceProps) {
  const locale = useLocale();
  const isAr = locale === 'ar';
  const fmtLocale = isAr ? 'ar-SA' : 'en-SA';
  const isVatRegistered = invoice.seller.isVatRegistered === true;
  const isBuyerBusiness = isVatRegistered && !!(invoice.buyer.vatNumber?.trim());
  const typeLabel = invoiceDocumentLabel(invoice.invoiceTypeCode, isVatRegistered, isBuyerBusiness);
  const documentLabel = isAr ? typeLabel.ar : typeLabel.en;
  const sellerName = isAr
    ? (invoice.seller.nameAr || invoice.seller.nameEn)
    : (invoice.seller.nameEn || invoice.seller.nameAr);
  const buyerName = isAr
    ? (invoice.buyer.nameAr || invoice.buyer.nameEn || '—')
    : (invoice.buyer.nameEn || invoice.buyer.nameAr || '—');

  const sellerAddress = [
    invoice.seller.address.streetName,
    invoice.seller.address.buildingNumber,
    invoice.seller.address.district,
    invoice.seller.address.city,
    invoice.seller.address.postalCode,
  ].filter(Boolean).join(isAr ? '، ' : ', ');

  function handlePrint() { window.print(); }

  return (
    <>
      {/* ── Action bar (screen only) ── */}
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

      {/* ── Invoice document ── */}
      <div
        id="printable-invoice"
        dir={isAr ? 'rtl' : 'ltr'}
        className="bg-white mx-auto shadow-lg print:shadow-none w-full max-w-3xl print:text-sm"
        style={{ fontFamily: isAr ? "'Tajawal', 'Arial', sans-serif" : "'Inter', 'Arial', sans-serif" }}
      >

        {/* ══ HEADER BAND ══════════════════════════════════════════════════════ */}
        <div className="bg-brand-600 px-8 py-5 flex items-center justify-between">
          {/* Invoice title (RIGHT in RTL) */}
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">{documentLabel}</h1>
          </div>
          {/* Agency logo + name (LEFT in RTL) */}
          <div className="flex items-center gap-3">
            <div className="text-end">
              <p className="text-white font-bold text-lg leading-tight">{sellerName}</p>
            </div>
            {invoice.seller.logoUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={invoice.seller.logoUrl}
                alt={sellerName}
                style={{ height: 48, width: 'auto', objectFit: 'contain', maxWidth: 120, background: 'white', borderRadius: 8, padding: 4 }}
              />
            ) : (
              <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
                <span className="text-2xl font-black text-white">{isAr ? 'م' : 'M'}</span>
              </div>
            )}
          </div>
        </div>

        {/* ══ INVOICE NUMBER STRIP ═════════════════════════════════════════════ */}
        <div className="bg-brand-50 border-b border-brand-100 px-8 py-3 flex items-center justify-between">
          <p className="text-[10px] text-brand-500 uppercase tracking-widest font-semibold">
            {documentLabel}
          </p>
          <p className="font-mono font-bold text-brand-700 text-base">{invoice.invoiceNumber}</p>
        </div>

        <div className="px-8 py-6 space-y-6">

          {/* ══ META INFO + QR ═══════════════════════════════════════════════════ */}
          <div className="grid grid-cols-2 gap-6">

            {/* Info fields — stacked label-above-value (fixes date alignment bug) */}
            <div className="grid grid-cols-2 gap-x-6 gap-y-4">
              <InfoField label={isAr ? 'تاريخ الإصدار' : 'Issue Date'} value={formatDate(invoice.issueDate, fmtLocale)} />
              <InfoField label={isAr ? 'العملة' : 'Currency'} value={isAr ? 'ريال سعودي' : 'Saudi riyal'} />
              {invoice.dueDate && (
                <InfoField label={isAr ? 'تاريخ الاستحقاق' : 'Due Date'} value={formatDate(invoice.dueDate, fmtLocale)} />
              )}
            </div>

            {/* QR code (VAT) or contact summary (non-VAT) */}
            {isVatRegistered && invoice.qrCodeData ? (
              <div className="flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-xl p-4 bg-slate-50">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={invoice.qrCodeData} width={120} height={120} alt={isAr ? 'رمز التحقق الضريبي' : 'Tax verification QR code'} style={{ display: 'block' }} />
              </div>
            ) : (
              <div className="rounded-xl border border-brand-100 bg-brand-50 p-4 space-y-2">
                <p className="text-[10px] font-bold text-brand-600 uppercase tracking-widest">{isAr ? 'بيانات التواصل' : 'Contact details'}</p>
                {sellerAddress && <p className="text-xs text-slate-600 leading-relaxed">{sellerAddress}</p>}
                {invoice.seller.phone && <p className="text-xs text-slate-600">{invoice.seller.phone}</p>}
                {invoice.seller.email && <p className="text-xs text-slate-500 break-all">{invoice.seller.email}</p>}
                {invoice.seller.crNumber && (
                  <p className="text-[10px] text-slate-500">
                    {isAr ? 'السجل التجاري:' : 'CR number:'} <span className="font-mono font-semibold">{invoice.seller.crNumber}</span>
                  </p>
                )}
              </div>
            )}
          </div>

          {/* ══ PARTIES ══════════════════════════════════════════════════════════ */}
          <div className="grid grid-cols-2 gap-4">

            {/* Seller */}
            <div className="rounded-xl border border-brand-200 overflow-hidden">
              <div className="bg-brand-600 px-4 py-2">
                <p className="text-[10px] font-bold text-brand-100 uppercase tracking-widest">
                  {isAr ? 'بيانات المورد' : 'Seller details'}
                </p>
              </div>
              <div className="p-4 space-y-2 text-xs">
                <div>
                  <p className="font-bold text-slate-900 text-sm">{sellerName}</p>
                </div>
                {sellerAddress && (
                  <div>
                    <p className="text-slate-400 text-[10px]">{isAr ? 'العنوان' : 'Address'}</p>
                    <p className="text-slate-700">{sellerAddress}</p>
                  </div>
                )}
                {isVatRegistered && invoice.seller.vatNumber && (
                  <div>
                    <p className="text-slate-400 text-[10px]">{isAr ? 'الرقم الضريبي' : 'VAT number'}</p>
                    <p className="font-mono font-semibold text-slate-900">{invoice.seller.vatNumber}</p>
                  </div>
                )}
                {invoice.seller.crNumber && (
                  <div>
                    <p className="text-slate-400 text-[10px]">{isAr ? 'السجل التجاري' : 'CR number'}</p>
                    <p className="font-mono font-semibold text-slate-900">{invoice.seller.crNumber}</p>
                  </div>
                )}
                {invoice.seller.phone && (
                  <div>
                    <p className="text-slate-400 text-[10px]">{isAr ? 'الهاتف' : 'Phone'}</p>
                    <p className="text-slate-700">{invoice.seller.phone}</p>
                  </div>
                )}
                {invoice.seller.email && (
                  <div>
                    <p className="text-slate-400 text-[10px]">{isAr ? 'البريد الإلكتروني' : 'Email'}</p>
                    <p className="text-slate-700 break-all">{invoice.seller.email}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Buyer */}
            <div className="rounded-xl border border-slate-200 overflow-hidden">
              <div className="bg-slate-700 px-4 py-2">
                <p className="text-[10px] font-bold text-slate-200 uppercase tracking-widest">
                  {isAr ? 'بيانات العميل' : 'Buyer details'}
                </p>
              </div>
              <div className="p-4 space-y-2 text-xs">
                <div>
                  <p className="font-bold text-slate-900 text-sm">{buyerName}</p>
                </div>
                {invoice.buyer.phone && (
                  <div>
                    <p className="text-slate-400 text-[10px]">{isAr ? 'الهاتف' : 'Phone'}</p>
                    <p className="text-slate-700">{invoice.buyer.phone}</p>
                  </div>
                )}
                {invoice.buyer.vatNumber && (
                  <div>
                    <p className="text-slate-400 text-[10px]">{isAr ? 'الرقم الضريبي' : 'VAT number'}</p>
                    <p className="font-mono font-semibold text-slate-900">{invoice.buyer.vatNumber}</p>
                  </div>
                )}
                {invoice.buyer.address?.city && (
                  <div>
                    <p className="text-slate-400 text-[10px]">{isAr ? 'المدينة' : 'City'}</p>
                    <p className="text-slate-700">{invoice.buyer.address.city}</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ══ LINE ITEMS TABLE ════════════════════════════════════════════════ */}
          <div className="rounded-xl border border-slate-200 overflow-hidden">
            <table className="w-full text-sm" dir={isAr ? 'rtl' : 'ltr'}>
              <thead>
                <tr className="bg-slate-700 text-white">
                  <th className="text-start pe-3 ps-4 py-3 font-semibold text-xs uppercase tracking-wide rounded-se-none">
                    {isAr ? 'تفاصيل السلع أو الخدمات' : 'Goods or services'}
                  </th>
                  <th className="text-center px-3 py-3 font-semibold text-xs uppercase tracking-wide">
                    {isAr ? 'الكمية' : 'Quantity'}
                  </th>
                  <th className="text-end px-3 py-3 font-semibold text-xs uppercase tracking-wide">
                    {isAr ? 'سعر الوحدة' : 'Unit price'}
                  </th>
                  {isVatRegistered && (
                    <th className="text-center px-3 py-3 font-semibold text-xs uppercase tracking-wide">
                      {isAr ? 'نسبة الضريبة' : 'VAT rate'}
                    </th>
                  )}
                  {isVatRegistered && (
                    <th className="text-end px-3 py-3 font-semibold text-xs uppercase tracking-wide">
                      {isAr ? 'مبلغ الضريبة' : 'VAT amount'}
                    </th>
                  )}
                  <th className="text-end px-3 pe-4 py-3 font-semibold text-xs uppercase tracking-wide">
                    {isAr ? 'الإجمالي' : 'Total'}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {invoice.lines.map((line, idx) => (
                  <tr key={line.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'}>
                    <td className="pe-3 ps-4 py-3">
                      <p className="font-medium text-slate-900">
                        {isAr ? (line.nameAr || line.nameEn) : (line.nameEn || line.nameAr)}
                      </p>
                    </td>
                    <td className="px-3 py-3 text-center text-slate-600 text-xs">
                      {line.quantity}
                    </td>
                    <td className="px-3 py-3 text-end text-slate-700 tabular-nums">
                      {formatCurrency(line.unitPriceExclVatHalalas, fmtLocale)}
                    </td>
                    {isVatRegistered && (
                      <td className="px-3 py-3 text-center">
                        {line.vatRate === 0 ? (
                          <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded font-medium">
                            {vatCategoryLabel(line.vatCategory, isAr)}
                          </span>
                        ) : (
                          <span className="text-slate-700 font-semibold">{(line.vatRate * 100).toFixed(0)}%</span>
                        )}
                      </td>
                    )}
                    {isVatRegistered && (
                      <td className="px-3 py-3 text-end text-slate-600 tabular-nums">
                        {formatCurrency(line.vatAmountHalalas, fmtLocale)}
                      </td>
                    )}
                    <td className="px-3 pe-4 py-3 text-end font-bold text-slate-900 tabular-nums">
                      {formatCurrency(
                        isVatRegistered ? line.totalInclVatHalalas : line.totalExclVatHalalas,
                        fmtLocale
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ══ TOTALS ═══════════════════════════════════════════════════════════ */}
          <div className="flex justify-end">
            <div className="w-80">
              {isVatRegistered && (
                <div className="border border-slate-200 rounded-xl overflow-hidden mb-2">
                  <div className="divide-y divide-slate-100">
                    <div className="flex justify-between items-center px-4 py-2.5 text-sm">
                      <span className="text-slate-500 text-xs">{isAr ? 'المجموع قبل الضريبة' : 'Subtotal excluding VAT'}</span>
                      <span className="font-medium text-slate-700 tabular-nums">
                        {formatCurrency(invoice.totals.subtotalExclVatHalalas, fmtLocale)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center px-4 py-2.5 text-sm">
                      <span className="text-slate-500 text-xs">{isAr ? 'ضريبة القيمة المضافة' : 'VAT'}</span>
                      <span className="font-medium text-slate-700 tabular-nums">
                        {formatCurrency(invoice.totals.totalVatHalalas, fmtLocale)}
                      </span>
                    </div>
                  </div>
                </div>
              )}
              <div className={cn(
                'flex items-center justify-between px-5 py-4 rounded-xl text-white font-bold',
                isVatRegistered ? 'bg-brand-600' : 'bg-slate-800'
              )}>
                <p className="text-xs opacity-80">
                  {isAr
                    ? (isVatRegistered ? 'الإجمالي شامل الضريبة' : 'إجمالي المبلغ المستحق')
                    : (isVatRegistered ? 'Total including VAT' : 'Total amount due')}
                </p>
                <p className="text-xl tabular-nums font-black">
                  {formatCurrency(invoice.totals.grandTotalHalalas, fmtLocale)}
                </p>
              </div>
            </div>
          </div>

          {/* ══ NOTES ════════════════════════════════════════════════════════════ */}
          {invoice.notes && (
            <div className="p-4 rounded-xl bg-amber-50 border border-amber-100">
              <p className="text-xs font-semibold text-amber-700 mb-1">{isAr ? 'ملاحظات' : 'Notes'}</p>
              <p className="text-sm text-slate-700">{invoice.notes}</p>
            </div>
          )}

        </div>{/* end px-8 py-6 */}

        {/* ══ FOOTER ═══════════════════════════════════════════════════════════ */}
        <div className="border-t-2 border-slate-100 bg-slate-50 px-8 py-5">
          <div className="flex items-start justify-between gap-6">

            {/* Compliance notice */}
            <div className="text-xs text-slate-500 space-y-1 flex-1">
              {isVatRegistered ? (
                <p className="font-semibold text-slate-700">{documentLabel}</p>
              ) : (
                <>
                  <p className="font-semibold text-slate-700">{documentLabel}</p>
                  <p>
                    {isAr
                      ? 'صادر عن منشأة غير مسجّلة في ضريبة القيمة المضافة.'
                      : 'Issued by an entity that is not registered for VAT.'}
                  </p>
                </>
              )}
            </div>

            {/* Invoice ref + branding */}
            <div className="text-end text-xs text-slate-400 flex-shrink-0">
              <p className="font-mono font-semibold text-slate-600">{invoice.invoiceNumber}</p>
              <p className="mt-2 text-slate-300">{isAr ? 'نظام مسارات © 2026' : 'Masarat ERP © 2026'}</p>
            </div>
          </div>
        </div>

      </div>{/* end invoice document */}

      {/* ── Print CSS ── */}
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
            box-shadow: none;
          }
          @page { size: A4; margin: 8mm; }
        }
      `}</style>
    </>
  );
}
