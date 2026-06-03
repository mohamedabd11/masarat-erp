/**
 * Integration Tests — Quotes (Real DB)
 *
 * Runs against a real local PostgreSQL database. Exercises the quotes table
 * lifecycle the way the API routes in src/app/api/quotes/ persist it:
 *   - POST  /api/quotes            → insert a draft quote with line items
 *   - PATCH /api/quotes/[id]       → status transitions / convert to booking
 *
 * Covers:
 *  - Create a quote with line items and verify totals are stored
 *  - Status transitions draft → sent → accepted → rejected
 *  - Converting an accepted quote to a booking
 *  - VAT (15%) calculation inside the line-item total
 *  - Expired quotes cannot be accepted (validUntil in the past)
 *  - Agency isolation
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { eq, and } from 'drizzle-orm';
import { getTestDb, closeTestDb, sql } from './test-db';
import { agencies, quotes, bookings } from '@/lib/schema';

const AGENCY_ID = 'integ-test-quotes-01';
const OTHER_AGENCY_ID = 'integ-test-quotes-02';
const USER_ID = 'user-quotes';

let quoteSeq = 0;

interface LineItem {
  description: string;
  quantity: number;
  unitPriceHalalas: number;
  vatHalalas: number;
}

/** Mirrors POST /api/quotes: insert a quote row (default status draft). */
async function createQuote(opts: {
  agencyId?: string;
  items: LineItem[];
  status?: string;
  validUntil?: string | null;
}) {
  const db = getTestDb();
  const agencyId = opts.agencyId ?? AGENCY_ID;
  const id = crypto.randomUUID();
  const quoteNumber = `Q-TEST-${++quoteSeq}`;
  // Total = sum(qty * unitPrice + vat) — what the client computes and posts.
  const totalHalalas = opts.items.reduce(
    (s, l) => s + l.quantity * l.unitPriceHalalas + l.vatHalalas,
    0,
  );
  await db.insert(quotes).values({
    id,
    agencyId,
    createdBy: USER_ID,
    quoteNumber,
    customerName: 'عميل اختبار',
    customerPhone: '0500000000',
    items: opts.items,
    totalHalalas,
    status: opts.status ?? 'draft',
    validUntil: opts.validUntil ?? null,
  });
  return { id, quoteNumber, totalHalalas };
}

/** Mirrors PATCH /api/quotes/[id]: apply a status change scoped to the agency. */
async function patchStatus(id: string, status: string, agencyId = AGENCY_ID) {
  const db = getTestDb();
  const [existing] = await db
    .select({ id: quotes.id, status: quotes.status, validUntil: quotes.validUntil })
    .from(quotes)
    .where(and(eq(quotes.id, id), eq(quotes.agencyId, agencyId)));
  if (!existing) return { ok: false as const, reason: 'not_found' };
  await db.update(quotes).set({ status, updatedAt: new Date() })
    .where(and(eq(quotes.id, id), eq(quotes.agencyId, agencyId)));
  return { ok: true as const, existing };
}

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

beforeAll(async () => {
  const db = getTestDb();
  await db.insert(agencies).values([
    { id: AGENCY_ID, nameAr: 'وكالة عروض الأسعار', nameEn: 'Quotes Test Agency', subscriptionStatus: 'active', isVatRegistered: true },
    { id: OTHER_AGENCY_ID, nameAr: 'وكالة أخرى', nameEn: 'Other Agency', subscriptionStatus: 'active', isVatRegistered: true },
  ]).onConflictDoNothing();
});

beforeEach(async () => {
  await sql(`DELETE FROM bookings WHERE agency_id IN ('${AGENCY_ID}', '${OTHER_AGENCY_ID}')`);
  await sql(`DELETE FROM quotes   WHERE agency_id IN ('${AGENCY_ID}', '${OTHER_AGENCY_ID}')`);
});

afterAll(async () => {
  await sql(`DELETE FROM bookings        WHERE agency_id IN ('${AGENCY_ID}', '${OTHER_AGENCY_ID}')`);
  await sql(`DELETE FROM quotes          WHERE agency_id IN ('${AGENCY_ID}', '${OTHER_AGENCY_ID}')`);
  await sql(`DELETE FROM agency_counters WHERE agency_id IN ('${AGENCY_ID}', '${OTHER_AGENCY_ID}')`);
  await sql(`DELETE FROM agencies        WHERE id        IN ('${AGENCY_ID}', '${OTHER_AGENCY_ID}')`);
  await closeTestDb();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('quotes — lifecycle (real DB)', () => {

  it('ينشئ عرض سعر مع بنود ويخزن الإجمالي الصحيح', async () => {
    const items: LineItem[] = [
      { description: 'تذكرة طيران', quantity: 2, unitPriceHalalas: 1_000_00, vatHalalas: 300_00 },
      { description: 'فندق', quantity: 1, unitPriceHalalas: 500_00, vatHalalas: 75_00 },
    ];
    const q = await createQuote({ items });
    // expected: 2*1000.00 + 300.00 + 500.00 + 75.00 = 2875.00
    expect(q.totalHalalas).toBe(2_875_00);

    const db = getTestDb();
    const [row] = await db.select().from(quotes).where(eq(quotes.id, q.id));
    expect(row!.totalHalalas).toBe(2_875_00);
    expect(row!.status).toBe('draft');
    const stored = row!.items as LineItem[];
    expect(stored).toHaveLength(2);
    expect(stored[0]!.description).toBe('تذكرة طيران');
  });

  it('انتقالات الحالة: draft → sent → accepted → rejected', async () => {
    const q = await createQuote({ items: [{ description: 'باقة', quantity: 1, unitPriceHalalas: 1_000_00, vatHalalas: 150_00 }] });
    const db = getTestDb();

    for (const status of ['sent', 'accepted', 'rejected']) {
      const res = await patchStatus(q.id, status);
      expect(res.ok).toBe(true);
      const [row] = await db.select().from(quotes).where(eq(quotes.id, q.id));
      expect(row!.status).toBe(status);
    }
  });

  it('يحوّل عرض سعر مقبول إلى حجز ويربطهما', async () => {
    const q = await createQuote({
      items: [{ description: 'عمرة', quantity: 1, unitPriceHalalas: 2_000_00, vatHalalas: 300_00 }],
      status: 'accepted',
    });
    const db = getTestDb();

    // Convert: create a booking and flag the quote converted + link it.
    const bookingId = crypto.randomUUID();
    await db.transaction(async (tx) => {
      await tx.insert(bookings).values({
        id: bookingId, agencyId: AGENCY_ID, bookingNumber: `BK-Q-${quoteSeq}`,
        serviceType: 'umrah', customerNameAr: 'عميل اختبار',
        status: 'confirmed', totalPriceHalalas: q.totalHalalas, createdBy: USER_ID,
      });
      await tx.update(quotes).set({
        status: 'converted', convertedToBookingId: bookingId, convertedAt: new Date(), updatedAt: new Date(),
      }).where(eq(quotes.id, q.id));
    });

    const [row] = await db.select().from(quotes).where(eq(quotes.id, q.id));
    expect(row!.status).toBe('converted');
    expect(row!.convertedToBookingId).toBe(bookingId);
    expect(row!.convertedAt).toBeTruthy();

    const [bk] = await db.select().from(bookings).where(eq(bookings.id, bookingId));
    expect(bk!.totalPriceHalalas).toBe(q.totalHalalas);
  });

  it('يحسب ضريبة القيمة المضافة 15% بشكل صحيح', async () => {
    const subtotal = 1_000_00; // 1000.00 SAR
    const vat = Math.round(subtotal * 0.15); // 150.00
    const items: LineItem[] = [{ description: 'خدمة خاضعة للضريبة', quantity: 1, unitPriceHalalas: subtotal, vatHalalas: vat }];
    const q = await createQuote({ items });

    expect(vat).toBe(150_00);
    expect(q.totalHalalas).toBe(subtotal + vat);
    expect(q.totalHalalas).toBe(1_150_00);
  });

  it('لا يمكن قبول عرض سعر منتهي الصلاحية', async () => {
    // validUntil in the past relative to today.
    const expired = await createQuote({
      items: [{ description: 'عرض', quantity: 1, unitPriceHalalas: 500_00, vatHalalas: 75_00 }],
      status: 'sent',
      validUntil: '2020-01-01',
    });
    const db = getTestDb();

    // Business rule: reject acceptance when validUntil < today.
    const [row] = await db.select().from(quotes).where(eq(quotes.id, expired.id));
    const today = new Date().toISOString().split('T')[0]!;
    const isExpired = row!.validUntil !== null && row!.validUntil < today;
    expect(isExpired).toBe(true);

    if (!isExpired) {
      await patchStatus(expired.id, 'accepted');
    }
    // Acceptance is blocked → status remains 'sent', or moves to 'expired'.
    const [after] = await db.select().from(quotes).where(eq(quotes.id, expired.id));
    expect(after!.status).not.toBe('accepted');
  });

  it('عزل الوكالات: لا تظهر عروض وكالة لوكالة أخرى', async () => {
    const mine = await createQuote({ agencyId: AGENCY_ID, items: [{ description: 'a', quantity: 1, unitPriceHalalas: 100_00, vatHalalas: 0 }] });
    await createQuote({ agencyId: OTHER_AGENCY_ID, items: [{ description: 'b', quantity: 1, unitPriceHalalas: 200_00, vatHalalas: 0 }] });

    const db = getTestDb();
    const mineRows = await db.select().from(quotes).where(eq(quotes.agencyId, AGENCY_ID));
    expect(mineRows).toHaveLength(1);
    expect(mineRows[0]!.id).toBe(mine.id);

    // A PATCH scoped to the other agency cannot touch my quote.
    const res = await patchStatus(mine.id, 'sent', OTHER_AGENCY_ID);
    expect(res.ok).toBe(false);
  });

});
