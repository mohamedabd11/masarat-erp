import { NextResponse } from 'next/server';
import { eq, and, asc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { bookings, bookingLines, VAT_RATE_BPS } from '@/lib/schema';
import type { VatCategory } from '@/lib/schema';
import { verifyAuth, assertRole, ApiAuthError, BusinessError, ROLES_MANAGER_UP } from '@/lib/api-auth';

const VALID_SERVICE_TYPES = new Set([
  'flight', 'hotel', 'package', 'umrah', 'hajj',
  'insurance', 'visa', 'transport', 'custom',
]);
const VALID_VAT_CATEGORIES = new Set<string>(['S', 'Z', 'E', 'O']);
const VALID_REVENUE_MODELS  = new Set<string>(['agent', 'principal']);
const VALID_OP_STATUSES     = new Set<string>(['pending', 'confirmed', 'ticketed', 'issued', 'cancelled']);

export async function GET(
  request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const { agencyId } = await verifyAuth(request);

    const [booking] = await db.select({ id: bookings.id })
      .from(bookings)
      .where(and(eq(bookings.id, params.id), eq(bookings.agencyId, agencyId)))
      .limit(1);
    if (!booking) return NextResponse.json({ error: 'الحجز غير موجود' }, { status: 404 });

    const lines = await db.select().from(bookingLines)
      .where(and(eq(bookingLines.bookingId, params.id), eq(bookingLines.agencyId, agencyId)))
      .orderBy(asc(bookingLines.sortOrder), asc(bookingLines.createdAt));

    return NextResponse.json({ lines });
  } catch (err) {
    if (err instanceof ApiAuthError || err instanceof BusinessError)
      return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const { agencyId, role } = await verifyAuth(request);
    assertRole(role, [...ROLES_MANAGER_UP]);

    // Validate booking exists and belongs to this agency
    const [booking] = await db.select({ id: bookings.id, status: bookings.status })
      .from(bookings)
      .where(and(eq(bookings.id, params.id), eq(bookings.agencyId, agencyId)))
      .limit(1);
    if (!booking) return NextResponse.json({ error: 'الحجز غير موجود' }, { status: 404 });
    if (booking.status === 'cancelled') {
      return NextResponse.json({ error: 'لا يمكن إضافة سطر لحجز ملغي' }, { status: 422 });
    }

    const body = await request.json() as {
      serviceType:              string;
      description:              string;
      quantity?:                number;
      unitCostHalalas?:         number;
      unitPriceExclVatHalalas?: number;
      vatCategory?:             string;
      vatRateBps?:              number;
      revenueModel?:            string;
      revenueAccountCode?:      string;
      costAccountCode?:         string;
      supplierId?:              string;
      supplierName?:            string;
      operationalStatus?:       string;
      pnrReference?:            string;
      voucherNumber?:           string;
      sortOrder?:               number;
      notes?:                   string;
    };

    // ── Validation ───────────────────────────────────────────────────────────
    if (!body.serviceType || !VALID_SERVICE_TYPES.has(body.serviceType)) {
      return NextResponse.json({ error: `serviceType غير صالح. القيم المقبولة: ${[...VALID_SERVICE_TYPES].join('|')}` }, { status: 400 });
    }
    if (!body.description?.trim()) {
      return NextResponse.json({ error: 'description مطلوب' }, { status: 400 });
    }
    if (body.unitPriceExclVatHalalas === undefined || body.unitPriceExclVatHalalas < 0) {
      return NextResponse.json({ error: 'unitPriceExclVatHalalas مطلوب ويجب أن يكون >= 0' }, { status: 400 });
    }

    const quantity   = body.quantity ?? 1;
    if (!Number.isInteger(quantity) || quantity < 1) {
      return NextResponse.json({ error: 'quantity يجب أن يكون عدداً صحيحاً >= 1' }, { status: 400 });
    }

    const vatCategory = (body.vatCategory ?? 'S') as VatCategory;
    if (!VALID_VAT_CATEGORIES.has(vatCategory)) {
      return NextResponse.json({ error: 'vatCategory يجب أن يكون S|Z|E|O' }, { status: 400 });
    }

    const revenueModel = body.revenueModel ?? 'agent';
    if (!VALID_REVENUE_MODELS.has(revenueModel)) {
      return NextResponse.json({ error: 'revenueModel يجب أن يكون agent أو principal' }, { status: 400 });
    }

    const opStatus = body.operationalStatus ?? 'pending';
    if (!VALID_OP_STATUSES.has(opStatus)) {
      return NextResponse.json({ error: `operationalStatus غير صالح. القيم: ${[...VALID_OP_STATUSES].join('|')}` }, { status: 400 });
    }

    // ── Calculations ─────────────────────────────────────────────────────────
    const vatRateBps  = body.vatRateBps ?? VAT_RATE_BPS[vatCategory];
    const unitCost    = body.unitCostHalalas ?? 0;
    const unitPrice   = body.unitPriceExclVatHalalas;
    const totalCost   = unitCost  * quantity;
    const totalPrice  = unitPrice * quantity;
    // VAT is computed on the total exclusive-of-VAT amount
    const vatHalalas  = Math.round(totalPrice * vatRateBps / 10000);

    const id = crypto.randomUUID();
    await db.insert(bookingLines).values({
      id,
      bookingId:                 params.id,
      agencyId,
      serviceType:               body.serviceType,
      description:               body.description.trim(),
      supplierId:                body.supplierId   ?? null,
      supplierName:              body.supplierName ?? null,
      quantity,
      unitCostHalalas:           unitCost,
      totalCostHalalas:          totalCost,
      unitPriceExclVatHalalas:   unitPrice,
      totalPriceExclVatHalalas:  totalPrice,
      vatCategory,
      vatRateBps,
      vatHalalas,
      revenueModel,
      revenueAccountCode:        body.revenueAccountCode ?? null,
      costAccountCode:           body.costAccountCode    ?? null,
      operationalStatus:         opStatus,
      pnrReference:              body.pnrReference  ?? null,
      voucherNumber:             body.voucherNumber  ?? null,
      isLegacy:                  false,
      status:                    'active',
      refundHalalas:             0,
      sortOrder:                 body.sortOrder ?? 0,
      notes:                     body.notes ?? null,
    });

    return NextResponse.json({
      success: true,
      id,
      vatHalalas,
      totalPriceExclVatHalalas: totalPrice,
      totalInclVatHalalas: totalPrice + vatHalalas,
    });
  } catch (err) {
    if (err instanceof ApiAuthError || err instanceof BusinessError)
      return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
