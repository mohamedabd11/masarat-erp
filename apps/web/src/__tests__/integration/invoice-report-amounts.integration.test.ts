import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, eq, ne, sql as expression } from 'drizzle-orm';
import { agencies, invoices } from '@/lib/schema';
import { signedInvoiceAmount } from '@/lib/invoice-report-amounts';
import { closeTestDb, getTestDb, SKIP_IF_NO_DB, sql } from './test-db';

const AGENCY_ID = 'integ-report-invoice-sign-20260902';

beforeAll(async () => {
  if (SKIP_IF_NO_DB) return;
  const db = getTestDb();
  await db.insert(agencies).values({ id: AGENCY_ID, nameAr: 'اختبار اتجاه مبالغ التقارير' });
  await db.insert(invoices).values([
    { suffix: 'invoice', type: '388', month: 1, subtotal: 100_000, vat: 15_000 },
    { suffix: 'credit', type: '381', month: 2, subtotal: 20_000, vat: 3_000 },
    { suffix: 'debit', type: '383', month: 3, subtotal: 5_000, vat: 750 },
    { suffix: 'zero-vat', type: '380', month: 4, subtotal: 12_000, vat: 0 },
    { suffix: 'cancelled', type: '381', month: 1, subtotal: 100_000, vat: 15_000 },
  ].map(row => ({
    id: `${AGENCY_ID}-${row.suffix}`, agencyId: AGENCY_ID,
    invoiceNumber: `TEST-SIGN-${row.suffix}`, type: row.type,
    issueDate: `2026-0${row.month}-15`, createdAt: new Date(`2026-0${row.month}-15T12:00:00Z`),
    status: row.suffix === 'cancelled' ? 'cancelled' : 'issued',
    subtotalHalalas: row.subtotal, vatHalalas: row.vat, totalHalalas: row.subtotal + row.vat,
  })));
});

afterAll(async () => {
  if (SKIP_IF_NO_DB) return;
  await sql(`DELETE FROM invoices WHERE agency_id = '${AGENCY_ID}'`);
  await sql(`DELETE FROM agencies WHERE id = '${AGENCY_ID}'`);
  await closeTestDb();
});

describe.skipIf(SKIP_IF_NO_DB)('invoice-based report amounts — real SQL', () => {
  const totals = () => ({
    subtotal: expression<string>`coalesce(sum(${signedInvoiceAmount(invoices.subtotalHalalas)}), 0)`,
    vat: expression<string>`coalesce(sum(${signedInvoiceAmount(invoices.vatHalalas)}), 0)`,
    total: expression<string>`coalesce(sum(${signedInvoiceAmount(invoices.totalHalalas)}), 0)`,
  });

  it('subtracts credit notes, adds debit notes, and preserves subtotal + VAT = total', async () => {
    const [row] = await getTestDb().select(totals()).from(invoices).where(and(
      eq(invoices.agencyId, AGENCY_ID), ne(invoices.status, 'cancelled'),
    ));
    expect(Number(row!.subtotal)).toBe(97_000);
    expect(Number(row!.vat)).toBe(12_750);
    expect(Number(row!.total)).toBe(109_750);
    expect(Number(row!.subtotal) + Number(row!.vat)).toBe(Number(row!.total));
  });

  it('keeps a refund-only month negative rather than treating it as new sales', async () => {
    const rows = await getTestDb().select({
      month: expression<number>`extract(month from ${invoices.createdAt})::int`, ...totals(),
    }).from(invoices).where(and(eq(invoices.agencyId, AGENCY_ID), ne(invoices.status, 'cancelled')))
      .groupBy(expression`extract(month from ${invoices.createdAt})`);
    expect(rows).toHaveLength(4);
    const february = rows.find(row => row.month === 2)!;
    expect([Number(february.subtotal), Number(february.vat), Number(february.total)])
      .toEqual([-20_000, -3_000, -23_000]);
    expect(Number(rows.find(row => row.month === 4)!.vat)).toBe(0);
  });
});
