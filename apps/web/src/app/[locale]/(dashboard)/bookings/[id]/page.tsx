import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { BookingStatusBadge } from '@/components/ui/StatusBadge';
import { formatCurrency, formatDate } from '@/lib/utils';
import { ArrowRight, ArrowLeft, FileText, User, MapPin, Users, Receipt } from 'lucide-react';
import { BookingActions } from '@/components/bookings/BookingActions';

// Demo data — in production fetched from Firestore
const DEMO_BOOKING = {
  id: 'BK-2026-000248',
  type: 'umrah',
  status: 'confirmed' as const,
  customerNameAr: 'أحمد محمد العمري',
  customerNameEn: 'Ahmed Al-Omari',
  customerPhone: '0501234567',
  customerEmail: 'ahmed@example.com',
  destination: 'مكة المكرمة والمدينة المنورة',
  departureDate: new Date('2026-06-10'),
  returnDate: new Date('2026-06-24'),
  travelers: [
    { nameAr: 'أحمد محمد العمري', nameEn: 'Ahmed Al-Omari', passportNumber: 'K123456', nationality: 'SA' },
    { nameAr: 'منى أحمد العمري', nameEn: 'Mona Ahmed Al-Omari', passportNumber: 'K789012', nationality: 'SA' },
  ],
  supplierName: 'شركة الحرمين للسياحة',
  supplierRef: 'HRM-2026-8844',
  revenueModel: 'agent' as const,
  costPriceHalalas: 700000,
  serviceFeeSAR: 50000,
  vatAmountHalalas: 7500,
  grandTotalHalalas: 902500,
  paidHalalas: 902500,
  notes: 'العميل يفضل غرفة مطلة على الحرم',
  invoiceIds: ['INV-2026-000248'],
  createdAt: new Date('2026-05-20'),
  confirmedAt: new Date('2026-05-20'),
};

export default async function BookingDetailPage({
  params,
}: {
  params: { locale: string; id: string };
}) {
  const locale = params.locale;
  const isAr = locale === 'ar';

  // In production: fetch from Firestore by params.id
  const booking = params.id === DEMO_BOOKING.id ? DEMO_BOOKING : null;
  if (!booking) notFound();

  const BackIcon = isAr ? ArrowRight : ArrowLeft;

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
              {isAr ? 'عمرة' : 'Umrah'} · {isAr ? 'نموذج وكيل' : 'Agent Model'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:ms-auto">
          {booking.invoiceIds.length > 0 && (
            <Link href={`/${locale}/invoices/${booking.invoiceIds[0]}`}>
              <Button variant="outline" size="sm">
                <FileText size={14} />
                {isAr ? 'عرض الفاتورة' : 'View Invoice'}
              </Button>
            </Link>
          )}
          <Button size="sm" variant="secondary">
            {isAr ? 'تعديل' : 'Edit'}
          </Button>
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
                <p className="font-medium text-slate-900">
                  {isAr ? booking.customerNameAr : booking.customerNameEn}
                </p>
              </div>
              <div>
                <p className="text-slate-500 text-xs mb-1">{isAr ? 'الهاتف' : 'Phone'}</p>
                <p className="font-medium text-slate-900 font-mono" dir="ltr">{booking.customerPhone}</p>
              </div>
              <div>
                <p className="text-slate-500 text-xs mb-1">{isAr ? 'البريد الإلكتروني' : 'Email'}</p>
                <p className="font-medium text-slate-900">{booking.customerEmail}</p>
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
              <div>
                <p className="text-slate-500 text-xs mb-1">{isAr ? 'الوجهة' : 'Destination'}</p>
                <p className="font-medium text-slate-900">{booking.destination}</p>
              </div>
              <div>
                <p className="text-slate-500 text-xs mb-1">{isAr ? 'المورد' : 'Supplier'}</p>
                <p className="font-medium text-slate-900">{booking.supplierName}</p>
                <p className="text-xs text-slate-400 mt-0.5 font-mono">{booking.supplierRef}</p>
              </div>
              <div>
                <p className="text-slate-500 text-xs mb-1">{isAr ? 'تاريخ المغادرة' : 'Departure'}</p>
                <p className="font-medium text-slate-900">
                  {formatDate(booking.departureDate, isAr ? 'ar-SA' : 'en-SA')}
                </p>
              </div>
              <div>
                <p className="text-slate-500 text-xs mb-1">{isAr ? 'تاريخ العودة' : 'Return'}</p>
                <p className="font-medium text-slate-900">
                  {formatDate(booking.returnDate, isAr ? 'ar-SA' : 'en-SA')}
                </p>
              </div>
            </div>
          </Card>

          {/* Travelers */}
          <Card>
            <CardHeader>
              <CardTitle>
                <div className="flex items-center gap-2">
                  <Users size={16} className="text-brand-600" />
                  {isAr ? `المسافرون (${booking.travelers.length})` : `Travelers (${booking.travelers.length})`}
                </div>
              </CardTitle>
            </CardHeader>
            <div className="space-y-3">
              {booking.travelers.map((traveler, idx) => (
                <div key={idx} className="flex items-center gap-4 p-3 rounded-lg bg-slate-50 border border-slate-100">
                  <div className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center text-xs font-bold text-brand-700 flex-shrink-0">
                    {idx + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900">
                      {isAr ? traveler.nameAr : traveler.nameEn}
                    </p>
                    <p className="text-xs text-slate-500 font-mono mt-0.5">{traveler.passportNumber}</p>
                  </div>
                  <span className="text-xs text-slate-400 flex-shrink-0">{traveler.nationality}</span>
                </div>
              ))}
            </div>
          </Card>

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
                { label: isAr ? 'سعر التكلفة' : 'Cost Price', value: formatCurrency(booking.costPriceHalalas, isAr ? 'ar-SA' : 'en-SA') },
                { label: isAr ? 'رسوم الخدمة' : 'Service Fee', value: formatCurrency(booking.serviceFeeSAR, isAr ? 'ar-SA' : 'en-SA') },
                { label: isAr ? 'ضريبة القيمة المضافة 15%' : 'VAT 15%', value: formatCurrency(booking.vatAmountHalalas, isAr ? 'ar-SA' : 'en-SA') },
              ].map(row => (
                <div key={row.label} className="flex justify-between text-slate-600">
                  <span>{row.label}</span>
                  <span>{row.value}</span>
                </div>
              ))}
              <div className="border-t border-surface-border pt-2.5 flex justify-between font-bold text-slate-900">
                <span>{isAr ? 'الإجمالي' : 'Total'}</span>
                <span className="text-brand-700">
                  {formatCurrency(booking.grandTotalHalalas, isAr ? 'ar-SA' : 'en-SA')}
                </span>
              </div>
              <div className="flex justify-between text-emerald-600 font-medium">
                <span>{isAr ? 'المدفوع' : 'Paid'}</span>
                <span>{formatCurrency(booking.paidHalalas, isAr ? 'ar-SA' : 'en-SA')}</span>
              </div>
              {booking.grandTotalHalalas - booking.paidHalalas > 0 && (
                <div className="flex justify-between text-red-600 font-medium">
                  <span>{isAr ? 'المتبقي' : 'Due'}</span>
                  <span>
                    {formatCurrency(booking.grandTotalHalalas - booking.paidHalalas, isAr ? 'ar-SA' : 'en-SA')}
                  </span>
                </div>
              )}
            </div>
            <BookingActions
              bookingId={booking.id}
              agencyId="demo-agency"
              bookingStatus={booking.status}
              existingInvoiceId={booking.invoiceIds[0]}
              grandTotalHalalas={booking.grandTotalHalalas}
              paidHalalas={booking.paidHalalas}
            />
          </Card>

          {/* Timeline */}
          <Card>
            <CardHeader>
              <CardTitle>{isAr ? 'السجل الزمني' : 'Timeline'}</CardTitle>
            </CardHeader>
            <div className="space-y-3">
              {[
                { label: isAr ? 'تم الإنشاء' : 'Created', date: booking.createdAt, color: 'bg-slate-400' },
                { label: isAr ? 'تم التأكيد' : 'Confirmed', date: booking.confirmedAt, color: 'bg-emerald-500' },
                { label: isAr ? 'تم إصدار الفاتورة' : 'Invoice Issued', date: booking.createdAt, color: 'bg-brand-500' },
              ].map((event, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className={`w-2.5 h-2.5 rounded-full mt-1 flex-shrink-0 ${event.color}`} />
                  <div>
                    <p className="text-sm font-medium text-slate-700">{event.label}</p>
                    <p className="text-xs text-slate-400">{formatDate(event.date, isAr ? 'ar-SA' : 'en-SA')}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
