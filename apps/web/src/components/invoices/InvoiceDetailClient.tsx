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
  FileX, AlertTriangle,
} from 'lucide-react';
import { ProcessPaymentModal } from '@/components/bookings/ProcessPaymentModal';

// ─── Types ────────────────────────────────────────────────────────────────────

type ZatcaStatus = 'not_submitted' | 'submitted' | 'reported' | 'cleared' | 'rejected';

interface InvoiceLine {
  description:      string;
  descriptionEn?:   string | null;
  quantity:         number;
  unitPriceHalalas: number;
  vatHalalas:       number;
  totalHalalas:     number;
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
  const [showPayment,    setShowPayment]    = useState(false);
  const [showCreditNote, setShowCreditNote] = useState(false);
  const [creditNoteErr,  setCreditNoteErr]  = useState('');
  const [creditNoteBusy, setCreditNoteBusy] = useState(false);

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
  const zatcaStatus = 'not_submitted' as ZatcaStatus;
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
    ? invoice.items as InvoiceLine[]
    : [
        {
          description:      isAr ? 'خدمة سفر' : 'Travel Service',
          descriptionEn:    'Travel Service',
          quantity:         1,
          unitPriceHalalas: subtotalExclVat,
          vatHalalas:       totalVat,
          totalHalalas:     grandTotal,
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
          {/* Credit Note — only for tax invoices (380) that are not cancelled */}
          {invoice.type === '380' && invoice.status !== 'cancelled' && (
            <button
              onClick={() => setShowCreditNote(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-red-200
                         text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
            >
              <FileX size={15} />
              {isAr ? 'إشعار دائن' : 'Credit Note'}
            </button>
          )}
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
                {false ? (
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
                {isAr ? 'بيانات المورد' : 'Supplier Details'}
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
                {isAr ? 'أضف بيانات الوكالة من الإعدادات أو حدّد المورد عند إنشاء الفاتورة' : 'Add agency info from Settings or specify supplier when creating the invoice'}
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
                <tr key={line.description} className="hover:bg-slate-50/40 transition-colors">
                  <td className="ps-6 pe-4 py-4">
                    <p className="text-slate-900 font-medium">{line.description}</p>
                    {line.descriptionEn && line.description !== line.descriptionEn && (
                      <p className="text-xs text-slate-400">{isAr ? line.descriptionEn : line.description}</p>
                    )}
                  </td>
                  <td className="px-4 py-4 text-center text-slate-600">
                    {line.quantity}
                  </td>
                  <td className="px-4 py-4 text-end text-slate-600">
                    {formatCurrency(line.unitPriceHalalas, fmtLocale)}
                  </td>
                  {isVatRegistered && (
                    <>
                      <td className="px-4 py-4 text-center">
                        {line.vatHalalas === 0 ? (
                          <span className="text-xs bg-slate-100 text-slate-500 px-2 py-0.5 rounded font-medium">
                            {isAr ? 'معفى' : 'Exempt'}
                          </span>
                        ) : (
                          <span className="text-slate-600">
                            {line.unitPriceHalalas > 0
                              ? `${Math.round(line.vatHalalas / (line.unitPriceHalalas * line.quantity) * 100)}%`
                              : '15%'}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-4 text-end text-slate-600">
                        {formatCurrency(line.vatHalalas, fmtLocale)}
                      </td>
                    </>
                  )}
                  <td className="ps-4 pe-6 py-4 text-end font-semibold text-slate-900">
                    {formatCurrency(line.totalHalalas, fmtLocale)}
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
          bookingId={invoice.bookingId ?? undefined}
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

      {/* ── Credit note modal ─────────────────────────────────────────────────── */}
      {showCreditNote && invoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                <FileX size={20} className="text-red-600" />
              </div>
              <div>
                <h2 className="font-bold text-slate-800 text-lg">
                  {isAr ? 'إصدار إشعار دائن' : 'Issue Credit Note'}
                </h2>
                <p className="text-xs text-slate-500">
                  {isAr ? `للفاتورة رقم: ${invoice.invoiceNumber}` : `For invoice: ${invoice.invoiceNumber}`}
                </p>
              </div>
            </div>

            {/* Summary */}
            <div className="bg-slate-50 rounded-xl p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-600">{isAr ? 'المبلغ قبل الضريبة' : 'Subtotal'}</span>
                <span className="font-medium">{formatCurrency(invoice.subtotalHalalas, fmtLocale)}</span>
              </div>
              {invoice.vatHalalas > 0 && (
                <div className="flex justify-between">
                  <span className="text-slate-600">{isAr ? 'ضريبة القيمة المضافة' : 'VAT'}</span>
                  <span className="font-medium">{formatCurrency(invoice.vatHalalas, fmtLocale)}</span>
                </div>
              )}
              <div className="flex justify-between border-t pt-2">
                <span className="font-semibold text-slate-800">{isAr ? 'الإجمالي المسترد' : 'Total Credit'}</span>
                <span className="font-bold text-red-600">{formatCurrency(invoice.totalHalalas, fmtLocale)}</span>
              </div>
            </div>

            {/* Reason */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">
                {isAr ? 'سبب الإلغاء / الاسترداد' : 'Reason for credit note'}
                <span className="text-red-500 ms-1">*</span>
              </label>
              <textarea
                id="credit-note-reason"
                rows={3}
                placeholder={isAr ? 'أدخل سبب إصدار الإشعار الدائن...' : 'Enter reason for issuing credit note...'}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm
                           focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
              />
            </div>

            {creditNoteErr && (
              <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
                <AlertTriangle size={15} className="flex-shrink-0" />
                {creditNoteErr}
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => { setShowCreditNote(false); setCreditNoteErr(''); }}
                disabled={creditNoteBusy}
                className="flex-1 px-4 py-2.5 rounded-lg border border-slate-200 text-sm font-medium
                           text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
              >
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                disabled={creditNoteBusy}
                onClick={async () => {
                  const reason = (document.getElementById('credit-note-reason') as HTMLTextAreaElement)?.value?.trim();
                  if (!reason) {
                    setCreditNoteErr(isAr ? 'يرجى إدخال سبب الإشعار الدائن' : 'Please enter a reason');
                    return;
                  }
                  setCreditNoteBusy(true);
                  setCreditNoteErr('');
                  try {
                    await apiFetch('/api/invoices/credit-note', {
                      method: 'POST',
                      body: JSON.stringify({
                        originalInvoiceId: invoice.id,
                        subtotalHalalas:   invoice.subtotalHalalas,
                        vatHalalas:        invoice.vatHalalas,
                        totalHalalas:      invoice.totalHalalas,
                        reason,
                        buyerNameAr:       invoice.buyerNameAr ?? '',
                        items:             invoice.items ?? [],
                      }),
                    });
                    setShowCreditNote(false);
                    // Reload invoice to reflect cancelled status
                    const data = await apiFetch<{ invoice: FirestoreInvoice }>(`/api/invoices/${invoice.id}`);
                    setInvoice(data.invoice);
                  } catch (e: unknown) {
                    setCreditNoteErr(
                      e instanceof Error ? e.message : (isAr ? 'حدث خطأ' : 'An error occurred'),
                    );
                  } finally {
                    setCreditNoteBusy(false);
                  }
                }}
                className="flex-1 px-4 py-2.5 rounded-lg bg-red-600 text-white text-sm font-medium
                           hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {creditNoteBusy
                  ? <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  : <FileX size={15} />}
                {isAr ? 'إصدار الإشعار الدائن' : 'Issue Credit Note'}
              </button>
            </div>
          </div>
        </div>
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
            <p className="font-semibold text-amber-800">
              {isAr
                ? 'فاتورة ضريبية (مرحلة أولى) — تكامل ZATCA المرحلة الثانية قيد التطوير'
                : 'Tax Invoice (Phase 1) — ZATCA Phase 2 Integration Pending'}
            </p>
            <p className="text-xs text-amber-700">
              {isAr
                ? 'الفوترة الإلكترونية عبر منصة ZATCA المرحلة الثانية غير مفعّلة حالياً في هذا النظام.'
                : 'ZATCA Phase 2 electronic invoicing is not yet active in this system.'}
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
