import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { bookings } from '@/lib/schema';
import { verifyAuth, ApiAuthError } from '@/lib/api-auth';
import { getNextBookingNumber } from '@/lib/invoice-counter';
import { logAudit } from '@/lib/audit';
import { checkRateLimit, getClientIp, rateLimitHeaders } from '@/lib/rate-limit';

const VALID_SERVICE_TYPES = new Set([
  'flight', 'hotel', 'package', 'umrah', 'hajj',
  'insurance', 'visa', 'transport', 'custom',
]);

export async function POST(request: Request) {
  try {
    const { uid, agencyId } = await verifyAuth(request);

    const rl = await checkRateLimit(`${agencyId}:${getClientIp(request)}`, 'financial');
    if (!rl.success) {
      return NextResponse.json(
        { error: 'تجاوزت الحد المسموح به من الطلبات. حاول مرة أخرى بعد دقيقة.' },
        { status: 429, headers: rateLimitHeaders(rl) },
      );
    }

    const body = await request.json() as Record<string, unknown>;

    const serviceType = String(body['type'] ?? '');
    if (!serviceType || !VALID_SERVICE_TYPES.has(serviceType)) {
      return NextResponse.json(
        { error: `نوع الخدمة غير صالح: "${serviceType}". القيم المقبولة: flight، hotel، package، umrah، hajj، insurance، visa، transport، custom` },
        { status: 400 },
      );
    }

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
        serviceType,
        customerId:       String(body['customerId'] ?? '') || null,
        customerNameAr,
        customerNameEn,
        customerPhone:    String(body['customerPhone'] ?? '') || null,
        status:           'confirmed',
        totalPriceHalalas: totalPriceHalalas,
        costPriceHalalas:  costPriceHalalas,
        profitHalalas:     profitHalalas,
        paidHalalas:      0,
        notes:            String(body['notes'] ?? '') || null,
        details:          mergedDetails,
        createdBy:        uid,
      });

      return { bookingId, bookingNumber };
    });

    await logAudit({
      agencyId, userId: uid, action: 'create', resource: 'booking',
      resourceId: result.bookingId,
      after: { bookingNumber: result.bookingNumber, serviceType, totalPriceHalalas: Number(body['pricing'] ? (body['pricing'] as Record<string, unknown>)['totalAmount'] : 0) },
    });

    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(JSON.stringify({ event: 'booking_create_failed', error: (err as Error).message ?? String(err) }));
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
