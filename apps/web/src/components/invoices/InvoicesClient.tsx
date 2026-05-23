'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@masarat/firebase';
import { Card } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import { EmptyState } from '@/components/ui/EmptyState';
import { InvoiceStatusBadge } from '@/components/ui/StatusBadge';
import { formatCurrency, formatDate } from '@/lib/utils';
import { FileText, Search } from 'lucide-react';

interface Invoice {
  id: string;
  invoiceNumber: string;
  bookingId: string;
  type: string;
  status: string;
  paymentStatus: string;
  amountDue: number;
  amountPaid: number;
  buyer?: { name?: { ar?: string; en?: string }; phone?: string };
  totals?: { grandTotal?: number };
  issueDate?: { toDate?: () => Date };
  createdAt?: { toDate?: () => Date };
}

interface InvoicesClientProps {
  locale: string;
}

export function InvoicesClient({ locale }: InvoicesClientProps) {
  const isAr = locale === 'ar';
  const { user } = useAuth();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
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
      const col = collection(db, 'invoices');
      const q = query(col, where('agencyId', '==', agencyId));
      unsub = onSnapshot(q, snap => {
        const docs = snap.docs.map(d => ({ id: d.id, ...d.data() } as Invoice));
        docs.sort((a, b) => {
          const aTime = a.createdAt?.toDate?.()?.getTime() ?? 0;
          const bTime = b.createdAt?.toDate?.()?.getTime() ?? 0;
          return bTime - aTime;
        });
        setInvoices(docs);
        setLoading(false);
      }, () => setLoading(false));
    }

    void subscribe();
    return () => unsub?.();
  }, [agencyId]);

  const filtered = search
    ? invoices.filter(inv => {
        const name = isAr
          ? inv.buyer?.name?.ar ?? ''
          : inv.buyer?.name?.en ?? inv.buyer?.name?.ar ?? '';
        return (
          inv.invoiceNumber?.toLowerCase().includes(search.toLowerCase()) ||
          name.toLowerCase().includes(search.toLowerCase())
        );
      })
    : invoices;

  // KPI counts
  const paid = invoices.filter(i => i.paymentStatus === 'fully_paid').length;
  const unpaid = invoices.filter(i => i.paymentStatus === 'unpaid').length;
  const partial = invoices.filter(i => i.paymentStatus === 'partial').length;
  const totalRevenue = invoices.reduce((sum, i) => sum + (i.totals?.grandTotal ?? 0), 0);

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: isAr ? 'إجمالي الإيرادات' : 'Total Revenue', value: formatCurrency(totalRevenue, isAr ? 'ar-SA' : 'en-SA'), color: 'text-brand-700' },
          { label: isAr ? 'مدفوع بالكامل' : 'Fully Paid', value: paid, color: 'text-emerald-600' },
          { label: isAr ? 'جزئي' : 'Partial', value: partial, color: 'text-amber-600' },
          { label: isAr ? 'غير مدفوع' : 'Unpaid', value: unpaid, color: 'text-red-600' },
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
            placeholder={isAr ? 'ابحث في الفواتير...' : 'Search invoices...'}
            className="w-full rounded-lg border border-slate-200 bg-white ps-9 pe-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
      </Card>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<FileText size={48} />}
          title={isAr ? 'لا توجد فواتير بعد' : 'No invoices yet'}
          description={isAr
            ? 'ستظهر الفواتير هنا بعد تأكيد الحجوزات'
            : 'Invoices will appear here after confirming bookings'}
        />
      ) : (
        <Card padding="none">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-surface-border bg-slate-50/50">
                  {[
                    isAr ? 'رقم الفاتورة' : 'Invoice #',
                    isAr ? 'العميل' : 'Customer',
                    isAr ? 'النوع' : 'Type',
                    isAr ? 'تاريخ الإصدار' : 'Issue Date',
                    isAr ? 'الحالة' : 'Status',
                    isAr ? 'الإجمالي' : 'Total',
                  ].map(h => (
                    <th key={h} className="text-start ps-4 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider first:ps-6 last:pe-6">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {filtered.map(inv => {
                  const customerName = isAr
                    ? (inv.buyer?.name?.ar ?? '')
                    : (inv.buyer?.name?.en ?? inv.buyer?.name?.ar ?? '');
                  const issueDate = inv.issueDate?.toDate?.() ?? inv.createdAt?.toDate?.() ?? null;
                  const grandTotal = inv.totals?.grandTotal ?? 0;
                  const isCreditNote = inv.type === 'credit_note';

                  return (
                    <tr key={inv.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="ps-6 pe-4 py-4">
                        <Link
                          href={`/${locale}/invoices/${inv.id}`}
                          className="text-sm font-mono font-medium text-brand-700 hover:underline"
                        >
                          {inv.invoiceNumber ?? inv.id.slice(0, 10)}
                        </Link>
                        {isCreditNote && (
                          <span className="ms-2 text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">
                            {isAr ? 'إشعار دائن' : 'Credit Note'}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-4">
                        <p className="text-sm text-slate-900">{customerName || '—'}</p>
                      </td>
                      <td className="px-4 py-4">
                        <span className="text-xs text-slate-500">
                          {inv.bookingId ? (
                            <Link href={`/${locale}/bookings/${inv.bookingId}`} className="hover:underline text-brand-600">
                              {inv.bookingId.slice(0, 12)}...
                            </Link>
                          ) : '—'}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-sm text-slate-600">
                        {issueDate ? formatDate(issueDate, isAr ? 'ar-SA' : 'en-SA') : '—'}
                      </td>
                      <td className="px-4 py-4">
                        <InvoiceStatusBadge status={inv.paymentStatus as 'unpaid' | 'partial' | 'fully_paid' | 'refunded'} locale={locale} />
                      </td>
                      <td className="ps-4 pe-6 py-4 text-sm font-semibold text-slate-900 text-end">
                        {formatCurrency(grandTotal, isAr ? 'ar-SA' : 'en-SA')}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="px-6 py-3 border-t border-surface-border">
            <span className="text-xs text-slate-400">
              {isAr ? `${filtered.length} فاتورة` : `${filtered.length} invoice${filtered.length !== 1 ? 's' : ''}`}
            </span>
          </div>
        </Card>
      )}
    </div>
  );
}
