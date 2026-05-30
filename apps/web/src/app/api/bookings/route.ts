import { NextResponse } from 'next/server';
import { eq, and, desc, count, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { bookings, invoices } from '@/lib/schema';
import { verifyAuth, ApiAuthError } from '@/lib/api-auth';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT     = 200;

export async function GET(request: Request) {
  try {
    const { agencyId } = await verifyAuth(request);
    const url        = new URL(request.url);
    const status     = url.searchParams.get('status')     ?? undefined;
    const type       = url.searchParams.get('type')       ?? undefined;
    const customerId = url.searchParams.get('customerId') ?? undefined;
    const page       = Math.max(1, parseInt(url.searchParams.get('page')  ?? '1',  10) || 1);
    const limit      = Math.min(MAX_LIMIT, Math.max(1, parseInt(url.searchParams.get('limit') ?? String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT));
    const offset     = (page - 1) * limit;

    const conditions = [eq(bookings.agencyId, agencyId), isNull(bookings.deletedAt)];
    if (status)     conditions.push(eq(bookings.status, status));
    if (type)       conditions.push(eq(bookings.serviceType, type));
    if (customerId) conditions.push(eq(bookings.customerId, customerId));

    const [{ total }] = await db
      .select({ total: count() })
      .from(bookings)
      .where(and(...conditions));

    const rows = await db
      .select({
        id:                bookings.id,
        agencyId:          bookings.agencyId,
        bookingNumber:     bookings.bookingNumber,
        serviceType:       bookings.serviceType,
        customTypeId:      bookings.customTypeId,
        customTypeName:    bookings.customTypeName,
        customerId:        bookings.customerId,
        customerNameAr:    bookings.customerNameAr,
        customerNameEn:    bookings.customerNameEn,
        customerPhone:     bookings.customerPhone,
        status:            bookings.status,
        totalPriceHalalas: bookings.totalPriceHalalas,
        costPriceHalalas:  bookings.costPriceHalalas,
        profitHalalas:     bookings.profitHalalas,
        paidHalalas:       bookings.paidHalalas,
        currency:          bookings.currency,
        notes:             bookings.notes,
        details:           bookings.details,
        journalEntryId:    bookings.journalEntryId,
        createdBy:         bookings.createdBy,
        createdAt:         bookings.createdAt,
        updatedAt:         bookings.updatedAt,
        invoiceId:         invoices.id,
        invoiceNumber:     invoices.invoiceNumber,
      })
      .from(bookings)
      .leftJoin(invoices, eq(invoices.bookingId, bookings.id))
      .where(and(...conditions))
      .orderBy(desc(bookings.createdAt))
      .limit(limit)
      .offset(offset);

    const data = rows.map(r => ({ ...r, hasInvoice: r.invoiceId !== null }));

    return NextResponse.json({
      data,
      total,
      page,
      limit,
      hasMore: offset + data.length < total,
    });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(JSON.stringify({ event: 'bookings_list_failed', error: String(err) }));
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
