/**
 * Canonical financial layer for booking_lines.
 *
 * All financial totals on the bookings table are DERIVED values — they must
 * be kept in sync with booking_lines whenever lines are created or changed.
 *
 * Rule: IF financial calculation needed → use booking_lines.
 *       IF booking.totalPriceHalalas is read → it was derived from booking_lines.
 *
 * Call syncBookingTotalsFromLines() inside a transaction whenever non-legacy
 * lines are added, updated, or cancelled on a booking.
 */
import { eq, and } from 'drizzle-orm';
import { bookings, bookingLines } from '@/lib/schema';
import type { db as DbType } from '@/lib/db';

type Tx = Parameters<Parameters<typeof DbType.transaction>[0]>[0];

/**
 * Recomputes booking.totalPriceHalalas, costPriceHalalas, and profitHalalas
 * from the active non-legacy booking_lines and writes them back to the booking.
 *
 * If no non-legacy active lines exist (legacy-only booking), the booking
 * totals are left unchanged to preserve historical accuracy.
 */
export async function syncBookingTotalsFromLines(
  bookingId: string,
  agencyId: string,
  tx: Tx,
): Promise<void> {
  const activeLines = await tx.select({
    totalPriceExclVatHalalas: bookingLines.totalPriceExclVatHalalas,
    vatHalalas:               bookingLines.vatHalalas,
    totalCostHalalas:         bookingLines.totalCostHalalas,
  })
  .from(bookingLines)
  .where(and(
    eq(bookingLines.bookingId, bookingId),
    eq(bookingLines.agencyId,  agencyId),
    eq(bookingLines.status,    'active'),
    eq(bookingLines.isLegacy,  false),
  ));

  // Legacy-only booking: don't touch the stored totals
  if (activeLines.length === 0) return;

  const totalPrice  = activeLines.reduce((s, l) => s + l.totalPriceExclVatHalalas + l.vatHalalas, 0);
  const totalCost   = activeLines.reduce((s, l) => s + l.totalCostHalalas, 0);
  const totalProfit = totalPrice - totalCost;

  await tx.update(bookings)
    .set({
      totalPriceHalalas: totalPrice,
      costPriceHalalas:  totalCost,
      profitHalalas:     totalProfit,
      updatedAt:         new Date(),
    })
    .where(and(
      eq(bookings.id,       bookingId),
      eq(bookings.agencyId, agencyId),
    ));
}
