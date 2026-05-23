import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatCurrency } from '@/lib/utils';
import { Users, Search, Phone, TrendingUp, BookOpen, Eye } from 'lucide-react';
import { NewCustomerButton } from '@/components/customers/NewCustomerButton';

// ─── Demo Data ────────────────────────────────────────────────────────────────

const demoCustomers = [
  {
    id: 'CUS-001',
    nameAr: 'أحمد محمد العمري',
    nameEn: 'Ahmed Al-Omari',
    phone: '0501234567',
    email: 'ahmed@example.com',
    nationality: 'SA',
    totalBookings: 8,
    totalSpentHalalas: 4250000,
    lastBookingDate: new Date('2026-05-20'),
    createdAt: new Date('2024-01-15'),
  },
  {
    id: 'CUS-002',
    nameAr: 'فاطمة علي الزهراني',
    nameEn: 'Fatima Al-Zahrani',
    phone: '0559876543',
    email: 'fatima@example.com',
    nationality: 'SA',
    totalBookings: 3,
    totalSpentHalalas: 990000,
    lastBookingDate: new Date('2026-05-21'),
    createdAt: new Date('2024-03-10'),
  },
  {
    id: 'CUS-003',
    nameAr: 'خالد إبراهيم السعد',
    nameEn: 'Khalid Al-Saad',
    phone: '0503456789',
    email: '',
    nationality: 'SA',
    totalBookings: 12,
    totalSpentHalalas: 8750000,
    lastBookingDate: new Date('2026-05-21'),
    createdAt: new Date('2023-08-22'),
  },
  {
    id: 'CUS-004',
    nameAr: 'منى عبدالله القحطاني',
    nameEn: 'Mona Al-Qahtani',
    phone: '0556789012',
    email: 'mona@example.com',
    nationality: 'SA',
    totalBookings: 5,
    totalSpentHalalas: 3200000,
    lastBookingDate: new Date('2026-05-22'),
    createdAt: new Date('2024-06-01'),
  },
  {
    id: 'CUS-005',
    nameAr: 'سعود محمد الغامدي',
    nameEn: 'Saud Al-Ghamdi',
    phone: '0508901234',
    email: 'saud@example.com',
    nationality: 'SA',
    totalBookings: 1,
    totalSpentHalalas: 75000,
    lastBookingDate: new Date('2026-05-22'),
    createdAt: new Date('2026-05-22'),
  },
  {
    id: 'CUS-006',
    nameAr: 'نورة سعد الشمري',
    nameEn: 'Noura Al-Shammari',
    phone: '0553210987',
    email: 'noura@example.com',
    nationality: 'SA',
    totalBookings: 7,
    totalSpentHalalas: 5600000,
    lastBookingDate: new Date('2026-04-10'),
    createdAt: new Date('2023-11-30'),
  },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function CustomersPage({ params }: { params: { locale: string } }) {
  const t = await getTranslations('customers');
  const { locale } = params;
  const isAr = locale === 'ar';

  const totalSpent = demoCustomers.reduce((s, c) => s + c.totalSpentHalalas, 0);
  const totalBookings = demoCustomers.reduce((s, c) => s + c.totalBookings, 0);
  const fmtLocale = isAr ? 'ar-SA' : 'en-SA';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-slate-900">{t('title')}</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            {isAr
              ? `${demoCustomers.length} عميل مسجل`
              : `${demoCustomers.length} registered customers`}
          </p>
        </div>
        <NewCustomerButton label={t('newCustomer')} />
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          {
            icon: Users,
            bg: 'bg-brand-50',
            color: 'text-brand-600',
            label: isAr ? 'إجمالي العملاء' : 'Total Customers',
            value: demoCustomers.length,
          },
          {
            icon: BookOpen,
            bg: 'bg-emerald-50',
            color: 'text-emerald-600',
            label: isAr ? 'إجمالي الحجوزات' : 'Total Bookings',
            value: totalBookings,
          },
          {
            icon: TrendingUp,
            bg: 'bg-amber-50',
            color: 'text-amber-600',
            label: isAr ? 'إجمالي الإيرادات' : 'Total Revenue',
            value: formatCurrency(totalSpent, fmtLocale),
          },
        ].map((stat) => (
          <Card key={stat.label} className="flex items-center gap-4">
            <div className={`p-3 rounded-xl ${stat.bg} flex-shrink-0`}>
              <stat.icon size={20} className={stat.color} />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-slate-500 mb-0.5 truncate">{stat.label}</p>
              <p className="text-xl font-bold text-slate-900">{stat.value}</p>
            </div>
          </Card>
        ))}
      </div>

      {/* Search bar */}
      <Card padding="sm">
        <div className="relative">
          <Search
            size={16}
            className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
          />
          <input
            type="search"
            placeholder={t('searchPlaceholder')}
            className="w-full rounded-lg border border-slate-200 bg-white ps-9 pe-4 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-colors"
          />
        </div>
      </Card>

      {/* Table / Empty state */}
      {demoCustomers.length === 0 ? (
        <EmptyState
          icon={<Users size={48} />}
          title={t('noCustomers')}
          action={{ label: t('newCustomer'), onClick: () => {} }}
        />
      ) : (
        <Card padding="none">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-surface-border bg-slate-50/50">
                  <th className="text-start ps-6 pe-4 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    {isAr ? 'العميل' : 'Customer'}
                  </th>
                  <th className="text-start px-4 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden sm:table-cell">
                    {isAr ? 'الهاتف' : 'Phone'}
                  </th>
                  <th className="text-start px-4 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden sm:table-cell">
                    {isAr ? 'البريد' : 'Email'}
                  </th>
                  <th className="text-start px-4 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden lg:table-cell">
                    {isAr ? 'الجنسية' : 'Nationality'}
                  </th>
                  <th className="text-end px-4 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden md:table-cell">
                    {isAr ? 'الحجوزات' : 'Bookings'}
                  </th>
                  <th className="text-end px-4 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden md:table-cell">
                    {isAr ? 'الإجمالي المنفق' : 'Total Spent'}
                  </th>
                  <th className="text-end ps-4 pe-6 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    {isAr ? 'الإجراءات' : 'Actions'}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {demoCustomers.map((customer) => (
                  <tr
                    key={customer.id}
                    className="hover:bg-slate-50/50 transition-colors group"
                  >
                    {/* Name + ID */}
                    <td className="ps-6 pe-4 py-4">
                      <p className="text-sm font-medium text-slate-900">
                        {isAr ? customer.nameAr : customer.nameEn}
                      </p>
                      <p className="text-xs text-slate-400 mt-0.5 font-mono">{customer.id}</p>
                    </td>

                    {/* Phone */}
                    <td className="px-4 py-4 hidden sm:table-cell">
                      <div className="flex items-center gap-1.5 text-sm text-slate-600">
                        <Phone size={13} className="text-slate-400 flex-shrink-0" />
                        <span dir="ltr">{customer.phone}</span>
                      </div>
                    </td>

                    {/* Email */}
                    <td className="px-4 py-4 hidden sm:table-cell">
                      {customer.email ? (
                        <span className="text-sm text-slate-600 truncate max-w-[160px] block">
                          {customer.email}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400 italic">
                          {isAr ? 'غير متوفر' : 'N/A'}
                        </span>
                      )}
                    </td>

                    {/* Nationality */}
                    <td className="px-4 py-4 hidden lg:table-cell">
                      <span className="text-sm text-slate-600">{customer.nationality}</span>
                    </td>

                    {/* Bookings count */}
                    <td className="px-4 py-4 text-end hidden md:table-cell">
                      <span className="text-sm font-medium text-slate-900">
                        {customer.totalBookings}
                      </span>
                    </td>

                    {/* Total spent */}
                    <td className="px-4 py-4 text-end hidden md:table-cell">
                      <span className="text-sm font-semibold text-slate-900">
                        {formatCurrency(customer.totalSpentHalalas, fmtLocale)}
                      </span>
                    </td>

                    {/* View action */}
                    <td className="ps-4 pe-6 py-4 text-end">
                      <Link
                        href={`/${locale}/customers/${customer.id}`}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-brand-600 hover:bg-brand-50 transition-colors"
                      >
                        <Eye size={13} />
                        {isAr ? 'عرض' : 'View'}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
