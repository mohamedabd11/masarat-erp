'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@masarat/firebase';
import { Card } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatCurrency } from '@/lib/utils';
import { Users, Search, Phone, TrendingUp, Plus } from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface Customer {
  id: string;
  name?: { ar?: string; en?: string };
  mobile?: string;
  email?: string;
  nationality?: string;
  stats?: { totalBookings?: number; totalSpent?: number };
  tier?: string;
  isActive?: boolean;
  createdAt?: { toDate?: () => Date };
}

interface CustomersClientProps {
  locale: string;
}

export function CustomersClient({ locale }: CustomersClientProps) {
  const isAr = locale === 'ar';
  const { user } = useAuth();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const agencyId = user?.agencyId ?? '';

  useEffect(() => {
    if (!agencyId) { setLoading(false); return; }
    let unsub: (() => void) | undefined;

    async function subscribe() {
      const { getFirestore, collection, query, where, onSnapshot } = await import('firebase/firestore');
      const { getApp } = await import('@masarat/firebase');
      const db = getFirestore(getApp());
      const col = collection(db, 'customers');
      const q = query(col, where('agencyId', '==', agencyId));
      unsub = onSnapshot(q, snap => {
        const docs = snap.docs.map(d => ({ id: d.id, ...d.data() } as Customer));
        docs.sort((a, b) => {
          const at = a.createdAt?.toDate?.()?.getTime() ?? 0;
          const bt = b.createdAt?.toDate?.()?.getTime() ?? 0;
          return bt - at;
        });
        setCustomers(docs);
        setLoading(false);
      }, () => setLoading(false));
    }

    void subscribe();
    return () => unsub?.();
  }, [agencyId]);

  const filtered = search
    ? customers.filter(c => {
        const name = isAr ? c.name?.ar ?? '' : c.name?.en ?? c.name?.ar ?? '';
        return (
          name.toLowerCase().includes(search.toLowerCase()) ||
          (c.mobile ?? '').includes(search)
        );
      })
    : customers;

  const tierColors: Record<string, string> = {
    standard: 'bg-slate-100 text-slate-600',
    silver:   'bg-slate-100 text-slate-700',
    gold:     'bg-amber-100 text-amber-700',
    platinum: 'bg-indigo-100 text-indigo-700',
  };
  const tierLabels: Record<string, { ar: string; en: string }> = {
    standard: { ar: 'عادي',     en: 'Standard' },
    silver:   { ar: 'فضي',      en: 'Silver' },
    gold:     { ar: 'ذهبي',     en: 'Gold' },
    platinum: { ar: 'بلاتيني',  en: 'Platinum' },
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{isAr ? 'العملاء' : 'Customers'}</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            {isAr ? 'إدارة بيانات العملاء والمسافرين' : 'Manage customer and traveler data'}
          </p>
        </div>
        <Link href={`/${locale}/customers/new`}>
          <Button size="sm">
            <Plus size={15} />
            {isAr ? 'عميل جديد' : 'New Customer'}
          </Button>
        </Link>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: isAr ? 'إجمالي العملاء' : 'Total Customers', value: customers.length, color: 'text-brand-700' },
          { label: isAr ? 'نشط' : 'Active', value: customers.filter(c => c.isActive !== false).length, color: 'text-emerald-600' },
          { label: isAr ? 'ذهبي وبلاتيني' : 'Gold & Platinum', value: customers.filter(c => c.tier === 'gold' || c.tier === 'platinum').length, color: 'text-amber-600' },
          { label: isAr ? 'إجمالي المبيعات' : 'Total Sales', value: formatCurrency(customers.reduce((s, c) => s + (c.stats?.totalSpent ?? 0), 0), isAr ? 'ar-SA' : 'en-SA'), color: 'text-indigo-600' },
        ].map(k => (
          <Card key={k.label} padding="sm">
            <p className="text-xs text-slate-500 mb-1">{k.label}</p>
            <p className={`text-xl font-bold ${k.color}`}>{k.value}</p>
          </Card>
        ))}
      </div>

      {/* Search */}
      <Card padding="sm">
        <div className="relative">
          <Search size={15} className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={isAr ? 'ابحث عن عميل...' : 'Search customers...'}
            className="w-full rounded-lg border border-slate-200 bg-white ps-9 pe-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
      </Card>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Users size={48} />}
          title={isAr ? 'لا يوجد عملاء بعد' : 'No customers yet'}
          description={isAr ? 'أضف أول عميل للبدء' : 'Add your first customer to get started'}
        />
      ) : (
        <Card padding="none">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-surface-border bg-slate-50/50">
                  {[
                    isAr ? 'العميل' : 'Customer',
                    isAr ? 'الهاتف' : 'Phone',
                    isAr ? 'الجنسية' : 'Nationality',
                    isAr ? 'عدد الحجوزات' : 'Bookings',
                    isAr ? 'إجمالي الإنفاق' : 'Total Spent',
                    isAr ? 'الدرجة' : 'Tier',
                    '',
                  ].map((h, i) => (
                    <th key={i} className="text-start ps-4 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider first:ps-6 last:pe-6">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {filtered.map(c => {
                  const name = isAr ? c.name?.ar ?? '' : c.name?.en ?? c.name?.ar ?? '';
                  const tier = c.tier ?? 'standard';
                  return (
                    <tr key={c.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="ps-6 pe-4 py-4">
                        <p className="text-sm font-medium text-slate-900">{name}</p>
                        {c.email && <p className="text-xs text-slate-400 mt-0.5">{c.email}</p>}
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-1.5 text-sm text-slate-600">
                          <Phone size={12} className="text-slate-400 flex-shrink-0" />
                          <span dir="ltr">{c.mobile ?? '—'}</span>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-sm text-slate-600">{c.nationality ?? '—'}</td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-1.5 text-sm text-slate-600">
                          <TrendingUp size={13} className="text-slate-400" />
                          {c.stats?.totalBookings ?? 0}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-sm font-medium text-slate-900">
                        {formatCurrency(c.stats?.totalSpent ?? 0, isAr ? 'ar-SA' : 'en-SA')}
                      </td>
                      <td className="px-4 py-4">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${tierColors[tier] ?? tierColors.standard}`}>
                          {isAr ? tierLabels[tier]?.ar : tierLabels[tier]?.en}
                        </span>
                      </td>
                      <td className="ps-4 pe-6 py-4">
                        <Link href={`/${locale}/customers/${c.id}`} className="text-xs text-brand-600 hover:underline font-medium">
                          {isAr ? 'عرض' : 'View'}
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="px-6 py-3 border-t border-surface-border">
            <span className="text-xs text-slate-400">
              {isAr ? `${filtered.length} عميل` : `${filtered.length} customer${filtered.length !== 1 ? 's' : ''}`}
            </span>
          </div>
        </Card>
      )}
    </div>
  );
}
