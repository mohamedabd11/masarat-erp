'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { apiFetch } from '@/lib/api-client';
import { InvoiceStatusBadge } from '@/components/ui/StatusBadge';
import { Spinner } from '@/components/ui/Spinner';
import { formatCurrency, formatDate } from '@/lib/utils';
import { cn } from '@/lib/utils';
import {
  ArrowRight, ArrowLeft, Printer, Building2, User,
  CalendarDays, Hash, ShieldCheck, Receipt, CheckCircle2,
} from 'lucide-react';
import { ProcessPaymentModal } from '@/components/bookings/ProcessPaymentModal';

// ─── Types ────────────────────────────────────────────────────────────────────

type ZatcaStatus = 'not_submitted' | 'submitted' | 'reported' | 'cleared' | 'rejected';

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

// Postgres-backed invoice (flat fields from the invoices table)
interface FirestoreInvoice {
  id: string;
  agencyId: string;
  bookingId: string;
  bookingNumber?: string;
  type: string;
  invoiceNumber: string;
  status: string;
  // Postgres uses status for payment status; no separate paymentStatus field
  paymentStatus?: string;
  paidHalalas: number;
  subtotalHalalas: number;
  vatHalalas: number;
  totalHalalas: number;
  // flat buyer fields
  buyerNameAr?: string;
  buyerNameEn?: string;
  buyerPhone?: string;
  buyerNationalId?: string;
  // flat seller fields
  sellerNameAr?: string;
  sellerNameEn?: string;
  sellerVatNumber?: string;
  sellerCrNumber?: string;
  sellerAddress?: string;
  // items as JSON
  items?: InvoiceLine[] | null;
  // dates as ISO strings
  issueDate?: string;
  dueDate?: string | null;
  createdAt?: string;
  zatcaUuid?: string;
  isEInvoice?: boolean;
}

// ─── ZATCA status styling ──────────────────────────────────────────────────────

const ZATCA_STYLE: Record<ZatcaStatus, { bg: string; dot: string; ar: string; en: string }> = {
  not_submitted: { bg: 'bg-amber-50 text-amber-700 ring-amber-200',    dot: 'bg-amber-400',   ar: 'بانتظار الإرسال', en: 'Pending' },
  submitted:     { bg: 'bg-sky-50 text-sky-700 ring-sky-200',          dot: 'bg-sky-400',     ar: 'تم الإرسال',     en: 'Submitted' },
  reported:      { bg: 'bg-emerald-50 text-emerald-700 ring-emerald-200', dot: 'bg-emerald-500', ar: 'مبلغ عنها',    en: 'Reported' },
  cleared:       { bg: 'bg-emerald-50 text-emerald-700 ring-emerald-200', dot: 'bg-emerald-500', ar: 'مخلصة',         en: 'Cleared' },
  rejected:      { bg: 'bg-red-50 text-red-700 ring-red-200',          dot: 'bg-red-500',     ar: 'مرفوضة',         en: 'Rejected' },
};

// ─── Component ────────────────────────────────────────────────────────────────

interface InvoiceDetailClientProps {
  locale: string;
  invoiceId: string;
}

export function InvoiceDetailClient({ locale, invoiceId }: InvoiceDetailClientProps) {
  const isAr = locale === 'ar';
  const fmtLocale = isAr ? 'ar-SA' : 'en-SA';
  const [invoice, setInvoice] = useState<FirestoreInvoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [isVatRegistered, setIsVatRegistered] = useState(false);
  const [resolvedBookingNumber, setResolvedBookingNumber] = useState<string | null>(null);
  const [amountDue, setAmountDue]   = useState(0);
  const [amountPaid, setAmountPaid] = useState(0);
  const [showPayment, setShowPayment] = useState(false);

  const BackIcon = isAr ? ArrowRight : ArrowLeft;

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const data = await apiFetch<{ invoice: FirestoreInvoice }>(`/api/invoices/${invoiceId}`);
        if (cancelled) return;
        const inv = data.invoice;
        setInvoice(inv);
        const grandTotal = inv.totalHalalas ?? 0;
        const paid       = inv.paidHalalas  ?? 0;
        setAmountPaid(paid);
        setAmountDue(grandTotal - paid);
        setIsVatRegistered(inv.isEInvoice === true || inv.vatHalalas > 0);

        // Resolve booking number from invoice or fetch booking
        if (inv.bookingNumber) {
          setResolvedBookingNumber(inv.bookingNumber);
        } else if (inv.bookingId) {
          try {
            const bkData = await apiFetch<{ booking: { bookingNumber?: string } }>(`/api/bookings/${inv.bookingId}`);
            if (!cancelled) setResolvedBookingNumber(bkData.booking.bookingNumber ?? null);
          } catch {
            // booking lookup is best-effort
          }
        }
      } catch {
        if (!cancelled) setNotFound(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => { cancelled = true; };
  }, [invoiceId]);

  if (loading) {
    return <div className="flex justify-center py-24"><Spinner size="lg" /></div>;
  }

  if (notFound || !invoice) {
    return (
      <div className="py-16 text-center space-y-4">
        <p className="text-slate-500">{isAr ? 'الفاتورة غير موجودة' : 'Invoice not found'}</p>
        <Link href={`/${locale}/invoices`} className="text-sm text-brand-600 hover:underline">
          {isAr ? '← العودة للفواتير' : '← Back to Invoices'}
        </Link>
      </div>
    );
  }

  // ── Extract data ──────────────────────────────────────────────────────────

  const isCreditNote = invoice.type === 'credit_note' || invoice.type === '381';
  const zatcaStatus: ZatcaStatus = 'not_submitted';
  const zStyle = ZATCA_STYLE[zatcaStatus] ?? ZATCA_STYLE.not_submitted;
  const uuid = invoice.zatcaUuid ?? '';
  const issueDate = invoice.issueDate ? new Date(invoice.issueDate) : (invoice.createdAt ? new Date(invoice.createdAt) : new Date());
  const dueDate = invoice.dueDate ? new Date(invoice.dueDate) : null;

  const customerName = isAr
    ? (invoice.buyerNameAr ?? invoice.buyerNameEn ?? '—')
    : (invoice.buyerNameEn ?? invoice.buyerNameAr ?? '—');

  const sellerNameAr = invoice.sellerNameAr ?? '';
  const sellerNameEn = invoice.sellerNameEn ?? '';

  const grandTotal = invoice.totalHalalas ?? 0;
  const subtotalExclVat = invoice.subtotalHalalas ?? Math.round(grandTotal / 1.15);
  const totalVat = invoice.vatHalalas ?? (grandTotal - subtotalExclVat);

  // ── Line items: use stored items or create synthetic line ─────────────────
  const lines: InvoiceLine[] = (invoice.items && invoice.items.length > 0)
    ? invoice.items
    : [
        {
          id: '1',
          nameAr: 'خدمة سفر',
          nameEn: 'Travel Service',
          quantity: 1,
          unitCode: 'PCE',
          unitPriceExclVatHalalas: subtotalExclVat,
          totalExclVatHalalas: subtotalExclVat,
          vatRate: totalVat > 0 ? 0.15 : 0,
          vatAmountHalalas: totalVat,
          totalInclVatHalalas: grandTotal,
        },
      ];

  return (
    <div className="max-w-4xl mx-auto space-y-6">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <Link
            href={`/${locale}/invoices`}
            className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors flex-shrink-0"
          >
            <BackIcon size={18} />
          </Link>
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-slate-900 font-mono truncate">
              {invoice.invoiceNumber}
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              <Link
                href={`/${locale}/bookings/${invoice.bookingId}`}
                className="hover:text-brand-600 hover:underline font-mono"
              >
                {resolvedBookingNumber ?? invoice.bookingId}
              </Link>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Link
            href={`/${locale}/invoices/${invoiceId}/print`}
            target="_blank"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200
                       text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
          >
            <Printer size={15} />
            {isAr ? 'طباعة / PDF' : 'Print / PDF'}
          </Link>
        </div>
      </div>

      {/* ── Invoice meta card ────────────────────────────────────────────────── */}
      <Card>
        <div className="flex flex-col sm:flex-row sm:items-start gap-6">
          <div className="flex-1 space-y-4">
            {/* Number + status badges */}
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-mono text-lg font-bold text-slate-900">{invoice.invoiceNumber}</span>
              <InvoiceStatusBadge status={(invoice.paymentStatus ?? invoice.status) as never} locale={locale} />
              {isCreditNote && (
                <span className="text-[11px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-semibold">
                  {isAr ? 'إشعار دائن' : 'Credit Note'}
                </span>
              )}
              {/* ZATCA status — only shown for VAT-registered agencies */}
              {isVatRegistered && (
                <span className={cn(
                  'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ring-1 ring-inset',
                  zStyle.bg,
                )}>
                  <span className={cn('w-1.5 h-1.5 rounded-full', zStyle.dot)} />
                  ZATCA: {isAr ? zStyle.ar : zStyle.en}
                </span>
              )}
            </div>

            {/* Dates */}
            <div className="grid grid-cols-2 gap-x-8 gap-y-3">
              <div className="flex items-start gap-2">
                <CalendarDays size={15} className="text-slate-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-xs text-slate-400">{isAr ? 'تاريخ الإصدار' : 'Issue Date'}</p>
                  <p className="text-sm text-slate-700 font-medium">{formatDate(issueDate, fmtLocale)}</p>
                </div>
              </div>
              {dueDate && (
                <div className="flex items-start gap-2">
                  <CalendarDays size={15} className="text-slate-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-xs text-slate-400">{isAr ? 'تاريخ الاستحقاق' : 'Due Date'}</p>
                    <p className="text-sm text-slate-700 font-medium">{formatDate(dueDate, fmtLocale)}</p>
                  </div>
                </div>
              )}
              {isVatRegistered && uuid && (
                <div className="col-span-2 flex items-start gap-2">
                  <Hash size={15} className="text-slate-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-xs text-slate-400">{isAr ? 'معرف ZATCA' : 'ZATCA UUID'}</p>
                    <p className="text-xs font-mono text-slate-600 break-all">{uuid}</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* QR placeholder — only for VAT-registered agencies */}
          {isVatRegistered && (
            <div className="flex flex-col items-center gap-2 flex-shrink-0">
              <div className="w-28 h-28 rounded-lg border-2 border-dashed border-slate-200 bg-slate-50 flex items-center justify-center">
                {invoice.zatca?.qrCodeData ? (
                  <span className="text-[10px] text-slate-400 text-center px-2 break-all font-mono">
                    QR
                  </span>
                ) : (
                  <div className="text-center">
                    <div className="grid grid-cols-3 gap-0.5 mb-1 mx-auto w-fit">
                      {Array.from({ length: 9 }).map((_, i) => (
                        <div key={i} className={cn('w-2.5 h-2.5 rounded-sm',
                          [0, 2, 6, 8, 4].includes(i) ? 'bg-slate-300' : 'bg-slate-100')} />
                      ))}
                    </div>
                    <p className="text-[9px] text-slate-400">{isAr ? 'قريباً' : 'Soon'}</p>
                  </div>
                )}
              </div>
              <p className="text-[10px] text-slate-400 text-center max-w-[7rem]">
                {isAr ? 'امسح للتحقق' : 'Scan to verify'}
              </p>
            </div>
          )}
        </div>
      </Card>

      {/* ── Seller + Buyer ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>
              <div className="flex items-center gap-2">
                <Building2 size={16} className="text-brand-600" />
                {isAr ? 'بيانات البائع' : 'Seller Details'}
              </div>
            </CardTitle>
          </CardHeader>
          <dl className="space-y-2 text-sm">
            {(sellerNameAr || sellerNameEn) && (
              <div>
                <dt className="text-xs text-slate-400">{isAr ? 'اسم الشركة' : 'Company Name'}</dt>
                <dd className="text-slate-900 font-semibold mt-0.5">
                  {isAr ? (sellerNameAr || sellerNameEn) : (sellerNameEn || sellerNameAr)}
                </dd>
              </div>
            )}
            {isVatRegistered && invoice.sellerVatNumber && (
              <div>
                <dt className="text-xs text-slate-400">{isAr ? 'الرقم الضريبي' : 'VAT Number'}</dt>
                <dd className="text-slate-700 font-mono mt-0.5">{invoice.sellerVatNumber}</dd>
              </div>
            )}
            {invoice.sellerCrNumber && (
              <div>
                <dt className="text-xs text-slate-400">{isAr ? 'رقم السجل التجاري' : 'CR Number'}</dt>
                <dd className="text-slate-700 font-mono mt-0.5">{invoice.sellerCrNumber}</dd>
              </div>
            )}
            {invoice.sellerAddress && (
              <div>
                <dt className="text-xs text-slate-400">{isAr ? 'العنوان' : 'Address'}</dt>
                <dd className="text-slate-700 mt-0.5">{invoice.sellerAddress}</dd>
              </div>
            )}
            {!sellerNameAr && !sellerNameEn && (
              <p className="text-xs text-slate-400 italic">
                {isAr ? 'أضف بيانات الوكالة من الإعدادات' : 'Add agency info from Settings'}
              </p>
            )}

          </dl>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>
              <div className="flex items-center gap-2">
                <User size={16} className="text-slate-500" />
                {isAr ? 'بيانات المشتري' : 'Buyer Details'}
              </div>
            </CardTitle>
          </CardHeader>
          <dl className="space-y-2 text-sm">
            <div>
              <dt className="text-xs text-slate-400">{isAr ? 'الاسم' : 'Name'}</dt>
              <dd className="text-slate-900 font-semibold mt-0.5">{customerName}</dd>
            </div>
            {invoice.buyerPhone && (
              <div>
                <dt className="text-xs text-slate-400">{isAr ? 'رقم الهاتف' : 'Phone'}</dt>
                <dd className="text-slate-700 font-mono mt-0.5" dir="rtl">{invoice.buyerPhone}</dd>
              </div>
            )}
            {invoice.buyerNationalId && (
              <div>
                <dt className="text-xs text-slate-400">{isAr ? 'الرقم الضريبي' : 'VAT Number'}</dt>
                <dd className="text-slate-700 font-mono mt-0.5">{invoice.buyerNationalId}</dd>
              </div>
            )}
            <div>
              <dt className="text-xs text-slate-400">{isAr ? 'رقم الحجز' : 'Booking Ref'}</dt>
              <dd className="mt-0.5" dir="rtl">
                <Link
                  href={`/${locale}/bookings/${invoice.bookingId}`}
                  className="text-brand-700 font-mono hover:underline text-sm"
                >
                  {resolvedBookingNumber ?? invoice.bookingId}
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
                {isVatRegistered && (
                  <>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider w-20">
                      {isAr ? 'ض.ق.م %' : 'VAT %'}
                    </th>
                    <th className="text-end px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      {isAr ? 'مبلغ الضريبة' : 'VAT Amt'}
                    </th>
                  </>
                )}
                <th className="text-end ps-4 pe-6 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  {isAr ? 'الإجمالي' : 'Total'}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border">
              {lines.map((line) => (
                <tr key={line.id} className="hover:bg-slate-50/40 transition-colors">
                  <td className="ps-6 pe-4 py-4">
                    <p className="text-slate-900 font-medium">{isAr ? line.nameAr : line.nameEn}</p>
                    {line.nameEn && line.nameAr !== line.nameEn && (
                      <p className="text-xs text-slate-400">{isAr ? line.nameEn : line.nameAr}</p>
                    )}
                  </td>
                  <td className="px-4 py-4 text-center text-slate-600">
                    {line.quantity} {line.unitCode}
                  </td>
                  <td className="px-4 py-4 text-end text-slate-600">
                    {formatCurrency(line.unitPriceExclVatHalalas, fmtLocale)}
                  </td>
                  {isVatRegistered && (
                    <>
                      <td className="px-4 py-4 text-center">
                        {line.vatRate === 0 ? (
                          <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded font-medium">
                            {isAr ? 'معفى' : 'Exempt'}
                          </span>
                        ) : (
                          <span className="text-slate-600">{(line.vatRate * 100).toFixed(0)}%</span>
                        )}
                      </td>
                      <td className="px-4 py-4 text-end text-slate-600">
                        {formatCurrency(line.vatAmountHalalas, fmtLocale)}
                      </td>
                    </>
                  )}
                  <td className="ps-4 pe-6 py-4 text-end font-semibold text-slate-900">
                    {formatCurrency(isVatRegistered ? line.totalInclVatHalalas : line.totalExclVatHalalas, fmtLocale)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals */}
        <div className="border-t border-surface-border">
          <div className="flex justify-end px-6 py-4">
            <div className="w-full sm:w-80 space-y-2">
              {isVatRegistered && (
                <>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-500">{isAr ? 'المجموع (قبل الضريبة)' : 'Subtotal (excl. VAT)'}</span>
                    <span className="text-slate-700 font-medium">{formatCurrency(subtotalExclVat, fmtLocale)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-500">{isAr ? 'ضريبة القيمة المضافة (15%)' : 'VAT (15%)'}</span>
                    <span className="text-slate-700 font-medium">{formatCurrency(totalVat, fmtLocale)}</span>
                  </div>
                </>
              )}
              <div className="border-t border-slate-200 pt-2 mt-1">
                <div className="flex items-center justify-between">
                  <span className="text-base font-bold text-slate-900">
                    {isAr ? 'الإجمالي الكلي' : 'Grand Total'}
                  </span>
                  <span className="text-xl font-bold text-brand-700">
                    {formatCurrency(grandTotal, fmtLocale)}
                  </span>
                </div>
                {isVatRegistered && (
                  <p className="text-xs text-slate-400 mt-1 text-end">
                    {isAr ? 'شامل ضريبة القيمة المضافة' : 'Inclusive of VAT'}
                  </p>
                )}
              </div>

              {/* Payment summary */}
              {amountPaid > 0 && (
                <div className="flex items-center justify-between text-sm text-emerald-700 font-medium">
                  <span>{isAr ? 'المدفوع' : 'Paid'}</span>
                  <span className="tabular-nums">{formatCurrency(amountPaid, fmtLocale)}</span>
                </div>
              )}
              {amountDue > 0 && (
                <div className="flex items-center justify-between text-sm text-red-600 font-bold">
                  <span>{isAr ? 'المتبقي' : 'Balance Due'}</span>
                  <span className="tabular-nums">{formatCurrency(amountDue, fmtLocale)}</span>
                </div>
              )}

              {/* Payment action */}
              {amountDue > 0 ? (
                <button
                  onClick={() => setShowPayment(true)}
                  className="mt-3 w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-brand-600 text-white text-sm font-semibold hover:bg-brand-700 transition-colors"
                >
                  <Receipt size={15} />
                  {isAr ? 'تسجيل دفعة' : 'Record Payment'}
                </button>
              ) : grandTotal > 0 ? (
                <div className="mt-3 flex items-center justify-center gap-2 text-sm text-emerald-700 font-medium">
                  <CheckCircle2 size={15} />
                  {isAr ? 'مدفوعة بالكامل' : 'Fully Paid'}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </Card>

      {/* ── Payment modal ──────────────────────────────────────────────────────── */}
      {showPayment && invoice && (
        <ProcessPaymentModal
          bookingId={invoice.bookingId}
          invoiceId={invoice.id}
          agencyId={invoice.agencyId}
          remainingDueHalalas={amountDue}
          onClose={() => setShowPayment(false)}
          onSuccess={(remaining) => {
            setAmountPaid(grandTotal - remaining);
            setAmountDue(remaining);
          }}
        />
      )}

      {/* ── ZATCA compliance footer — only shown for VAT-registered agencies ──── */}
      {isVatRegistered && <Card className={cn(
        zatcaStatus === 'cleared' || zatcaStatus === 'reported'
          ? 'border-emerald-200 bg-emerald-50/40'
          : 'border-amber-200 bg-amber-50/40',
      )}>
        <div className="flex items-start gap-3">
          <ShieldCheck size={20} className={cn(
            'flex-shrink-0 mt-0.5',
            zatcaStatus === 'cleared' || zatcaStatus === 'reported' ? 'text-emerald-600' : 'text-amber-600',
          )} />
          <div className="text-sm space-y-1">
            <p className={cn(
              'font-semibold',
              zatcaStatus === 'cleared' || zatcaStatus === 'reported' ? 'text-emerald-800' : 'text-amber-800',
            )}>
              {isAr
                ? 'فاتورة إلكترونية وفق متطلبات هيئة الزكاة والضريبة والجمارك (ZATCA)'
                : 'E-Invoice compliant with ZATCA (Zakat, Tax & Customs Authority)'}
            </p>
            <p className={cn(
              'text-xs',
              zatcaStatus === 'cleared' || zatcaStatus === 'reported' ? 'text-emerald-700' : 'text-amber-700',
            )}>
              {isAr
                ? `المرحلة الثانية — تكامل مع منصة ZATCA | حالة الإرسال: ${zStyle.ar}`
                : `Phase 2 Integration | Submission status: ${zStyle.en}`}
            </p>
            {uuid && (
              <p className="text-xs text-slate-500 font-mono">{`UUID: ${uuid}`}</p>
            )}
          </div>
        </div>
      </Card>}
    </div>
  );
}
