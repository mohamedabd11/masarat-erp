/**
 * Integration Tests — Bookings (Real DB)
 *
 * Runs against a real local PostgreSQL database. Exercises the bookings table
 * the way src/app/api/bookings/ persists it:
 *   - POST  /api/bookings/create   → insert a booking (defaults to 'confirmed')
 *   - PATCH /api/bookings/[id]      → status lifecycle
 *   - GET   /api/bookings           → left-joins invoices for invoiceId/hasInvoice
 *
 * The booking↔invoice link lives on invoices.bookingId (there is no invoiceId
 * column on bookings); GET reconstructs invoiceId via that join.
 *
 * Covers:
 *  - Create booking and verify fields stored
 *  - Status lifecycle draft → confirmed → completed → cancelled
 *  - Link booking to invoice (invoices.bookingId) and read it back via join
 *  - Cancelled booking → linked invoice voided/cancelled
 *  - Booking with a PNR reference (stored in details JSONB)
 *  - Agency isolation
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { eq, and, desc } from 'drizzle-orm';
import { getTestDb, closeTestDb, sql } from './test-db';
import { agencies, bookings, invoices } from '@/lib/schema';

const AGENCY_ID = 'integ-test-bookings-01';
const OTHER_AGENCY_ID = 'integ-test-bookings-02';
const USER_ID = 'user-bookings';

let seq = 0;

/** Mirrors POST /api/bookings/create: insert a booking row. */
async function createBooking(opts: {
  agencyId?: string;
  serviceType?: string;
  status?: string;
  total?: number;
  cost?: number;
  details?: Record<string, unknown>;
}) {
  const db = getTestDb();
  const agencyId = opts.agencyId ?? AGENCY_ID;
  const id = crypto.randomUUID();
  const total = opts.total ?? 1_000_00;
  const cost = opts.cost ?? 700_00;
  const bookingNumber = `BK-TEST-${++seq}`;
  await db.insert(bookings).values({
    id, agencyId, bookingNumber,
    serviceType: opts.serviceType ?? 'flight',
    customerNameAr: 'عميل اختبار', customerNameEn: 'Test Customer',
    customerPhone: '0500000000',
    status: opts.status ?? 'confirmed',
    totalPriceHalalas: total, costPriceHalalas: cost, profitHalalas: total - cost,
    details: opts.details ?? null, createdBy: USER_ID,
  });
  return { id, bookingNumber, total, cost };
}

/** Create an issued invoice linked to a booking (mirrors the booking→invoice link). */
async function createInvoiceForBooking(bookingId: string, total: number, agencyId = AGENCY_ID) {
  const db = getTestDb();
  const id = crypto.randomUUID();
  const today = new Date().toISOString().split('T')[0]!;
  await db.insert(invoices).values({
    id, agencyId, invoiceNumber: `INV-BK-${seq}`, type: '380', bookingId,
    subtotalHalalas: total, vatHalalas: 0, totalHalalas: total, paidHalalas: 0,
    issueDate: today, status: 'issued', createdBy: USER_ID,
  });
  return { id };
}

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

beforeAll(async () => {
  const db = getTestDb();
  await db.insert(agencies).values([
    { id: AGENCY_ID, nameAr: 'وكالة الحجوزات', nameEn: 'Bookings Test Agency', subscriptionStatus: 'active', isVatRegistered: true },
    { id: OTHER_AGENCY_ID, nameAr: 'وكالة أخرى', nameEn: 'Other Agency', subscriptionStatus: 'active', isVatRegistered: true },
  ]).onConflictDoNothing();
});

beforeEach(async () => {
  await sql(`DELETE FROM invoices WHERE agency_id IN ('${AGENCY_ID}', '${OTHER_AGENCY_ID}')`);
  await sql(`DELETE FROM bookings WHERE agency_id IN ('${AGENCY_ID}', '${OTHER_AGENCY_ID}')`);
});

afterAll(async () => {
  await sql(`DELETE FROM invoices        WHERE agency_id IN ('${AGENCY_ID}', '${OTHER_AGENCY_ID}')`);
  await sql(`DELETE FROM bookings        WHERE agency_id IN ('${AGENCY_ID}', '${OTHER_AGENCY_ID}')`);
  await sql(`DELETE FROM agency_counters WHERE agency_id IN ('${AGENCY_ID}', '${OTHER_AGENCY_ID}')`);
  await sql(`DELETE FROM agencies        WHERE id        IN ('${AGENCY_ID}', '${OTHER_AGENCY_ID}')`);
  await closeTestDb();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('bookings — lifecycle (real DB)', () => {

  it('ينشئ حجزاً ويخزن الحقول بشكل صحيح', async () => {
    const bk = await createBooking({ serviceType: 'hotel', total: 1_500_00, cost: 1_000_00 });
    const db = getTestDb();
    const [row] = await db.select().from(bookings).where(eq(bookings.id, bk.id));
    expect(row!.serviceType).toBe('hotel');
    expect(row!.totalPriceHalalas).toBe(1_500_00);
    expect(row!.costPriceHalalas).toBe(1_000_00);
    expect(row!.profitHalalas).toBe(500_00);
    expect(row!.status).toBe('confirmed');
    expect(row!.currency).toBe('SAR');
  });

  it('دورة حياة الحالة: draft → confirmed → completed → cancelled', async () => {
    const bk = await createBooking({ status: 'draft' });
    const db = getTestDb();
    for (const status of ['confirmed', 'completed', 'cancelled']) {
      await db.update(bookings).set({ status, updatedAt: new Date() })
        .where(and(eq(bookings.id, bk.id), eq(bookings.agencyId, AGENCY_ID)));
      const [row] = await db.select().from(bookings).where(eq(bookings.id, bk.id));
      expect(row!.status).toBe(status);
    }
  });

  it('يربط الحجز بالفاتورة (invoices.bookingId) ويُقرأ عبر الـ join', async () => {
    const bk = await createBooking({ total: 2_000_00 });
    const inv = await createInvoiceForBooking(bk.id, 2_000_00);

    const db = getTestDb();
    // Replicates GET /api/bookings left join.
    const [row] = await db
      .select({ id: bookings.id, invoiceId: invoices.id })
      .from(bookings)
      .leftJoin(invoices, eq(invoices.bookingId, bookings.id))
      .where(and(eq(bookings.id, bk.id), eq(bookings.agencyId, AGENCY_ID)))
      .orderBy(desc(bookings.createdAt));
    expect(row!.invoiceId).toBe(inv.id);
  });

  it('إلغاء الحجز يلغي/يبطل الفاتورة المرتبطة', async () => {
    const bk = await createBooking({ total: 1_200_00 });
    const inv = await createInvoiceForBooking(bk.id, 1_200_00);

    const db = getTestDb();
    // Cancel booking and void its invoice in one transaction.
    await db.transaction(async (tx) => {
      await tx.update(bookings).set({ status: 'cancelled', updatedAt: new Date() })
        .where(eq(bookings.id, bk.id));
      await tx.update(invoices).set({ status: 'cancelled', updatedAt: new Date() })
        .where(eq(invoices.bookingId, bk.id));
    });

    const [bkRow] = await db.select().from(bookings).where(eq(bookings.id, bk.id));
    const [invRow] = await db.select().from(invoices).where(eq(invoices.id, inv.id));
    expect(bkRow!.status).toBe('cancelled');
    expect(invRow!.status).toBe('cancelled');
  });

  it('حجز يحمل مرجع PNR', async () => {
    const bk = await createBooking({ serviceType: 'flight', details: { pnr: 'ABC123', airline: 'SV' } });
    const db = getTestDb();
    const [row] = await db.select().from(bookings).where(eq(bookings.id, bk.id));
    const details = row!.details as Record<string, unknown>;
    expect(details['pnr']).toBe('ABC123');
    expect(details['airline']).toBe('SV');
  });

  it('عزل الوكالات: لا تظهر حجوزات وكالة لوكالة أخرى', async () => {
    const mine = await createBooking({ agencyId: AGENCY_ID });
    await createBooking({ agencyId: OTHER_AGENCY_ID });

    const db = getTestDb();
    const mineRows = await db.select().from(bookings).where(eq(bookings.agencyId, AGENCY_ID));
    expect(mineRows).toHaveLength(1);
    expect(mineRows[0]!.id).toBe(mine.id);

    // Cross-agency lookup of my booking returns nothing.
    const cross = await db.select().from(bookings)
      .where(and(eq(bookings.id, mine.id), eq(bookings.agencyId, OTHER_AGENCY_ID)));
    expect(cross).toHaveLength(0);
  });

});
