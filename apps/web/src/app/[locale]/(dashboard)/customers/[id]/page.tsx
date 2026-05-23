import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { BookingStatusBadge } from '@/components/ui/StatusBadge';
import { formatCurrency, formatDate } from '@/lib/utils';
import { ArrowRight, ArrowLeft, User, Phone, Mail, BookOpen, TrendingUp, Calendar } from 'lucide-react';

const DEMO_CUSTOMERS: Record<string, {
  id: string; nameAr: string; nameEn: string; phone: string; email: string;
  nationality: string; nationalId: string; totalBookings: number;
  totalSpentHalalas: number; createdAt: Date;
  bookings: Array<{ id: string; type: string; typeEn: string; status: 'confirmed' | 'completed' | 'cancelled'; date: Date; amountHalalas: number }>;
}> = {
  'CUS-001': {
    id: 'CUS-001', nameAr: 'أحمد محمد العمري', nameEn: 'Ahmed Al-Omari',
    phone: '0501234567', email: 'ahmed@example.com', nationality: 'SA', nationalId: '1012345678',
    totalBookings: 8, totalSpentHalalas: 4250000, createdAt: new Date('2024-01-15'),
    bookings: [
      { id: 'BK-2026-000248', type: 'عمرة', typeEn: 'Umrah', status: 'confirmed', date: new Date('2026-05-20'), amountHalalas: 902500 },
      { id: 'BK-2025-000120', type: 'طيران', typeEn: 'Flight', status: 'completed', date: new Date('2025-09-10'), amountHalalas: 345000 },
      { id: 'BK-2025-000055', type: 'فندق', typeEn: 'Hotel', status: 'completed', date: new Date('2025-03-15'), amountHalalas: 520000 },
    ],
  },
};

export default async function CustomerDetailPage({
  params,
}: {
  params: { locale: string; id: string };
}) {
  const locale = params.locale;
  const isAr = locale === 'ar';
  const customer = DEMO_CUSTOMERS[params.id];
  if (!customer) notFound();

  const BackIcon = isAr ? ArrowRight : ArrowLeft;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href={`/${locale}/customers`}
          className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors"
        >
          <BackIcon size={18} />
        </Link>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-slate-900">
            {isAr ? customer.nameAr : customer.nameEn}
          </h1>
          <p className="text-slate-500 text-sm">{customer.id}</p>
        </div>
        <Link href={`/${locale}/bookings/new`}>
          <Button size="sm">
            <BookOpen size={14} />
            {isAr ? 'حجز جديد' : 'New Booking'}
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Profile */}
        <div className="space-y-5">
          <Card>
            <div className="flex flex-col items-center text-center pb-4 border-b border-surface-border mb-4">
              <div className="w-16 h-16 rounded-full bg-brand-100 flex items-center justify-center text-2xl font-bold text-brand-700 mb-3">
                {customer.nameAr[0]}
              </div>
              <h2 className="text-base font-semibold text-slate-900">
                {isAr ? customer.nameAr : customer.nameEn}
              </h2>
              <p className="text-sm text-slate-500">{customer.nationality}</p>
            </div>
            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-2.5 text-slate-600">
                <Phone size={14} className="text-slate-400 flex-shrink-0" />
                <span dir="ltr">{customer.phone}</span>
              </div>
              {customer.email && (
                <div className="flex items-center gap-2.5 text-slate-600">
                  <Mail size={14} className="text-slate-400 flex-shrink-0" />
                  <span>{customer.email}</span>
                </div>
              )}
              <div className="flex items-center gap-2.5 text-slate-600">
                <User size={14} className="text-slate-400 flex-shrink-0" />
                <span dir="ltr">{customer.nationalId}</span>
              </div>
              <div className="flex items-center gap-2.5 text-slate-600">
                <Calendar size={14} className="text-slate-400 flex-shrink-0" />
                <span>{isAr ? 'عميل منذ' : 'Customer since'}: {formatDate(customer.createdAt, isAr ? 'ar-SA' : 'en-SA')}</span>
              </div>
            </div>
          </Card>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-3">
            <Card padding="sm">
              <div className="flex items-center gap-2 mb-1">
                <BookOpen size={14} className="text-brand-600" />
                <span className="text-xs text-slate-500">{isAr ? 'حجوزات' : 'Bookings'}</span>
              </div>
              <p className="text-xl font-bold text-slate-900">{customer.totalBookings}</p>
            </Card>
            <Card padding="sm">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp size={14} className="text-emerald-600" />
                <span className="text-xs text-slate-500">{isAr ? 'الإنفاق' : 'Spent'}</span>
              </div>
              <p className="text-base font-bold text-slate-900">
                {formatCurrency(customer.totalSpentHalalas, isAr ? 'ar-SA' : 'en-SA')}
              </p>
            </Card>
          </div>
        </div>

        {/* Bookings history */}
        <div className="lg:col-span-2">
          <Card padding="none">
            <div className="px-6 py-4 border-b border-surface-border">
              <h3 className="text-base font-semibold text-slate-900">
                {isAr ? 'سجل الحجوزات' : 'Booking History'}
              </h3>
            </div>
            <div className="divide-y divide-surface-border">
              {customer.bookings.map(booking => (
                <div key={booking.id} className="px-6 py-4 flex items-center gap-4 hover:bg-slate-50/50 transition-colors">
                  <div className="flex-1 min-w-0">
                    <Link
                      href={`/${locale}/bookings/${booking.id}`}
                      className="text-sm font-mono font-medium text-brand-700 hover:underline"
                    >
                      {booking.id}
                    </Link>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {isAr ? booking.type : booking.typeEn} · {formatDate(booking.date, isAr ? 'ar-SA' : 'en-SA')}
                    </p>
                  </div>
                  <div className="text-end flex-shrink-0">
                    <p className="text-sm font-semibold text-slate-900">
                      {formatCurrency(booking.amountHalalas, isAr ? 'ar-SA' : 'en-SA')}
                    </p>
                  </div>
                  <BookingStatusBadge status={booking.status} locale={locale} />
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
