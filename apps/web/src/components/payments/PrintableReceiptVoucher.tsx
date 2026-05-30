'use client';

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

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-SA', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

// ─── Component ────────────────────────────────────────────────────────────────

export function PrintableReceiptVoucher({ data }: { data: ReceiptVoucherData }) {
  const amtSAR = formatAmountSAR(data.amountHalalas);
  const amtWords = amountInArabicWords(data.amountHalalas);
  const method = PAYMENT_METHOD_LABELS[data.paymentMethod] ?? { ar: data.paymentMethod, en: data.paymentMethod };
  const addr = data.agency.address;
  const addrLine = [addr?.streetName, addr?.district, addr?.city].filter(Boolean).join('، ');
  const customerName = data.customer.nameAr || data.customer.nameEn;
  const dateStr = formatDate(data.issuedDate);

  return (
    <div
      id="receipt-voucher"
      dir="rtl"
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
          {/* Arabic side */}
          <div className="text-right">
            <p className="text-xl font-bold text-slate-900 leading-snug">{data.agency.nameAr}</p>
            {addrLine && <p className="text-xs text-slate-500 mt-0.5">{addrLine}</p>}
            {data.agency.phone && <p className="text-xs text-slate-500">{data.agency.phone}</p>}
            {data.agency.isVatRegistered && data.agency.vatNumber && (
              <p className="text-xs text-slate-500">الرقم الضريبي: {data.agency.vatNumber}</p>
            )}
            {!data.agency.isVatRegistered && data.agency.crNumber && (
              <p className="text-xs text-slate-500">س.ت: {data.agency.crNumber}</p>
            )}
          </div>

          {/* Document title (center) — logo replaces "ق" when available */}
          <div className="text-center flex flex-col items-center gap-1">
            {data.agency.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={data.agency.logoUrl}
                alt={data.agency.nameAr}
                style={{ height: 56, width: 'auto', objectFit: 'contain', maxWidth: 120 }}
              />
            ) : (
              <div className="w-14 h-14 rounded-xl bg-brand-50 border border-brand-200 flex items-center justify-center text-xl font-black text-brand-600 select-none">
                ق
              </div>
            )}
            <p className="text-base font-black text-slate-900 tracking-tight mt-1">سند قبض</p>
            <p className="text-[10px] text-slate-500 tracking-widest uppercase">Receipt Voucher</p>
          </div>

          {/* English side */}
          <div className="text-left">
            <p className="text-xl font-bold text-slate-900 leading-snug">{data.agency.nameEn}</p>
            {addrLine && <p className="text-xs text-slate-500 mt-0.5" dir="ltr">{addrLine}</p>}
            {data.agency.phone && <p className="text-xs text-slate-500" dir="ltr">{data.agency.phone}</p>}
            {data.agency.isVatRegistered && data.agency.vatNumber && (
              <p className="text-xs text-slate-500" dir="ltr">VAT: {data.agency.vatNumber}</p>
            )}
            {data.agency.crNumber && (
              <p className="text-xs text-slate-500" dir="ltr">CR: {data.agency.crNumber}</p>
            )}
          </div>
        </div>
      </div>

      {/* ── Voucher Meta ──────────────────────────────────────────────────── */}
      <div className="px-8 mb-4">
        <div className="flex justify-between items-center bg-slate-50 border border-slate-200 rounded-lg px-5 py-3">
          <div className="text-right">
            <p className="text-[10px] text-slate-400 mb-0.5">رقم السند</p>
            <p className="text-sm font-bold text-slate-900 font-mono" dir="ltr">{data.voucherNumber}</p>
          </div>
          <div className="text-center">
            <p className="text-[10px] text-slate-400 mb-0.5">التاريخ / Date</p>
            <p className="text-sm font-bold text-slate-900 font-mono" dir="ltr">{dateStr}</p>
          </div>
          <div className="text-left">
            <p className="text-[10px] text-slate-400 mb-0.5">Voucher No</p>
            <p className="text-sm font-bold text-slate-900 font-mono" dir="ltr">{data.voucherNumber}</p>
          </div>
        </div>
      </div>

      {/* ── Body ──────────────────────────────────────────────────────────── */}
      <div className="px-8 space-y-3">

        {/* Received from */}
        <div className="border border-slate-200 rounded-lg overflow-hidden">
          <div className="bg-slate-700 px-4 py-1.5">
            <p className="text-white text-xs font-semibold">
              استُلم من / Received from
            </p>
          </div>
          <div className="px-4 py-3 flex justify-between items-center">
            <div className="text-right">
              <p className="font-bold text-slate-900 text-sm">{customerName}</p>
              {data.customer.phone && (
                <p className="text-xs text-slate-500 font-mono mt-0.5">{data.customer.phone}</p>
              )}
            </div>
            <div className="text-left">
              <p className="font-bold text-slate-900 text-sm">{data.customer.nameEn || customerName}</p>
            </div>
          </div>
        </div>

        {/* Amount */}
        <div className="border-2 border-brand-400 rounded-lg overflow-hidden">
          <div className="bg-brand-600 px-4 py-1.5 flex justify-between items-center">
            <p className="text-white text-xs font-semibold">مبلغ وقدره / Amount</p>
            <p className="text-white text-xs font-semibold">SAR</p>
          </div>
          <div className="px-4 py-3">
            <div className="flex justify-between items-center mb-2">
              <p className="text-2xl font-black text-brand-700 font-mono" dir="ltr">{amtSAR}</p>
              <p className="text-sm font-semibold text-brand-700">{amtSAR} ريال سعودي</p>
            </div>
            <div className="border-t border-dashed border-slate-200 pt-2">
              <p className="text-xs text-slate-600 leading-relaxed">{amtWords}</p>
            </div>
          </div>
        </div>

        {/* Details grid */}
        <div className="border border-slate-200 rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <tbody className="divide-y divide-slate-100">
              <tr>
                <td className="px-4 py-2 text-slate-500 text-right w-1/4">بموجب فاتورة</td>
                <td className="px-4 py-2 font-mono font-semibold text-slate-900 text-right">{data.invoiceNumber}</td>
                <td className="px-4 py-2 text-slate-400 text-left w-1/4">Invoice No</td>
              </tr>
              {data.bookingNumber && (
                <tr>
                  <td className="px-4 py-2 text-slate-500 text-right">رقم الحجز</td>
                  <td className="px-4 py-2 font-mono font-semibold text-slate-900 text-right">{data.bookingNumber}</td>
                  <td className="px-4 py-2 text-slate-400 text-left">Booking No</td>
                </tr>
              )}
              <tr>
                <td className="px-4 py-2 text-slate-500 text-right">طريقة الدفع</td>
                <td className="px-4 py-2 font-semibold text-slate-900 text-right">{method.ar}</td>
                <td className="px-4 py-2 text-slate-400 text-left">{method.en}</td>
              </tr>
              {data.reference && (
                <tr>
                  <td className="px-4 py-2 text-slate-500 text-right">رقم المرجع</td>
                  <td className="px-4 py-2 font-mono text-slate-900 text-right">{data.reference}</td>
                  <td className="px-4 py-2 text-slate-400 text-left">Reference</td>
                </tr>
              )}
              {data.notes && (
                <tr>
                  <td className="px-4 py-2 text-slate-500 text-right">ملاحظات</td>
                  <td className="px-4 py-2 text-slate-700 text-right">{data.notes}</td>
                  <td className="px-4 py-2 text-slate-400 text-left">Notes</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Signatures */}
        <div className="flex gap-6 mt-6 pt-4 border-t border-dashed border-slate-300">
          <div className="flex-1 text-center">
            <p className="text-xs text-slate-500 mb-8">توقيع المستلم / Received by</p>
            <div className="border-b border-slate-400 mx-4" />
            <p className="text-[10px] text-slate-400 mt-1">{data.agency.nameAr}</p>
          </div>
          <div className="flex-1 text-center">
            <p className="text-xs text-slate-500 mb-8">توقيع الدافع / Paid by</p>
            <div className="border-b border-slate-400 mx-4" />
            <p className="text-[10px] text-slate-400 mt-1">{customerName}</p>
          </div>
        </div>
      </div>

      {/* ── Footer ────────────────────────────────────────────────────────── */}
      <div className="px-8 mt-6 pb-6">
        <p className="text-center text-[9px] text-slate-400">
          سند قبض رقم {data.voucherNumber} · {dateStr} · نظام مسارات للإدارة
        </p>
      </div>
    </div>
  );
}
