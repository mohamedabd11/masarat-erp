'use client';

import { useLocale } from 'next-intl';
import { cn } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ReceiptVoucherData {
  voucherNumber: string;
  paymentId: string;
  issuedDate: Date;
  amountHalalas: number;
  paymentMethod: string;
  reference?: string;
  notes?: string;
  invoiceNumber: string;
  bookingNumber?: string;
  customer: {
    nameAr: string;
    nameEn: string;
    phone?: string;
  };
  agency: {
    nameAr: string;
    nameEn: string;
    logoUrl?: string;
    isVatRegistered?: boolean;
    address?: {
      streetName?: string;
      buildingNumber?: string;
      district?: string;
      city?: string;
      postalCode?: string;
    };
    phone?: string;
    vatNumber?: string;
    crNumber?: string;
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ONES_AR = [
  '', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة',
  'عشرة', 'أحد عشر', 'اثنا عشر', 'ثلاثة عشر', 'أربعة عشر', 'خمسة عشر',
  'ستة عشر', 'سبعة عشر', 'ثمانية عشر', 'تسعة عشر',
];
const TENS_AR  = ['', '', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون'];
const HUNDREDS_AR = ['', 'مائة', 'مائتان', 'ثلاثمائة', 'أربعمائة', 'خمسمائة', 'ستمائة', 'سبعمائة', 'ثمانمائة', 'تسعمائة'];

function intToArabic(n: number): string {
  if (n === 0) return 'صفر';
  let r = '';
  if (n >= 1000000) {
    const m = Math.floor(n / 1000000); n %= 1000000;
    r += m === 1 ? 'مليون' : m === 2 ? 'مليونان' : m <= 10 ? ONES_AR[m] + ' ملايين' : intToArabic(m) + ' مليون';
    if (n > 0) r += ' و';
  }
  if (n >= 1000) {
    const t = Math.floor(n / 1000); n %= 1000;
    r += t === 1 ? 'ألف' : t === 2 ? 'ألفان' : t <= 10 ? ONES_AR[t] + ' آلاف' : intToArabic(t) + ' ألف';
    if (n > 0) r += ' و';
  }
  if (n >= 100) {
    r += HUNDREDS_AR[Math.floor(n / 100)] + ' '; n %= 100;
    if (n > 0) r += 'و';
  }
  if (n >= 20) {
    r += TENS_AR[Math.floor(n / 10)] + ' '; n %= 10;
    if (n > 0) r += 'و' + ONES_AR[n];
  } else if (n > 0) {
    r += ONES_AR[n];
  }
  return r.trim();
}

function amountInArabicWords(halalas: number): string {
  const sr = Math.floor(halalas / 100);
  const hal = halalas % 100;
  const srWords = intToArabic(sr);
  if (hal === 0) return `فقط ${srWords} ريالاً سعودياً لا غير`;
  const halWords = intToArabic(hal);
  return `فقط ${srWords} ريالاً سعودياً و${halWords} هللة لا غير`;
}

function formatAmountSAR(halalas: number): string {
  return (halalas / 100).toLocaleString('en-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const PAYMENT_METHOD_LABELS: Record<string, { ar: string; en: string }> = {
  cash:          { ar: 'نقداً',          en: 'Cash' },
  bank_transfer: { ar: 'تحويل بنكي',    en: 'Bank Transfer' },
  card:          { ar: 'بطاقة ائتمان',  en: 'Credit/Debit Card' },
  online:        { ar: 'دفع إلكتروني',  en: 'Online Payment' },
};

function formatDate(d: Date, locale: string): string {
  return d.toLocaleDateString(locale, { year: 'numeric', month: '2-digit', day: '2-digit' });
}

// ─── Component ────────────────────────────────────────────────────────────────

export function PrintableReceiptVoucher({ data }: { data: ReceiptVoucherData }) {
  const locale = useLocale();
  const isAr = locale === 'ar';
  const fmtLocale = isAr ? 'ar-SA' : 'en-SA';
  const amtSAR = formatAmountSAR(data.amountHalalas);
  const amtWords = amountInArabicWords(data.amountHalalas);
  const method = PAYMENT_METHOD_LABELS[data.paymentMethod] ?? { ar: data.paymentMethod, en: data.paymentMethod };
  const addr = data.agency.address;
  const addrLine = [addr?.streetName, addr?.district, addr?.city].filter(Boolean).join(isAr ? '، ' : ', ');
  const agencyName = isAr ? (data.agency.nameAr || data.agency.nameEn) : (data.agency.nameEn || data.agency.nameAr);
  const customerName = isAr ? (data.customer.nameAr || data.customer.nameEn) : (data.customer.nameEn || data.customer.nameAr);
  const dateStr = formatDate(data.issuedDate, fmtLocale);

  return (
    <div
      id="receipt-voucher"
      dir={isAr ? 'rtl' : 'ltr'}
      className={cn(
        'bg-white font-sans text-slate-900',
        'w-[210mm] min-h-[148mm] mx-auto',   // A5 landscape-ish, adjust as needed
        'print:shadow-none print:w-full',
      )}
      style={{ fontFamily: '"Segoe UI", Tahoma, Arial, sans-serif' }}
    >
      {/* ── Agency Header ──────────────────────────────────────────────────── */}
      <div className="border-b-2 border-slate-700 pb-4 mb-4 px-8 pt-6">
        <div className="flex justify-between items-start">
          <div className="text-start">
            <p className="text-xl font-bold text-slate-900 leading-snug">{agencyName}</p>
            {addrLine && <p className="text-xs text-slate-500 mt-0.5">{addrLine}</p>}
            {data.agency.phone && <p className="text-xs text-slate-500">{data.agency.phone}</p>}
            {data.agency.isVatRegistered && data.agency.vatNumber && (
              <p className="text-xs text-slate-500">{isAr ? 'الرقم الضريبي' : 'VAT number'}: {data.agency.vatNumber}</p>
            )}
            {!data.agency.isVatRegistered && data.agency.crNumber && (
              <p className="text-xs text-slate-500">{isAr ? 'السجل التجاري' : 'CR number'}: {data.agency.crNumber}</p>
            )}
          </div>

          {/* Document title (center) — logo replaces "ق" when available */}
          <div className="text-center flex flex-col items-center gap-1">
            {data.agency.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={data.agency.logoUrl}
                alt={agencyName}
                style={{ height: 56, width: 'auto', objectFit: 'contain', maxWidth: 120 }}
              />
            ) : (
              <div className="w-14 h-14 rounded-xl bg-brand-50 border border-brand-200 flex items-center justify-center text-xl font-black text-brand-600 select-none">
                {isAr ? 'ق' : 'R'}
              </div>
            )}
            <p className="text-base font-black text-slate-900 tracking-tight mt-1">{isAr ? 'سند قبض' : 'Receipt Voucher'}</p>
          </div>
        </div>
      </div>

      {/* ── Voucher Meta ──────────────────────────────────────────────────── */}
      <div className="px-8 mb-4">
        <div className="flex justify-between items-center bg-slate-50 border border-slate-200 rounded-lg px-5 py-3">
          <div className="text-start">
            <p className="text-[10px] text-slate-400 mb-0.5">{isAr ? 'رقم السند' : 'Voucher number'}</p>
            <p className="text-sm font-bold text-slate-900 font-mono" dir="ltr">{data.voucherNumber}</p>
          </div>
          <div className="text-center">
            <p className="text-[10px] text-slate-400 mb-0.5">{isAr ? 'التاريخ' : 'Date'}</p>
            <p className="text-sm font-bold text-slate-900 font-mono" dir="ltr">{dateStr}</p>
          </div>
        </div>
      </div>

      {/* ── Body ──────────────────────────────────────────────────────────── */}
      <div className="px-8 space-y-3">

        {/* Received from */}
        <div className="border border-slate-200 rounded-lg overflow-hidden">
          <div className="bg-slate-700 px-4 py-1.5">
            <p className="text-white text-xs font-semibold">
              {isAr ? 'استُلم من' : 'Received from'}
            </p>
          </div>
          <div className="px-4 py-3">
            <div className="text-start">
              <p className="font-bold text-slate-900 text-sm">{customerName}</p>
              {data.customer.phone && (
                <p className="text-xs text-slate-500 font-mono mt-0.5">{data.customer.phone}</p>
              )}
            </div>
          </div>
        </div>

        {/* Amount */}
        <div className="border-2 border-brand-400 rounded-lg overflow-hidden">
          <div className="bg-brand-600 px-4 py-1.5 flex justify-between items-center">
            <p className="text-white text-xs font-semibold">{isAr ? 'مبلغ وقدره' : 'Amount received'}</p>
            <p className="text-white text-xs font-semibold">{isAr ? 'ر.س' : 'SAR'}</p>
          </div>
          <div className="px-4 py-3">
            <div className="flex justify-between items-center mb-2">
              <p className="text-2xl font-black text-brand-700 font-mono" dir="ltr">{amtSAR}</p>
              <p className="text-sm font-semibold text-brand-700">{amtSAR} {isAr ? 'ريال سعودي' : 'Saudi riyals'}</p>
            </div>
            <div className="border-t border-dashed border-slate-200 pt-2">
              <p className="text-xs text-slate-600 leading-relaxed">{isAr ? amtWords : `${amtSAR} Saudi riyals only`}</p>
            </div>
          </div>
        </div>

        {/* Details grid */}
        <div className="border border-slate-200 rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <tbody className="divide-y divide-slate-100">
              <tr>
                <td className="px-4 py-2 text-slate-500 text-start w-1/3">{isAr ? 'بموجب الفاتورة' : 'Invoice number'}</td>
                <td className="px-4 py-2 font-mono font-semibold text-slate-900 text-start">{data.invoiceNumber}</td>
              </tr>
              {data.bookingNumber && (
                <tr>
                  <td className="px-4 py-2 text-slate-500 text-start">{isAr ? 'رقم الحجز' : 'Booking number'}</td>
                  <td className="px-4 py-2 font-mono font-semibold text-slate-900 text-start">{data.bookingNumber}</td>
                </tr>
              )}
              <tr>
                <td className="px-4 py-2 text-slate-500 text-start">{isAr ? 'طريقة الدفع' : 'Payment method'}</td>
                <td className="px-4 py-2 font-semibold text-slate-900 text-start">{isAr ? method.ar : method.en}</td>
              </tr>
              {data.reference && (
                <tr>
                  <td className="px-4 py-2 text-slate-500 text-start">{isAr ? 'رقم المرجع' : 'Reference number'}</td>
                  <td className="px-4 py-2 font-mono text-slate-900 text-start">{data.reference}</td>
                </tr>
              )}
              {data.notes && (
                <tr>
                  <td className="px-4 py-2 text-slate-500 text-start">{isAr ? 'ملاحظات' : 'Notes'}</td>
                  <td className="px-4 py-2 text-slate-700 text-start">{data.notes}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Signatures */}
        <div className="flex gap-6 mt-6 pt-4 border-t border-dashed border-slate-300">
          <div className="flex-1 text-center">
            <p className="text-xs text-slate-500 mb-8">{isAr ? 'توقيع المستلم' : 'Received by'}</p>
            <div className="border-b border-slate-400 mx-4" />
            <p className="text-[10px] text-slate-400 mt-1">{agencyName}</p>
          </div>
          <div className="flex-1 text-center">
            <p className="text-xs text-slate-500 mb-8">{isAr ? 'توقيع الدافع' : 'Paid by'}</p>
            <div className="border-b border-slate-400 mx-4" />
            <p className="text-[10px] text-slate-400 mt-1">{customerName}</p>
          </div>
        </div>
      </div>

      {/* ── Footer ────────────────────────────────────────────────────────── */}
      <div className="px-8 mt-6 pb-6">
        <p className="text-center text-[9px] text-slate-400">
          {isAr ? 'سند قبض' : 'Receipt voucher'} {data.voucherNumber} · {dateStr} · {isAr ? 'نظام مسارات' : 'Masarat ERP'}
        </p>
      </div>
    </div>
  );
}
