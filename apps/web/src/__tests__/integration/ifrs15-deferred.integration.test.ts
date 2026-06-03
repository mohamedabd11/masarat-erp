/**
 * Integration Tests — IFRS 15 Deferred Revenue (Real DB)
 *
 * Replicates the server-side deferred-revenue logic against a real local
 * PostgreSQL database (no HTTP). Source routes:
 *   - src/app/api/invoices/create/route.ts            (defer decision + posting)
 *   - src/app/api/invoices/recognize-revenue/route.ts (recognition posting)
 *
 * Deferral rule (create route): for a deferrable service type
 * (umrah|hajj|package|packages) whose travel date is in the FUTURE, the revenue
 * portion is credited to 3201 Deferred Revenue (not 4100 Travel Services) and
 * invoices.deferred_until is set to the travel date. Otherwise revenue is
 * recognised immediately to 4100.
 *
 * Recognition (recognize-revenue route): once deferred_until has passed and the
 * invoice has not yet been recognised, post Dr 3201 / Cr 4100 for the subtotal
 * and stamp revenue_recognized_at.
 *
 * All journals must satisfy DR = CR.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { eq, and, lte, isNull, isNotNull, ne } from 'drizzle-orm';
import { getTestDb, closeTestDb, sql } from './test-db';
import {
  agencies, invoices, journalEntries, journalLines,
} from '@/lib/schema';
import { getNextInvoiceNumber, getNextJournalNumber } from '@/lib/invoice-counter';
import { GL } from '@/lib/gl-accounts';

const AGENCY_ID = 'integ-test-ifrs15-01';
const USER_ID   = 'user-ifrs15';

const DEFERRABLE_SERVICE_TYPES = new Set(['umrah', 'hajj', 'package', 'packages']);

function today() { return new Date().toISOString().split('T')[0]!; }
function plusDays(n: number) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().split('T')[0]!;
}

/**
 * Replicates invoices/create deferral decision + journal posting for a
 * VAT-registered principal-model invoice. Returns ids and the deferred flag.
 */
async function createInvoice(opts: {
  serviceType: string;
  grandTotal: number;          // VAT-inclusive halalas
  travelDate: string | null;   // YYYY-MM-DD
  isVatRegistered?: boolean;
}) {
  const db = getTestDb();
  const isVatRegistered = opts.isVatRegistered ?? true;
  const vatRate = 0.15;

  let subtotalExclVat: number;
  let totalVat: number;
  if (!isVatRegistered) {
    subtotalExclVat = opts.grandTotal;
    totalVat = 0;
  } else {
    subtotalExclVat = Math.round(opts.grandTotal / (1 + vatRate));
    totalVat = opts.grandTotal - subtotalExclVat;
  }

  const t = today();
  const isDeferrable   = DEFERRABLE_SERVICE_TYPES.has(opts.serviceType);
  const isFutureTravel = opts.travelDate != null && opts.travelDate > t;
  const deferRevenue   = isDeferrable && isFutureTravel;

  const revenueAccount = deferRevenue ? GL.deferredRevenue : GL.revenuePrincipal;

  type JL = { code: string; ar: string; en: string; dr: number; cr: number };
  const ar = (ac: { code: string; ar: string; en: string }, dr: number, cr: number): JL => ({ code: ac.code, ar: ac.ar, en: ac.en, dr, cr });
  const jLines: JL[] = isVatRegistered && totalVat > 0
    ? [ar(GL.receivable, opts.grandTotal, 0), ar(revenueAccount, 0, subtotalExclVat), ar(GL.vatPayable, 0, totalVat)]
    : [ar(GL.receivable, opts.grandTotal, 0), ar(revenueAccount, 0, opts.grandTotal)];

  return db.transaction(async (tx) => {
    const year = Number(t.slice(0, 4));
    const invoiceNumber = await getNextInvoiceNumber(AGENCY_ID, 'taxInvoice', year, tx as never);
    const jeNumber      = await getNextJournalNumber(AGENCY_ID, year, tx as never);
    const invoiceId = crypto.randomUUID();
    const jeId      = crypto.randomUUID();

    await tx.insert(invoices).values({
      id: invoiceId, agencyId: AGENCY_ID, invoiceNumber, type: '380',
      subtotalHalalas: subtotalExclVat, vatHalalas: totalVat, totalHalalas: opts.grandTotal,
      paidHalalas: 0, issueDate: t, status: 'issued',
      deferredUntil: deferRevenue ? opts.travelDate : null,
      isEInvoice: isVatRegistered, journalEntryId: jeId, createdBy: USER_ID,
    });

    await tx.insert(journalEntries).values({
      id: jeId, agencyId: AGENCY_ID, entryNumber: jeNumber, date: t,
      descriptionAr: `فاتورة ${invoiceNumber}`, source: 'invoice', sourceId: invoiceId,
      serviceType: opts.serviceType, isPosted: true,
      totalDebitHalalas: jLines.reduce((s, l) => s + l.dr, 0),
      totalCreditHalalas: jLines.reduce((s, l) => s + l.cr, 0),
      createdBy: USER_ID,
    });
    for (let i = 0; i < jLines.length; i++) {
      const l = jLines[i]!;
      await tx.insert(journalLines).values({
        id: crypto.randomUUID(), entryId: jeId, agencyId: AGENCY_ID,
        accountCode: l.code, accountNameAr: l.ar, accountNameEn: l.en,
        debitHalalas: l.dr, creditHalalas: l.cr, sortOrder: i + 1,
      });
    }
    return { invoiceId, jeId, deferRevenue, subtotalExclVat, totalVat };
  });
}

/** Replicates invoices/recognize-revenue for all due deferred invoices. */
async function recognizeRevenue() {
  const db = getTestDb();
  const t = today();
  const due = await db.select({
    id: invoices.id, invoiceNumber: invoices.invoiceNumber, subtotalHalalas: invoices.subtotalHalalas,
  })
    .from(invoices)
    .where(and(
      eq(invoices.agencyId, AGENCY_ID),
      isNotNull(invoices.deferredUntil),
      lte(invoices.deferredUntil, t),
      isNull(invoices.revenueRecognizedAt),
      ne(invoices.status, 'cancelled'),
    ));

  const recognized: Array<{ id: string; jeId: string; amount: number }> = [];
  await db.transaction(async (tx) => {
    const year = Number(t.slice(0, 4));
    for (const inv of due) {
      const amount = inv.subtotalHalalas;
      if (amount <= 0) {
        await tx.update(invoices).set({ revenueRecognizedAt: t, updatedAt: new Date() }).where(eq(invoices.id, inv.id));
        continue;
      }
      const jeId = crypto.randomUUID();
      const jeNumber = await getNextJournalNumber(AGENCY_ID, year, tx as never);
      await tx.insert(journalEntries).values({
        id: jeId, agencyId: AGENCY_ID, entryNumber: jeNumber, date: t,
        descriptionAr: `إثبات إيراد مؤجل - ${inv.invoiceNumber}`, source: 'invoice', sourceId: inv.id,
        isPosted: true, totalDebitHalalas: amount, totalCreditHalalas: amount, createdBy: USER_ID,
      });
      const lines = [
        { ac: GL.deferredRevenue,  dr: amount, cr: 0 },
        { ac: GL.revenuePrincipal, dr: 0,      cr: amount },
      ];
      for (let i = 0; i < lines.length; i++) {
        const l = lines[i]!;
        await tx.insert(journalLines).values({
          id: crypto.randomUUID(), entryId: jeId, agencyId: AGENCY_ID,
          accountCode: l.ac.code, accountNameAr: l.ac.ar, accountNameEn: l.ac.en,
          debitHalalas: l.dr, creditHalalas: l.cr, sortOrder: i + 1,
        });
      }
      await tx.update(invoices).set({ revenueRecognizedAt: t, updatedAt: new Date() }).where(eq(invoices.id, inv.id));
      recognized.push({ id: inv.id, jeId, amount });
    }
  });
  return recognized;
}

async function lines(jeId: string) {
  const db = getTestDb();
  return db.select().from(journalLines).where(eq(journalLines.entryId, jeId));
}

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

beforeAll(async () => {
  const db = getTestDb();
  await db.insert(agencies).values({
    id: AGENCY_ID, nameAr: 'وكالة اختبار الإيراد المؤجل',
    nameEn: 'IFRS15 Test Agency', subscriptionStatus: 'active', isVatRegistered: true,
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

describe('IFRS 15 — فاتورة بتاريخ سفر مستقبلي → إيراد مؤجل (3201)', () => {

  it('عمرة بتاريخ سفر مستقبلي → الإيراد يُسجَّل في 3201 وليس 4100', async () => {
    const r = await createInvoice({ serviceType: 'umrah', grandTotal: 115_000, travelDate: plusDays(30) });
    expect(r.deferRevenue).toBe(true);

    const ls = await lines(r.jeId);
    const deferred = ls.find(l => l.accountCode === '3201');
    const revenue  = ls.find(l => l.accountCode === '4100');
    expect(deferred).toBeDefined();
    expect(deferred!.creditHalalas).toBe(r.subtotalExclVat);
    expect(revenue).toBeUndefined();
  });

  it('deferred_until يُضبط على تاريخ السفر ويُمكن الاستعلام عنه', async () => {
    const travel = plusDays(45);
    const r = await createInvoice({ serviceType: 'hajj', grandTotal: 230_000, travelDate: travel });
    const db = getTestDb();
    const [inv] = await db.select().from(invoices).where(eq(invoices.id, r.invoiceId));
    expect(inv!.deferredUntil).toBe(travel);
    expect(inv!.revenueRecognizedAt).toBeNull();
  });

  it('قيد الفاتورة المؤجلة متوازن (DR = CR)', async () => {
    const r = await createInvoice({ serviceType: 'package', grandTotal: 115_000, travelDate: plusDays(10) });
    const ls = await lines(r.jeId);
    const dr = ls.reduce((s, l) => s + l.debitHalalas, 0);
    const cr = ls.reduce((s, l) => s + l.creditHalalas, 0);
    expect(dr).toBe(cr);
  });
});

describe('IFRS 15 — فاتورة فورية → إيراد مباشر (4100)', () => {

  it('سفر بتاريخ اليوم → الإيراد يُسجَّل مباشرة في 4100 وليس 3201', async () => {
    const r = await createInvoice({ serviceType: 'umrah', grandTotal: 115_000, travelDate: today() });
    expect(r.deferRevenue).toBe(false);

    const ls = await lines(r.jeId);
    expect(ls.find(l => l.accountCode === '4100')).toBeDefined();
    expect(ls.find(l => l.accountCode === '3201')).toBeUndefined();

    const db = getTestDb();
    const [inv] = await db.select().from(invoices).where(eq(invoices.id, r.invoiceId));
    expect(inv!.deferredUntil).toBeNull();
  });

  it('سفر بتاريخ ماضٍ → الإيراد مباشر في 4100', async () => {
    const r = await createInvoice({ serviceType: 'hajj', grandTotal: 115_000, travelDate: plusDays(-5) });
    expect(r.deferRevenue).toBe(false);
    const ls = await lines(r.jeId);
    expect(ls.find(l => l.accountCode === '4100')).toBeDefined();
    expect(ls.find(l => l.accountCode === '3201')).toBeUndefined();
  });

  it('نوع خدمة غير مؤجَّل (طيران) بتاريخ مستقبلي → إيراد مباشر في 4100', async () => {
    const r = await createInvoice({ serviceType: 'flight', grandTotal: 115_000, travelDate: plusDays(30) });
    expect(r.deferRevenue).toBe(false);
    const ls = await lines(r.jeId);
    expect(ls.find(l => l.accountCode === '4100')).toBeDefined();
    expect(ls.find(l => l.accountCode === '3201')).toBeUndefined();
  });
});

describe('IFRS 15 — إثبات الإيراد المؤجل عند حلول التاريخ', () => {

  it('عند تمرير تاريخ ماضٍ كـ deferred_until → الإثبات يُنشئ Dr 3201 / Cr 4100', async () => {
    // Create a deferrable invoice whose deferred_until is already in the past so
    // it is immediately eligible for recognition.
    const past = plusDays(-1);
    const created = await createInvoice({ serviceType: 'umrah', grandTotal: 115_000, travelDate: past });
    // Force the deferred path by stamping deferred_until directly (past-dated
    // create takes the immediate path, so we set the field to simulate a
    // previously-deferred invoice that has now matured).
    const db = getTestDb();
    await db.update(invoices)
      .set({ deferredUntil: past, revenueRecognizedAt: null })
      .where(eq(invoices.id, created.invoiceId));

    const recognized = await recognizeRevenue();
    expect(recognized.length).toBe(1);

    const ls = await lines(recognized[0]!.jeId);
    const dr = ls.find(l => l.accountCode === '3201')!;
    const cr = ls.find(l => l.accountCode === '4100')!;
    expect(dr.debitHalalas).toBe(created.subtotalExclVat);
    expect(cr.creditHalalas).toBe(created.subtotalExclVat);

    const totalDr = ls.reduce((s, l) => s + l.debitHalalas, 0);
    const totalCr = ls.reduce((s, l) => s + l.creditHalalas, 0);
    expect(totalDr).toBe(totalCr);

    const [inv] = await db.select().from(invoices).where(eq(invoices.id, created.invoiceId));
    expect(inv!.revenueRecognizedAt).toBe(today());
  });

  it('الفاتورة المؤجلة لتاريخ مستقبلي لا تُثبَّت بعد', async () => {
    await createInvoice({ serviceType: 'umrah', grandTotal: 115_000, travelDate: plusDays(60) });
    const recognized = await recognizeRevenue();
    expect(recognized.length).toBe(0);
  });

  it('إعادة تشغيل الإثبات لا تُكرِّر القيد (idempotent)', async () => {
    const past = plusDays(-2);
    const created = await createInvoice({ serviceType: 'package', grandTotal: 115_000, travelDate: past });
    const db = getTestDb();
    await db.update(invoices).set({ deferredUntil: past, revenueRecognizedAt: null }).where(eq(invoices.id, created.invoiceId));

    const first  = await recognizeRevenue();
    const second = await recognizeRevenue();
    expect(first.length).toBe(1);
    expect(second.length).toBe(0);
  });
});
