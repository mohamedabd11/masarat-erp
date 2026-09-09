import { and, eq, notInArray, ne, sql } from 'drizzle-orm';
import type { DB } from './db';
import { bookings } from './schema/bookings';
import { invoices } from './schema/invoices';
import { signedInvoiceAmount } from './invoice-report-amounts';
import { getProfitAndLoss } from './profit-and-loss';
import { emptyDashboardMonth, hasDashboardActivity, type DashboardReport, type ReportPeriod } from './reports-dashboard-model';

export async function getDashboardReport(db: Pick<DB, 'select'>, agencyId: string,
  period: ReportPeriod & { year: number }): Promise<DashboardReport> {
  const invoiceMonth = sql<number>`substring(${invoices.issueDate}, 6, 2)::int`;
  const bookingMonth = sql<number>`EXTRACT(MONTH FROM ${bookings.createdAt})::int`;
  // Run sequentially inside the route's repeatable-read transaction so all three
  // sections describe one database snapshot even while a busy agency is posting.
  const invoiceRows = await db.select({ month: invoiceMonth, documents: sql<string>`COUNT(*)`,
      rev: sql<string>`COALESCE(SUM(${signedInvoiceAmount(invoices.subtotalHalalas)}), 0)`,
      vat: sql<string>`COALESCE(SUM(${signedInvoiceAmount(invoices.vatHalalas)}), 0)`,
      grandTotal: sql<string>`COALESCE(SUM(${signedInvoiceAmount(invoices.totalHalalas)}), 0)`,
    }).from(invoices).where(and(eq(invoices.agencyId, agencyId),
      notInArray(invoices.status, ['cancelled', 'draft']),
      sql`${invoices.issueDate} >= ${period.from}`, sql`${invoices.issueDate} <= ${period.to}`))
      .groupBy(invoiceMonth);
  const bookingRows = await db.select({ month: bookingMonth, type: bookings.serviceType,
      count: sql<string>`COUNT(*)`, rev: sql<string>`COALESCE(SUM(${bookings.totalPriceHalalas}), 0)`,
    }).from(bookings).where(and(eq(bookings.agencyId, agencyId), ne(bookings.status, 'cancelled'),
      sql`${bookings.createdAt} >= ${period.from}::date`,
      sql`${bookings.createdAt} < (${period.to}::date + INTERVAL '1 day')`))
      .groupBy(bookingMonth, bookings.serviceType);
  const profit = await getProfitAndLoss(db, agencyId, period);
  const months = Array.from({ length: 12 }, (_, i) => emptyDashboardMonth(i + 1));
  const at = (month: number) => {
    const row = months[Number(month) - 1];
    if (!row) throw new Error('Invalid report month');
    return row;
  };
  for (const row of invoiceRows) Object.assign(at(row.month), { documents: Number(row.documents),
    rev: Number(row.rev), vat: Number(row.vat), grandTotal: Number(row.grandTotal) });
  const types = new Map<string, { type: string; count: number; rev: number }>();
  for (const row of bookingRows) {
    at(row.month).bookings += Number(row.count);
    const type = types.get(row.type) ?? { type: row.type, count: 0, rev: 0 };
    type.count += Number(row.count); type.rev += Number(row.rev);
    types.set(row.type, type);
  }
  for (const row of profit.monthly) Object.assign(at(row.month), row, { hasLedgerActivity: true });
  return { year: period.year, period: { from: period.from, to: period.to },
    monthly: months.filter(hasDashboardActivity), typeMix: [...types.values()].sort((a, b) => a.type.localeCompare(b.type)) };
}
