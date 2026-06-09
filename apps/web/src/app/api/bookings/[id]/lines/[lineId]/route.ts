import { NextResponse } from 'next/server';
import { eq, and, ne } from 'drizzle-orm';
import { db } from '@/lib/db';
import { bookings, bookingLines, invoices } from '@/lib/schema';
import { verifyAuth, assertRole, ApiAuthError, BusinessError, ROLES_AGENT_UP, ROLES_MANAGER_UP } from '@/lib/api-auth';
import { syncBookingTotalsFromLines } from '@/lib/booking-financials';

type RouteCtx = { params: { id: string; lineId: string } };

const VALID_OP_STATUSES = new Set(['pending', 'confirmed', 'ticketed', 'issued', 'cancelled']);

export async function PATCH(req: Request, { params }: RouteCtx) {
  try {
    const { agencyId, role } = await verifyAuth(req);
    const { id: bookingId, lineId } = params;

    const [booking] = await db.select({ id: bookings.id, status: bookings.status })
      .from(bookings)
      .where(and(eq(bookings.id, bookingId), eq(bookings.agencyId, agencyId)));
    if (!booking) return NextResponse.json({ error: 'الحجز غير موجود' }, { status: 404 });

    const [line] = await db.select()
      .from(bookingLines)
      .where(and(
        eq(bookingLines.id, lineId),
        eq(bookingLines.bookingId, bookingId),
        eq(bookingLines.agencyId, agencyId),
      ));
    if (!line) return NextResponse.json({ error: 'سطر الحجز غير موجود' }, { status: 404 });
    if (line.isLegacy) return NextResponse.json({ error: 'لا يمكن تعديل السطور التاريخية' }, { status: 400 });

    const body = await req.json() as Record<string, unknown>;
    const action = body['action'] as string | undefined;

    // ── Cancel action (manager+ required) ────────────────────────────────
    if (action === 'cancel') {
      assertRole(role, [...ROLES_MANAGER_UP]);

      if (line.status !== 'active') {
        return NextResponse.json({ error: 'السطر ليس نشطاً ولا يمكن إلغاؤه' }, { status: 400 });
      }
      if (booking.status === 'cancelled') {
        return NextResponse.json({ error: 'الحجز ملغى بالفعل' }, { status: 400 });
      }

      // Block if booking has a live (non-cancelled) invoice — same guard as booking cancel
      const [liveInvoice] = await db.select({ id: invoices.id })
        .from(invoices)
        .where(and(
          eq(invoices.bookingId, bookingId),
          eq(invoices.agencyId, agencyId),
          ne(invoices.status, 'cancelled'),
        ))
        .limit(1);
      if (liveInvoice) {
        return NextResponse.json(
          { error: 'لا يمكن إلغاء سطر حجز له فاتورة سارية — استخدم الاسترداد أو أصدر إشعاراً دائناً أولاً' },
          { status: 422 },
        );
      }

      await db.transaction(async (tx) => {
        const now = new Date();
        await tx.update(bookingLines)
          .set({ status: 'cancelled', cancelledAt: now, updatedAt: now })
          .where(and(eq(bookingLines.id, lineId), eq(bookingLines.agencyId, agencyId)));
        await syncBookingTotalsFromLines(bookingId, agencyId, tx);
      });

      return NextResponse.json({ success: true });
    }

    // ── Field updates (agent+ required) ──────────────────────────────────
    assertRole(role, [...ROLES_AGENT_UP]);

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    let hasUpdate = false;

    const opStatus = body['operationalStatus'] as string | undefined;
    if (opStatus !== undefined) {
      if (!VALID_OP_STATUSES.has(opStatus)) {
        return NextResponse.json({ error: 'operationalStatus غير صالح. القيم المقبولة: pending|confirmed|ticketed|issued|cancelled' }, { status: 400 });
      }
      updates['operationalStatus'] = opStatus;
      hasUpdate = true;
    }

    if (body['notes'] !== undefined) {
      updates['notes'] = (body['notes'] as string)?.trim() || null;
      hasUpdate = true;
    }
    if (body['pnrReference'] !== undefined) {
      updates['pnrReference'] = (body['pnrReference'] as string)?.trim() || null;
      hasUpdate = true;
    }
    if (body['voucherNumber'] !== undefined) {
      updates['voucherNumber'] = (body['voucherNumber'] as string)?.trim() || null;
      hasUpdate = true;
    }

    if (!hasUpdate) {
      return NextResponse.json({ error: 'لا توجد حقول للتحديث' }, { status: 400 });
    }

    const [updated] = await db.update(bookingLines)
      .set(updates)
      .where(and(
        eq(bookingLines.id, lineId),
        eq(bookingLines.bookingId, bookingId),
        eq(bookingLines.agencyId, agencyId),
      ))
      .returning();

    return NextResponse.json({ line: updated });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof BusinessError)  return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(JSON.stringify({ event: 'booking_line_patch_failed', error: String(err) }));
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
