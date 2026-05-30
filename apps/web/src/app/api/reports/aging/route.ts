import { NextResponse } from 'next/server';
import { eq, and, inArray, sql, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { invoices, customers } from '@/lib/schema';
import { verifyAuth, assertRole, ApiAuthError, ROLES_ACCOUNTANT_UP } from '@/lib/api-auth';

// ── Types ──────────────────────────────────────────────────────────────────────

interface AgingBuckets {
  current:      number;   // not yet overdue
  days1to30:    number;
  days31to60:   number;
  days61to90:   number;
  days91plus:   number;
  totalOutstanding: number;
}

interface AgingInvoiceLine {
  invoiceId:        string;
  invoiceNumber:    string;
  issueDate:        string;
  dueDate:          string | null;
  totalHalalas:     number;
  paidHalalas:      number;
  outstandingHalalas: number;
  daysOverdue:      number;
  bucket:           'current' | '1-30' | '31-60' | '61-90' | '91+';
}

interface AgingCustomerRow extends AgingBuckets {
  customerId:     string | null;
  customerNameAr: string;
  customerNameEn: string | null;
  invoices:       AgingInvoiceLine[];
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function diffDays(asOf: Date, dateStr: string): number {
  const d = new Date(dateStr + 'T00:00:00Z');
  return Math.floor((asOf.getTime() - d.getTime()) / 86_400_000);
}

function assignBucket(daysOverdue: number): AgingInvoiceLine['bucket'] {
  if (daysOverdue <= 0)  return 'current';
  if (daysOverdue <= 30) return '1-30';
  if (daysOverdue <= 60) return '31-60';
  if (daysOverdue <= 90) return '61-90';
  return '91+';
}

function emptyBuckets(): AgingBuckets {
  return { current: 0, days1to30: 0, days31to60: 0, days61to90: 0, days91plus: 0, totalOutstanding: 0 };
}

function addToBucket(b: AgingBuckets, bucket: AgingInvoiceLine['bucket'], amount: number) {
  b.totalOutstanding += amount;
  if (bucket === 'current') b.current       += amount;
  else if (bucket === '1-30')  b.days1to30    += amount;
  else if (bucket === '31-60') b.days31to60   += amount;
  else if (bucket === '61-90') b.days61to90   += amount;
  else                         b.days91plus   += amount;
}

// ── Route ──────────────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  try {
    const { agencyId, role } = await verifyAuth(request);
    assertRole(role, [...ROLES_ACCOUNTANT_UP]);

    const url        = new URL(request.url);
    const asOfParam  = url.searchParams.get('asOf');
    const filterCust = url.searchParams.get('customerId');

    // Validate asOf — default to today
    const asOf = asOfParam ? new Date(asOfParam + 'T00:00:00Z') : new Date();
    if (isNaN(asOf.getTime())) {
      return NextResponse.json({ error: 'asOf يجب أن يكون تاريخاً صالحاً (YYYY-MM-DD)' }, { status: 400 });
    }
    const asOfStr = asOf.toISOString().split('T')[0]!;

    // ── 1. Load outstanding invoices ──────────────────────────────────────────
    const conditions = [
      eq(invoices.agencyId, agencyId),
      isNull(invoices.deletedAt),
      eq(invoices.type, '380'),
      inArray(invoices.status, ['issued', 'partial']),
      sql`${invoices.totalHalalas} > ${invoices.paidHalalas}`,
    ];
    if (filterCust) conditions.push(eq(invoices.customerId, filterCust));

    const rows = await db
      .select({
        id:            invoices.id,
        invoiceNumber: invoices.invoiceNumber,
        customerId:    invoices.customerId,
        buyerNameAr:   invoices.buyerNameAr,
        buyerNameEn:   invoices.buyerNameEn,
        totalHalalas:  invoices.totalHalalas,
        paidHalalas:   invoices.paidHalalas,
        issueDate:     invoices.issueDate,
        dueDate:       invoices.dueDate,
      })
      .from(invoices)
      .where(and(...conditions));

    // ── 2. Enrich with customer names where customerId is set ─────────────────
    const custIdSet: Record<string, boolean> = {};
    for (const r of rows) { if (r.customerId) custIdSet[r.customerId] = true; }
    const customerIds = Object.keys(custIdSet);

    const customerMap: Record<string, { nameAr: string; nameEn: string | null }> = {};
    if (customerIds.length > 0) {
      const custRows = await db
        .select({ id: customers.id, nameAr: customers.nameAr, nameEn: customers.nameEn })
        .from(customers)
        .where(and(eq(customers.agencyId, agencyId), isNull(customers.deletedAt), inArray(customers.id, customerIds)));
      for (const c of custRows) customerMap[c.id] = { nameAr: c.nameAr, nameEn: c.nameEn ?? null };
    }

    // ── 3. Bucket each invoice ────────────────────────────────────────────────
    // Group key: customerId if present, else buyerNameAr (walk-in customers)
    const grouped: Record<string, AgingCustomerRow> = {};

    for (const r of rows) {
      const outstanding = r.totalHalalas - r.paidHalalas;
      if (outstanding <= 0) continue;

      // Use dueDate if set, otherwise fall back to issueDate (invoice is overdue from day of issue)
      const daysOverdue = r.dueDate ? Math.max(0, diffDays(asOf, r.dueDate)) : 0;
      const bucket      = assignBucket(daysOverdue);

      const invLine: AgingInvoiceLine = {
        invoiceId:          r.id,
        invoiceNumber:      r.invoiceNumber,
        issueDate:          r.issueDate,
        dueDate:            r.dueDate ?? null,
        totalHalalas:       r.totalHalalas,
        paidHalalas:        r.paidHalalas,
        outstandingHalalas: outstanding,
        daysOverdue,
        bucket,
      };

      const groupKey = r.customerId ?? `_walkin_${r.buyerNameAr ?? 'unknown'}`;
      if (!grouped[groupKey]) {
        const custInfo = r.customerId ? customerMap[r.customerId] : undefined;
        grouped[groupKey] = {
          customerId:     r.customerId ?? null,
          customerNameAr: custInfo?.nameAr ?? r.buyerNameAr ?? 'غير محدد',
          customerNameEn: custInfo?.nameEn ?? r.buyerNameEn ?? null,
          ...emptyBuckets(),
          invoices: [],
        };
      }

      const customerRow = grouped[groupKey]!;
      addToBucket(customerRow, bucket, outstanding);
      customerRow.invoices.push(invLine);
    }

    // Sort each customer's invoices by days overdue desc
    for (const key of Object.keys(grouped)) {
      grouped[key]!.invoices.sort((a, b) => b.daysOverdue - a.daysOverdue);
    }

    // Sort customers by totalOutstanding desc
    const customerList: AgingCustomerRow[] = Object.values(grouped)
      .sort((a, b) => b.totalOutstanding - a.totalOutstanding);

    // ── 4. Summary totals ─────────────────────────────────────────────────────
    const summary = emptyBuckets();
    for (const row of customerList) {
      summary.current         += row.current;
      summary.days1to30       += row.days1to30;
      summary.days31to60      += row.days31to60;
      summary.days61to90      += row.days61to90;
      summary.days91plus      += row.days91plus;
      summary.totalOutstanding += row.totalOutstanding;
    }

    return NextResponse.json({ asOf: asOfStr, summary, customers: customerList });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(JSON.stringify({ event: 'aging_report_failed', error: (err as Error).message }));
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
