'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useAuth } from '@masarat/firebase';
import { Card } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatCurrency, formatCount } from '@/lib/utils';
import { cn } from '@/lib/utils';
import {
  Users, Search, X, Plus, Phone, Mail, TrendingUp,
  Star, Crown, Award, ChevronRight, BookOpen,
} from 'lucide-react';
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

interface CustomersClientProps { locale: string }

type TierFilter = 'all' | 'standard' | 'silver' | 'gold' | 'platinum';
type SortKey   = 'newest' | 'bookings' | 'spent';

const TIER_META: Record<string, { ar: string; en: string; bg: string; text: string; icon: typeof Star; border: string }> = {
  standard: { ar: 'عادي',    en: 'Standard', bg: 'bg-slate-100',  text: 'text-slate-600',  icon: Users,  border: 'border-slate-300' },
  silver:   { ar: 'فضي',     en: 'Silver',   bg: 'bg-slate-200',  text: 'text-slate-700',  icon: Award,  border: 'border-slate-400' },
  gold:     { ar: 'ذهبي',    en: 'Gold',     bg: 'bg-amber-100',  text: 'text-amber-700',  icon: Star,   border: 'border-amber-400' },
  platinum: { ar: 'بلاتيني', en: 'Platinum', bg: 'bg-indigo-100', text: 'text-indigo-700', icon: Crown,  border: 'border-indigo-400' },
};

function initials(name: string): string {
  return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
}

function avatarColor(id: string): string {
  const colors = ['bg-brand-500', 'bg-emerald-500', 'bg-amber-500', 'bg-purple-500', 'bg-sky-500', 'bg-rose-500'];
  return colors[id.charCodeAt(0) % colors.length];
}

export function CustomersClient({ locale }: CustomersClientProps) {
  const isAr      = locale === 'ar';
  const fmtLocale = isAr ? 'ar-SA' : 'en-SA';
  const { user }  = useAuth();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState('');
  const [tierFilter, setTierFilter] = useState<TierFilter>('all');
  const [sort, setSort]           = useState<SortKey>('newest');

  const agencyId = user?.agencyId ?? '';

  useEffect(() => {
    if (!agencyId) { setLoading(false); return; }
    let unsub: (() => void) | undefined;
    async function subscribe() {
      const { getFirestore, collection, query, where, onSnapshot } = await import('firebase/firestore');
      const { getApp } = await import('@masarat/firebase');
      const q = query(collection(getFirestore(getApp()), 'customers'), where('agencyId', '==', agencyId));
      unsub = onSnapshot(q, snap => {
        setCustomers(snap.docs.map(d => ({ id: d.id, ...d.data() } as Customer)));
        setLoading(false);
      }, () => setLoading(false));
    }
    void subscribe();
    return () => unsub?.();
  }, [agencyId]);

  // ── KPIs ─────────────────────────────────────────────────────────────────
  const totalSpent   = customers.reduce((s, c) => s + (c.stats?.totalSpent ?? 0), 0);
  const vipCount     = customers.filter(c => c.tier === 'gold' || c.tier === 'platinum').length;
  const activeCount  = customers.filter(c => c.isActive !== false).length;
  const avgSpend     = customers.length > 0 ? totalSpent / customers.length : 0;

  // ── Filtered & sorted ────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    let list = customers.filter(c => {
      const name = isAr ? c.name?.ar ?? '' : c.name?.en ?? c.name?.ar ?? '';
      const matchSearch = !q || name.toLowerCase().includes(q) || (c.mobile ?? '').includes(q) || (c.email ?? '').toLowerCase().includes(q);
      const matchTier   = tierFilter === 'all' || c.tier === tierFilter || (!c.tier && tierFilter === 'standard');
      return matchSearch && matchTier;
    });
    if (sort === 'newest')   list = [...list].sort((a, b) => (b.createdAt?.toDate?.()?.getTime() ?? 0) - (a.createdAt?.toDate?.()?.getTime() ?? 0));
    if (sort === 'bookings') list = [...list].sort((a, b) => (b.stats?.totalBookings ?? 0) - (a.stats?.totalBookings ?? 0));
    if (sort === 'spent')    list = [...list].sort((a, b) => (b.stats?.totalSpent ?? 0) - (a.stats?.totalSpent ?? 0));
    return list;
  }, [customers, search, tierFilter, sort, isAr]);

  if (loading) return <div className="flex items-center justify-center py-24"><Spinner size="lg" /></div>;

  return (
    <div className="space-y-5">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-slate-900">{isAr ? 'العملاء' : 'Customers'}</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            {isAr ? 'إدارة بيانات العملاء وتاريخ تعاملاتهم' : 'Manage customer profiles and booking history'}
          </p>
        </div>
        <Link href={`/${locale}/customers/new`}>
          <Button size="sm">
            <Plus size={15} />
            {isAr ? 'عميل جديد' : 'New Customer'}
          </Button>
        </Link>
      </div>

      {/* ── KPIs ─────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          { icon: Users,     bg: 'bg-brand-50',   color: 'text-brand-600',   accent: 'border-brand-500',   label: isAr ? 'إجمالي العملاء' : 'Total Customers',    value: formatCount(customers.length, fmtLocale) },
          { icon: Crown,     bg: 'bg-amber-50',   color: 'text-amber-600',   accent: 'border-amber-500',   label: isAr ? 'عملاء VIP' : 'VIP Customers',           value: formatCount(vipCount, fmtLocale) },
          { icon: TrendingUp,bg: 'bg-emerald-50', color: 'text-emerald-600', accent: 'border-emerald-500', label: isAr ? 'إجمالي الإيرادات' : 'Total Revenue',     value: formatCurrency(totalSpent, fmtLocale) },
          { icon: BookOpen,  bg: 'bg-sky-50',     color: 'text-sky-600',     accent: 'border-sky-500',     label: isAr ? 'متوسط الإنفاق' : 'Average Spend',        value: formatCurrency(avgSpend, fmtLocale) },
        ].map(k => (
          <div key={k.label} className={cn('bg-white rounded-xl border border-slate-200 shadow-sm p-4 border-s-4', k.accent)}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-1">{k.label}</p>
                <p className="text-xl font-extrabold text-slate-900 tabular-nums">{k.value}</p>
              </div>
              <div className={cn('p-2.5 rounded-xl', k.bg)}>
                <k.icon size={18} className={k.color} strokeWidth={2} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Tier tabs + Search + Sort ─────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex gap-1 overflow-x-auto pb-px flex-1">
          {(['all', 'standard', 'silver', 'gold', 'platinum'] as TierFilter[]).map(tier => {
            const label = tier === 'all' ? { ar: 'الكل', en: 'All' } : { ar: TIER_META[tier].ar, en: TIER_META[tier].en };
            const count = tier === 'all' ? customers.length : customers.filter(c => (c.tier ?? 'standard') === tier).length;
            return (
              <button key={tier} onClick={() => setTierFilter(tier)}
                className={cn(
                  'inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-colors',
                  tierFilter === tier ? 'bg-brand-600 text-white shadow-sm' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50',
                )}>
                {isAr ? label.ar : label.en}
                <span className={cn('text-[11px] font-bold px-1.5 py-0.5 rounded-full',
                  tierFilter === tier ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500')}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex gap-2 flex-shrink-0">
          <div className="relative">
            <Search size={15} className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input type="search" value={search} onChange={e => setSearch(e.target.value)}
              placeholder={isAr ? 'ابحث...' : 'Search...'}
              className="rounded-xl border border-slate-200 bg-white ps-9 pe-9 py-2 text-sm w-56 focus:outline-none focus:ring-2 focus:ring-brand-500" />
            {search && <button onClick={() => setSearch('')} className="absolute end-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"><X size={13} /></button>}
          </div>
          <select value={sort} onChange={e => setSort(e.target.value as SortKey)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500">
            <option value="newest">{isAr ? 'الأحدث' : 'Newest'}</option>
            <option value="bookings">{isAr ? 'الأكثر حجزاً' : 'Most Bookings'}</option>
            <option value="spent">{isAr ? 'الأعلى إنفاقاً' : 'Highest Spend'}</option>
          </select>
        </div>
      </div>

      {/* ── Table ─────────────────────────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={<Users size={48} />}
          title={isAr ? 'لا يوجد عملاء' : 'No customers'}
          description={isAr ? 'أضف أول عميل للبدء' : 'Add your first customer to get started'}
        />
      ) : (
        <Card padding="none">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-surface-border bg-slate-50/60">
                  <th className="text-start ps-6 pe-3 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider">{isAr ? 'العميل' : 'Customer'}</th>
                  <th className="text-start px-3 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider hidden sm:table-cell">{isAr ? 'التواصل' : 'Contact'}</th>
                  <th className="text-start px-3 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider hidden md:table-cell">{isAr ? 'الجنسية' : 'Nationality'}</th>
                  <th className="text-end px-3 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider hidden lg:table-cell">{isAr ? 'الحجوزات' : 'Bookings'}</th>
                  <th className="text-end px-3 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider">{isAr ? 'إجمالي الإنفاق' : 'Total Spent'}</th>
                  <th className="text-start px-3 py-3.5 text-xs font-bold text-slate-500 uppercase tracking-wider hidden md:table-cell">{isAr ? 'الدرجة' : 'Tier'}</th>
                  <th className="text-end pe-5 px-3 py-3.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {filtered.map(c => {
                  const name = isAr ? c.name?.ar ?? '' : c.name?.en ?? c.name?.ar ?? '';
                  const tier = c.tier ?? 'standard';
                  const meta = TIER_META[tier] ?? TIER_META.standard;
                  const TierIcon = meta.icon;
                  return (
                    <tr key={c.id} className="hover:bg-slate-50/60 transition-colors group">
                      <td className="ps-6 pe-3 py-4">
                        <div className="flex items-center gap-3">
                          <div className={cn('w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0', avatarColor(c.id))}>
                            {initials(name || 'U')}
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-slate-900">{name || '—'}</p>
                            {c.email && <p className="text-xs text-slate-400 mt-0.5">{c.email}</p>}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-4 hidden sm:table-cell">
                        {c.mobile && (
                          <div className="flex items-center gap-1.5 text-sm text-slate-600">
                            <Phone size={12} className="text-slate-400 flex-shrink-0" />
                            <span dir="ltr">{c.mobile}</span>
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-4 hidden md:table-cell">
                        <span className="text-sm text-slate-600">{c.nationality ?? '—'}</span>
                      </td>
                      <td className="px-3 py-4 text-end hidden lg:table-cell">
                        <span className="text-sm font-semibold text-slate-900 tabular-nums">
                          {formatCount(c.stats?.totalBookings ?? 0, fmtLocale)}
                        </span>
                      </td>
                      <td className="px-3 py-4 text-end">
                        <span className="text-sm font-bold tabular-nums text-slate-900">
                          {formatCurrency(c.stats?.totalSpent ?? 0, fmtLocale)}
                        </span>
                      </td>
                      <td className="px-3 py-4 hidden md:table-cell">
                        <span className={cn('inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold border', meta.bg, meta.text, meta.border)}>
                          <TierIcon size={11} />
                          {isAr ? meta.ar : meta.en}
                        </span>
                      </td>
                      <td className="pe-5 px-3 py-4 text-end">
                        <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Link href={`/${locale}/bookings/new?customer=${c.id}`}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-brand-50 text-brand-700 text-xs font-semibold hover:bg-brand-100 transition-colors">
                            <Plus size={11} />
                            {isAr ? 'حجز' : 'Book'}
                          </Link>
                          <Link href={`/${locale}/customers/${c.id}`}
                            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors">
                            <ChevronRight size={15} />
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="px-6 py-3 border-t border-surface-border">
            <span className="text-xs text-slate-400">
              {isAr
                ? `${formatCount(filtered.length, fmtLocale)} من ${formatCount(customers.length, fmtLocale)} عميل`
                : `${filtered.length} of ${customers.length} customers`}
            </span>
          </div>
        </Card>
      )}
    </div>
  );
}
