/**
 * Integration Tests — Refunds (Real DB)
 *
 * Runs against a real local PostgreSQL (opt-in via TEST_DATABASE_URL; skips
 * otherwise). Replicates the server-side transaction from
 * src/app/api/refunds/process/route.ts directly against Drizzle, calling the SAME
 * pure `buildRefundJournalLines` helper the route uses, and verifies the GL
 * invariants the audit (CRIT-10) demands:
 *
 *   1. The refund journal entry is balanced (DR = CR).
 *   2. A MIXED invoice reverses BOTH revenue accounts (4000 and 4100).
 *   3. A partially-paid full cancellation splits the credit between Bank (cash)
 *      and AR 1120 (the open unpaid portion).
 *   4. Deferred revenue (3201) is unwound, not 4100.
 *   5. The agency-wide trial balance stays balanced after the refund.
 *   6. suppliers.balanceHalalas is decremented to mirror the AP (2000) reversal.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { eq, and, sql as dsql } from 'drizzle-orm';
import { getTestDb, closeTestDb, sql, SKIP_IF_NO_DB } from './test-db';
import { agencies, suppliers, invoices, journalEntries, journalLines } from '@/lib/schema';
import { getNextJournalNumber } from '@/lib/invoice-counter';
import { buildRefundJournalLines } from '@/lib/refund-journal';

const AGENCY_ID = 'integ-test-refund-01';
const USER_ID   = 'user-refund';

let seq = 0;

interface SeedShape {
  agentFee?: number; agentCost?: number;
  principalRev?: number; principalCost?: number;
  deferred?: number; vat?: number;
  paid: number;
  supplierId?: string;
}

/** Seed an issued invoice with a realistic revenue-recognition journal. */
async function createIssuedInvoice(o: SeedShape) {
  const db = getTestDb();
  return db.transaction(async (tx) => {
    const now   = new Date();
    const year  = now.getFullYear();
    const today = now.toISOString().split('T')[0]!;
    const invId = crypto.randomUUID();
    const jeId  = crypto.randomUUID();
    const invNum = `INV-RF-${++seq}`;
    const jeNum  = await getNextJournalNumber(AGENCY_ID, year, tx as never);

    const body: { code: string; ar: string; dr: number; cr: number }[] = [];
    const push = (code: string, dr: number, cr: number) => body.push({ code, ar: code, dr, cr });
    if (o.agentFee)     push('4000', 0, o.agentFee);
    if (o.principalRev) push('4100', 0, o.principalRev);
    if (o.deferred)     push('3201', 0, o.deferred);
    if (o.vat)          push('2200', 0, o.vat);
    if (o.agentCost)    push('2000', 0, o.agentCost);
    if (o.principalCost) { push('5000', o.principalCost, 0); push('2000', 0, o.principalCost); }
    const cr = body.reduce((s, l) => s + l.cr, 0);
    const dr = body.reduce((s, l) => s + l.dr, 0);
    const total = cr - dr;                                   // AR debit / customer total
    const subtotal = total - (o.vat ?? 0);

    await tx.insert(invoices).values({
      id: invId, agencyId: AGENCY_ID, invoiceNumber: invNum, type: '388',
      subtotalHalalas: subtotal, vatHalalas: o.vat ?? 0, totalHalalas: total,
      paidHalalas: o.paid, issueDate: today, status: o.paid >= total ? 'paid' : 'partial',
      isEInvoice: (o.vat ?? 0) > 0, journalEntryId: jeId, createdBy: USER_ID,
    });
    await tx.insert(journalEntries).values({
      id: jeId, agencyId: AGENCY_ID, entryNumber: jeNum, date: today,
      descriptionAr: `فاتورة ${invNum}`, source: 'invoice', sourceId: invId,
      isPosted: true, totalDebitHalalas: total + dr, totalCreditHalalas: cr, createdBy: USER_ID,
    });
    await tx.insert(journalLines).values([
      { id: crypto.randomUUID(), entryId: jeId, agencyId: AGENCY_ID, accountCode: '1120', accountNameAr: '1120', accountNameEn: '1120', debitHalalas: total, creditHalalas: 0, sortOrder: 0 },
      ...body.map((l, i) => ({ id: crypto.randomUUID(), entryId: jeId, agencyId: AGENCY_ID, accountCode: l.code, accountNameAr: l.code, accountNameEn: l.code, debitHalalas: l.dr, creditHalalas: l.cr, sortOrder: i + 1 })),
    ]);

    return { invId, jeId, invNum, total, vat: o.vat ?? 0, paid: o.paid };
  });
}

/** Replicate the refund route's GL transaction using the real helper. */
async function processRefund(opts: {
  invId: string; refundAmount: number; cancellationFee?: number; cancelledTotal?: number;
  fallbackModel?: 'agent' | 'principal'; costPriceHalalas?: number;
  supplierDecrements?: { supplierId: string; cost: number }[];
}) {
  const db = getTestDb();
  return db.transaction(async (tx) => {
    const now   = new Date();
    const year  = now.getFullYear();
    const today = now.toISOString().split('T')[0]!;

    const [inv] = await tx.select().from(invoices).where(and(eq(invoices.id, opts.invId), eq(invoices.agencyId, AGENCY_ID)));
    if (!inv) throw new Error('invoice not found');

    const origLines = inv.journalEntryId
      ? await tx.select({ accountCode: journalLines.accountCode, accountNameAr: journalLines.accountNameAr, accountNameEn: journalLines.accountNameEn, debitHalalas: journalLines.debitHalalas, creditHalalas: journalLines.creditHalalas })
          .from(journalLines).where(eq(journalLines.entryId, inv.journalEntryId))
      : [];

    const jLines = buildRefundJournalLines({
      originalLines: origLines,
      originalTotalHalalas: inv.totalHalalas,
      originalVatHalalas: inv.vatHalalas,
      paidHalalas: inv.paidHalalas,
      refundAmountHalalas: opts.refundAmount,
      cancellationFeeHalalas: opts.cancellationFee ?? 0,
      cancelledTotalHalalas: opts.cancelledTotal,
      isEInvoice: inv.isEInvoice,
      fallback: { revenueModel: opts.fallbackModel ?? 'principal', costPriceHalalas: opts.costPriceHalalas ?? 0 },
    });

    const jeId  = crypto.randomUUID();
    const jeNum = await getNextJournalNumber(AGENCY_ID, year, tx as never);
    await tx.insert(journalEntries).values({
      id: jeId, agencyId: AGENCY_ID, entryNumber: jeNum, date: today,
      descriptionAr: `استرداد ${inv.invoiceNumber}`, source: 'receipt', sourceId: opts.invId,
      isPosted: true,
      totalDebitHalalas: jLines.reduce((s, l) => s + l.dr, 0),
      totalCreditHalalas: jLines.reduce((s, l) => s + l.cr, 0),
      createdBy: USER_ID,
    });
    await tx.insert(journalLines).values(jLines.map((l, i) => ({
      id: crypto.randomUUID(), entryId: jeId, agencyId: AGENCY_ID,
      accountCode: l.code, accountNameAr: l.ar, accountNameEn: l.en,
      debitHalalas: l.dr, creditHalalas: l.cr, sortOrder: i + 1,
    })));

    for (const d of opts.supplierDecrements ?? []) {
      const cancelledTotal = opts.cancelledTotal ?? (opts.refundAmount + (opts.cancellationFee ?? 0));
      const ratio = cancelledTotal / (inv.totalHalalas || 1);
      const dec = Math.round(d.cost * ratio);
      await tx.update(suppliers)
        .set({ balanceHalalas: dsql`${suppliers.balanceHalalas} - ${dec}` })
        .where(and(eq(suppliers.id, d.supplierId), eq(suppliers.agencyId, AGENCY_ID)));
    }

    return { jeId, jLines };
  });
}

async function linesOf(jeId: string) {
  return getTestDb().select().from(journalLines).where(eq(journalLines.entryId, jeId));
}

/** Agency-wide trial balance: Σ debits must equal Σ credits over all posted lines. */
async function trialBalanceBalanced(): Promise<boolean> {
  const res = await sql(`SELECT COALESCE(SUM(debit_halalas),0) AS dr, COALESCE(SUM(credit_halalas),0) AS cr FROM journal_lines WHERE agency_id = '${AGENCY_ID}'`);
  const row = res.rows[0] as { dr: string; cr: string };
  return String(row.dr) === String(row.cr);
}

// ─── Setup / Teardown ───────────────────────────────────────────────────────────

beforeAll(async () => {
  if (SKIP_IF_NO_DB) return;
  const db = getTestDb();
  await db.insert(agencies).values({
    id: AGENCY_ID, nameAr: 'وكالة اختبار الاسترداد', nameEn: 'Refund Test Agency',
    subscriptionStatus: 'active', isVatRegistered: true,
  }).onConflictDoNothing();
});

beforeEach(async () => {
  if (SKIP_IF_NO_DB) return;
  await sql(`DELETE FROM journal_lines   WHERE agency_id = '${AGENCY_ID}'`);
  await sql(`DELETE FROM journal_entries WHERE agency_id = '${AGENCY_ID}'`);
  await sql(`DELETE FROM invoices        WHERE agency_id = '${AGENCY_ID}'`);
  await sql(`DELETE FROM suppliers       WHERE agency_id = '${AGENCY_ID}'`);
});

afterAll(async () => {
  if (SKIP_IF_NO_DB) return;
  await sql(`DELETE FROM journal_lines   WHERE agency_id = '${AGENCY_ID}'`);
  await sql(`DELETE FROM journal_entries WHERE agency_id = '${AGENCY_ID}'`);
  await sql(`DELETE FROM invoices        WHERE agency_id = '${AGENCY_ID}'`);
  await sql(`DELETE FROM suppliers       WHERE agency_id = '${AGENCY_ID}'`);
  await sql(`DELETE FROM agency_counters WHERE agency_id = '${AGENCY_ID}'`);
  await sql(`DELETE FROM agencies        WHERE id        = '${AGENCY_ID}'`);
  await closeTestDb();
});

// ─── Tests ──────────────────────────────────────────────────────────────────────

describe.skipIf(SKIP_IF_NO_DB)('refunds — refund GL (CRIT-10)', () => {

  it('mixed agent+principal full refund reverses BOTH 4000 and 4100; entry + TB balanced', async () => {
    const inv = await createIssuedInvoice({ agentFee: 2_000_00, principalRev: 8_000_00, vat: 1_500_00, principalCost: 6_000_00, paid: 11_500_00 });
    const { jeId } = await processRefund({ invId: inv.invId, refundAmount: inv.total });

    const ls = await linesOf(jeId);
    const drOf = (c: string) => ls.filter(l => l.accountCode === c).reduce((s, l) => s + l.debitHalalas, 0);
    expect(drOf('4000')).toBe(2_000_00);
    expect(drOf('4100')).toBe(8_000_00);
    expect(ls.reduce((s, l) => s + l.debitHalalas, 0)).toBe(ls.reduce((s, l) => s + l.creditHalalas, 0));
    expect(await trialBalanceBalanced()).toBe(true);
  });

  it('partially-paid full cancellation splits the credit between Bank and AR (1120)', async () => {
    const inv = await createIssuedInvoice({ principalRev: 10_000_00, vat: 1_500_00, principalCost: 6_000_00, paid: 5_750_00 });
    const { jeId } = await processRefund({ invId: inv.invId, refundAmount: 5_750_00, cancelledTotal: inv.total });

    const ls = await linesOf(jeId);
    const crOf = (c: string) => ls.filter(l => l.accountCode === c).reduce((s, l) => s + l.creditHalalas, 0);
    expect(crOf('1110')).toBe(5_750_00);   // cash actually returned
    expect(crOf('1120')).toBe(5_750_00);   // open AR voided
    expect(await trialBalanceBalanced()).toBe(true);
  });

  it('deferred-revenue invoice unwinds 3201, never 4100', async () => {
    const inv = await createIssuedInvoice({ deferred: 10_000_00, vat: 1_500_00, principalCost: 6_000_00, paid: 11_500_00 });
    const { jeId } = await processRefund({ invId: inv.invId, refundAmount: inv.total });

    const ls = await linesOf(jeId);
    const drOf = (c: string) => ls.filter(l => l.accountCode === c).reduce((s, l) => s + l.debitHalalas, 0);
    expect(drOf('3201')).toBe(10_000_00);
    expect(drOf('4100')).toBe(0);
    expect(await trialBalanceBalanced()).toBe(true);
  });

  it('decrements suppliers.balanceHalalas to mirror the AP (2000) reversal', async () => {
    const db = getTestDb();
    const supplierId = 'sup-refund-1';
    await db.insert(suppliers).values({ id: supplierId, agencyId: AGENCY_ID, nameAr: 'مورد', balanceHalalas: 6_000_00, isActive: true }).onConflictDoNothing();

    const inv = await createIssuedInvoice({ principalRev: 10_000_00, vat: 1_500_00, principalCost: 6_000_00, paid: 11_500_00 });
    await processRefund({ invId: inv.invId, refundAmount: inv.total, supplierDecrements: [{ supplierId, cost: 6_000_00 }] });

    const [sup] = await db.select().from(suppliers).where(eq(suppliers.id, supplierId));
    expect(sup!.balanceHalalas).toBe(0);   // full refund → full AP reversal
  });

});
