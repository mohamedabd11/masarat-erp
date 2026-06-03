import { NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { quotes, bookings } from '@/lib/schema';
import { verifyAuth, assertRole, ApiAuthError, ROLES_AGENT_UP } from '@/lib/api-auth';
import { getNextBookingNumber } from '@/lib/invoice-counter';
import { logAudit } from '@/lib/audit';

const CONVERTIBLE_STATUSES = new Set(['approved', 'sent']);

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const { uid, agencyId, role } = await verifyAuth(request);
    assertRole(role, [...ROLES_AGENT_UP]);

    // Fetch the quote and validate it belongs to this agency
    const [quote] = await db
      .select()
      .from(quotes)
      .where(and(eq(quotes.id, params.id), eq(quotes.agencyId, agencyId)));

    if (!quote) {
      return NextResponse.json({ error: 'عرض السعر غير موجود' }, { status: 404 });
    }

    // Only approved or sent quotes can be converted
    if (!CONVERTIBLE_STATUSES.has(quote.status)) {
      return NextResponse.json(
        { error: `لا يمكن تحويل عرض السعر بحالة '${quote.status}'. يجب أن تكون الحالة 'approved' أو 'sent'` },
        { status: 422 },
      );
    }

    const year = new Date().getFullYear();

    const result = await db.transaction(async (tx) => {
      const bookingNumber = await getNextBookingNumber(agencyId, year, tx);
      const bookingId = crypto.randomUUID();
      const now = new Date();

      // Map quote fields to booking fields
      const items = (quote.items ?? []) as Record<string, unknown>[];
      const totalPriceHalalas = quote.totalHalalas;

      // Derive cost from items if available, otherwise default to 0
      let costPriceHalalas = 0;
      for (const item of items) {
        costPriceHalalas += Number(item['costHalalas'] ?? item['cost'] ?? 0);
      }
      const profitHalalas = totalPriceHalalas - costPriceHalalas;

      await tx.insert(bookings).values({
        id:               bookingId,
        agencyId,
        bookingNumber,
        serviceType:      'custom',          // quotes are generic; caller can PATCH to refine
        customerId:       quote.customerId ?? null,
        customerNameAr:   quote.customerName ?? null,
        customerNameEn:   null,
        customerPhone:    quote.customerPhone ?? null,
        status:           'confirmed',
        totalPriceHalalas,
        costPriceHalalas,
        profitHalalas,
        paidHalalas:      0,
        notes:            quote.notes ?? null,
        details:          { sourceQuoteId: quote.id, items },
        createdBy:        uid,
      });

      await tx.update(quotes)
        .set({
          status:               'converted',
          convertedToBookingId: bookingId,
          convertedAt:          now,
          updatedAt:            now,
        })
        .where(and(eq(quotes.id, params.id), eq(quotes.agencyId, agencyId)));

      return { bookingId, bookingNumber };
    });

    await logAudit({
      agencyId, userId: uid, action: 'create', resource: 'booking',
      resourceId: result.bookingId,
      after: { sourceQuoteId: params.id, bookingNumber: result.bookingNumber, totalPriceHalalas: quote.totalHalalas },
    });

    return NextResponse.json({ bookingId: result.bookingId });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(JSON.stringify({ event: 'quote_convert_failed', error: (err as Error).message ?? String(err) }));
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
