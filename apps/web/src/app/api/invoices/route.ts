import { NextResponse } from 'next/server';
import { eq, and, desc, count, inArray, isNotNull, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { invoices, payments } from '@/lib/schema';
import { verifyAuth, ApiAuthError, BusinessError } from '@/lib/api-auth';
import { requireFeature } from '@/lib/feature-access';

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE     = 200;

export async function GET(request: Request) {
  try {
    const { agencyId } = await verifyAuth(request);
    await requireFeature(agencyId, 'invoices', db);
    const url        = new URL(request.url);
    const status     = url.searchParams.get('status')     ?? undefined;
    const customerId = url.searchParams.get('customerId') ?? undefined;
    const page       = Math.max(1, parseInt(url.searchParams.get('page')  ?? '1',  10) || 1);
    const pageSize   = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(url.searchParams.get('limit') ?? String(DEFAULT_PAGE_SIZE), 10) || DEFAULT_PAGE_SIZE));
    const offset     = (page - 1) * pageSize;

    const conditions = [eq(invoices.agencyId, agencyId)];
    if (status)     conditions.push(eq(invoices.status, status));
    if (customerId) conditions.push(eq(invoices.customerId, customerId));

    const [{ total }] = await db
      .select({ total: count(invoices.id) })
      .from(invoices)
      .where(and(...conditions));

    const rows = await db
      .select()
      .from(invoices)
      .where(and(...conditions))
      .orderBy(desc(invoices.createdAt))
      .limit(pageSize)
      .offset(offset);

    const [invoiceSummary] = await db
      .select({
        totalInvoiced: sql<number>`cast(coalesce(sum(case
          when ${invoices.status} = 'cancelled' then 0
          when ${invoices.type} = '381' then -${invoices.totalHalalas}
          else ${invoices.totalHalalas}
        end), 0) as double precision)`,
        totalOutstanding: sql<number>`cast(coalesce(sum(case
          when ${invoices.type} = '381' then 0
          when ${invoices.status} not in ('issued','partial','overdue') then 0
          else greatest(${invoices.totalHalalas} - ${invoices.paidHalalas}, 0)
        end), 0) as double precision)`,
      })
      .from(invoices)
      .where(and(...conditions));

    const paymentConditions = [
      eq(payments.agencyId, agencyId),
      isNotNull(payments.invoiceId),
    ];
    if (customerId) {
      const customerInvoiceIds = db
        .select({ id: invoices.id })
        .from(invoices)
        .where(and(eq(invoices.customerId, customerId), eq(invoices.agencyId, agencyId)));
      paymentConditions.push(or(
        eq(payments.customerId, customerId),
        inArray(payments.invoiceId, customerInvoiceIds),
      )!);
    }
    const [paymentSummary] = await db
      .select({
        totalCollected: sql<number>`cast(coalesce(sum(${payments.amountHalalas}), 0) as double precision)`,
      })
      .from(payments)
      .where(and(...paymentConditions));

    return NextResponse.json({
      invoices: rows,
      summary: {
        totalInvoiced:    Number(invoiceSummary?.totalInvoiced    ?? 0),
        totalCollected:   Number(paymentSummary?.totalCollected   ?? 0),
        totalOutstanding: Number(invoiceSummary?.totalOutstanding ?? 0),
      },
      pagination: { page, pageSize, total: Number(total), totalPages: Math.ceil(Number(total) / pageSize) },
    });
  } catch (err) {
    if (err instanceof ApiAuthError || err instanceof BusinessError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(JSON.stringify({ event: 'invoices_list_error', error: String(err) }));
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
