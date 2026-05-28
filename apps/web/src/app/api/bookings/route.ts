import { NextResponse } from 'next/server';
import { eq, and, desc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { bookings, invoices } from '@/lib/schema';
import { verifyAuth, ApiAuthError } from '@/lib/api-auth';

export async function GET(request: Request) {
  try {
    const { agencyId } = await verifyAuth(request);
    const url        = new URL(request.url);
    const status     = url.searchParams.get('status')     ?? undefined;
    const type       = url.searchParams.get('type')       ?? undefined;
    const customerId = url.searchParams.get('customerId') ?? undefined;

    const conditions = [eq(bookings.agencyId, agencyId)];
    if (status)     conditions.push(eq(bookings.status, status));
    if (type)       conditions.push(eq(bookings.serviceType, type));
    if (customerId) conditions.push(eq(bookings.customerId, customerId));

    // Left join invoices so each booking carries hasInvoice + invoiceId
    const rows = await db
      .select({
        // all booking columns
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
        // invoice info
        invoiceId:         invoices.id,
        invoiceNumber:     invoices.invoiceNumber,
      })
      .from(bookings)
      .leftJoin(invoices, eq(invoices.bookingId, bookings.id))
      .where(and(...conditions))
      .orderBy(desc(bookings.createdAt));

    // Map to add hasInvoice flag
    const enriched = rows.map(r => ({
      ...r,
      hasInvoice: r.invoiceId !== null,
    }));

    return NextResponse.json({ bookings: enriched });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(JSON.stringify({ event: 'bookings_list_failed', error: String(err) }));
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
