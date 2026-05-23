/**
 * @masarat/firebase — Bookings Operations
 * عمليات CRUD للحجوزات مع Firestore query builders
 */

import {
  query,
  where,
  orderBy,
  limit,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  Timestamp,
  type QueryConstraint,
} from 'firebase/firestore';
import { bookingsCol, bookingDoc } from './collections';
import type { BookingDoc, BookingStatus, BookingType } from './types';

export interface BookingFilters {
  agencyId: string;
  status?: BookingStatus | BookingStatus[];
  type?: BookingType;
  agentId?: string;
  customerId?: string;
  dateFrom?: Date;
  dateTo?: Date;
  limitCount?: number;
}

/** يجلب قائمة حجوزات مع فلترة */
export async function getBookings(filters: BookingFilters): Promise<BookingDoc[]> {
  const constraints: QueryConstraint[] = [
    where('agencyId', '==', filters.agencyId),
    orderBy('createdAt', 'desc'),
  ];

  if (filters.status) {
    const statuses = Array.isArray(filters.status) ? filters.status : [filters.status];
    if (statuses.length === 1) {
      constraints.push(where('status', '==', statuses[0]));
    } else {
      constraints.push(where('status', 'in', statuses));
    }
  }

  if (filters.type) {
    constraints.push(where('type', '==', filters.type));
  }

  if (filters.agentId) {
    constraints.push(where('agentId', '==', filters.agentId));
  }

  if (filters.customerId) {
    constraints.push(where('customerId', '==', filters.customerId));
  }

  if (filters.dateFrom) {
    constraints.push(where('travelDate', '>=', Timestamp.fromDate(filters.dateFrom)));
  }

  if (filters.dateTo) {
    constraints.push(where('travelDate', '<=', Timestamp.fromDate(filters.dateTo)));
  }

  constraints.push(limit(filters.limitCount ?? 50));

  const q = query(bookingsCol(), ...constraints);
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ ...d.data(), id: d.id }));
}

/** يجلب حجزاً واحداً بمعرّفه */
export async function getBooking(bookingId: string): Promise<BookingDoc | null> {
  const snap = await getDoc(bookingDoc(bookingId));
  if (!snap.exists()) return null;
  return { ...snap.data(), id: snap.id };
}

/** ينشئ حجزاً جديداً (مسودة) — بدون قيد محاسبي (الكود الـ draft) */
export async function createBookingDraft(
  data: Omit<BookingDoc, 'id' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  const now = Timestamp.now();
  const ref = await addDoc(bookingsCol(), {
    ...data,
    status: 'draft',
    paymentStatus: 'unpaid',
    totalPaid: 0,
    invoiceIds: [],
    customFields: data.customFields ?? {},
    createdAt: now,
    updatedAt: now,
  } as unknown as BookingDoc);
  return ref.id;
}

/** يُحدِّث حقولاً محددة في الحجز (من الـ Client — للحقول المسموح بها) */
export async function updateBookingFields(
  bookingId: string,
  fields: Partial<Pick<BookingDoc, 'notes' | 'customFields'>>
): Promise<void> {
  await updateDoc(bookingDoc(bookingId), {
    ...fields,
    updatedAt: Timestamp.now(),
  });
}

/** يجلب إحصائيات سريعة للـ Dashboard */
export async function getBookingStats(agencyId: string): Promise<{
  todayCount: number;
  pendingApprovalCount: number;
  thisMonthRevenue: number;
}> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [todaySnap, pendingSnap, monthSnap] = await Promise.all([
    getDocs(query(
      bookingsCol(),
      where('agencyId', '==', agencyId),
      where('createdAt', '>=', Timestamp.fromDate(todayStart))
    )),
    getDocs(query(
      bookingsCol(),
      where('agencyId', '==', agencyId),
      where('status', '==', 'pending_approval')
    )),
    getDocs(query(
      bookingsCol(),
      where('agencyId', '==', agencyId),
      where('status', 'in', ['confirmed', 'ticketed', 'completed']),
      where('createdAt', '>=', Timestamp.fromDate(getMonthStart()))
    )),
  ]);

  const thisMonthRevenue = monthSnap.docs.reduce(
    (sum, d) => sum + (d.data().pricing?.totalAmount ?? 0),
    0
  );

  return {
    todayCount: todaySnap.size,
    pendingApprovalCount: pendingSnap.size,
    thisMonthRevenue,
  };
}

function getMonthStart(): Date {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}
