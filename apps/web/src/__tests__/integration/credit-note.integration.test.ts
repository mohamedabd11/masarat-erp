/**
 * Integration Tests — Credit Notes (Real DB)
 *
 * Tests run against a real local PostgreSQL database. They replicate the
 * server-side transaction logic from src/app/api/invoices/credit-note/route.ts
 * directly against Drizzle (no HTTP), and verify the GL invariants.
 *
 * A ZATCA credit note (type 381) reverses the original invoice's revenue
 * recognition:
 *   Dr Revenue (4000 / 4100)         subtotal
 *   Dr VAT Payable (2200)            vat        [only if vat > 0]
 *      Cr Accounts Receivable (1120) total      → reduces AR
 *
 * Verifies:
 *  1. The credit note's journal entry is balanced (DR = CR)
 *  2. AR (1120) is CREDITED (reduces receivable)
 *  3. Revenue (4000/4100) is DEBITED
 *  4. The original invoice is flagged (status → 'credit_noted')
 *  5. No double AR reduction: original.paidHalalas is NOT mutated by the GL entry
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { eq, and } from 'drizzle-orm';
import { getTestDb, closeTestDb, sql } from './test-db';
import { agencies, invoices, journalEntries, journalLines } from '@/lib/schema';
import { getNextJournalNumber } from '@/lib/invoice-counter';
import { GL } from '@/lib/gl-accounts';

const AGENCY_ID = 'integ-test-credit-note-01';
const USER_ID   = 'user-credit-note';

const AC = {
  receivable: GL.receivable,        // 1120
  revenue:    GL.revenuePrincipal,  // 4100
  vatPayable: GL.vatPayable,        // 2200
};

let invSeq = 0;

/**
 * Seed an original issued sales invoice with its revenue-recognition journal:
 *   Dr 1120 AR (total) / Cr 4100 Revenue (subtotal) / Cr 2200 VAT (vat)
 */
async function createIssuedInvoice(opts: { subtotal: number; vat: number }) {
  const db = getTestDb();
  const total = opts.subtotal + opts.vat;
  return db.transaction(async (tx) => {
    const now   = new Date();
    const year  = now.getFullYear();
    const today = now.toISOString().split('T')[0]!;
    const invId = crypto.randomUUID();
    const jeId  = crypto.randomUUID();
    const invNum = `INV-TEST-${++invSeq}`;
    const jeNum  = await getNextJournalNumber(AGENCY_ID, year, tx as never);

    await tx.insert(invoices).values({
      id: invId, agencyId: AGENCY_ID, invoiceNumber: invNum, type: '380',
      subtotalHalalas: opts.subtotal, vatHalalas: opts.vat, totalHalalas: total,
      paidHalalas: 0, issueDate: today, status: 'issued',
      journalEntryId: jeId, createdBy: USER_ID,
    });

    await tx.insert(journalEntries).values({
      id: jeId, agencyId: AGENCY_ID, entryNumber: jeNum, date: today,
      descriptionAr: `فاتورة ${invNum}`, source: 'invoice', sourceId: invId,
      isPosted: true, totalDebitHalalas: total, totalCreditHalalas: total, createdBy: USER_ID,
    });

    await tx.insert(journalLines).values([
      { id: crypto.randomUUID(), entryId: jeId, agencyId: AGENCY_ID, accountCode: AC.receivable.code, accountNameAr: AC.receivable.ar, accountNameEn: AC.receivable.en, debitHalalas: total,         creditHalalas: 0,           sortOrder: 1 },
      { id: crypto.randomUUID(), entryId: jeId, agencyId: AGENCY_ID, accountCode: AC.revenue.code,    accountNameAr: AC.revenue.ar,    accountNameEn: AC.revenue.en,    debitHalalas: 0,             creditHalalas: opts.subtotal, sortOrder: 2 },
      ...(opts.vat > 0 ? [{ id: crypto.randomUUID(), entryId: jeId, agencyId: AGENCY_ID, accountCode: AC.vatPayable.code, accountNameAr: AC.vatPayable.ar, accountNameEn: AC.vatPayable.en, debitHalalas: 0, creditHalalas: opts.vat, sortOrder: 3 }] : []),
    ]);

    return { invId, jeId, invNum, subtotal: opts.subtotal, vat: opts.vat, total };
  });
}

/**
 * Replicates credit-note/route POST: resolves the revenue account from the
 * original invoice's journal, inserts a type-381 credit-note invoice, and posts
 * the reversing journal (Dr Revenue / Dr VAT / Cr AR). Also flags the original
 * invoice as `credit_noted`.
 */
async function createCreditNote(originalInvoiceId: string, opts: { subtotal: number; vat: number; reason: string }) {
  const db = getTestDb();
  return db.transaction(async (tx) => {
    const now   = new Date();
    const year  = now.getFullYear();
    const today = now.toISOString().split('T')[0]!;

    const [orig] = await tx.select().from(invoices)
      .where(and(eq(invoices.id, originalInvoiceId), eq(invoices.agencyId, AGENCY_ID)));
    if (!orig) throw new Error('original invoice not found');

    const invId  = crypto.randomUUID();
    const jeId   = crypto.randomUUID();
    const invNum = `CN-TEST-${++invSeq}`;
    const jeNum  = await getNextJournalNumber(AGENCY_ID, year, tx as never);

    const subtotal = opts.subtotal;
    const vat      = opts.vat;
    const total    = subtotal + vat;

    // Resolve the original revenue account (mirror the route's selection logic).
    let revenueAc: { code: string; ar: string; en: string } = { code: AC.revenue.code, ar: AC.revenue.ar, en: AC.revenue.en };
    if (orig.journalEntryId) {
      const origLines = await tx.select().from(journalLines).where(eq(journalLines.entryId, orig.journalEntryId));
      const revLine = origLines.find(l =>
        l.creditHalalas > 0 && l.accountCode !== '1120' && l.accountCode !== '2200' &&
        l.accountCode !== '5000' && l.accountCode !== '2000');
      if (revLine) revenueAc = { code: revLine.accountCode, ar: revLine.accountNameAr ?? '', en: revLine.accountNameEn ?? '' };
    }

    await tx.insert(invoices).values({
      id: invId, agencyId: AGENCY_ID, invoiceNumber: invNum, type: '381',
      originalInvoiceId, subtotalHalalas: subtotal, vatHalalas: vat, totalHalalas: total,
      paidHalalas: 0, issueDate: today, status: 'issued',
      notes: opts.reason, journalEntryId: jeId, createdBy: USER_ID,
    });

    const jLines = [
      { id: crypto.randomUUID(), entryId: jeId, agencyId: AGENCY_ID, accountCode: revenueAc.code,    accountNameAr: revenueAc.ar,    accountNameEn: revenueAc.en,    debitHalalas: subtotal, creditHalalas: 0,     sortOrder: 1 },
      ...(vat > 0 ? [{ id: crypto.randomUUID(), entryId: jeId, agencyId: AGENCY_ID, accountCode: AC.vatPayable.code, accountNameAr: AC.vatPayable.ar, accountNameEn: AC.vatPayable.en, debitHalalas: vat, creditHalalas: 0, sortOrder: 2 }] : []),
      { id: crypto.randomUUID(), entryId: jeId, agencyId: AGENCY_ID, accountCode: AC.receivable.code, accountNameAr: AC.receivable.ar, accountNameEn: AC.receivable.en, debitHalalas: 0,        creditHalalas: total, sortOrder: 3 },
    ];
    const totalDr = jLines.reduce((s, l) => s + l.debitHalalas,  0);
    const totalCr = jLines.reduce((s, l) => s + l.creditHalalas, 0);

    await tx.insert(journalEntries).values({
      id: jeId, agencyId: AGENCY_ID, entryNumber: jeNum, date: today,
      descriptionAr: `إشعار دائن ${invNum} — ${opts.reason}`, source: 'invoice', sourceId: invId,
      isPosted: true, totalDebitHalalas: totalDr, totalCreditHalalas: totalCr, createdBy: USER_ID,
    });
    await tx.insert(journalLines).values(jLines);

    // Flag the original invoice (status → credit_noted). The GL entry — NOT a
    // paidHalalas mutation — is what reduces AR, so paidHalalas stays untouched.
    await tx.update(invoices).set({ status: 'credit_noted', updatedAt: now })
      .where(eq(invoices.id, originalInvoiceId));

    return { invId, jeId, invNum };
  });
}

async function lines(jeId: string) {
  const db = getTestDb();
  return db.select().from(journalLines).where(eq(journalLines.entryId, jeId));
}

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

beforeAll(async () => {
  const db = getTestDb();
  await db.insert(agencies).values({
    id: AGENCY_ID, nameAr: 'وكالة اختبار الإشعارات الدائنة',
    nameEn: 'Credit Note Test Agency', subscriptionStatus: 'active', isVatRegistered: true,
  }).onConflictDoNothing();
});

beforeEach(async () => {
  await sql(`DELETE FROM journal_lines   WHERE agency_id = '${AGENCY_ID}'`);
  await sql(`DELETE FROM journal_entries WHERE agency_id = '${AGENCY_ID}'`);
  await sql(`DELETE FROM invoices        WHERE agency_id = '${AGENCY_ID}'`);
});

afterAll(async () => {
  await sql(`DELETE FROM journal_lines   WHERE agency_id = '${AGENCY_ID}'`);
  await sql(`DELETE FROM journal_entries WHERE agency_id = '${AGENCY_ID}'`);
  await sql(`DELETE FROM invoices        WHERE agency_id = '${AGENCY_ID}'`);
  await sql(`DELETE FROM agency_counters WHERE agency_id = '${AGENCY_ID}'`);
  await sql(`DELETE FROM agencies        WHERE id        = '${AGENCY_ID}'`);
  await closeTestDb();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('credit_note — القيد المحاسبي للإشعار الدائن (type 381)', () => {

  it('قيد الإشعار الدائن متوازن (DR = CR)', async () => {
    const orig = await createIssuedInvoice({ subtotal: 10_000_00, vat: 1_500_00 });
    const cn = await createCreditNote(orig.invId, { subtotal: orig.subtotal, vat: orig.vat, reason: 'إلغاء حجز' });

    const db = getTestDb();
    const [entry] = await db.select().from(journalEntries).where(eq(journalEntries.id, cn.jeId));
    expect(entry!.totalDebitHalalas).toBe(entry!.totalCreditHalalas);
    expect(entry!.totalDebitHalalas).toBe(orig.total);

    const ls = await lines(cn.jeId);
    const dr = ls.reduce((s, l) => s + l.debitHalalas,  0);
    const cr = ls.reduce((s, l) => s + l.creditHalalas, 0);
    expect(dr).toBe(cr);
  });

  it('الذمم المدينة (1120) تُجعل دائنة لتخفيض الرصيد', async () => {
    const orig = await createIssuedInvoice({ subtotal: 8_000_00, vat: 1_200_00 });
    const cn = await createCreditNote(orig.invId, { subtotal: orig.subtotal, vat: orig.vat, reason: 'خصم تجاري' });

    const ls = await lines(cn.jeId);
    const arLine = ls.find(l => l.accountCode === '1120')!;
    expect(arLine.creditHalalas).toBe(orig.total);   // AR credited by full total
    expect(arLine.debitHalalas).toBe(0);
  });

  it('الإيراد (4100) يُجعل مديناً لعكس الاعتراف بالإيراد', async () => {
    const orig = await createIssuedInvoice({ subtotal: 6_000_00, vat: 900_00 });
    const cn = await createCreditNote(orig.invId, { subtotal: orig.subtotal, vat: orig.vat, reason: 'استرجاع جزئي' });

    const ls = await lines(cn.jeId);
    const revLine = ls.find(l => l.accountCode === '4100')!;
    expect(revLine.debitHalalas).toBe(orig.subtotal);
    expect(revLine.creditHalalas).toBe(0);

    // VAT payable also debited (reversing output VAT)
    const vatLine = ls.find(l => l.accountCode === '2200')!;
    expect(vatLine.debitHalalas).toBe(orig.vat);
  });

  it('الفاتورة الأصلية تُحدَّث إلى الحالة credit_noted', async () => {
    const orig = await createIssuedInvoice({ subtotal: 5_000_00, vat: 750_00 });
    await createCreditNote(orig.invId, { subtotal: orig.subtotal, vat: orig.vat, reason: 'إلغاء' });

    const db = getTestDb();
    const [updated] = await db.select().from(invoices).where(eq(invoices.id, orig.invId));
    expect(updated!.status).toBe('credit_noted');
  });

  it('لا تخفيض مزدوج للذمم: paidHalalas للفاتورة الأصلية لا يتغير', async () => {
    const orig = await createIssuedInvoice({ subtotal: 7_000_00, vat: 1_050_00 });
    const db = getTestDb();
    const [before] = await db.select().from(invoices).where(eq(invoices.id, orig.invId));
    expect(before!.paidHalalas).toBe(0);

    await createCreditNote(orig.invId, { subtotal: orig.subtotal, vat: orig.vat, reason: 'تعديل' });

    const [after] = await db.select().from(invoices).where(eq(invoices.id, orig.invId));
    // AR is reduced solely via the GL credit line, never by mutating paidHalalas.
    expect(after!.paidHalalas).toBe(0);

    // And the credit note itself records no payment.
    const [cn] = await db.select().from(invoices)
      .where(and(eq(invoices.originalInvoiceId, orig.invId), eq(invoices.type, '381')));
    expect(cn!.paidHalalas).toBe(0);
  });

});
