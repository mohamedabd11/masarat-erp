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
} from 'lucide-react';

interface BookingDetailClientProps {
  locale: string;
  bookingId: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type BookingData = Record<string, any>;

export function BookingDetailClient({ locale, bookingId }: BookingDetailClientProps) {
  const isAr = locale === 'ar';
  const { user } = useAuth();
  const [booking, setBooking] = useState<BookingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

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
          setBooking({ id: snap.id, ...snap.data() });
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
  const grandTotalHalalas = pricing.totalAmount ?? 0;
  const paidHalalas = booking.totalPaid ?? 0;

  const travelDate = booking.travelDate?.toDate?.() ?? null;
  const returnDate = booking.returnDate?.toDate?.() ?? null;

  const travelers: BookingData[] = booking.passengers ?? [];
  const invoiceIds: string[] = booking.invoiceIds ?? [];
  const existingInvoiceId = invoiceIds[0];

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
              <h1 className="text-xl font-bold text-slate-900 font-mono">{booking.id}</h1>
              <BookingStatusBadge status={booking.status} locale={locale} />
            </div>
            <p className="text-slate-500 text-sm mt-0.5">
              {booking.type} · {booking.pricing?.revenueModel === 'agent'
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
                <p className="font-medium text-slate-900 font-mono" dir="ltr">{booking.customerPhone ?? '—'}</p>
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
