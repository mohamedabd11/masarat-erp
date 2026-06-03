/**
 * Integration Tests — Cheques (Real DB)
 *
 * Runs against a real local PostgreSQL database. Replicates the GL logic from
 * src/app/api/cheques/route.ts (POST) and src/app/api/cheques/[id]/route.ts
 * (PATCH) directly against Drizzle, then verifies the journal invariants.
 *
 * NOTE on accounts — these tests follow the *actual* route implementation:
 *   - Issue incoming cheque : Dr Cheques Receivable (1125) / Cr Accounts Receivable (1120)
 *       (the route credits AR — i.e. it transfers an existing receivable into a
 *        cheque-receivable, it does NOT credit a revenue account)
 *   - Clear cheque          : Dr Bank (1110)               / Cr Cheques Receivable (1125)
 *   - Bounce cheque         : Dr Accounts Receivable (1120)/ Cr Cheques Receivable (1125)
 *       (the route reverses the receivable transfer back to AR; it does NOT touch
 *        Bank or a Bank-Discrepancy expense (5510), since funds never hit the bank
 *        for a cheque that bounces before clearing)
 *
 * Verifies:
 *  - Issue GL (1125 Dr / 1120 Cr)
 *  - Clear GL (1110 Dr / 1125 Cr)
 *  - Bounce GL (1120 Dr / 1125 Cr)
 *  - Overdue cheques can be queried by dueDate
 *  - Status transitions pending → cleared, pending → bounced
 *  - DR = CR invariant for every posted entry
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { eq, and, lt } from 'drizzle-orm';
import { getTestDb, closeTestDb, sql } from './test-db';
import { agencies, cheques, journalEntries, journalLines } from '@/lib/schema';
import { getNextJournalNumber } from '@/lib/invoice-counter';

const AGENCY_ID = 'integ-test-cheques-01';
const USER_ID = 'user-cheques';

const AC_RECEIVABLE = { code: '1120', ar: 'ذمم مدينة - عملاء', en: 'Accounts Receivable' };
const AC_CHEQUES_RCV = { code: '1125', ar: 'أوراق قبض - شيكات', en: 'Cheques Receivable' };
const AC_BANK = { code: '1110', ar: 'البنك', en: 'Bank' };

let seq = 0;

/** Mirrors POST /api/cheques for an incoming cheque (Dr 1125 / Cr 1120). */
async function issueIncomingCheque(opts: { amount: number; dueDate?: string }) {
  const db = getTestDb();
  const id = crypto.randomUUID();
  const chequeNumber = `CHQ-TEST-${++seq}`;
  return db.transaction(async (tx) => {
    await tx.insert(cheques).values({
      id, agencyId: AGENCY_ID, chequeNumber, bankName: 'الراجحي',
      amountHalalas: opts.amount, type: 'incoming', status: 'pending',
      dueDate: opts.dueDate ?? null, payerName: 'عميل',
    });

    const now = new Date();
    const year = now.getFullYear();
    const today = now.toISOString().split('T')[0]!;
    const jeId = crypto.randomUUID();
    const jeNum = await getNextJournalNumber(AGENCY_ID, year, tx as never);

    await tx.insert(journalEntries).values({
      id: jeId, agencyId: AGENCY_ID, entryNumber: jeNum, date: today,
      descriptionAr: `استلام شيك ${chequeNumber}`, descriptionEn: `Cheque received ${chequeNumber}`,
      source: 'cheque', sourceId: id, isPosted: true,
      totalDebitHalalas: opts.amount, totalCreditHalalas: opts.amount, createdBy: USER_ID,
    });
    await tx.insert(journalLines).values([
      { id: crypto.randomUUID(), entryId: jeId, agencyId: AGENCY_ID, accountCode: AC_CHEQUES_RCV.code, accountNameAr: AC_CHEQUES_RCV.ar, accountNameEn: AC_CHEQUES_RCV.en, debitHalalas: opts.amount, creditHalalas: 0, sortOrder: 1 },
      { id: crypto.randomUUID(), entryId: jeId, agencyId: AGENCY_ID, accountCode: AC_RECEIVABLE.code, accountNameAr: AC_RECEIVABLE.ar, accountNameEn: AC_RECEIVABLE.en, debitHalalas: 0, creditHalalas: opts.amount, sortOrder: 2 },
    ]);

    return { chequeId: id, chequeNumber, jeId, amount: opts.amount };
  });
}

/** Mirrors PATCH /api/cheques/[id]: set status and post the cleared/bounced GL. */
async function transition(chequeId: string, newStatus: 'cleared' | 'bounced') {
  const db = getTestDb();
  return db.transaction(async (tx) => {
    const [existing] = await tx.select().from(cheques)
      .where(and(eq(cheques.id, chequeId), eq(cheques.agencyId, AGENCY_ID)));
    if (!existing) throw new Error('cheque not found');

    await tx.update(cheques).set({ status: newStatus, updatedAt: new Date() })
      .where(eq(cheques.id, chequeId));

    const now = new Date();
    const year = now.getFullYear();
    const today = now.toISOString().split('T')[0]!;
    const jeId = crypto.randomUUID();
    const jeNum = await getNextJournalNumber(AGENCY_ID, year, tx as never);
    const amt = existing.amountHalalas;

    if (newStatus === 'cleared') {
      await tx.insert(journalEntries).values({
        id: jeId, agencyId: AGENCY_ID, entryNumber: jeNum, date: today,
        descriptionAr: `تحصيل شيك ${existing.chequeNumber}`, descriptionEn: `Cheque cleared ${existing.chequeNumber}`,
        source: 'cheque', sourceId: existing.id, isPosted: true,
        totalDebitHalalas: amt, totalCreditHalalas: amt, createdBy: USER_ID,
      });
      await tx.insert(journalLines).values([
        { id: crypto.randomUUID(), entryId: jeId, agencyId: AGENCY_ID, accountCode: AC_BANK.code, accountNameAr: AC_BANK.ar, accountNameEn: AC_BANK.en, debitHalalas: amt, creditHalalas: 0, sortOrder: 1 },
        { id: crypto.randomUUID(), entryId: jeId, agencyId: AGENCY_ID, accountCode: AC_CHEQUES_RCV.code, accountNameAr: AC_CHEQUES_RCV.ar, accountNameEn: AC_CHEQUES_RCV.en, debitHalalas: 0, creditHalalas: amt, sortOrder: 2 },
      ]);
    } else {
      await tx.insert(journalEntries).values({
        id: jeId, agencyId: AGENCY_ID, entryNumber: jeNum, date: today,
        descriptionAr: `شيك مرتجع ${existing.chequeNumber}`, descriptionEn: `Cheque bounced ${existing.chequeNumber}`,
        source: 'cheque', sourceId: existing.id, isPosted: true,
        totalDebitHalalas: amt, totalCreditHalalas: amt, createdBy: USER_ID,
      });
      await tx.insert(journalLines).values([
        { id: crypto.randomUUID(), entryId: jeId, agencyId: AGENCY_ID, accountCode: AC_RECEIVABLE.code, accountNameAr: AC_RECEIVABLE.ar, accountNameEn: AC_RECEIVABLE.en, debitHalalas: amt, creditHalalas: 0, sortOrder: 1 },
        { id: crypto.randomUUID(), entryId: jeId, agencyId: AGENCY_ID, accountCode: AC_CHEQUES_RCV.code, accountNameAr: AC_CHEQUES_RCV.ar, accountNameEn: AC_CHEQUES_RCV.en, debitHalalas: 0, creditHalalas: amt, sortOrder: 2 },
      ]);
    }
    return { jeId, amount: amt };
  });
}

async function lines(jeId: string) {
  const db = getTestDb();
  return db.select().from(journalLines).where(eq(journalLines.entryId, jeId));
}

function assertBalanced(ls: { debitHalalas: number; creditHalalas: number }[]) {
  const dr = ls.reduce((s, l) => s + l.debitHalalas, 0);
  const cr = ls.reduce((s, l) => s + l.creditHalalas, 0);
  expect(dr).toBe(cr);
  return { dr, cr };
}

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

beforeAll(async () => {
  const db = getTestDb();
  await db.insert(agencies).values({
    id: AGENCY_ID, nameAr: 'وكالة الشيكات', nameEn: 'Cheques Test Agency',
    subscriptionStatus: 'active', isVatRegistered: true,
  }).onConflictDoNothing();
});

beforeEach(async () => {
  await sql(`DELETE FROM journal_lines   WHERE agency_id = '${AGENCY_ID}'`);
  await sql(`DELETE FROM journal_entries WHERE agency_id = '${AGENCY_ID}'`);
  await sql(`DELETE FROM cheques         WHERE agency_id = '${AGENCY_ID}'`);
});

afterAll(async () => {
  await sql(`DELETE FROM journal_lines   WHERE agency_id = '${AGENCY_ID}'`);
  await sql(`DELETE FROM journal_entries WHERE agency_id = '${AGENCY_ID}'`);
  await sql(`DELETE FROM cheques         WHERE agency_id = '${AGENCY_ID}'`);
  await sql(`DELETE FROM agency_counters WHERE agency_id = '${AGENCY_ID}'`);
  await sql(`DELETE FROM agencies        WHERE id        = '${AGENCY_ID}'`);
  await closeTestDb();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('cheques — GL & lifecycle (real DB)', () => {

  it('إصدار شيك وارد: مدين 1125 / دائن 1120 — والقيد متوازن', async () => {
    const chq = await issueIncomingCheque({ amount: 5_000_00 });
    const ls = await lines(chq.jeId);
    assertBalanced(ls);

    const drLine = ls.find(l => l.accountCode === AC_CHEQUES_RCV.code)!;
    const crLine = ls.find(l => l.accountCode === AC_RECEIVABLE.code)!;
    expect(drLine.debitHalalas).toBe(5_000_00);
    expect(drLine.creditHalalas).toBe(0);
    expect(crLine.creditHalalas).toBe(5_000_00);
    expect(crLine.debitHalalas).toBe(0);
  });

  it('تحصيل شيك (وصول للبنك): مدين 1110 / دائن 1125 — والقيد متوازن', async () => {
    const chq = await issueIncomingCheque({ amount: 3_000_00 });
    const t = await transition(chq.chequeId, 'cleared');
    const ls = await lines(t.jeId);
    assertBalanced(ls);

    const bankLine = ls.find(l => l.accountCode === AC_BANK.code)!;
    const chqLine = ls.find(l => l.accountCode === AC_CHEQUES_RCV.code)!;
    expect(bankLine.debitHalalas).toBe(3_000_00);
    expect(chqLine.creditHalalas).toBe(3_000_00);

    const db = getTestDb();
    const [row] = await db.select().from(cheques).where(eq(cheques.id, chq.chequeId));
    expect(row!.status).toBe('cleared');
  });

  it('شيك مرتجع: مدين 1120 / دائن 1125 — والقيد متوازن', async () => {
    const chq = await issueIncomingCheque({ amount: 2_500_00 });
    const t = await transition(chq.chequeId, 'bounced');
    const ls = await lines(t.jeId);
    assertBalanced(ls);

    const arLine = ls.find(l => l.accountCode === AC_RECEIVABLE.code)!;
    const chqLine = ls.find(l => l.accountCode === AC_CHEQUES_RCV.code)!;
    expect(arLine.debitHalalas).toBe(2_500_00);
    expect(chqLine.creditHalalas).toBe(2_500_00);
    // Route does not touch Bank (1110) for a pre-clearing bounce.
    expect(ls.find(l => l.accountCode === AC_BANK.code)).toBeUndefined();

    const db = getTestDb();
    const [row] = await db.select().from(cheques).where(eq(cheques.id, chq.chequeId));
    expect(row!.status).toBe('bounced');
  });

  it('تتبع تاريخ الاستحقاق: يمكن الاستعلام عن الشيكات المتأخرة', async () => {
    await issueIncomingCheque({ amount: 1_000_00, dueDate: '2020-01-01' }); // overdue
    await issueIncomingCheque({ amount: 1_000_00, dueDate: '2099-12-31' }); // future

    const db = getTestDb();
    const today = new Date().toISOString().split('T')[0]!;
    const overdue = await db.select().from(cheques)
      .where(and(
        eq(cheques.agencyId, AGENCY_ID),
        eq(cheques.status, 'pending'),
        lt(cheques.dueDate, today),
      ));
    expect(overdue).toHaveLength(1);
    expect(overdue[0]!.dueDate).toBe('2020-01-01');
  });

  it('الحالة: pending → cleared', async () => {
    const chq = await issueIncomingCheque({ amount: 800_00 });
    const db = getTestDb();
    let [row] = await db.select().from(cheques).where(eq(cheques.id, chq.chequeId));
    expect(row!.status).toBe('pending');
    await transition(chq.chequeId, 'cleared');
    [row] = await db.select().from(cheques).where(eq(cheques.id, chq.chequeId));
    expect(row!.status).toBe('cleared');
  });

  it('ثبات المساواة (DR=CR) لكل قيود الإصدار والتحصيل والارتجاع', async () => {
    const a = await issueIncomingCheque({ amount: 1_111_00 });
    const cleared = await transition(a.chequeId, 'cleared');
    const b = await issueIncomingCheque({ amount: 2_222_00 });
    const bounced = await transition(b.chequeId, 'bounced');

    for (const jeId of [a.jeId, cleared.jeId, b.jeId, bounced.jeId]) {
      const ls = await lines(jeId);
      assertBalanced(ls);
    }
  });

});
