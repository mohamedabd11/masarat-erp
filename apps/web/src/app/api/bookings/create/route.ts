import { NextResponse } from 'next/server';
import { ensureAdminApp } from '@/lib/firebase-admin';
import { db } from '@/lib/db';
import { bookings } from '@/lib/schema';
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
    const decoded = await getAuth().verifyIdToken(token);
    const agencyId = decoded['agencyId'] as string | undefined;
    if (!agencyId) {
      return NextResponse.json({ error: 'يجب تسجيل الدخول أولاً' }, { status: 401 });
    }

    const body = await request.json() as Record<string, unknown>;

    const year = new Date().getFullYear();

    const result = await db.transaction(async (tx) => {
      const bookingNumber = await getNextBookingNumber(agencyId, year, tx);
      const bookingId = crypto.randomUUID();

      const cn = body['customerName'] as Record<string, string> | string | undefined;
      const customerNameAr = typeof cn === 'object' ? (cn?.['ar'] ?? '') : (cn ?? '');
      const customerNameEn = typeof cn === 'object' ? (cn?.['en'] ?? '') : '';

      const pricing = (body['pricing'] ?? {}) as Record<string, unknown>;
      const totalPriceHalalas = Number(pricing['totalAmount'] ?? 0);
      const costPriceHalalas  = Number(pricing['totalCost']   ?? 0);
      const profitHalalas     = totalPriceHalalas - costPriceHalalas;
      const revenueModel      = String(pricing['revenueModel'] ?? 'principal');
      const serviceFeeHalalas = Number(pricing['serviceFee']   ?? 0);
      const vatAmountHalalas  = Number(pricing['vatAmount']    ?? 0);

      // Merge pricing fields into details JSONB so they survive round-trips
      const serviceDetails = (body['details'] ?? {}) as Record<string, unknown>;
      const mergedDetails = {
        ...serviceDetails,
        revenueModel,
        serviceFee:  serviceFeeHalalas,
        vatAmount:   vatAmountHalalas,
        currency:    String(pricing['currency'] ?? 'SAR'),
      };

      await tx.insert(bookings).values({
        id:               bookingId,
        agencyId,
        bookingNumber,
        serviceType:      String(body['type'] ?? ''),
        customerId:       String(body['customerId'] ?? '') || null,
        customerNameAr,
        customerNameEn,
        customerPhone:    String(body['customerPhone'] ?? '') || null,
        status:           'confirmed',
        totalPriceHalalas: totalPriceHalalas,
        costPriceHalalas:  costPriceHalalas,
        profitHalalas:     profitHalalas > 0 ? profitHalalas : 0,
        paidHalalas:      0,
        notes:            String(body['notes'] ?? '') || null,
        details:          mergedDetails,
        createdBy:        decoded.uid,
      });

      return { bookingId, bookingNumber };
    });

    return NextResponse.json(result);
  } catch (err) {
    console.error(JSON.stringify({ event: 'booking_create_failed', error: (err as Error).message ?? String(err) }));
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
