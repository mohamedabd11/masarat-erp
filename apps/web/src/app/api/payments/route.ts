import { NextResponse } from 'next/server';
import { eq, and, desc, count, inArray, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { invoices, payments } from '@/lib/schema';
import { verifyAuth, ApiAuthError, BusinessError } from '@/lib/api-auth';
import { requireFeature } from '@/lib/feature-access';

const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE     = 200;

export async function GET(request: Request) {
  try {
    const { agencyId } = await verifyAuth(request);
    await requireFeature(agencyId, 'payments', db);
    const url        = new URL(request.url);
    const customerId = url.searchParams.get('customerId') ?? undefined;
    const page       = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10) || 1);
    const pageSize   = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(url.searchParams.get('limit') ?? String(DEFAULT_PAGE_SIZE), 10) || DEFAULT_PAGE_SIZE));
    const offset     = (page - 1) * pageSize;

    const conditions = [eq(payments.agencyId, agencyId)];
    if (customerId) {
      const customerInvoiceIds = db
        .select({ id: invoices.id })
        .from(invoices)
        .where(and(eq(invoices.customerId, customerId), eq(invoices.agencyId, agencyId)));
      conditions.push(or(
        eq(payments.customerId, customerId),
        inArray(payments.invoiceId, customerInvoiceIds),
      )!);
    }

    const [{ total }] = await db
      .select({ total: count(payments.id) })
      .from(payments)
      .where(and(...conditions));

    const rows = await db
      .select()
      .from(payments)
      .where(and(...conditions))
      .orderBy(desc(payments.createdAt))
      .limit(pageSize)
      .offset(offset);

    const [paymentSummary] = await db
      .select({
        netCollected: sql<number>`cast(coalesce(sum(${payments.amountHalalas}), 0) as double precision)`,
      })
      .from(payments)
      .where(and(...conditions));

    const invoiceConditions = [eq(invoices.agencyId, agencyId)];
    if (customerId) invoiceConditions.push(eq(invoices.customerId, customerId));
    const [invoiceSummary] = await db
      .select({
        outstanding: sql<number>`cast(coalesce(sum(case
          when ${invoices.type} = '381' then 0
          when ${invoices.status} not in ('issued','partial','overdue') then 0
          else greatest(${invoices.totalHalalas} - ${invoices.paidHalalas}, 0)
        end), 0) as double precision)`,
      })
      .from(invoices)
      .where(and(...invoiceConditions));
    return NextResponse.json({
      payments: rows,
      summary: {
        netCollected: Number(paymentSummary?.netCollected ?? 0),
        outstanding:  Number(invoiceSummary?.outstanding ?? 0),
      },
      pagination: { page, pageSize, total: Number(total), totalPages: Math.ceil(Number(total) / pageSize) },
    });
  } catch (err) {
    if (err instanceof ApiAuthError || err instanceof BusinessError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
