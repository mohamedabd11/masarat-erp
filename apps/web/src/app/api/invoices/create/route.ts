import { NextResponse } from 'next/server';
import { eq, and, sql, ne, asc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { bookings, bookingLines, agencies, invoices, journalEntries, journalLines, customers, suppliers } from '@/lib/schema';
import type { BookingLine } from '@/lib/schema';
import { verifyAuth, assertRole, ApiAuthError, BusinessError, ROLES_ACCOUNTANT_UP } from '@/lib/api-auth';
import { logAudit } from '@/lib/audit';
import { checkRateLimit, getClientIp, rateLimitHeaders } from '@/lib/rate-limit';
import { withIdempotency, markIdempotencyComplete } from '@/lib/idempotency';
import { getNextInvoiceNumber, getNextJournalNumber } from '@/lib/invoice-counter';
import { assertPeriodOpen } from '@/lib/period-lock';
import { GL } from '@/lib/gl-accounts';
import { buildZatcaInvoiceRecord, submitInvoiceToZatca, inferZatcaExemptionReason } from '@/lib/zatca-einvoice';
import type { ZatcaVatCategory, ZatcaExemptionReason } from '@masarat/zatca';

const AC = {
  receivable:       GL.receivable,
  payableSupplier:  GL.payableSupplier,
  vatPayable:       GL.vatPayable,
  revenueAgent:     GL.revenueAgent,
  revenuePrincipal: GL.revenuePrincipal,
  costOfServices:   GL.costOfServices,
  deferredRevenue:  GL.deferredRevenue,
};

// Service types whose revenue is deferred until the trip is delivered (IFRS 15).
const DEFERRABLE_SERVICE_TYPES = new Set(['umrah', 'hajj', 'package', 'packages']);

// Pull the travel/service date out of booking.details (no dedicated column on
// the bookings table — dates are stored in the details JSON).
function extractTravelDate(details: Record<string, unknown>): string | null {
  const raw = details['travelDate'] ?? details['serviceDate'] ?? details['departureDate'];
  return typeof raw === 'string' && raw.trim() !== '' ? raw : null;
}

interface InvoiceCreateBody {
  bookingId: string;
  idempotencyKey?: string;
}

// Line items stored in booking.details.lineItems (set at booking-creation time)
interface PackageLineItem {
  descriptionAr:    string;
  descriptionEn?:   string;
  quantity:         number;
  unitPriceHalalas: number;   // VAT-inclusive per unit
  totalHalalas:     number;   // VAT-inclusive total (= quantity × unitPriceHalalas)
}

interface InvoiceItem {
  description:      string;
  descriptionEn:    string | null;
  quantity:         number;
  unitPriceHalalas: number;   // excl. VAT (for ZATCA line-level breakdown)
  vatHalalas:       number;
  totalHalalas:     number;   // incl. VAT
  vatCategory?:     ZatcaVatCategory;
  exemptionReason?: ZatcaExemptionReason;
}

export async function POST(request: Request) {
  try {
    const { uid, agencyId, role } = await verifyAuth(request);
    assertRole(role, [...ROLES_ACCOUNTANT_UP]);

    const rl = await checkRateLimit(`${agencyId}:${getClientIp(request)}`, 'financial');
    if (!rl.success) {
      return NextResponse.json(
        { error: 'تجاوزت الحد المسموح به من الطلبات. حاول مرة أخرى بعد دقيقة.' },
        { status: 429, headers: rateLimitHeaders(rl) },
      );
    }

    const body = await request.json() as InvoiceCreateBody;
    const { bookingId } = body;
    const idempKey = body.idempotencyKey ?? crypto.randomUUID();

    if (!bookingId) {
      return NextResponse.json({ error: 'bookingId مطلوب' }, { status: 400 });
    }

    const result = await withIdempotency(idempKey, agencyId, 'createInvoice', async () => {
      return db.transaction(async (tx) => {

        // ── 1. Read ────────────────────────────────────────────────────────
        const [booking] = await tx.select().from(bookings).where(
          and(eq(bookings.id, bookingId), eq(bookings.agencyId, agencyId)),
        );
        if (!booking) throw new BusinessError(`الحجز ${bookingId} غير موجود`, 404);

        const [agency] = await tx.select().from(agencies).where(eq(agencies.id, agencyId));
        if (!agency) throw new BusinessError(`الوكالة ${agencyId} غير موجودة`, 404);

        // ── 1b. Query booking lines (new source of truth for amounts) ─────
        // Active non-legacy lines drive VAT, items, and journal entries.
        // Bookings without any non-legacy lines fall back to the aggregated
        // amounts stored on the booking itself (backward-compatible path).
        const allBookingLines = await tx.select().from(bookingLines)
          .where(and(eq(bookingLines.bookingId, bookingId), eq(bookingLines.agencyId, agencyId)))
          .orderBy(asc(bookingLines.sortOrder), asc(bookingLines.createdAt));
        const activeLines = allBookingLines.filter(l => !l.isLegacy && l.status === 'active');
        const hasActiveLines = activeLines.length > 0;

        // ── 2. Validate ────────────────────────────────────────────────────
        if (booking.status !== 'confirmed' && booking.status !== 'completed') {
          throw new BusinessError(`لا يمكن إصدار فاتورة للحجز بحالة: ${booking.status}`, 400);
        }

        // Check no existing invoice for this booking
        const [existingInvoice] = await tx.select({ id: invoices.id }).from(invoices).where(
          and(eq(invoices.bookingId, bookingId), eq(invoices.agencyId, agencyId)),
        ).limit(1);
        if (existingInvoice) throw new BusinessError(`الحجز ${bookingId} لديه فاتورة بالفعل`, 409);

        // ── 3. Period lock check ────────────────────────────────────────────
        const now = new Date();
        await assertPeriodOpen(agencyId, now.toISOString().split('T')[0]!, tx);

        // ── 3b. Calculate amounts ────────────────────────────────────────────
        const year = now.getFullYear();
        const isVatRegistered = agency.isVatRegistered === true;
        const vatRateDecimal  = (agency.vatRate ?? 15) / 100;

        const details      = (booking.details ?? {}) as Record<string, unknown>;
        const revenueModel = (details['revenueModel'] as string | undefined) ?? 'principal';
        const vatScheme    = (details['vatScheme']    as string | undefined) ?? 'standard';

        let subtotalExclVat: number;
        let totalVat: number;
        let finalGrandTotal: number;

        if (hasActiveLines) {
          // ── NEW PATH: amounts sourced from booking_lines ─────────────────
          // Each line carries its own vatCategory and vatRateBps, enabling
          // correct mixed-supply VAT (e.g. 0% flight + 15% hotel).
          subtotalExclVat = activeLines.reduce((s, l) => s + l.totalPriceExclVatHalalas, 0);
          totalVat        = isVatRegistered
            ? activeLines.reduce((s, l) => s + l.vatHalalas, 0)
            : 0;
          finalGrandTotal = subtotalExclVat + totalVat;
        } else {
          // ── LEGACY PATH: amounts sourced from booking aggregated totals ──
          const grandTotal = booking.totalPriceHalalas;
          const storedCost = booking.costPriceHalalas;

          if (!isVatRegistered) {
            subtotalExclVat = grandTotal;
            totalVat        = 0;
            finalGrandTotal = grandTotal;
          } else if (revenueModel === 'agent') {
            const storedFee = (details['serviceFee'] as number | undefined) ?? 0;
            const storedVat = (details['vatAmount']  as number | undefined) ?? 0;
            subtotalExclVat = storedCost + storedFee;
            totalVat        = storedVat;
            finalGrandTotal = grandTotal;
          } else if (vatScheme === 'margin' && storedCost > 0) {
            // ZATCA Margin Scheme: VAT base = profit margin only
            const margin    = Math.max(0, grandTotal - storedCost);
            totalVat        = Math.round(margin * vatRateDecimal / (1 + vatRateDecimal));
            subtotalExclVat = margin - totalVat;
            finalGrandTotal = grandTotal;
          } else {
            subtotalExclVat = Math.round(grandTotal / (1 + vatRateDecimal));
            totalVat        = grandTotal - subtotalExclVat;
            finalGrandTotal = grandTotal;
          }
        }

        // ── 4. Zero-amount guard ────────────────────────────────────────────
        if (finalGrandTotal === 0) {
          throw new BusinessError('لا يمكن إصدار فاتورة بمبلغ صفر — يرجى تحديث سعر الحجز أولاً', 400);
        }

        // ── 4b. Credit-limit guard + buyer VAT number snapshot ──────────────
        let buyerVatNumber: string | null = null;
        if (booking.customerId) {
          const [customer] = await tx.select({ creditLimitHalalas: customers.creditLimitHalalas, vatNumber: customers.vatNumber })
            .from(customers)
            .where(and(eq(customers.id, booking.customerId), eq(customers.agencyId, agencyId)));

          buyerVatNumber = customer?.vatNumber ?? null;

          if (customer && customer.creditLimitHalalas > 0) {
            const [{ outstanding }] = await tx.select({
              outstanding: sql<number>`coalesce(sum(${invoices.totalHalalas} - ${invoices.paidHalalas}), 0)`,
            })
            .from(invoices)
            .where(and(
              eq(invoices.customerId, booking.customerId),
              eq(invoices.agencyId, agencyId),
              ne(invoices.status, 'paid'),
              ne(invoices.status, 'cancelled'),
            ));

            if ((outstanding + finalGrandTotal) > customer.creditLimitHalalas) {
              throw new BusinessError(
                `تجاوز حد الائتمان: الرصيد المستحق ${(outstanding / 100).toFixed(2)} ر.س + الفاتورة الجديدة ${(finalGrandTotal / 100).toFixed(2)} ر.س يتجاوز الحد ${(customer.creditLimitHalalas / 100).toFixed(2)} ر.س`,
                400,
              );
            }
          }
        }

        // ── 5. Counter + IDs ────────────────────────────────────────────────
        const invoiceNumber = await getNextInvoiceNumber(agencyId, 'taxInvoice', year, tx);
        const jeNumber      = await getNextJournalNumber(agencyId, year, tx);
        const invoiceId     = crypto.randomUUID();
        const jeId          = crypto.randomUUID();

        const today  = now.toISOString().split('T')[0]!;
        const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

        // ── 5b. IFRS 15 deferred-revenue check ──────────────────────────────
        // For future-dated Umrah/Hajj/package bookings the performance obligation
        // is satisfied on the travel date, so revenue is deferred (credited to
        // 3201 Deferred Revenue instead of 4100 Travel Services) until then.
        const travelDate    = extractTravelDate(details);
        const isDeferrable   = DEFERRABLE_SERVICE_TYPES.has(booking.serviceType ?? '');
        const isFutureTravel = travelDate != null && travelDate > today;
        const deferRevenue   = isDeferrable && isFutureTravel;

        // ── 6. Build journal lines & invoice items ──────────────────────────
        const typeLabel = BOOKING_TYPE_LABELS[booking.serviceType ?? ''] ?? { ar: 'خدمة سفر', en: 'Travel Service' };

        let jLines: Array<{ code: string; ar: string; en: string; dr: number; cr: number }>;
        let invoiceItems: InvoiceItem[];

        // International transport (VATEX-SA-32) is signalled per-booking via
        // booking.details.isInternational — set at booking creation for flights.
        const isInternational = details['isInternational'] === true;

        if (hasActiveLines) {
          // New path: per-line VAT, per-line revenue model
          jLines       = buildJournalLinesFromBookingLines(activeLines, isVatRegistered, deferRevenue);
          invoiceItems = buildInvoiceItemsFromLines(activeLines, isVatRegistered, booking.serviceType, isInternational);
        } else {
          // Legacy path: aggregated amounts
          const storedCost = booking.costPriceHalalas;
          jLines = buildInvoiceJournalLines(
            revenueModel, isVatRegistered, finalGrandTotal, storedCost,
            (details['serviceFee'] as number | undefined) ?? 0, totalVat, subtotalExclVat,
            deferRevenue,
          );
          // Legacy bookings have one VAT treatment for the whole booking — a
          // VAT-registered agency issuing a zero-VAT invoice means the booking
          // itself is zero-rated (Z), not standard-rated (S).
          const legacyVatCategory: ZatcaVatCategory | undefined = !isVatRegistered ? undefined : (totalVat > 0 ? 'S' : 'Z');
          const legacyExemptionReason = legacyVatCategory
            ? inferZatcaExemptionReason(legacyVatCategory, null, booking.serviceType, isInternational)
            : undefined;
          invoiceItems = buildInvoiceItems(
            details['lineItems'], finalGrandTotal, subtotalExclVat, totalVat, typeLabel,
            legacyVatCategory, legacyExemptionReason,
          );
        }

        // ── ZATCA e-invoice record — only for VAT-registered agencies ────────
        // Builds the UUID + Phase 1 QR + validated UBL payload in one place;
        // throws if the amounts cannot form a ZATCA-valid document.
        const zatcaRecord = isVatRegistered && agency.vatNumber
          ? buildZatcaInvoiceRecord({
              uuid:            crypto.randomUUID(),
              invoiceNumber,
              issueDateTime:   now,
              sellerNameAr:    agency.nameAr,
              sellerNameEn:    agency.nameEn,
              vatNumber:       agency.vatNumber,
              crNumber:        agency.crNumber,
              buyerName:       booking.customerNameAr || booking.customerNameEn || 'عميل نقدي',
              buyerVatNumber,
              vatRatePercent:  agency.vatRate ?? 15,
              subtotalHalalas: subtotalExclVat,
              vatHalalas:      totalVat,
              totalHalalas:    finalGrandTotal,
              items:           invoiceItems,
            })
          : null;

        // ── 6. Write ────────────────────────────────────────────────────────
        await tx.insert(invoices).values({
          id:              invoiceId,
          agencyId,
          invoiceNumber,
          type:            '388',
          bookingId,
          customerId:      booking.customerId ?? null,
          sellerNameAr:    agency.nameAr,
          sellerNameEn:    agency.nameEn ?? agency.nameAr,
          sellerVatNumber: agency.vatNumber ?? null,
          sellerCrNumber:  agency.crNumber  ?? null,
          buyerNameAr:     booking.customerNameAr ?? '',
          buyerNameEn:     booking.customerNameEn ?? '',
          buyerPhone:      booking.customerPhone  ?? '',
          buyerVatNumber,
          subtotalHalalas: subtotalExclVat,
          vatHalalas:      totalVat,
          totalHalalas:    finalGrandTotal,
          paidHalalas:     0,
          issueDate:       today,
          status:          'issued',
          deferredUntil:   deferRevenue ? travelDate : null,
          isEInvoice:      isVatRegistered,
          items:           invoiceItems,
          journalEntryId:  jLines.length > 0 ? jeId : null,
          createdBy:       uid,
          zatcaUuid:       zatcaRecord?.uuid ?? crypto.randomUUID(),
          zatcaQr:         zatcaRecord?.qr ?? null,
        });

        if (jLines.length > 0) {
          await tx.insert(journalEntries).values({
            id:                  jeId,
            agencyId,
            entryNumber:         jeNumber,
            date:                today,
            descriptionAr:       `فاتورة رقم ${invoiceNumber} - ${typeLabel.ar}`,
            descriptionEn:       `Invoice ${invoiceNumber} - ${typeLabel.en}`,
            source:              'invoice',
            sourceId:            invoiceId,
            serviceType:         booking.serviceType ?? null,
            isPosted:            true,
            totalDebitHalalas:   jLines.reduce((s, l) => s + l.dr, 0),
            totalCreditHalalas:  jLines.reduce((s, l) => s + l.cr, 0),
            createdBy:           uid,
          });

          for (let i = 0; i < jLines.length; i++) {
            const l = jLines[i]!;
            await tx.insert(journalLines).values({
              id:            crypto.randomUUID(),
              entryId:       jeId,
              agencyId,
              accountCode:   l.code,
              accountNameAr: l.ar,
              accountNameEn: l.en,
              debitHalalas:  l.dr,
              creditHalalas: l.cr,
              sortOrder:     i + 1,
            });
          }
        }

        // Maintain the supplier (AP) subledger at invoice time. The journal
        // credits account 2000 per costed line, but suppliers.balanceHalalas was
        // only ever decremented on payment — never incremented here — so AP aging
        // understated liabilities vs GL 2000 (CRIT-9). Attribute the AP credit to
        // each line's supplier and increment. Lines with no supplierId (in-house /
        // legacy) stay unattributed and are surfaced by the supplier-aging recon.
        if (hasActiveLines) {
          const apBySupplier = new Map<string, number>();
          for (const l of activeLines) {
            if (l.supplierId && l.totalCostHalalas > 0) {
              apBySupplier.set(l.supplierId, (apBySupplier.get(l.supplierId) ?? 0) + l.totalCostHalalas);
            }
          }
          for (const [sid, amt] of apBySupplier) {
            await tx.update(suppliers)
              .set({ balanceHalalas: sql`${suppliers.balanceHalalas} + ${amt}`, updatedAt: now })
              .where(and(eq(suppliers.id, sid), eq(suppliers.agencyId, agencyId)));
          }
        }

        // Update booking status
        await tx.update(bookings)
          .set({ status: 'completed', updatedAt: now })
          .where(eq(bookings.id, bookingId));

        // Record idempotency (authoritative, inside the tx — see markIdempotencyComplete)
        await markIdempotencyComplete(tx, agencyId, 'createInvoice', idempKey, { invoiceId, invoiceNumber });

        return { invoiceId, invoiceNumber };
      });
    });

    await logAudit({
      agencyId, userId: uid, action: 'create', resource: 'invoice',
      resourceId: result.invoiceId,
      after: { invoiceNumber: result.invoiceNumber, bookingId },
    });

    // Phase 2 clearance/reporting — internally gated on production onboarding
    // (skips with no network cost otherwise) and never throws; a failed
    // submission is recorded on the invoice (zatca_status='failed') for retry.
    const zatca = await submitInvoiceToZatca(agencyId, result.invoiceId);

    return NextResponse.json({ success: true, ...result, zatcaStatus: zatca.status });
  } catch (err) {
    if (err instanceof ApiAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    if (err instanceof BusinessError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    // PostgreSQL unique_violation (23505) — duplicate invoice for same booking
    if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === '23505') {
      return NextResponse.json({ error: 'الحجز لديه فاتورة بالفعل' }, { status: 409 });
    }
    console.error(JSON.stringify({ event: 'create_invoice_failed', error: String(err) }));
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}

// ─── helpers ──────────────────────────────────────────────────────────────────

const BOOKING_TYPE_LABELS: Record<string, { ar: string; en: string }> = {
  flight:    { ar: 'حجز طيران',    en: 'Flight Booking' },
  hotel:     { ar: 'حجز فندق',     en: 'Hotel Booking' },
  package:   { ar: 'باقة سياحية',  en: 'Tour Package' },
  umrah:     { ar: 'برنامج عمرة',  en: 'Umrah Program' },
  hajj:      { ar: 'برنامج حج',    en: 'Hajj Program' },
  visa:      { ar: 'خدمة تأشيرة',  en: 'Visa Service' },
  insurance: { ar: 'تأمين سفر',    en: 'Travel Insurance' },
  transport: { ar: 'خدمة نقل',     en: 'Transport Service' },
};

// ─── buildInvoiceItems ────────────────────────────────────────────────────────
// Returns a multi-line items array when booking.details.lineItems is valid,
// falling back to a single summary line otherwise.
//
// VAT is distributed proportionally across lines (last line absorbs rounding
// remainder) so sum(item.vatHalalas) always equals the invoice totalVat.
function buildInvoiceItems(
  rawLineItems: unknown,
  grandTotal:      number,
  subtotalExclVat: number,
  totalVat:        number,
  typeLabel:       { ar: string; en: string },
  vatCategory?:     ZatcaVatCategory,
  exemptionReason?: ZatcaExemptionReason,
): InvoiceItem[] {
  // ── Validate rawLineItems ────────────────────────────────────────────────
  if (!Array.isArray(rawLineItems) || rawLineItems.length === 0) {
    return [{ description: typeLabel.ar, descriptionEn: typeLabel.en, quantity: 1, unitPriceHalalas: subtotalExclVat, vatHalalas: totalVat, totalHalalas: grandTotal, vatCategory, exemptionReason }];
  }

  const lineItems = rawLineItems as PackageLineItem[];
  for (const item of lineItems) {
    if (!item.descriptionAr || typeof item.descriptionAr !== 'string') {
      return [{ description: typeLabel.ar, descriptionEn: typeLabel.en, quantity: 1, unitPriceHalalas: subtotalExclVat, vatHalalas: totalVat, totalHalalas: grandTotal, vatCategory, exemptionReason }];
    }
    if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
      return [{ description: typeLabel.ar, descriptionEn: typeLabel.en, quantity: 1, unitPriceHalalas: subtotalExclVat, vatHalalas: totalVat, totalHalalas: grandTotal, vatCategory, exemptionReason }];
    }
    if (!Number.isInteger(item.totalHalalas) || item.totalHalalas <= 0) {
      return [{ description: typeLabel.ar, descriptionEn: typeLabel.en, quantity: 1, unitPriceHalalas: subtotalExclVat, vatHalalas: totalVat, totalHalalas: grandTotal, vatCategory, exemptionReason }];
    }
  }

  // Validate sum of line item totals equals invoice grand total
  const lineSum = lineItems.reduce((s, l) => s + l.totalHalalas, 0);
  if (lineSum !== grandTotal) {
    // Sum mismatch — fall back to single line rather than produce invalid ZATCA document
    return [{ description: typeLabel.ar, descriptionEn: typeLabel.en, quantity: 1, unitPriceHalalas: subtotalExclVat, vatHalalas: totalVat, totalHalalas: grandTotal, vatCategory, exemptionReason }];
  }

  // ── Distribute VAT proportionally ────────────────────────────────────────
  let vatAssigned = 0;
  return lineItems.map((item, idx) => {
    const isLast   = idx === lineItems.length - 1;
    const itemVat  = isLast
      ? totalVat - vatAssigned
      : Math.round(totalVat * (item.totalHalalas / grandTotal));
    if (!isLast) vatAssigned += itemVat;
    const itemSubtotal     = item.totalHalalas - itemVat;
    const unitPriceExclVat = item.quantity > 0 ? Math.round(itemSubtotal / item.quantity) : itemSubtotal;
    return {
      description:      item.descriptionAr,
      descriptionEn:    item.descriptionEn ?? null,
      quantity:         item.quantity,
      unitPriceHalalas: unitPriceExclVat,
      vatHalalas:       itemVat,
      totalHalalas:     item.totalHalalas,
      vatCategory,
      exemptionReason,
    };
  });
}

// ─── buildInvoiceItemsFromLines ───────────────────────────────────────────────
// Maps active non-legacy booking_lines to ZATCA invoice line items.
// Each line carries its own vatCategory and vatRateBps — no proportional
// distribution needed (each line already has the exact vatHalalas).
function buildInvoiceItemsFromLines(
  lines: BookingLine[],
  isVatRegistered: boolean,
  bookingServiceType: string | null,
  isInternational: boolean,
): InvoiceItem[] {
  return lines.map(line => {
    const lineVat = isVatRegistered ? line.vatHalalas : 0;
    const vatCategory = isVatRegistered ? (line.vatCategory as ZatcaVatCategory) : undefined;
    const exemptionReason = vatCategory
      ? inferZatcaExemptionReason(vatCategory, line.serviceType, bookingServiceType, isInternational)
      : undefined;
    return {
      description:      line.description,
      descriptionEn:    null,
      quantity:         line.quantity,
      unitPriceHalalas: line.unitPriceExclVatHalalas,
      vatHalalas:       lineVat,
      totalHalalas:     line.totalPriceExclVatHalalas + lineVat,
      vatCategory,
      exemptionReason,
    };
  });
}

// ─── buildJournalLinesFromBookingLines ────────────────────────────────────────
// Produces a balanced double-entry journal from booking_lines.
// Lines are split by revenueModel (agent vs principal); each group gets its
// own GL treatment. A single Dr Receivables covers all lines combined.
//
// Agent lines:
//   Dr AR (cost + fee + VAT)
//   Cr AP Supplier (cost)
//   Cr Revenue Agent (fee = price_excl_vat − cost)
//   Cr VAT Payable (if VAT registered)
//
// Principal lines:
//   Dr AR (revenue + VAT)
//   Cr Revenue Principal (price_excl_vat)
//   Cr VAT Payable (if VAT registered)
//   Dr COGS / Cr AP Supplier (if cost > 0)
function buildJournalLinesFromBookingLines(
  lines: BookingLine[],
  isVatRegistered: boolean,
  deferRevenue: boolean,
): Array<{ code: string; ar: string; en: string; dr: number; cr: number }> {
  const ln = (ac: { code: string; ar: string; en: string }, dr: number, cr: number) =>
    ({ code: ac.code, ar: ac.ar, en: ac.en, dr, cr });

  const revenueAccount = deferRevenue ? AC.deferredRevenue : AC.revenuePrincipal;
  const agentLines     = lines.filter(l => l.revenueModel === 'agent');
  const principalLines = lines.filter(l => l.revenueModel !== 'agent');

  const totalReceivable = lines.reduce((s, l) => {
    return s + l.totalPriceExclVatHalalas + (isVatRegistered ? l.vatHalalas : 0);
  }, 0);

  const result: Array<{ code: string; ar: string; en: string; dr: number; cr: number }> = [];
  result.push(ln(AC.receivable, totalReceivable, 0));

  if (agentLines.length > 0) {
    const totalCost    = agentLines.reduce((s, l) => s + l.totalCostHalalas, 0);
    // Agency fee = customer price excl VAT minus what we pay the supplier
    const totalFee     = agentLines.reduce((s, l) => s + Math.max(0, l.totalPriceExclVatHalalas - l.totalCostHalalas), 0);
    const totalLineVat = isVatRegistered ? agentLines.reduce((s, l) => s + l.vatHalalas, 0) : 0;
    if (totalCost    > 0) result.push(ln(AC.payableSupplier, 0, totalCost));
    if (totalFee     > 0) result.push(ln(AC.revenueAgent, 0, totalFee));
    if (totalLineVat > 0) result.push(ln(AC.vatPayable, 0, totalLineVat));
  }

  if (principalLines.length > 0) {
    const totalRevenue = principalLines.reduce((s, l) => s + l.totalPriceExclVatHalalas, 0);
    const totalLineVat = isVatRegistered ? principalLines.reduce((s, l) => s + l.vatHalalas, 0) : 0;
    const totalCost    = principalLines.reduce((s, l) => s + l.totalCostHalalas, 0);
    if (totalRevenue > 0) result.push(ln(revenueAccount, 0, totalRevenue));
    if (totalLineVat > 0) result.push(ln(AC.vatPayable, 0, totalLineVat));
    if (totalCost    > 0) {
      result.push(ln(AC.costOfServices, totalCost, 0));
      result.push(ln(AC.payableSupplier, 0, totalCost));
    }
  }

  // Rounding residual: ensure Dr = Cr by adjusting the last credit line
  const totalDr = result.reduce((s, l) => s + l.dr, 0);
  const totalCr = result.reduce((s, l) => s + l.cr, 0);
  if (totalDr !== totalCr) {
    const lastCr = [...result].reverse().find(l => l.cr > 0);
    if (lastCr) lastCr.cr += totalDr - totalCr;
  }

  return result;
}

function buildInvoiceJournalLines(
  revenueModel: string,
  isVatRegistered: boolean,
  grandTotal: number,
  totalCost: number,
  serviceFee: number,
  vatAmount: number,
  subtotalExclVat: number,
  deferRevenue = false,
): Array<{ code: string; ar: string; en: string; dr: number; cr: number }> {
  if (grandTotal === 0) return [];
  const ar = (ac: { code: string; ar: string; en: string }, dr: number, cr: number) => ({ code: ac.code, ar: ac.ar, en: ac.en, dr, cr });

  // IFRS 15: future-dated travel packages credit deferred revenue (3201) instead
  // of recognising travel-services revenue (4100) at issuance.
  const revenueAccount = deferRevenue ? AC.deferredRevenue : AC.revenuePrincipal;

  if (revenueModel === 'agent') {
    const hasBreakdown = totalCost > 0 || serviceFee > 0;
    if (hasBreakdown) {
      const lines = [ar(AC.receivable, grandTotal, 0), ar(AC.payableSupplier, 0, totalCost), ar(AC.revenueAgent, 0, serviceFee)];
      if (isVatRegistered && vatAmount > 0) lines.push(ar(AC.vatPayable, 0, vatAmount));
      return lines;
    }
    if (isVatRegistered && vatAmount > 0) {
      return [ar(AC.receivable, grandTotal, 0), ar(AC.revenueAgent, 0, grandTotal - vatAmount), ar(AC.vatPayable, 0, vatAmount)];
    }
    return [ar(AC.receivable, grandTotal, 0), ar(AC.revenueAgent, 0, grandTotal)];
  }

  // Principal model: Dr AR / Cr Revenue (or Deferred Revenue) / Cr VAT
  //                + Dr COGS / Cr AP (if cost known)
  const revenueLines = isVatRegistered && vatAmount > 0
    ? [ar(AC.receivable, grandTotal, 0), ar(revenueAccount, 0, subtotalExclVat), ar(AC.vatPayable, 0, vatAmount)]
    : [ar(AC.receivable, grandTotal, 0), ar(revenueAccount, 0, grandTotal)];

  if (totalCost > 0) {
    revenueLines.push(ar(AC.costOfServices, totalCost, 0));
    revenueLines.push(ar(AC.payableSupplier, 0, totalCost));
  }
  return revenueLines;
}
