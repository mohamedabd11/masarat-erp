import { NextResponse } from 'next/server';
import { eq, and, desc, sum, count } from 'drizzle-orm';
import { db } from '@/lib/db';
import { customers, invoices, bookings } from '@/lib/schema';
import { verifyAuth, ApiAuthError } from '@/lib/api-auth';

export async function GET(
  request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const { agencyId } = await verifyAuth(request);
    const { id } = params;

    const [customer] = await db
      .select()
      .from(customers)
      .where(and(eq(customers.id, id), eq(customers.agencyId, agencyId)));

    if (!customer) {
      return NextResponse.json({ error: 'العميل غير موجود' }, { status: 404 });
    }

    // Customer statement: aggregate invoices + recent bookings
    const [invoiceSummary] = await db
      .select({
        totalInvoiced: sum(invoices.totalHalalas),
        totalPaid:     sum(invoices.paidHalalas),
        invoiceCount:  count(invoices.id),
      })
      .from(invoices)
      .where(and(eq(invoices.customerId, id), eq(invoices.agencyId, agencyId)));

    const recentInvoices = await db
      .select({
        id:            invoices.id,
        invoiceNumber: invoices.invoiceNumber,
        totalHalalas:  invoices.totalHalalas,
        paidHalalas:   invoices.paidHalalas,
        status:        invoices.status,
        issueDate:     invoices.issueDate,
      })
      .from(invoices)
      .where(and(eq(invoices.customerId, id), eq(invoices.agencyId, agencyId)))
      .orderBy(desc(invoices.createdAt))
      .limit(10);

    const recentBookings = await db
      .select({
        id:                bookings.id,
        bookingNumber:     bookings.bookingNumber,
        serviceType:       bookings.serviceType,
        status:            bookings.status,
        totalPriceHalalas: bookings.totalPriceHalalas,
        paidHalalas:       bookings.paidHalalas,
        createdAt:         bookings.createdAt,
      })
      .from(bookings)
      .where(and(eq(bookings.customerId, id), eq(bookings.agencyId, agencyId)))
      .orderBy(desc(bookings.createdAt))
      .limit(10);

    const totalInvoiced = Number(invoiceSummary?.totalInvoiced ?? 0);
    const totalPaid     = Number(invoiceSummary?.totalPaid     ?? 0);

    return NextResponse.json({
      customer,
      statement: {
        totalInvoiced,
        totalPaid,
        outstanding:  totalInvoiced - totalPaid,
        invoiceCount: Number(invoiceSummary?.invoiceCount ?? 0),
      },
      recentInvoices,
      recentBookings,
    });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const { agencyId } = await verifyAuth(request);
    const { id } = params;

    const body = await request.json() as Partial<{
      nameAr: string; nameEn: string; phone: string; email: string;
      nationality: string; nationalId: string; passportNumber: string;
      dateOfBirth: string; notes: string; isActive: boolean;
    }>;

    const [existing] = await db
      .select()
      .from(customers)
      .where(and(eq(customers.id, id), eq(customers.agencyId, agencyId)));

    if (!existing) {
      return NextResponse.json({ error: 'العميل غير موجود' }, { status: 404 });
    }

    const [updated] = await db
      .update(customers)
      .set({ ...body, updatedAt: new Date() })
      .where(and(eq(customers.id, id), eq(customers.agencyId, agencyId)))
      .returning();

    return NextResponse.json({ success: true, customer: updated });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const { agencyId } = await verifyAuth(request);
    const { id } = params;

    const [existing] = await db
      .select()
      .from(customers)
      .where(and(eq(customers.id, id), eq(customers.agencyId, agencyId)));

    if (!existing) {
      return NextResponse.json({ error: 'العميل غير موجود' }, { status: 404 });
    }

    await db
      .delete(customers)
      .where(and(eq(customers.id, id), eq(customers.agencyId, agencyId)));

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
