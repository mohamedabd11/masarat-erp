import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { agencies, bookings, bookingLines, bookingPassengers, VAT_RATE_BPS } from '@/lib/schema';
import type { VatCategory } from '@/lib/schema';
import { verifyAuth, assertRole, ApiAuthError, ROLES_AGENT_UP } from '@/lib/api-auth';
import { getNextBookingNumber } from '@/lib/invoice-counter';
import { logAudit } from '@/lib/audit';
import { checkRateLimit, getClientIp, rateLimitHeaders } from '@/lib/rate-limit';

const VALID_SERVICE_TYPES = new Set([
  'flight', 'hotel', 'flight_hotel', 'package', 'umrah', 'hajj',
  'insurance', 'visa', 'family_visit', 'transport', 'transfer', 'cruise', 'custom',
]);

const VALID_VAT_CATEGORIES = new Set<string>(['S', 'Z', 'E', 'O']);
const VALID_REVENUE_MODELS  = new Set<string>(['agent', 'principal']);
const VALID_VAT_RATES_BPS   = new Set([0, 500, 1000, 1500, 2000]);

const SERVICE_LABEL_AR: Record<string, string> = {
  flight: 'حجز طيران', hotel: 'حجز فندق', package: 'باقة سياحية',
  umrah:  'برنامج عمرة', hajj: 'برنامج حج', visa: 'خدمة تأشيرة',
  flight_hotel: 'طيران وفندق', family_visit: 'زيارة عائلية',
  insurance: 'تأمين سفر', transport: 'خدمة نقل', transfer: 'خدمة نقل',
  cruise: 'رحلة بحرية', custom: 'خدمة متنوعة',
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
  if (!Number.isInteger(vatRateBps) || !VALID_VAT_RATES_BPS.has(vatRateBps)) {
    return { error: `lines[${index}].vatRateBps غير مدعوم` };
  }
  const totalPrice = unitPrice * quantity;
  const totalCost  = unitCost  * quantity;
  const vatBase    = revenueModel === 'agent' ? Math.max(0, totalPrice - totalCost) : totalPrice;
  const vatHalalas = Math.round(vatBase * vatRateBps / 10000);

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

    const [agency] = await db
      .select({ isVatRegistered: agencies.isVatRegistered, vatRate: agencies.vatRate })
      .from(agencies)
      .where(eq(agencies.id, agencyId));
    if (!agency) return NextResponse.json({ error: 'الوكالة غير موجودة' }, { status: 404 });

    const serviceType = String(body['type'] ?? '');
    if (!serviceType || !VALID_SERVICE_TYPES.has(serviceType)) {
      return NextResponse.json(
        { error: `نوع الخدمة غير صالح: "${serviceType}"` },
        { status: 400 },
      );
    }

    const pricing        = (body['pricing'] ?? {}) as Record<string, unknown>;
    const revenueModel   = String(pricing['revenueModel'] ?? 'principal');
    const vatAmountHalalas = Number(pricing['vatAmount'] ?? 0);
    const vatCategoryFromPricing = String(
      pricing['vatCategory'] ?? (agency.isVatRegistered ? 'S' : 'O'),
    ) as VatCategory;
    const agencyVatRateBps = agency.isVatRegistered ? Math.round((agency.vatRate ?? 15) * 100) : 0;
    const vatRateBpsFromPricing = Number(
      pricing['vatRateBps'] ?? (vatCategoryFromPricing === 'S' ? agencyVatRateBps : VAT_RATE_BPS[vatCategoryFromPricing]),
    );
    const serviceDetails = (body['details'] ?? {}) as Record<string, unknown>;
    const supplierName   = String(body['supplierName'] ?? '').trim() || null;
    const supplierRef    = String(body['supplierRef']  ?? '').trim() || null;
    const destination    = String(body['destination']  ?? '').trim() || null;
    const departureDate  = String(body['travelDate']   ?? '').trim() || null;
    const returnDate     = String(body['returnDate']   ?? '').trim() || null;

    // ── Prepare booking_lines ──────────────────────────────────────────────
    // Validate and compute all line data BEFORE entering the transaction so
    // we can return 400 errors without holding a DB connection.
    const rawLines = Array.isArray(body['lines']) ? (body['lines'] as Record<string, unknown>[]) : null;

    if (!VALID_REVENUE_MODELS.has(revenueModel)) {
      return NextResponse.json({ error: 'نموذج الإيراد يجب أن يكون وكيل أو أصيل' }, { status: 400 });
    }
    if (!VALID_VAT_CATEGORIES.has(vatCategoryFromPricing)) {
      return NextResponse.json({ error: 'فئة الضريبة غير صالحة' }, { status: 400 });
    }
    if (!Number.isInteger(vatRateBpsFromPricing) || !VALID_VAT_RATES_BPS.has(vatRateBpsFromPricing)) {
      return NextResponse.json({ error: 'معدل الضريبة غير مدعوم' }, { status: 400 });
    }

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
      if (![totalPrice, totalCost, vatAmountHalalas].every(Number.isInteger)
          || totalPrice < 0 || totalCost < 0 || vatAmountHalalas < 0 || vatAmountHalalas > totalPrice) {
        return NextResponse.json({ error: 'مبالغ الحجز غير صالحة' }, { status: 400 });
      }
      const priceExclVat = Math.max(0, totalPrice - vatAmountHalalas);
      const vatBase = revenueModel === 'agent'
        ? Math.max(0, priceExclVat - totalCost)
        : priceExclVat;
      const expectedVat = Math.round(vatBase * vatRateBpsFromPricing / 10_000);
      if (vatAmountHalalas !== expectedVat) {
        return NextResponse.json({ error: 'مبلغ الضريبة لا يطابق نموذج الإيراد ومعدل الضريبة' }, { status: 400 });
      }
      preparedLines = [{
        serviceType,
        description:              destination ?? SERVICE_LABEL_AR[serviceType] ?? serviceType,
        supplierId:               null,
        supplierName,
        quantity:                 1,
        unitCostHalalas:          totalCost,
        totalCostHalalas:         totalCost,
        unitPriceExclVatHalalas:  priceExclVat,
        totalPriceExclVatHalalas: priceExclVat,
        vatCategory:              vatCategoryFromPricing,
        vatRateBps:              vatRateBpsFromPricing,
        vatHalalas:               vatAmountHalalas,
        revenueModel,
        revenueAccountCode:       null,
        costAccountCode:          null,
        operationalStatus:        'pending',
        pnrReference:             String(serviceDetails['pnr'] ?? '').trim() || null,
        voucherNumber:            supplierRef,
        sortOrder:                1,
        notes:                    null,
      }];
    }

    for (const line of preparedLines) {
      if (!agency.isVatRegistered && (line.vatRateBps !== 0 || line.vatHalalas !== 0)) {
        return NextResponse.json({ error: 'لا يمكن إضافة ضريبة لمنشأة غير مسجلة ضريبياً' }, { status: 400 });
      }
      if (agency.isVatRegistered && line.vatCategory === 'S' && line.vatRateBps !== agencyVatRateBps) {
        return NextResponse.json({ error: 'معدل الضريبة لا يطابق إعدادات المنشأة' }, { status: 400 });
      }
      if (line.vatCategory !== 'S' && (line.vatRateBps !== 0 || line.vatHalalas !== 0)) {
        return NextResponse.json({ error: 'فئة الضريبة المحددة يجب ألا تحمل ضريبة' }, { status: 400 });
      }
    }

    // Booking totals are derived from lines (single source of truth)
    const derivedTotal  = preparedLines.reduce((s, l) => s + l.totalPriceExclVatHalalas + l.vatHalalas, 0);
    const derivedCost   = preparedLines.reduce((s, l) => s + l.totalCostHalalas, 0);
    const derivedProfit = preparedLines.reduce(
      (sum, line) => sum + line.totalPriceExclVatHalalas - line.totalCostHalalas,
      0,
    );

    const rawPassengers = Array.isArray(body['passengers'])
      ? body['passengers'] as Record<string, unknown>[]
      : [];
    const preparedPassengers: Array<{
      nameAr: string; nameEn: string | null; type: string; gender: string | null;
      passportNumber: string | null; passportExpiry: string | null;
      nationality: string | null; dateOfBirth: string | null; nationalId: string | null;
    }> = [];
    const passengerTypeMap: Record<string, string> = {
      adult: 'ADT', child: 'CHD', infant: 'INF', ADT: 'ADT', CHD: 'CHD', INF: 'INF',
    };
    const genderMap: Record<string, string> = { male: 'M', female: 'F', M: 'M', F: 'F' };
    for (let i = 0; i < rawPassengers.length; i++) {
      const passenger = rawPassengers[i]!;
      const nameAr = String(passenger['nameAr'] ?? '').trim();
      if (!nameAr) {
        return NextResponse.json({ error: `passengers[${i}].nameAr مطلوب` }, { status: 400 });
      }
      const rawType = String(passenger['type'] ?? 'ADT');
      const type = passengerTypeMap[rawType];
      if (!type) return NextResponse.json({ error: `passengers[${i}].type غير صالح` }, { status: 400 });
      const rawGender = String(passenger['gender'] ?? '');
      preparedPassengers.push({
        nameAr,
        nameEn:         String(passenger['nameEn']         ?? '').trim() || null,
        type,
        gender:         genderMap[rawGender] ?? null,
        passportNumber: String(passenger['passportNumber'] ?? '').trim() || null,
        passportExpiry: String(passenger['passportExpiry'] ?? '').trim() || null,
        nationality:    String(passenger['nationality']    ?? '').trim() || null,
        dateOfBirth:    String(passenger['dateOfBirth']    ?? '').trim() || null,
        nationalId:     String(passenger['nationalId']     ?? '').trim() || null,
      });
    }

    const year = new Date().getFullYear();

    const result = await db.transaction(async (tx) => {
      const bookingNumber = await getNextBookingNumber(agencyId, year, tx);
      const bookingId = crypto.randomUUID();

      const cn = body['customerName'] as Record<string, string> | string | undefined;
      const customerNameAr = typeof cn === 'object' ? (cn?.['ar'] ?? '') : (cn ?? '');
      const customerNameEn = typeof cn === 'object' ? (cn?.['en'] ?? '') : '';

      const serviceFeeHalalas = Number(pricing['serviceFee'] ?? 0);

      // Merge pricing fields into details JSONB so they survive round-trips
      const mergedDetails = {
        ...serviceDetails,
        destination,
        departureDate,
        returnDate,
        supplierName,
        supplierRef,
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

      if (preparedPassengers.length > 0) {
        await tx.insert(bookingPassengers).values(preparedPassengers.map((passenger) => ({
          id: crypto.randomUUID(),
          agencyId,
          bookingId,
          ...passenger,
          createdBy: uid,
        })));
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
