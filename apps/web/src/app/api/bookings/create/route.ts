import { NextResponse } from 'next/server';
import { ensureAdminApp } from '@/lib/firebase-admin';
import { getNextBookingNumber } from '@/lib/invoice-counter';

export async function POST(request: Request) {
  try {
    ensureAdminApp();

    const authHeader = request.headers.get('Authorization') ?? '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) {
      return NextResponse.json({ error: 'يجب تسجيل الدخول أولاً' }, { status: 401 });
    }

    const { getAuth } = await import('firebase-admin/auth');
    const { getFirestore, Timestamp } = await import('firebase-admin/firestore');
    const auth = getAuth();
    const db = getFirestore();

    const decoded = await auth.verifyIdToken(token);
    const agencyId = decoded['agencyId'] as string | undefined;
    if (!agencyId) {
      return NextResponse.json({ error: 'يجب تسجيل الدخول أولاً' }, { status: 401 });
    }

    const body = await request.json() as Record<string, unknown>;

    const year = new Date().getFullYear();
    const bookingNumber = await getNextBookingNumber(agencyId, year);

    const toTs = (val: unknown) =>
      typeof val === 'string' && val ? Timestamp.fromDate(new Date(val)) : null;

    const travelDate = toTs(body['travelDate']) ?? Timestamp.now();
    const returnDate = toTs(body['returnDate']);

    const ref = await db.collection('bookings').add({
      agencyId,
      bookingNumber,
      type:          body['type']          ?? '',
      status:        'confirmed',
      customerName:  body['customerName']  ?? { ar: '', en: '' },
      customerPhone: body['customerPhone'] ?? '',
      customerEmail: body['customerEmail'] ?? '',
      customerId:    body['customerId']    ?? '',
      agentId:       decoded.uid,
      agentName:     decoded.name ?? '',
      passengers:    body['passengers']    ?? [],
      pricing:       body['pricing']       ?? {},
      paymentStatus: 'unpaid',
      totalPaid:     0,
      totalDue:      (body['pricing'] as Record<string, unknown> | undefined)?.['totalAmount'] ?? 0,
      invoiceIds:    [],
      supplierName:  body['supplierName']  ?? '',
      supplierRef:   body['supplierRef']   ?? '',
      destination:   body['destination']   ?? '',
      travelDate,
      returnDate,
      notes:         body['notes']         ?? '',
      details:       body['details']       ?? {},
      customFields:  {},
      source:        'web',
      createdAt:     Timestamp.now(),
      updatedAt:     Timestamp.now(),
      createdBy:     decoded.uid,
    });

    return NextResponse.json({ bookingId: ref.id, bookingNumber });
  } catch (err) {
    console.error('[bookings/create]', err);
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
