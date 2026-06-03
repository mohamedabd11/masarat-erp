import { NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { bookings, invoices } from '@/lib/schema';
import { verifyAuth, assertRole, ApiAuthError, ROLES_AGENT_UP } from '@/lib/api-auth';

const VALID_STATUSES = new Set(['draft', 'confirmed', 'completed', 'cancelled']);

// Fields that cannot be changed after an invoice is issued
const LOCKED_AFTER_INVOICE = new Set([
  'totalPriceHalalas', 'costPriceHalalas', 'profitHalalas',
  'serviceType', 'customerId', 'details',
]);

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const { agencyId } = await verifyAuth(request);
    const [booking] = await db.select().from(bookings)
      .where(and(eq(bookings.id, params.id), eq(bookings.agencyId, agencyId)));
    if (!booking) return NextResponse.json({ error: 'الحجز غير موجود' }, { status: 404 });

    // Reconstruct pricing object from stored details + numeric columns
    const det = (booking.details ?? {}) as Record<string, unknown>;
    const enriched = {
      ...booking,
      pricing: {
        revenueModel: String(det['revenueModel'] ?? 'principal'),
        currency:     String(det['currency']     ?? 'SAR'),
        totalCost:    booking.costPriceHalalas,
        serviceFee:   Number(det['serviceFee']   ?? 0),
        vatAmount:    Number(det['vatAmount']     ?? 0),
        totalAmount:  booking.totalPriceHalalas,
        commission:   Number(det['serviceFee']   ?? 0),
      },
    };
    return NextResponse.json({ booking: enriched });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const { agencyId, role } = await verifyAuth(request);
    assertRole(role, [...ROLES_AGENT_UP]);
    const body = await request.json() as Record<string, unknown>;
    const now  = new Date();

    // Validate status value if provided
    if (body['status'] !== undefined && !VALID_STATUSES.has(body['status'] as string)) {
      return NextResponse.json(
        { error: `حالة غير صالحة: ${body['status']}. القيم المقبولة: draft، confirmed، completed، cancelled` },
        { status: 400 },
      );
    }

    // Check if booking exists and belongs to this agency
    const [existing] = await db
      .select({ id: bookings.id, status: bookings.status })
      .from(bookings)
      .where(and(eq(bookings.id, params.id), eq(bookings.agencyId, agencyId)));
    if (!existing) return NextResponse.json({ error: 'الحجز غير موجود' }, { status: 404 });

    // Enforce booking status state machine — cancelled and completed are terminal
    if (body['status'] !== undefined && body['status'] !== existing.status) {
      const prevStatus = existing.status;
      const newStatus  = body['status'] as string;
      const ALLOWED_TRANSITIONS: Record<string, string[]> = {
        draft:     ['confirmed', 'cancelled'],
        confirmed: ['completed', 'cancelled'],
        completed: [],
        cancelled: [],
      };
      const allowed = ALLOWED_TRANSITIONS[prevStatus] ?? [];
      if (!allowed.includes(newStatus)) {
        return NextResponse.json(
          { error: `Cannot transition booking from '${prevStatus}' to '${newStatus}'` },
          { status: 422 },
        );
      }
    }

    // If financial or structural fields are being modified, check no invoice exists
    const hasSensitiveChanges = Object.keys(body).some(k => LOCKED_AFTER_INVOICE.has(k));
    if (hasSensitiveChanges) {
      const [existingInvoice] = await db
        .select({ id: invoices.id })
        .from(invoices)
        .where(and(eq(invoices.bookingId, params.id), eq(invoices.agencyId, agencyId)))
        .limit(1);
      if (existingInvoice) {
        return NextResponse.json(
          { error: 'لا يمكن تعديل تفاصيل الحجز بعد إصدار الفاتورة' },
          { status: 422 },
        );
      }
    }

    // Strip internal/auto-computed fields that callers should not set directly
    const STRIP = new Set(['id', 'agencyId', 'bookingNumber', 'paidHalalas', 'createdBy', 'createdAt']);
    const patch: Record<string, unknown> = { updatedAt: now };
    for (const [k, v] of Object.entries(body)) {
      if (!STRIP.has(k)) patch[k] = v;
    }

    await db
      .update(bookings)
      .set(patch as Partial<typeof bookings.$inferInsert>)
      .where(and(eq(bookings.id, params.id), eq(bookings.agencyId, agencyId)));

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
