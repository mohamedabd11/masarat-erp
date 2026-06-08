import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { bookings, bookingLines, VAT_RATE_BPS } from '@/lib/schema';
import type { VatCategory } from '@/lib/schema';
import { verifyAuth, assertRole, ApiAuthError, ROLES_AGENT_UP } from '@/lib/api-auth';
import { getNextBookingNumber } from '@/lib/invoice-counter';
import { logAudit } from '@/lib/audit';
import { checkRateLimit, getClientIp, rateLimitHeaders } from '@/lib/rate-limit';

const VALID_SERVICE_TYPES = new Set([
  'flight', 'hotel', 'package', 'umrah', 'hajj',
  'insurance', 'visa', 'transport', 'custom',
]);

const VALID_VAT_CATEGORIES = new Set<string>(['S', 'Z', 'E', 'O']);
const VALID_REVENUE_MODELS  = new Set<string>(['agent', 'principal']);

const SERVICE_LABEL_AR: Record<string, string> = {
  flight: 'حجز طيران', hotel: 'حجز فندق', package: 'باقة سياحية',
  umrah:  'برنامج عمرة', hajj: 'برنامج حج', visa: 'خدمة تأشيرة',
  insurance: 'تأمين سفر', transport: 'خدمة نقل', custom: 'خدمة متنوعة',
};

// Represents one line after validation and computation — ready for DB insert.
interface PreparedLine {
  serviceType:               string;
  description:               string;
  supplierId:                string | null;
  supplierName:              string | null;
  quantity:                  number;
  unitCostHalalas:           number;
  totalCostHalalas:          number;
  unitPriceExclVatHalalas:   number;
  totalPriceExclVatHalalas:  number;
  vatCategory:               VatCategory;
  vatRateBps:                number;
  vatHalalas:                number;
  revenueModel:              string;
  revenueAccountCode:        string | null;
  costAccountCode:           string | null;
  operationalStatus:         string;
  pnrReference:              string | null;
  voucherNumber:             string | null;
  sortOrder:                 number;
  notes:                     string | null;
}

function prepareLineInput(
  raw: Record<string, unknown>,
  fallbackServiceType: string,
  fallbackRevenueModel: string,
  index: number,
): PreparedLine | { error: string } {
  const description = String(raw['description'] ?? '').trim();
  if (!description) return { error: `lines[${index}].description مطلوب` };

  const rawPrice = raw['unitPriceExclVatHalalas'];
  if (rawPrice === undefined || rawPrice === null || Number(rawPrice) < 0) {
    return { error: `lines[${index}].unitPriceExclVatHalalas مطلوب ويجب أن يكون >= 0` };
  }

  const vatCat = String(raw['vatCategory'] ?? 'S') as VatCategory;
  if (!VALID_VAT_CATEGORIES.has(vatCat)) {
    return { error: `lines[${index}].vatCategory يجب أن يكون S|Z|E|O` };
  }
  const revenueModel = String(raw['revenueModel'] ?? fallbackRevenueModel);
  if (!VALID_REVENUE_MODELS.has(revenueModel)) {
    return { error: `lines[${index}].revenueModel يجب أن يكون agent أو principal` };
  }

  const quantity  = Math.max(1, Math.round(Number(raw['quantity'] ?? 1)));
  const unitPrice = Number(rawPrice);
  const unitCost  = Math.max(0, Number(raw['unitCostHalalas'] ?? 0));
  const vatRateBps = Number(raw['vatRateBps'] ?? VAT_RATE_BPS[vatCat]);
  const totalPrice = unitPrice * quantity;
  const totalCost  = unitCost  * quantity;
  const vatHalalas = Math.round(totalPrice * vatRateBps / 10000);

  return {
    serviceType:              String(raw['serviceType'] ?? fallbackServiceType),
    description,
    supplierId:               String(raw['supplierId']   ?? '') || null,
    supplierName:             String(raw['supplierName'] ?? '') || null,
    quantity,
    unitCostHalalas:          unitCost,
    totalCostHalalas:         totalCost,
    unitPriceExclVatHalalas:  unitPrice,
    totalPriceExclVatHalalas: totalPrice,
    vatCategory:              vatCat,
    vatRateBps,
    vatHalalas,
    revenueModel,
    revenueAccountCode:       String(raw['revenueAccountCode'] ?? '') || null,
    costAccountCode:          String(raw['costAccountCode']    ?? '') || null,
    operationalStatus:        String(raw['operationalStatus']  ?? 'pending'),
    pnrReference:             String(raw['pnrReference']  ?? '') || null,
    voucherNumber:            String(raw['voucherNumber'] ?? '') || null,
    sortOrder:                Number(raw['sortOrder'] ?? index),
    notes:                    String(raw['notes'] ?? '') || null,
  };
}

export async function POST(request: Request) {
  try {
    const { uid, agencyId, role } = await verifyAuth(request);
    assertRole(role, [...ROLES_AGENT_UP]);

    const rl = await checkRateLimit(`${agencyId}:${getClientIp(request)}`, 'financial');
    if (!rl.success) {
      return NextResponse.json(
        { error: 'تجاوزت الحد المسموح به من الطلبات. حاول مرة أخرى بعد دقيقة.' },
        { status: 429, headers: rateLimitHeaders(rl) },
      );
    }

    const body = await request.json() as Record<string, unknown>;

    const serviceType = String(body['type'] ?? '');
    if (!serviceType || !VALID_SERVICE_TYPES.has(serviceType)) {
      return NextResponse.json(
        { error: `نوع الخدمة غير صالح: "${serviceType}". القيم المقبولة: flight، hotel، package، umrah، hajj، insurance، visa، transport، custom` },
        { status: 400 },
      );
    }

    const pricing        = (body['pricing'] ?? {}) as Record<string, unknown>;
    const revenueModel   = String(pricing['revenueModel'] ?? 'principal');
    const vatAmountHalalas = Number(pricing['vatAmount'] ?? 0);
    const vatCategoryFromPricing = String(pricing['vatCategory'] ?? 'S') as VatCategory;

    // ── Prepare booking_lines ──────────────────────────────────────────────
    // Validate and compute all line data BEFORE entering the transaction so
    // we can return 400 errors without holding a DB connection.
    const rawLines = Array.isArray(body['lines']) ? (body['lines'] as Record<string, unknown>[]) : null;

    let preparedLines: PreparedLine[];

    if (rawLines && rawLines.length > 0) {
      // Explicit lines provided — validate each one
      const results = rawLines.map((r, i) => prepareLineInput(r, serviceType, revenueModel, i));
      for (const r of results) {
        if ('error' in r) return NextResponse.json({ error: r.error }, { status: 400 });
      }
      preparedLines = results as PreparedLine[];
    } else {
      // No explicit lines — derive one default line from pricing.
      // This ensures every new booking always has a non-legacy booking_line,
      // making it eligible for the per-line invoice path immediately.
      const totalPrice = Number(pricing['totalAmount'] ?? 0);
      const totalCost  = Number(pricing['totalCost']   ?? 0);
      const priceExclVat = Math.max(0, totalPrice - vatAmountHalalas);
      const vatRateBps   = VAT_RATE_BPS[vatCategoryFromPricing];
      preparedLines = [{
        serviceType,
        description:              SERVICE_LABEL_AR[serviceType] ?? serviceType,
        supplierId:               null,
        supplierName:             null,
        quantity:                 1,
        unitCostHalalas:          totalCost,
        totalCostHalalas:         totalCost,
        unitPriceExclVatHalalas:  priceExclVat,
        totalPriceExclVatHalalas: priceExclVat,
        vatCategory:              vatCategoryFromPricing,
        vatRateBps,
        vatHalalas:               vatAmountHalalas,
        revenueModel,
        revenueAccountCode:       null,
        costAccountCode:          null,
        operationalStatus:        'pending',
        pnrReference:             null,
        voucherNumber:            null,
        sortOrder:                1,
        notes:                    null,
      }];
    }

    // Booking totals are derived from lines (single source of truth)
    const derivedTotal  = preparedLines.reduce((s, l) => s + l.totalPriceExclVatHalalas + l.vatHalalas, 0);
    const derivedCost   = preparedLines.reduce((s, l) => s + l.totalCostHalalas, 0);
    const derivedProfit = derivedTotal - derivedCost;

    const year = new Date().getFullYear();

    const result = await db.transaction(async (tx) => {
      const bookingNumber = await getNextBookingNumber(agencyId, year, tx);
      const bookingId = crypto.randomUUID();

      const cn = body['customerName'] as Record<string, string> | string | undefined;
      const customerNameAr = typeof cn === 'object' ? (cn?.['ar'] ?? '') : (cn ?? '');
      const customerNameEn = typeof cn === 'object' ? (cn?.['en'] ?? '') : '';

      const serviceFeeHalalas = Number(pricing['serviceFee'] ?? 0);

      // Merge pricing fields into details JSONB so they survive round-trips
      const serviceDetails = (body['details'] ?? {}) as Record<string, unknown>;
      const mergedDetails = {
        ...serviceDetails,
        revenueModel,
        serviceFee:  serviceFeeHalalas,
        vatAmount:   vatAmountHalalas,
        currency:    String(pricing['currency'] ?? 'SAR'),
      };

      await tx.insert(bookings).values({
        id:               bookingId,
        agencyId,
        bookingNumber,
        serviceType,
        customerId:       String(body['customerId'] ?? '') || null,
        customerNameAr,
        customerNameEn,
        customerPhone:    String(body['customerPhone'] ?? '') || null,
        status:           'confirmed',
        totalPriceHalalas: derivedTotal,
        costPriceHalalas:  derivedCost,
        profitHalalas:     derivedProfit,
        paidHalalas:      0,
        notes:            String(body['notes'] ?? '') || null,
        details:          mergedDetails,
        createdBy:        uid,
      });

      // Insert booking_lines atomically — every new booking now has at least
      // one active non-legacy line, enabling the per-line invoice path.
      for (let i = 0; i < preparedLines.length; i++) {
        const l = preparedLines[i]!;
        await tx.insert(bookingLines).values({
          id:                         crypto.randomUUID(),
          bookingId,
          agencyId,
          serviceType:                l.serviceType,
          description:                l.description,
          supplierId:                 l.supplierId,
          supplierName:               l.supplierName,
          quantity:                   l.quantity,
          unitCostHalalas:            l.unitCostHalalas,
          totalCostHalalas:           l.totalCostHalalas,
          unitPriceExclVatHalalas:    l.unitPriceExclVatHalalas,
          totalPriceExclVatHalalas:   l.totalPriceExclVatHalalas,
          vatCategory:                l.vatCategory,
          vatRateBps:                 l.vatRateBps,
          vatHalalas:                 l.vatHalalas,
          revenueModel:               l.revenueModel,
          revenueAccountCode:         l.revenueAccountCode,
          costAccountCode:            l.costAccountCode,
          operationalStatus:          l.operationalStatus,
          pnrReference:               l.pnrReference,
          voucherNumber:              l.voucherNumber,
          isLegacy:                   false,
          status:                     'active',
          refundHalalas:              0,
          sortOrder:                  l.sortOrder,
          notes:                      l.notes,
        });
      }

      return { bookingId, bookingNumber };
    });

    await logAudit({
      agencyId, userId: uid, action: 'create', resource: 'booking',
      resourceId: result.bookingId,
      after: { bookingNumber: result.bookingNumber, serviceType, totalPriceHalalas: Number(body['pricing'] ? (body['pricing'] as Record<string, unknown>)['totalAmount'] : 0) },
    });

    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(JSON.stringify({ event: 'booking_create_failed', error: (err as Error).message ?? String(err) }));
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
