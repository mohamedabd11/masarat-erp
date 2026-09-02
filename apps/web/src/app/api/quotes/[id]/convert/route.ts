import { NextResponse } from 'next/server';
import { eq, and, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { quotes, bookings, bookingLines, agencies } from '@/lib/schema';
import { verifyAuth, assertRole, ApiAuthError, ROLES_AGENT_UP } from '@/lib/api-auth';
import { getNextBookingNumber } from '@/lib/invoice-counter';
import { logAudit } from '@/lib/audit';

const CONVERTIBLE_STATUSES = new Set(['accepted', 'approved', 'sent']);

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

    // VAT settings of the agency — used to split the quote's (VAT-inclusive)
    // total into a taxable base + VAT for the resulting booking line.
    const [agency] = await db
      .select({ isVatRegistered: agencies.isVatRegistered, vatRate: agencies.vatRate })
      .from(agencies)
      .where(eq(agencies.id, agencyId));

    // Accepted/sent quotes can be converted; "approved" remains supported for
    // rows created before the UI status was standardised to "accepted".
    if (!CONVERTIBLE_STATUSES.has(quote.status)) {
      return NextResponse.json(
        { error: `لا يمكن تحويل عرض السعر بحالة '${quote.status}'. يجب أن تكون الحالة مقبولة أو مُرسلة` },
        { status: 422 },
      );
    }

    const year = new Date().getFullYear();

    const result = await db.transaction(async (tx) => {
      // Lock this quote before checking its status. Without the row lock, two
      // simultaneous clicks could both read "accepted" and create two bookings.
      await tx.execute(sql`SELECT id FROM quotes
        WHERE id = ${params.id} AND agency_id = ${agencyId}
        FOR UPDATE`);
      const [freshQuote] = await tx.select({ status: quotes.status })
        .from(quotes)
        .where(and(eq(quotes.id, params.id), eq(quotes.agencyId, agencyId)));
      if (!freshQuote || !CONVERTIBLE_STATUSES.has(freshQuote.status)) {
        throw Object.assign(new Error('ALREADY_CONVERTED'), { httpStatus: 409 });
      }

      const bookingNumber = await getNextBookingNumber(agencyId, year, tx);
      const bookingId = crypto.randomUUID();
      const now = new Date();

      // Map quote fields to booking fields
      const items = (quote.items ?? []) as Record<string, unknown>[];
      const totalPriceHalalas = quote.totalHalalas;
      const primaryServiceType = typeof items[0]?.['serviceType'] === 'string'
        ? items[0]['serviceType'] as string
        : 'custom';

      // Derive cost from items if available, otherwise default to 0
      let costPriceHalalas = 0;
      for (const item of items) {
        costPriceHalalas += Number(item['costHalalas'] ?? item['cost'] ?? 0);
      }

      // quote.totalHalalas is the VAT-inclusive price agreed with the customer.
      // For VAT-registered agencies, back-calculate the taxable base + VAT so the
      // resulting invoice charges standard-rate output VAT instead of silently
      // zero-rating the whole amount (ZATCA 'Z' requires a justified exemption).
      const isVatRegistered = agency?.isVatRegistered === true;
      const vatRatePercent  = agency?.vatRate ?? 15;
      const lineVatHalalas  = isVatRegistered
        ? Math.round(totalPriceHalalas * vatRatePercent / (100 + vatRatePercent))
        : 0;
      const lineSubtotalHalalas = totalPriceHalalas - lineVatHalalas;
      const profitHalalas = lineSubtotalHalalas - costPriceHalalas;

      await tx.insert(bookings).values({
        id:               bookingId,
        agencyId,
        bookingNumber,
        serviceType:      primaryServiceType,
        customerId:       quote.customerId ?? null,
        customerNameAr:   quote.customerName ?? null,
        customerNameEn:   quote.customerNameEn ?? null,
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

      // Create a consolidating booking_line so this booking enters the canonical
      // financial layer (booking_lines as source of truth). VAT is split out of
      // the quote's VAT-inclusive total above; non-VAT-registered agencies fall
      // back to vatCategory='Z' / vatHalalas=0 (no VAT applies regardless).
      // The caller can still refine lines via POST /api/bookings/:id/lines after conversion.
      await tx.insert(bookingLines).values({
        id:                       crypto.randomUUID(),
        bookingId,
        agencyId,
        serviceType:              primaryServiceType,
        description:              `تحويل من عرض سعر رقم ${quote.quoteNumber}`,
        supplierId:               null,
        supplierName:             null,
        quantity:                 1,
        unitCostHalalas:          costPriceHalalas,
        totalCostHalalas:         costPriceHalalas,
        unitPriceExclVatHalalas:  lineSubtotalHalalas,
        totalPriceExclVatHalalas: lineSubtotalHalalas,
        vatCategory:              isVatRegistered ? 'S' : 'Z',
        vatRateBps:               isVatRegistered ? vatRatePercent * 100 : 0,
        vatHalalas:               lineVatHalalas,
        // Default to 'principal' (matches the booking GET default). The agent
        // model with cost=0 would misclassify the full gross sale as pure
        // commission, understating revenue and COGS. A real agent quote can be
        // refined via POST /api/bookings/:id/lines after conversion.
        revenueModel:             'principal',
        revenueAccountCode:       null,
        costAccountCode:          null,
        operationalStatus:        'pending',
        pnrReference:             null,
        voucherNumber:            null,
        isLegacy:                 false,
        status:                   'active',
        refundHalalas:            0,
        sortOrder:                1,
        notes:                    null,
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
    const e = err as Error & { httpStatus?: number };
    if (e.message === 'ALREADY_CONVERTED' || e.httpStatus === 409) {
      return NextResponse.json({ error: 'تم تحويل عرض السعر بالفعل' }, { status: 409 });
    }
    console.error(JSON.stringify({ event: 'quote_convert_failed', error: e.message ?? String(err) }));
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
