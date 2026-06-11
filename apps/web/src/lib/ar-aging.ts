/**
 * Accounts-Receivable aging — server-side aggregation (B4/B6).
 *
 * The per-customer bucket totals and the agency summary are computed with a single
 * SQL `GROUP BY` + conditional aggregation, so the route no longer materialises
 * every open invoice in memory and buckets/sorts them in JS. The result set is
 * bounded by the number of customers, not the number of invoices.
 *
 * Invoice-level detail (the drill-down lines) is returned only when a single
 * customer is requested via `filterCust` — that path is naturally bounded to one
 * customer's invoices. The list view returns bucket totals + an `invoiceCount`
 * per customer with an empty `invoices` array.
 *
 * Bucketing is by `daysOverdue = asOf - COALESCE(dueDate, issueDate)`:
 *   <= 0 current | 1–30 | 31–60 | 61–90 | > 90.
 */
import { eq, and, ne, inArray, sql } from 'drizzle-orm';
import { invoices, customers, journalLines, journalEntries } from '@/lib/schema';
import type { DB } from '@/lib/db';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface AgingBuckets {
  current:          number;   // not yet overdue
  days1to30:        number;
  days31to60:       number;
  days61to90:       number;
  days91plus:       number;
  totalOutstanding: number;
}

export interface AgingInvoiceLine {
  invoiceId:          string;
  invoiceNumber:      string;
  issueDate:          string;
  dueDate:            string | null;
  totalHalalas:       number;
  paidHalalas:        number;
  outstandingHalalas: number;
  daysOverdue:        number;
  bucket:             'current' | '1-30' | '31-60' | '61-90' | '91+';
}

export interface AgingCustomerRow extends AgingBuckets {
  customerId:     string | null;
  customerNameAr: string;
  customerNameEn: string | null;
  invoiceCount:   number;
  invoices:       AgingInvoiceLine[];
}

export interface AgingReconciliation {
  agingTotalOutstanding: number;
  glReceivableBalance:   number;
  difference:            number;
  reconciled:            boolean;
}

export interface AgingReport {
  summary:        AgingBuckets;
  customers:      AgingCustomerRow[];
  reconciliation: AgingReconciliation | null;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

// Receivable-increasing documents only: tax invoice (388), commercial invoice
// (380), and debit note (383). Credit notes (381) reduce the receivable and must
// NOT be aged as positive outstanding.
const AGING_DOC_TYPES = ['388', '380', '383'] as const;

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
  if (bucket === 'current')      b.current     += amount;
  else if (bucket === '1-30')    b.days1to30   += amount;
  else if (bucket === '31-60')   b.days31to60  += amount;
  else if (bucket === '61-90')   b.days61to90  += amount;
  else                           b.days91plus  += amount;
}

// ── Main ─────────────────────────────────────────────────────────────────────

/**
 * Build the AR-aging report for an agency as of `asOfStr` (YYYY-MM-DD).
 * When `filterCust` (a customerId) is given, the report is scoped to that
 * customer and includes invoice-level detail; otherwise it returns SQL-aggregated
 * per-customer bucket totals plus a GL-1120 reconciliation.
 */
export async function getAgingReport(
  db: DB,
  agencyId: string,
  asOfStr: string,
  filterCust: string | null,
): Promise<AgingReport> {
  return filterCust
    ? customerDrilldown(db, agencyId, asOfStr, filterCust)
    : agencyRollup(db, agencyId, asOfStr);
}

// ── Drill-down: one customer, with invoice-level detail (bounded) ───────────────

async function customerDrilldown(
  db: DB,
  agencyId: string,
  asOfStr: string,
  filterCust: string,
): Promise<AgingReport> {
  const asOf = new Date(asOfStr + 'T00:00:00Z');

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
    .where(and(
      eq(invoices.agencyId, agencyId),
      eq(invoices.customerId, filterCust),
      inArray(invoices.type, [...AGING_DOC_TYPES]),
      inArray(invoices.status, ['issued', 'partial']),
      sql`${invoices.totalHalalas} > ${invoices.paidHalalas}`,
    ));

  // Canonical customer name (may differ from the invoice's buyer snapshot).
  const [cust] = await db
    .select({ nameAr: customers.nameAr, nameEn: customers.nameEn })
    .from(customers)
    .where(and(eq(customers.agencyId, agencyId), eq(customers.id, filterCust)));

  const row: AgingCustomerRow = {
    customerId:     filterCust,
    customerNameAr: cust?.nameAr ?? rows[0]?.buyerNameAr ?? 'غير محدد',
    customerNameEn: cust?.nameEn ?? rows[0]?.buyerNameEn ?? null,
    invoiceCount:   0,
    ...emptyBuckets(),
    invoices:       [],
  };

  for (const r of rows) {
    const outstanding = r.totalHalalas - r.paidHalalas;
    if (outstanding <= 0) continue;
    // Treat an empty-string dueDate as absent (mirrors the SQL NULLIF) so it falls
    // back to the issue date instead of parsing to an Invalid Date.
    const effectiveDue = r.dueDate && r.dueDate.length > 0 ? r.dueDate : null;
    const daysOverdue  = Math.max(0, diffDays(asOf, effectiveDue ?? r.issueDate));
    const bucket       = assignBucket(daysOverdue);
    row.invoices.push({
      invoiceId:          r.id,
      invoiceNumber:      r.invoiceNumber,
      issueDate:          r.issueDate,
      dueDate:            effectiveDue,
      totalHalalas:       r.totalHalalas,
      paidHalalas:        r.paidHalalas,
      outstandingHalalas: outstanding,
      daysOverdue,
      bucket,
    });
    addToBucket(row, bucket, outstanding);
    row.invoiceCount++;
  }

  row.invoices.sort((a, b) => b.daysOverdue - a.daysOverdue);

  const summary = emptyBuckets();
  summary.current          = row.current;
  summary.days1to30        = row.days1to30;
  summary.days31to60       = row.days31to60;
  summary.days61to90       = row.days61to90;
  summary.days91plus       = row.days91plus;
  summary.totalOutstanding = row.totalOutstanding;

  // GL-1120 reconciliation is agency-wide, so it is not meaningful for a single
  // customer filter — mirror the previous route behaviour and omit it.
  return { summary, customers: row.invoiceCount > 0 ? [row] : [], reconciliation: null };
}

// ── Roll-up: all customers, SQL-aggregated bucket totals (bounded) ──────────────

async function agencyRollup(
  db: DB,
  agencyId: string,
  asOfStr: string,
): Promise<AgingReport> {
  // Days overdue, computed in SQL against the stored YYYY-MM-DD text dates.
  const dueDays     = sql`(${asOfStr}::date - COALESCE(NULLIF(${invoices.dueDate}, '')::date, ${invoices.issueDate}::date))`;
  const outstanding = sql`(${invoices.totalHalalas} - ${invoices.paidHalalas})`;
  // Group registered customers by id; walk-ins (no customerId) by buyer name.
  const groupKey    = sql`COALESCE(${invoices.customerId}, '_walkin_' || COALESCE(${invoices.buyerNameAr}, 'unknown'))`;

  const aggRows = await db
    .select({
      customerId: invoices.customerId,
      nameAr:     sql<string>`MAX(COALESCE(${customers.nameAr}, ${invoices.buyerNameAr}, 'غير محدد'))`,
      nameEn:     sql<string | null>`MAX(COALESCE(${customers.nameEn}, ${invoices.buyerNameEn}))`,
      current:    sql<string>`CAST(COALESCE(SUM(${outstanding}) FILTER (WHERE ${dueDays} <= 0), 0) AS bigint)`,
      d1to30:     sql<string>`CAST(COALESCE(SUM(${outstanding}) FILTER (WHERE ${dueDays} BETWEEN 1 AND 30), 0) AS bigint)`,
      d31to60:    sql<string>`CAST(COALESCE(SUM(${outstanding}) FILTER (WHERE ${dueDays} BETWEEN 31 AND 60), 0) AS bigint)`,
      d61to90:    sql<string>`CAST(COALESCE(SUM(${outstanding}) FILTER (WHERE ${dueDays} BETWEEN 61 AND 90), 0) AS bigint)`,
      d91plus:    sql<string>`CAST(COALESCE(SUM(${outstanding}) FILTER (WHERE ${dueDays} > 90), 0) AS bigint)`,
      total:      sql<string>`CAST(COALESCE(SUM(${outstanding}), 0) AS bigint)`,
      cnt:        sql<string>`CAST(COUNT(*) AS int)`,
    })
    .from(invoices)
    .leftJoin(customers, and(eq(customers.id, invoices.customerId), eq(customers.agencyId, agencyId)))
    .where(and(
      eq(invoices.agencyId, agencyId),
      inArray(invoices.type, [...AGING_DOC_TYPES]),
      inArray(invoices.status, ['issued', 'partial']),
      sql`${invoices.totalHalalas} > ${invoices.paidHalalas}`,
    ))
    .groupBy(groupKey, invoices.customerId);

  const customerList: AgingCustomerRow[] = aggRows
    .map((r) => ({
      customerId:       r.customerId ?? null,
      customerNameAr:   r.nameAr ?? 'غير محدد',
      customerNameEn:   r.nameEn ?? null,
      current:          Number(r.current),
      days1to30:        Number(r.d1to30),
      days31to60:       Number(r.d31to60),
      days61to90:       Number(r.d61to90),
      days91plus:       Number(r.d91plus),
      totalOutstanding: Number(r.total),
      invoiceCount:     Number(r.cnt),
      invoices:         [] as AgingInvoiceLine[],
    }))
    .sort((a, b) => b.totalOutstanding - a.totalOutstanding);

  const summary = emptyBuckets();
  for (const row of customerList) {
    summary.current          += row.current;
    summary.days1to30        += row.days1to30;
    summary.days31to60       += row.days31to60;
    summary.days61to90       += row.days61to90;
    summary.days91plus       += row.days91plus;
    summary.totalOutstanding += row.totalOutstanding;
  }

  // Reconcile the aged total to the GL control account (1120). The per-customer
  // buckets are derived from invoices (journal_lines carry no customer dimension),
  // so manual journals to 1120, credit notes, FX revaluation of AR and opening
  // balances never appear in the invoice view and the aged total can drift from
  // the AR control account. Surface the difference instead of diverging silently.
  const arGlRows = await db
    .select({
      netDebit: sql<string>`CAST(COALESCE(SUM(${journalLines.debitHalalas} - ${journalLines.creditHalalas}), 0) AS bigint)`,
    })
    .from(journalLines)
    .innerJoin(journalEntries, eq(journalLines.entryId, journalEntries.id))
    .where(and(
      eq(journalLines.agencyId, agencyId),
      eq(journalEntries.isPosted, true),
      ne(journalEntries.source, 'closing'),
      sql`${journalLines.accountCode} = '1120'`,
      sql`${journalEntries.date} <= ${asOfStr}`,
    ));
  const glReceivableBalance = Number(arGlRows[0]?.netDebit ?? 0);

  const reconciliation: AgingReconciliation = {
    agingTotalOutstanding: summary.totalOutstanding,
    glReceivableBalance,
    difference:            glReceivableBalance - summary.totalOutstanding,
    reconciled:            glReceivableBalance === summary.totalOutstanding,
  };

  return { summary, customers: customerList, reconciliation };
}
