/**
 * Integration Tests — AR Aging report (Real DB)
 *
 * Exercises the REAL `getAgingReport` SQL aggregation (B4/B6) against a local
 * PostgreSQL database, so the conditional-bucket SQL, the walk-in grouping, the
 * document-type / status / outstanding filters, and the GL-1120 reconciliation
 * (with its posted / non-closing / date <= asOf exclusions) are all verified.
 *
 * Seeded for asOf = 2026-06-11:
 *   Registered customer C1:
 *     A  due 2026-06-11  out 20000  → current   (partial: total 30000 paid 10000)
 *     H  due ''(empty)   out  6000  → current   (NULLIF → falls back to issueDate)
 *     B  due 2026-05-01  out 50000  → 31-60     (41 days)
 *     C  due 2026-01-01  out 100000 → 91+       (161 days)
 *     E  type 381 (credit note)            → EXCLUDED
 *     F  status 'paid'                      → EXCLUDED
 *     G  total == paid (nothing due)        → EXCLUDED
 *   Walk-in (no customerId):
 *     D  due null → issueDate 2026-06-10  out 25000 → 1-30  (grouped by buyer name)
 *
 *   Aging total = 201000 halalas. A posted Dr-1120 journal of 201000 makes the
 *   report reconcile exactly; three other 1120 journals (closing / unposted /
 *   future-dated) must be excluded.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getTestDb, closeTestDb, sql, SKIP_IF_NO_DB } from './test-db';
import { agencies, customers, invoices, journalEntries, journalLines } from '@/lib/schema';
import { getAgingReport } from '@/lib/ar-aging';

const AGENCY_ID = 'integ-test-ar-aging-01';
const C1        = 'integ-aging-cust-01';
const AS_OF     = '2026-06-11';

function inv(over: Partial<typeof invoices.$inferInsert> & { id: string; invoiceNumber: string; issueDate: string }) {
  return {
    agencyId: AGENCY_ID,
    type:     '388',
    status:   'issued',
    totalHalalas: 0,
    paidHalalas:  0,
    ...over,
  } as typeof invoices.$inferInsert;
}

beforeAll(async () => {
  if (SKIP_IF_NO_DB) return;
  const db = getTestDb();

  await db.insert(agencies).values({
    id: AGENCY_ID, nameAr: 'وكالة اختبار الأعمار', nameEn: 'Aging Test Agency',
    subscriptionStatus: 'active', isVatRegistered: true,
  }).onConflictDoNothing();

  await db.insert(customers).values({
    id: C1, agencyId: AGENCY_ID, nameAr: 'شركة الاختبار', nameEn: 'Test Corp',
  }).onConflictDoNothing();

  await db.insert(invoices).values([
    inv({ id: 'aging-A', invoiceNumber: 'AG-A', customerId: C1, issueDate: '2026-04-01', dueDate: '2026-06-11', totalHalalas: 30000, paidHalalas: 10000, status: 'partial' }),
    inv({ id: 'aging-H', invoiceNumber: 'AG-H', customerId: C1, issueDate: '2026-06-11', dueDate: '',           totalHalalas: 6000 }),
    inv({ id: 'aging-B', invoiceNumber: 'AG-B', customerId: C1, issueDate: '2026-03-01', dueDate: '2026-05-01', totalHalalas: 50000 }),
    inv({ id: 'aging-C', invoiceNumber: 'AG-C', customerId: C1, issueDate: '2025-12-01', dueDate: '2026-01-01', totalHalalas: 100000 }),
    // Excluded:
    inv({ id: 'aging-E', invoiceNumber: 'AG-E', customerId: C1, issueDate: '2026-01-01', dueDate: '2026-01-01', totalHalalas: 99900, type: '381' }),
    inv({ id: 'aging-F', invoiceNumber: 'AG-F', customerId: C1, issueDate: '2026-01-01', dueDate: '2026-01-01', totalHalalas: 40000, status: 'paid' }),
    inv({ id: 'aging-G', invoiceNumber: 'AG-G', customerId: C1, issueDate: '2026-01-01', dueDate: '2026-01-01', totalHalalas: 10000, paidHalalas: 10000 }),
    // Walk-in (no customerId) grouped by buyer name:
    inv({ id: 'aging-D', invoiceNumber: 'AG-D', buyerNameAr: 'زبون نقدي', issueDate: '2026-06-10', totalHalalas: 25000 }),
  ]);

  // GL 1120 journals — only JE1 should count toward the control balance.
  await db.insert(journalEntries).values([
    { id: 'aging-je1', agencyId: AGENCY_ID, entryNumber: 'JE-AG-1', date: '2026-06-01', source: 'invoice', isPosted: true,  totalDebitHalalas: 201000, totalCreditHalalas: 201000 },
    { id: 'aging-je2', agencyId: AGENCY_ID, entryNumber: 'JE-AG-2', date: '2026-06-01', source: 'closing', isPosted: true,  totalDebitHalalas: 9999,   totalCreditHalalas: 9999 },
    { id: 'aging-je3', agencyId: AGENCY_ID, entryNumber: 'JE-AG-3', date: '2026-06-01', source: 'manual',  isPosted: false, totalDebitHalalas: 8888,   totalCreditHalalas: 8888 },
    { id: 'aging-je4', agencyId: AGENCY_ID, entryNumber: 'JE-AG-4', date: '2026-07-15', source: 'manual',  isPosted: true,  totalDebitHalalas: 7777,   totalCreditHalalas: 7777 },
  ]);
  await db.insert(journalLines).values([
    { id: 'aging-jl1a', entryId: 'aging-je1', agencyId: AGENCY_ID, accountCode: '1120', debitHalalas: 201000, creditHalalas: 0, sortOrder: 1 },
    { id: 'aging-jl1b', entryId: 'aging-je1', agencyId: AGENCY_ID, accountCode: '4000', debitHalalas: 0, creditHalalas: 201000, sortOrder: 2 },
    { id: 'aging-jl2',  entryId: 'aging-je2', agencyId: AGENCY_ID, accountCode: '1120', debitHalalas: 9999, creditHalalas: 0, sortOrder: 1 },
    { id: 'aging-jl3',  entryId: 'aging-je3', agencyId: AGENCY_ID, accountCode: '1120', debitHalalas: 8888, creditHalalas: 0, sortOrder: 1 },
    { id: 'aging-jl4',  entryId: 'aging-je4', agencyId: AGENCY_ID, accountCode: '1120', debitHalalas: 7777, creditHalalas: 0, sortOrder: 1 },
  ]);
});

afterAll(async () => {
  if (SKIP_IF_NO_DB) return;
  await sql(`DELETE FROM journal_lines   WHERE agency_id = '${AGENCY_ID}'`);
  await sql(`DELETE FROM journal_entries WHERE agency_id = '${AGENCY_ID}'`);
  await sql(`DELETE FROM invoices        WHERE agency_id = '${AGENCY_ID}'`);
  await sql(`DELETE FROM customers       WHERE agency_id = '${AGENCY_ID}'`);
  await sql(`DELETE FROM agencies        WHERE id        = '${AGENCY_ID}'`);
  await closeTestDb();
});

describe.skipIf(SKIP_IF_NO_DB)('getAgingReport — agency roll-up (SQL aggregation)', () => {

  it('يجمّع لكل عميل في صفوف مع عدد الفواتير الصحيح (يستثني 381/مدفوعة/غير مستحقة)', async () => {
    const db = getTestDb();
    const { customers: rows } = await getAgingReport(db as never, AGENCY_ID, AS_OF, null);

    expect(rows).toHaveLength(2);                       // C1 + walk-in
    const c1 = rows.find(r => r.customerId === C1)!;
    const walkin = rows.find(r => r.customerId === null)!;

    expect(c1).toBeDefined();
    expect(c1.customerNameAr).toBe('شركة الاختبار');    // canonical name from the join
    expect(c1.invoiceCount).toBe(4);                    // A, H, B, C (E/F/G excluded)
    expect(walkin.invoiceCount).toBe(1);                // D
    expect(walkin.customerNameAr).toBe('زبون نقدي');     // grouped by buyer name
  });

  it('يضع كل فاتورة في الفئة العمرية الصحيحة', async () => {
    const db = getTestDb();
    const { customers: rows } = await getAgingReport(db as never, AGENCY_ID, AS_OF, null);
    const c1 = rows.find(r => r.customerId === C1)!;

    expect(c1.current).toBe(26000);          // A 20000 + H 6000
    expect(c1.days31to60).toBe(50000);       // B
    expect(c1.days91plus).toBe(100000);      // C
    expect(c1.days1to30).toBe(0);
    expect(c1.days61to90).toBe(0);
    expect(c1.totalOutstanding).toBe(176000);

    const walkin = rows.find(r => r.customerId === null)!;
    expect(walkin.days1to30).toBe(25000);    // D (due null → issueDate 2026-06-10 → 1 day)
    expect(walkin.totalOutstanding).toBe(25000);
  });

  it('صفوف العملاء فارغة التفاصيل (invoices=[]) ومرتّبة تنازلياً حسب الإجمالي', async () => {
    const db = getTestDb();
    const { customers: rows } = await getAgingReport(db as never, AGENCY_ID, AS_OF, null);
    expect(rows[0]!.totalOutstanding).toBeGreaterThanOrEqual(rows[1]!.totalOutstanding);
    expect(rows[0]!.customerId).toBe(C1);    // 176000 > 25000
    for (const r of rows) expect(r.invoices).toEqual([]);
  });

  it('الملخّص = مجموع كل الفئات عبر العملاء', async () => {
    const db = getTestDb();
    const { summary } = await getAgingReport(db as never, AGENCY_ID, AS_OF, null);
    expect(summary.current).toBe(26000);
    expect(summary.days1to30).toBe(25000);
    expect(summary.days31to60).toBe(50000);
    expect(summary.days61to90).toBe(0);
    expect(summary.days91plus).toBe(100000);
    expect(summary.totalOutstanding).toBe(201000);
  });

  it('يطابق رصيد الرقابة GL 1120 (يستثني الإقفال/غير المرحّل/ما بعد التاريخ)', async () => {
    const db = getTestDb();
    const { reconciliation } = await getAgingReport(db as never, AGENCY_ID, AS_OF, null);
    expect(reconciliation).not.toBeNull();
    expect(reconciliation!.glReceivableBalance).toBe(201000);   // only JE1 counts
    expect(reconciliation!.agingTotalOutstanding).toBe(201000);
    expect(reconciliation!.difference).toBe(0);
    expect(reconciliation!.reconciled).toBe(true);
  });
});

describe.skipIf(SKIP_IF_NO_DB)('getAgingReport — single-customer drill-down', () => {

  it('يُعيد تفاصيل الفواتير لعميل واحد مرتّبة حسب أيام التأخّر، دون مطابقة GL', async () => {
    const db = getTestDb();
    const { customers: rows, reconciliation } = await getAgingReport(db as never, AGENCY_ID, AS_OF, C1);

    expect(reconciliation).toBeNull();                 // agency-wide only
    expect(rows).toHaveLength(1);
    const c1 = rows[0]!;
    expect(c1.customerId).toBe(C1);
    expect(c1.invoiceCount).toBe(4);
    expect(c1.invoices).toHaveLength(4);

    // Sorted by daysOverdue desc: C (91+) → B (31-60) → A/H (current)
    expect(c1.invoices[0]!.invoiceNumber).toBe('AG-C');
    expect(c1.invoices[0]!.bucket).toBe('91+');
    expect(c1.invoices[1]!.invoiceNumber).toBe('AG-B');
    expect(c1.invoices[1]!.bucket).toBe('31-60');

    const a = c1.invoices.find(i => i.invoiceNumber === 'AG-A')!;
    expect(a.outstandingHalalas).toBe(20000);          // 30000 - 10000
    expect(a.bucket).toBe('current');

    const h = c1.invoices.find(i => i.invoiceNumber === 'AG-H')!;
    expect(h.bucket).toBe('current');                  // empty dueDate → falls back to issueDate

    expect(c1.totalOutstanding).toBe(176000);
  });

  it('يُعيد قائمة فارغة لعميل لا فواتير مستحقة له', async () => {
    const db = getTestDb();
    const { customers: rows, summary } = await getAgingReport(db as never, AGENCY_ID, AS_OF, 'no-such-customer');
    expect(rows).toEqual([]);
    expect(summary.totalOutstanding).toBe(0);
  });
});
