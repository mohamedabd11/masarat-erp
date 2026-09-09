import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { agencies, bookings, chartOfAccounts, invoices, journalEntries, journalLines } from '@/lib/schema';
import { getDashboardReport } from '@/lib/reports-dashboard';
import { getProfitAndLoss } from '@/lib/profit-and-loss';
import { closeTestDb, getTestDb, SKIP_IF_NO_DB, sql } from './test-db';

const A = 'integ-dashboard-deep-20260908-a', B = 'integ-dashboard-deep-20260908-b';
const id = (name: string) => `${A}-${name}`;

beforeAll(async () => {
  if (SKIP_IF_NO_DB) return;
  const db = getTestDb();
  await db.insert(agencies).values([{ id: A, nameAr: 'تقرير عميق أ' }, { id: B, nameAr: 'تقرير عميق ب' }]);
  await db.insert(chartOfAccounts).values([
    { id: id('coa-rev'), agencyId: A, code: '7999', nameAr: 'إيراد مخصص', type: 'revenue' },
    { id: id('coa-exp'), agencyId: A, code: '4998', nameAr: 'مصروف مخصص', type: 'expense' },
  ]);
  await db.insert(bookings).values([
    { id: id('booking-1'), agencyId: A, bookingNumber: 'DASH-A-1', serviceType: 'flight', totalPriceHalalas: 120_000, costPriceHalalas: 70_000, createdAt: new Date('2026-01-10T10:00:00Z') },
    { id: id('booking-2'), agencyId: A, bookingNumber: 'DASH-A-2', serviceType: 'hotel', totalPriceHalalas: 50_000, costPriceHalalas: 30_000, createdAt: new Date('2026-01-20T10:00:00Z') },
    { id: id('booking-cancelled'), agencyId: A, bookingNumber: 'DASH-A-X', serviceType: 'visa', status: 'cancelled', totalPriceHalalas: 999_999, createdAt: new Date('2026-02-01T10:00:00Z') },
    { id: id('booking-uninvoiced'), agencyId: A, bookingNumber: 'DASH-A-3', serviceType: 'umrah', totalPriceHalalas: 40_000, createdAt: new Date('2026-04-01T10:00:00Z') },
    { id: id('booking-after-period'), agencyId: A, bookingNumber: 'DASH-A-4', serviceType: 'package', totalPriceHalalas: 777_777, createdAt: new Date('2026-05-01T10:00:00Z') },
    { id: `${B}-booking`, agencyId: B, bookingNumber: 'DASH-B-1', serviceType: 'flight', totalPriceHalalas: 888_888, createdAt: new Date('2026-01-01T10:00:00Z') },
  ]);
  await db.insert(invoices).values([
    { id: id('invoice'), agencyId: A, invoiceNumber: 'DASH-I-1', type: '388', bookingId: id('booking-1'), issueDate: '2026-01-15', createdAt: new Date('2026-06-15T10:00:00Z'), subtotalHalalas: 100_000, vatHalalas: 15_000, totalHalalas: 115_000 },
    { id: id('zero-vat'), agencyId: A, invoiceNumber: 'DASH-I-2', type: '388', bookingId: id('booking-2'), issueDate: '2026-01-21', subtotalHalalas: 50_000, vatHalalas: 0, totalHalalas: 50_000 },
    { id: id('credit'), agencyId: A, invoiceNumber: 'DASH-CN-1', type: '381', bookingId: id('booking-1'), issueDate: '2026-02-05', subtotalHalalas: 20_000, vatHalalas: 3_000, totalHalalas: 23_000 },
    { id: id('debit'), agencyId: A, invoiceNumber: 'DASH-DN-1', type: '383', bookingId: id('booking-1'), issueDate: '2026-03-05', subtotalHalalas: 5_000, vatHalalas: 750, totalHalalas: 5_750 },
    { id: id('draft'), agencyId: A, invoiceNumber: 'DASH-DRAFT', type: '380', status: 'draft', issueDate: '2026-01-25', subtotalHalalas: 999_999, totalHalalas: 999_999 },
    { id: id('invoice-after-period'), agencyId: A, invoiceNumber: 'DASH-I-LATER', type: '388', issueDate: '2026-05-01', createdAt: new Date('2026-01-01T10:00:00Z'), subtotalHalalas: 777_777, totalHalalas: 777_777 },
    { id: `${B}-invoice`, agencyId: B, invoiceNumber: 'DASH-B-I', type: '388', bookingId: `${B}-booking`, issueDate: '2026-01-02', subtotalHalalas: 888_888, totalHalalas: 888_888 },
  ]);
  await db.insert(journalEntries).values([
    { id: id('je-jan-custom'), agencyId: A, entryNumber: 'DASH-JE-1', date: '2026-01-15', source: 'invoice', serviceType: 'flight' },
    { id: id('je-jan-large'), agencyId: A, entryNumber: 'DASH-JE-2', date: '2026-01-16', source: 'invoice', serviceType: 'hotel' },
    { id: id('je-refund'), agencyId: A, entryNumber: 'DASH-JE-3', date: '2026-02-05', source: 'credit_note', serviceType: 'flight' },
    { id: id('je-deferred'), agencyId: A, entryNumber: 'DASH-JE-4', date: '2026-03-10', source: 'revenue_recognition', serviceType: 'umrah' },
    { id: id('je-expense'), agencyId: A, entryNumber: 'DASH-JE-5', date: '2026-04-05', source: 'manual' },
    { id: id('je-closing'), agencyId: A, entryNumber: 'DASH-JE-X1', date: '2026-01-31', source: 'closing' },
    { id: id('je-unposted'), agencyId: A, entryNumber: 'DASH-JE-X2', date: '2026-01-31', source: 'manual', isPosted: false },
    { id: `${B}-je`, agencyId: B, entryNumber: 'DASH-B-JE', date: '2026-01-10', source: 'manual' },
  ]);
  const line = (entryId: string, suffix: string, agencyId: string, accountCode: string, debit: number, credit: number) => ({
    id: `${entryId}-${suffix}`, entryId, agencyId, accountCode, accountNameAr: accountCode, debitHalalas: debit, creditHalalas: credit,
  });
  await db.insert(journalLines).values([
    line(id('je-jan-custom'), 'rev', A, '7999', 0, 80_000), line(id('je-jan-custom'), 'exp', A, '4998', 30_000, 0),
    line(id('je-jan-large'), 'rev', A, '4001', 0, 3_000_000_000), line(id('je-jan-large'), 'cash', A, '1000', 3_000_000_000, 0),
    line(id('je-refund'), 'rev', A, '7999', 20_000, 0), line(id('je-refund'), 'exp', A, '4998', 0, 5_000),
    line(id('je-deferred'), 'rev', A, '7999', 0, 40_000),
    line(id('je-expense'), 'exp', A, '4998', 7_000, 0),
    line(id('je-closing'), 'rev', A, '7999', 0, 999_999), line(id('je-unposted'), 'exp', A, '4998', 999_999, 0),
    // Deliberately malformed tenant attribution: entry B with line A must not enter either agency's report.
    line(`${B}-je`, 'cross', A, '4001', 0, 777_777),
  ]);
});

afterAll(async () => {
  if (SKIP_IF_NO_DB) return;
  await sql(`DELETE FROM journal_entries WHERE agency_id IN ('${A}','${B}')`);
  await sql(`DELETE FROM invoices WHERE agency_id IN ('${A}','${B}')`);
  await sql(`DELETE FROM bookings WHERE agency_id IN ('${A}','${B}')`);
  await sql(`DELETE FROM chart_of_accounts WHERE agency_id IN ('${A}','${B}')`);
  await sql(`DELETE FROM agencies WHERE id IN ('${A}','${B}')`);
  await closeTestDb();
});

describe.skipIf(SKIP_IF_NO_DB)('dashboard and P&L — real multi-month SQL', () => {
  const period = { year: 2026, from: '2026-01-01', to: '2026-04-30' };

  it('counts booking records independently and dates documents by issue date', async () => {
    const report = await getDashboardReport(getTestDb() as never, A, period);
    expect(report.monthly.map(row => row.month)).toEqual([1, 2, 3, 4]);
    const [jan, feb, mar, apr] = report.monthly;
    expect(jan).toMatchObject({ bookings: 2, documents: 2, rev: 150_000, vat: 15_000, grandTotal: 165_000 });
    expect(feb).toMatchObject({ bookings: 0, documents: 1, rev: -20_000, vat: -3_000, grandTotal: -23_000 });
    expect(mar).toMatchObject({ bookings: 0, documents: 1, rev: 5_000, vat: 750, grandTotal: 5_750 });
    expect(apr).toMatchObject({ bookings: 1, documents: 0 });
    expect(report.typeMix.map(row => [row.type, row.count])).toEqual([['flight', 1], ['hotel', 1], ['umrah', 1]]);
  });

  it('uses posted journal dates, custom account types, reversals and values beyond 32-bit integers', async () => {
    const report = await getDashboardReport(getTestDb() as never, A, period);
    const [jan, feb, mar, apr] = report.monthly;
    expect(jan).toMatchObject({ revenue: 3_000_080_000, expenses: 30_000, netIncome: 3_000_050_000 });
    expect(feb).toMatchObject({ revenue: -20_000, expenses: -5_000, netIncome: -15_000 });
    expect(mar).toMatchObject({ revenue: 40_000, expenses: 0, netIncome: 40_000 });
    expect(apr).toMatchObject({ revenue: 0, expenses: 7_000, netIncome: -7_000 });
    const pl = await getProfitAndLoss(getTestDb() as never, A, period);
    expect(pl.totalRevenue).toBe(3_000_100_000);
    expect(pl.totalExpenses).toBe(32_000);
    expect(pl.netIncome).toBe(3_000_068_000);
    expect(pl.monthly.reduce((sum, row) => sum + row.netIncome, 0)).toBe(pl.netIncome);
  });

  it('excludes both ordinary and malformed cross-agency rows', async () => {
    const report = await getDashboardReport(getTestDb() as never, B, period);
    expect(report.monthly).toHaveLength(1);
    expect(report.monthly[0]).toMatchObject({ month: 1, bookings: 1, documents: 1, rev: 888_888,
      revenue: 0, expenses: 0, netIncome: 0 });
  });
});
