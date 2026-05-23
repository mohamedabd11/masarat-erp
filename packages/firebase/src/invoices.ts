import { query, where, orderBy, limit, getDocs, getDoc, doc } from 'firebase/firestore';
import { invoicesCol } from './collections';
import type { InvoiceDoc } from './types';

export interface InvoiceFilters {
  agencyId: string;
  status?: InvoiceDoc['status'];
  customerId?: string;
  bookingId?: string;
  dateFrom?: Date;
  dateTo?: Date;
  pageSize?: number;
}

export async function getInvoices(filters: InvoiceFilters): Promise<InvoiceDoc[]> {
  const col = invoicesCol();
  const constraints: Parameters<typeof query>[1][] = [
    where('agencyId', '==', filters.agencyId),
    orderBy('createdAt', 'desc'),
  ];

  if (filters.status) {
    constraints.push(where('status', '==', filters.status));
  }
  if (filters.customerId) {
    constraints.push(where('customerId', '==', filters.customerId));
  }
  if (filters.bookingId) {
    constraints.push(where('bookingId', '==', filters.bookingId));
  }

  constraints.push(limit(filters.pageSize ?? 50));

  const snap = await getDocs(query(col, ...constraints));
  return snap.docs.map(d => d.data());
}

export async function getInvoice(agencyId: string, invoiceId: string): Promise<InvoiceDoc | null> {
  const ref = doc(invoicesCol(), invoiceId);
  const snap = await getDoc(ref);
  return snap.exists() ? snap.data() : null;
}

export async function getInvoicesByBooking(agencyId: string, bookingId: string): Promise<InvoiceDoc[]> {
  const col = invoicesCol();
  const snap = await getDocs(
    query(
      col,
      where('agencyId', '==', agencyId),
      where('bookingId', '==', bookingId),
      orderBy('createdAt', 'asc')
    )
  );
  return snap.docs.map(d => d.data());
}

/** إحصائيات الفواتير (للوحة التحكم) */
export async function getInvoiceStats(agencyId: string): Promise<{
  totalCount: number;
  pendingCount: number;
  paidCount: number;
  overdueCount: number;
  totalAmountHalalas: number;
}> {
  const col = invoicesCol();
  const snap = await getDocs(
    query(col, where('agencyId', '==', agencyId), limit(1000))
  );

  const invoices = snap.docs.map(d => d.data());

  return {
    totalCount: invoices.length,
    pendingCount: invoices.filter(i => i.status === 'draft').length,
    paidCount: invoices.filter(i => i.status === 'issued').length,
    overdueCount: 0,
    totalAmountHalalas: invoices.reduce((sum, i) => sum + (i.totals?.grandTotal ?? 0), 0),
  };
}
