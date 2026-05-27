'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@masarat/firebase';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { BookingStatusBadge } from '@/components/ui/StatusBadge';
import { Spinner } from '@/components/ui/Spinner';
import { formatCurrency, formatDate } from '@/lib/utils';
import { BookingActions } from './BookingActions';
import {
  ArrowRight, ArrowLeft, FileText, User, MapPin, Users, Receipt,
  TrendingDown, Banknote, CreditCard, Building2, Globe, FileCheck2, ArrowUpRight,
  CheckCircle2, Circle, Clock, BadgeCheck,
} from 'lucide-react';

// ─── Booking Progress Stepper ─────────────────────────────────────────────────

type StepStatus = 'done' | 'current' | 'partial' | 'pending';

interface Step {
  labelAr: string;
  labelEn: string;
  status:  StepStatus;
  subAr?:  string;
  subEn?:  string;
}

function BookingProgressStepper({
  steps, isAr,
}: { steps: Step[]; isAr: boolean }) {
  return (
    <div className="relative flex items-start justify-between gap-0">
      {steps.map((step, idx) => {
        const isLast = idx === steps.length - 1;
        const { status } = step;

        const circleClass =
          status === 'done'    ? 'bg-emerald-500 border-emerald-500 text-white' :
          status === 'partial' ? 'bg-amber-400   border-amber-400   text-white' :
          status === 'current' ? 'bg-brand-600   border-brand-600   text-white' :
                                 'bg-white        border-slate-200   text-slate-400';

        const lineClass =
          status === 'done' || (idx > 0 && steps[idx - 1]?.status === 'done')
            ? 'bg-emerald-400'
            : 'bg-slate-200';

        const labelClass =
          status === 'done'    ? 'text-emerald-700 font-semibold' :
          status === 'partial' ? 'text-amber-600 font-semibold' :
          status === 'current' ? 'text-brand-700 font-semibold' :
                                 'text-slate-400';

        const Icon =
          status === 'done'    ? CheckCircle2 :
          status === 'partial' ? Clock :
          status === 'current' ? Circle :
                                 Circle;

        return (
          <div key={idx} className="flex-1 flex flex-col items-center relative">
            {/* Connector line (before circle) */}
            {idx > 0 && (
              <div className={`absolute top-4 h-0.5 w-full -translate-x-1/2 ${
                steps[idx - 1]?.status === 'done' ? 'bg-emerald-400' : 'bg-slate-200'
              }`}
                style={{ left: 0, right: '50%', width: '50%' }}
              />
            )}
            {/* Connector line (after circle) */}
            {!isLast && (
              <div className={`absolute top-4 h-0.5 ${lineClass}`}
                style={{ left: '50%', right: 0, width: '50%' }}
              />
            )}

            {/* Circle */}
            <div className={`relative z-10 w-8 h-8 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${circleClass}`}>
              <Icon size={14} strokeWidth={2.5} />
            </div>

            {/* Label */}
            <div className="mt-2 text-center px-1">
              <p className={`text-[11px] leading-tight ${labelClass}`}>
                {isAr ? step.labelAr : step.labelEn}
              </p>
              {(step.subAr || step.subEn) && (
                <p className="text-[10px] text-slate-400 mt-0.5 leading-tight">
                  {isAr ? step.subAr : step.subEn}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

interface BookingDetailClientProps {
  locale: string;
  bookingId: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type BookingData = Record<string, any>;

const TYPE_LABELS: Record<string, { ar: string; en: string }> = {
  flight:       { ar: 'طيران',        en: 'Flight' },
  hotel:        { ar: 'فندق',         en: 'Hotel' },
  flight_hotel: { ar: 'طيران + فندق', en: 'Flight + Hotel' },
  package:      { ar: 'باقة سياحية',  en: 'Package' },
  umrah:        { ar: 'عمرة',         en: 'Umrah' },
  hajj:         { ar: 'حج',           en: 'Hajj' },
  visa:         { ar: 'تأشيرة',       en: 'Visa' },
  insurance:    { ar: 'تأمين سفر',    en: 'Insurance' },
  transfer:     { ar: 'نقل',          en: 'Transfer' },
  family_visit: { ar: 'زيارة عائلية', en: 'Family Visit' },
  cruise:       { ar: 'رحلة بحرية',   en: 'Cruise' },
};

interface SupplierPayment {
  id: string;
  supplierName: string;
  amountHalalas: number;
  paymentMethod: string;
  reference?: string;
  createdAt: { toDate?: () => Date } | null;
}

function methodIcon(method: string) {
  if (method === 'bank_transfer') return <Building2 size={12} />;
  if (method === 'card')          return <CreditCard size={12} />;
  if (method === 'online')        return <Globe size={12} />;
  if (method === 'check')         return <FileCheck2 size={12} />;
  return <Banknote size={12} />;
}

function methodLabel(method: string, isAr: boolean) {
  const map: Record<string, { ar: string; en: string }> = {
    cash:          { ar: 'نقداً',        en: 'Cash' },
    bank_transfer: { ar: 'تحويل بنكي',  en: 'Bank Transfer' },
    card:          { ar: 'بطاقة',        en: 'Card' },
    online:        { ar: 'دفع إلكتروني', en: 'Online' },
    check:         { ar: 'شيك',          en: 'Cheque' },
  };
  const m = map[method];
  return m ? (isAr ? m.ar : m.en) : method;
}

export function BookingDetailClient({ locale, bookingId }: BookingDetailClientProps) {
  const isAr = locale === 'ar';
  const { user } = useAuth();
  const [booking, setBooking] = useState<BookingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [supplierPayments, setSupplierPayments] = useState<SupplierPayment[]>([]);

  const BackIcon = isAr ? ArrowRight : ArrowLeft;

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    async function fetchBooking() {
      try {
        const { getFirestore, doc, getDoc } = await import('firebase/firestore');
        const { getApp } = await import('@masarat/firebase');
        const db = getFirestore(getApp());
        const snap = await getDoc(doc(db, 'bookings', bookingId));
        if (cancelled) return;
        if (!snap.exists()) {
          setNotFound(true);
        } else {
          const data = snap.data() as BookingData;
          if (data['agencyId'] !== user?.agencyId) { setNotFound(true); return; }
          setBooking({ id: snap.id, ...data });
        }
      } catch {
        if (!cancelled) setNotFound(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void fetchBooking();
    return () => { cancelled = true; };
  }, [bookingId, user]);

  useEffect(() => {
    if (!user) return;
    let unsub: (() => void) | undefined;

    async function loadSupplierPayments() {
      const { getFirestore, collection, query, where, orderBy, onSnapshot } =
        await import('firebase/firestore');
      const { getApp } = await import('@masarat/firebase');
      const db = getFirestore(getApp());
      const q = query(
        collection(db, 'supplier_payments'),
        where('bookingId', '==', bookingId),
        orderBy('createdAt', 'desc'),
      );
      unsub = onSnapshot(q, snap => {
        setSupplierPayments(snap.docs.map(d => ({ id: d.id, ...d.data() } as SupplierPayment)));
      });
    }

    void loadSupplierPayments();
    return () => unsub?.();
  }, [bookingId, user]);

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Spinner size="lg" />
      </div>
    );
  }

  if (notFound || !booking) {
    return (
      <div className="py-16 text-center space-y-4">
        <p className="text-slate-500">{isAr ? 'الحجز غير موجود' : 'Booking not found'}</p>
        <Link href={`/${locale}/bookings`}>
          <Button variant="outline" size="sm">
            {isAr ? 'العودة إلى الحجوزات' : 'Back to Bookings'}
          </Button>
        </Link>
      </div>
    );
  }

  const customerName = isAr
    ? (booking.customerName?.ar ?? booking.customerName ?? '')
    : (booking.customerName?.en ?? booking.customerName?.ar ?? booking.customerName ?? '');

  const pricing = booking.pricing ?? {};
  const grandTotalHalalas = booking.grandTotalHalalas ?? pricing.totalAmount ?? 0;
  const paidHalalas = booking.paidHalalas ?? booking.totalPaid ?? 0;

  const travelDate = booking.travelDate?.toDate?.() ?? null;
  const returnDate = booking.returnDate?.toDate?.() ?? null;

  const travelers: BookingData[] = booking.passengers ?? [];
  const invoiceIds: string[] = booking.invoiceIds ?? [];
  const existingInvoiceId = invoiceIds[0];

  const isCompleted = booking.status === 'completed';
  const isPaid      = grandTotalHalalas > 0 && paidHalalas >= grandTotalHalalas;
  const isPartial   = paidHalalas > 0 && !isPaid;
  const hasInvoice  = !!existingInvoiceId;

  const progressSteps: Step[] = [
    {
      labelAr: 'تم الحجز',
      labelEn: 'Booked',
      status:  'done',
      subAr:   booking.bookingNumber ?? undefined,
      subEn:   booking.bookingNumber ?? undefined,
    },
    {
      labelAr: 'إصدار فاتورة',
      labelEn: 'Invoiced',
      status:  hasInvoice ? 'done' : 'current',
    },
    {
      labelAr: isPaid ? 'مدفوع بالكامل' : isPartial ? 'دفع جزئي' : 'الدفع',
      labelEn: isPaid ? 'Fully Paid'    : isPartial ? 'Partial'   : 'Payment',
      status:  isPaid ? 'done' : isPartial ? 'partial' : hasInvoice ? 'current' : 'pending',
      subAr:   isPartial
        ? `${formatCurrency(paidHalalas, 'ar-SA')} / ${formatCurrency(grandTotalHalalas, 'ar-SA')}`
        : undefined,
      subEn:   isPartial
        ? `${formatCurrency(paidHalalas, 'en-SA')} / ${formatCurrency(grandTotalHalalas, 'en-SA')}`
        : undefined,
    },
    {
      labelAr: 'مكتمل',
      labelEn: 'Completed',
      status:  isCompleted ? 'done' : isPaid ? 'current' : 'pending',
    },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex items-center gap-3">
          <Link
            href={`/${locale}/bookings`}
            className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors"
          >
            <BackIcon size={18} />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold text-slate-900 font-mono">
                {booking.bookingNumber ?? booking.id}
              </h1>
              <BookingStatusBadge status={booking.status} locale={locale} />
            </div>
            <p className="text-slate-500 text-sm mt-0.5">
              {(TYPE_LABELS[booking.type]?.[isAr ? 'ar' : 'en'] ?? booking.type)} · {booking.pricing?.revenueModel === 'agent'
                ? (isAr ? 'نموذج وكيل' : 'Agent Model')
                : (isAr ? 'نموذج أصيل' : 'Principal Model')}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:ms-auto">
          {existingInvoiceId && (
            <Link href={`/${locale}/invoices/${existingInvoiceId}`}>
              <Button variant="outline" size="sm">
                <FileText size={14} />
                {isAr ? 'عرض الفاتورة' : 'View Invoice'}
              </Button>
            </Link>
          )}
        </div>
      </div>

      {/* ── Progress stepper ─────────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-surface-border shadow-sm px-6 py-5">
        <div className="flex items-center justify-between mb-4">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
            {isAr ? 'مراحل الحجز' : 'Booking Progress'}
          </p>
          {isCompleted && (
            <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
              <BadgeCheck size={12} />
              {isAr ? 'مكتمل' : 'Completed'}
            </span>
          )}
        </div>
        <BookingProgressStepper steps={progressSteps} isAr={isAr} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main info */}
        <div className="lg:col-span-2 space-y-5">
          {/* Customer */}
          <Card>
            <CardHeader>
              <CardTitle>
                <div className="flex items-center gap-2">
                  <User size={16} className="text-brand-600" />
                  {isAr ? 'بيانات العميل' : 'Customer Details'}
                </div>
              </CardTitle>
            </CardHeader>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-slate-500 text-xs mb-1">{isAr ? 'الاسم' : 'Name'}</p>
                <p className="font-medium text-slate-900">{customerName}</p>
              </div>
              <div>
                <p className="text-slate-500 text-xs mb-1">{isAr ? 'الهاتف' : 'Phone'}</p>
                <p className="font-medium text-slate-900 font-mono" dir="rtl">{booking.customerPhone ?? '—'}</p>
              </div>
            </div>
          </Card>

          {/* Trip details */}
          <Card>
            <CardHeader>
              <CardTitle>
                <div className="flex items-center gap-2">
                  <MapPin size={16} className="text-brand-600" />
                  {isAr ? 'تفاصيل الرحلة' : 'Trip Details'}
                </div>
              </CardTitle>
            </CardHeader>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              {booking.supplierName && (
                <div>
                  <p className="text-slate-500 text-xs mb-1">{isAr ? 'المورد' : 'Supplier'}</p>
                  <p className="font-medium text-slate-900">{booking.supplierName}</p>
                  {booking.supplierRef && (
                    <p className="text-xs text-slate-400 mt-0.5 font-mono">{booking.supplierRef}</p>
                  )}
                </div>
              )}
              {travelDate && (
                <div>
                  <p className="text-slate-500 text-xs mb-1">{isAr ? 'تاريخ المغادرة' : 'Departure'}</p>
                  <p className="font-medium text-slate-900">
                    {formatDate(travelDate, isAr ? 'ar-SA' : 'en-SA')}
                  </p>
                </div>
              )}
              {returnDate && (
                <div>
                  <p className="text-slate-500 text-xs mb-1">{isAr ? 'تاريخ العودة' : 'Return'}</p>
                  <p className="font-medium text-slate-900">
                    {formatDate(returnDate, isAr ? 'ar-SA' : 'en-SA')}
                  </p>
                </div>
              )}
            </div>
          </Card>

          {/* Travelers */}
          {travelers.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>
                  <div className="flex items-center gap-2">
                    <Users size={16} className="text-brand-600" />
                    {isAr
                      ? `المسافرون (${travelers.length})`
                      : `Travelers (${travelers.length})`}
                  </div>
                </CardTitle>
              </CardHeader>
              <div className="space-y-3">
                {travelers.map((t, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-4 p-3 rounded-lg bg-slate-50 border border-slate-100"
                  >
                    <div className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center text-xs font-bold text-brand-700 flex-shrink-0">
                      {idx + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900">
                        {isAr ? (t.nameAr || t.nameEn) : (t.nameEn || t.nameAr)}
                      </p>
                      {t.passportNumber && (
                        <p className="text-xs text-slate-500 font-mono mt-0.5">{t.passportNumber}</p>
                      )}
                    </div>
                    {t.nationality && (
                      <span className="text-xs text-slate-400 flex-shrink-0">{t.nationality}</span>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          )}

          {booking.notes && (
            <Card>
              <CardHeader>
                <CardTitle>{isAr ? 'ملاحظات' : 'Notes'}</CardTitle>
              </CardHeader>
              <p className="text-sm text-slate-600">{booking.notes}</p>
            </Card>
          )}

          {/* Supplier Payments */}
          {supplierPayments.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <TrendingDown size={16} className="text-red-500" />
                      {isAr
                        ? `سندات الصرف (${supplierPayments.length})`
                        : `Payment Vouchers (${supplierPayments.length})`}
                    </div>
                    <span className="text-sm font-black font-mono text-red-700 tabular-nums">
                      {formatCurrency(
                        supplierPayments.reduce((s, p) => s + p.amountHalalas, 0),
                        isAr ? 'ar-SA' : 'en-SA',
                      )}
                    </span>
                  </div>
                </CardTitle>
              </CardHeader>
              <div className="space-y-2">
                {supplierPayments.map(sp => {
                  const date = sp.createdAt?.toDate?.() ?? null;
                  return (
                    <div
                      key={sp.id}
                      className="flex items-center gap-3 p-3 rounded-lg bg-red-50 border border-red-100"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900 truncate">{sp.supplierName}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="inline-flex items-center gap-1 text-xs text-slate-500 bg-white px-2 py-0.5 rounded-full border border-slate-200">
                            {methodIcon(sp.paymentMethod)}
                            {methodLabel(sp.paymentMethod, isAr)}
                          </span>
                          {date && (
                            <span className="text-xs text-slate-400">
                              {formatDate(date, isAr ? 'ar-SA' : 'en-SA')}
                            </span>
                          )}
                          {sp.reference && (
                            <span className="text-xs text-slate-400 font-mono truncate">{sp.reference}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-sm font-bold font-mono tabular-nums text-red-600">
                          {formatCurrency(sp.amountHalalas, isAr ? 'ar-SA' : 'en-SA')}
                        </span>
                        <Link
                          href={`/${locale}/supplier-payments/${sp.id}`}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-brand-600 hover:bg-white transition-colors"
                          title={isAr ? 'عرض السند' : 'View Voucher'}
                        >
                          <ArrowUpRight size={14} />
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}
        </div>

        {/* Sidebar: Financial summary */}
        <div className="space-y-5">
          <Card className="border-brand-200">
            <CardHeader>
              <CardTitle>
                <div className="flex items-center gap-2">
                  <Receipt size={16} className="text-brand-600" />
                  {isAr ? 'الملخص المالي' : 'Financial Summary'}
                </div>
              </CardTitle>
            </CardHeader>
            <div className="space-y-2.5 text-sm">
              {[
                { label: isAr ? 'سعر التكلفة' : 'Cost Price', value: formatCurrency(pricing.totalCost ?? 0, isAr ? 'ar-SA' : 'en-SA') },
                { label: isAr ? 'رسوم الخدمة' : 'Service Fee', value: formatCurrency(pricing.serviceFee ?? 0, isAr ? 'ar-SA' : 'en-SA') },
                { label: isAr ? 'ضريبة القيمة المضافة 15%' : 'VAT 15%', value: formatCurrency(pricing.vatAmount ?? 0, isAr ? 'ar-SA' : 'en-SA') },
              ].map(row => (
                <div key={row.label} className="flex justify-between text-slate-600">
                  <span>{row.label}</span>
                  <span>{row.value}</span>
                </div>
              ))}
              <div className="border-t border-surface-border pt-2.5 flex justify-between font-bold text-slate-900">
                <span>{isAr ? 'الإجمالي' : 'Total'}</span>
                <span className="text-brand-700">
                  {formatCurrency(grandTotalHalalas, isAr ? 'ar-SA' : 'en-SA')}
                </span>
              </div>
              <div className="flex justify-between text-emerald-600 font-medium">
                <span>{isAr ? 'المدفوع' : 'Paid'}</span>
                <span>{formatCurrency(paidHalalas, isAr ? 'ar-SA' : 'en-SA')}</span>
              </div>
              {grandTotalHalalas - paidHalalas > 0 && (
                <div className="flex justify-between text-red-600 font-medium">
                  <span>{isAr ? 'المتبقي' : 'Due'}</span>
                  <span>{formatCurrency(grandTotalHalalas - paidHalalas, isAr ? 'ar-SA' : 'en-SA')}</span>
                </div>
              )}
            </div>
            <BookingActions
              bookingId={booking.id}
              agencyId={booking.agencyId ?? user?.agencyId ?? ''}
              bookingStatus={booking.status}
              existingInvoiceId={existingInvoiceId}
              grandTotalHalalas={grandTotalHalalas}
              paidHalalas={paidHalalas}
            />
          </Card>

          {/* Timeline */}
          <Card>
            <CardHeader>
              <CardTitle>{isAr ? 'السجل الزمني' : 'Timeline'}</CardTitle>
            </CardHeader>
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <div className="w-2.5 h-2.5 rounded-full mt-1 flex-shrink-0 bg-slate-400" />
                <div>
                  <p className="text-sm font-medium text-slate-700">{isAr ? 'تم الإنشاء' : 'Created'}</p>
                  <p className="text-xs text-slate-400">
                    {booking.createdAt?.toDate
                      ? formatDate(booking.createdAt.toDate(), isAr ? 'ar-SA' : 'en-SA')
                      : '—'}
                  </p>
                </div>
              </div>
              {booking.status === 'confirmed' && (
                <div className="flex items-start gap-3">
                  <div className="w-2.5 h-2.5 rounded-full mt-1 flex-shrink-0 bg-emerald-500" />
                  <div>
                    <p className="text-sm font-medium text-slate-700">{isAr ? 'تم التأكيد' : 'Confirmed'}</p>
                    <p className="text-xs text-slate-400">
                      {booking.confirmedAt?.toDate
                        ? formatDate(booking.confirmedAt.toDate(), isAr ? 'ar-SA' : 'en-SA')
                        : (isAr ? 'عند الإنشاء' : 'At creation')}
                    </p>
                  </div>
                </div>
              )}
              {existingInvoiceId && (
                <div className="flex items-start gap-3">
                  <div className="w-2.5 h-2.5 rounded-full mt-1 flex-shrink-0 bg-brand-500" />
                  <div>
                    <p className="text-sm font-medium text-slate-700">
                      {isAr ? 'تم إصدار الفاتورة' : 'Invoice Issued'}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
