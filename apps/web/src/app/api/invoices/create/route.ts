import { NextResponse } from 'next/server';
import { eq, and, sql, ne } from 'drizzle-orm';
import { db } from '@/lib/db';
import { bookings, agencies, invoices, journalEntries, journalLines, customers } from '@/lib/schema';
import { verifyAuth, ApiAuthError, BusinessError } from '@/lib/api-auth';
import { withIdempotency, buildIdempotencyInsert } from '@/lib/idempotency';
import { idempotencyKeys } from '@/lib/schema';
import { getNextInvoiceNumber, getNextJournalNumber } from '@/lib/invoice-counter';
import { assertPeriodOpen } from '@/lib/period-lock';

const AC = {
  receivable:       { code: '1120', ar: 'ذمم مدينة - عملاء',           en: 'Accounts Receivable' },
  payableSupplier:  { code: '2000', ar: 'ذمم دائنة - موردون',          en: 'Accounts Payable' },
  vatPayable:       { code: '2200', ar: 'ضريبة القيمة المضافة مستحقة', en: 'VAT Payable' },
  revenueAgent:     { code: '4000', ar: 'إيراد رسوم الوكالة',           en: 'Revenue - Agency Fees' },
  revenuePrincipal: { code: '4100', ar: 'إيراد خدمات السفر',            en: 'Revenue - Travel Services' },
  costOfServices:   { code: '5000', ar: 'تكلفة الخدمات',                en: 'Cost of Services' },
};

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
}

export async function POST(request: Request) {
  try {
    const { uid, agencyId } = await verifyAuth(request);

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

        const grandTotal  = booking.totalPriceHalalas;
        const storedCost  = booking.costPriceHalalas;
        const details     = (booking.details ?? {}) as Record<string, unknown>;
        const revenueModel = (details['revenueModel'] as string | undefined) ?? 'principal';
        // vatScheme: 'standard' (default) | 'margin' (ZATCA margin scheme for tour operators)
        // Margin scheme: VAT is calculated only on the profit margin (selling - cost).
        const vatScheme    = (details['vatScheme'] as string | undefined) ?? 'standard';

        let subtotalExclVat: number;
        let totalVat: number;
        let finalGrandTotal: number;

        if (!isVatRegistered) {
          subtotalExclVat = grandTotal;
          totalVat = 0;
          finalGrandTotal = grandTotal;
        } else if (revenueModel === 'agent') {
          const storedFee = (details['serviceFee'] as number | undefined) ?? 0;
          const storedVat = (details['vatAmount']  as number | undefined) ?? 0;
          subtotalExclVat = storedCost + storedFee;
          totalVat        = storedVat;
          finalGrandTotal = grandTotal;
        } else if (vatScheme === 'margin' && storedCost > 0) {
          // ZATCA Margin Scheme (Special Scheme for Tour Operators):
          // VAT base = profit margin = selling price - supplier cost (both VAT-inclusive)
          // VAT = margin × rate / (100 + rate)   [tax-inclusive calculation]
          const margin    = Math.max(0, grandTotal - storedCost);
          totalVat        = Math.round(margin * vatRateDecimal / (1 + vatRateDecimal));
          subtotalExclVat = grandTotal - totalVat;
          finalGrandTotal = grandTotal;
        } else {
          subtotalExclVat = Math.round(grandTotal / (1 + vatRateDecimal));
          totalVat        = grandTotal - subtotalExclVat;
          finalGrandTotal = grandTotal;
        }

        // ── 4. Credit-limit guard ───────────────────────────────────────────
        if (booking.customerId) {
          const [customer] = await tx.select({ creditLimitHalalas: customers.creditLimitHalalas })
            .from(customers)
            .where(and(eq(customers.id, booking.customerId), eq(customers.agencyId, agencyId)));

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

        // ── 6. Build journal lines ──────────────────────────────────────────
        const jLines = buildInvoiceJournalLines(
          revenueModel, isVatRegistered, finalGrandTotal, storedCost,
          (details['serviceFee'] as number | undefined) ?? 0, totalVat, subtotalExclVat,
        );

        const typeLabel = BOOKING_TYPE_LABELS[booking.serviceType ?? ''] ?? { ar: 'خدمة سفر', en: 'Travel Service' };

        // Build invoice line items — multi-line if booking.details.lineItems is set
        const rawLineItems = details['lineItems'];
        const invoiceItems = buildInvoiceItems(
          rawLineItems, finalGrandTotal, subtotalExclVat, totalVat, typeLabel,
        );

        // ── 6. Write ────────────────────────────────────────────────────────
        await tx.insert(invoices).values({
          id:              invoiceId,
          agencyId,
          invoiceNumber,
          type:            '380',
          bookingId,
          customerId:      booking.customerId ?? null,
          sellerNameAr:    agency.nameAr,
          sellerNameEn:    agency.nameEn ?? agency.nameAr,
          sellerVatNumber: agency.vatNumber ?? null,
          sellerCrNumber:  agency.crNumber  ?? null,
          buyerNameAr:     booking.customerNameAr ?? '',
          buyerNameEn:     booking.customerNameEn ?? '',
          buyerPhone:      booking.customerPhone  ?? '',
          subtotalHalalas: subtotalExclVat,
          vatHalalas:      totalVat,
          totalHalalas:    finalGrandTotal,
          paidHalalas:     0,
          issueDate:       today,
          status:          'issued',
          isEInvoice:      isVatRegistered,
          items:           invoiceItems,
          journalEntryId:  jLines.length > 0 ? jeId : null,
          createdBy:       uid,
          zatcaUuid:       crypto.randomUUID(),
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

        // Update booking status
        await tx.update(bookings)
          .set({ status: 'completed', updatedAt: now })
          .where(eq(bookings.id, bookingId));

        // Record idempotency
        await tx.insert(idempotencyKeys)
          .values(buildIdempotencyInsert(agencyId, 'createInvoice', idempKey, { invoiceId, invoiceNumber }))
          .onConflictDoNothing();

        return { invoiceId, invoiceNumber };
      });
    });

    return NextResponse.json({ success: true, ...result });
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
): InvoiceItem[] {
  // ── Validate rawLineItems ────────────────────────────────────────────────
  if (!Array.isArray(rawLineItems) || rawLineItems.length === 0) {
    return [{ description: typeLabel.ar, descriptionEn: typeLabel.en, quantity: 1, unitPriceHalalas: subtotalExclVat, vatHalalas: totalVat, totalHalalas: grandTotal }];
  }

  const lineItems = rawLineItems as PackageLineItem[];
  for (const item of lineItems) {
    if (!item.descriptionAr || typeof item.descriptionAr !== 'string') {
      return [{ description: typeLabel.ar, descriptionEn: typeLabel.en, quantity: 1, unitPriceHalalas: subtotalExclVat, vatHalalas: totalVat, totalHalalas: grandTotal }];
    }
    if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
      return [{ description: typeLabel.ar, descriptionEn: typeLabel.en, quantity: 1, unitPriceHalalas: subtotalExclVat, vatHalalas: totalVat, totalHalalas: grandTotal }];
    }
    if (!Number.isInteger(item.totalHalalas) || item.totalHalalas <= 0) {
      return [{ description: typeLabel.ar, descriptionEn: typeLabel.en, quantity: 1, unitPriceHalalas: subtotalExclVat, vatHalalas: totalVat, totalHalalas: grandTotal }];
    }
  }

  // Validate sum of line item totals equals invoice grand total
  const lineSum = lineItems.reduce((s, l) => s + l.totalHalalas, 0);
  if (lineSum !== grandTotal) {
    // Sum mismatch — fall back to single line rather than produce invalid ZATCA document
    return [{ description: typeLabel.ar, descriptionEn: typeLabel.en, quantity: 1, unitPriceHalalas: subtotalExclVat, vatHalalas: totalVat, totalHalalas: grandTotal }];
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
    };
  });
}

function buildInvoiceJournalLines(
  revenueModel: string,
  isVatRegistered: boolean,
  grandTotal: number,
  totalCost: number,
  serviceFee: number,
  vatAmount: number,
  subtotalExclVat: number,
): Array<{ code: string; ar: string; en: string; dr: number; cr: number }> {
  if (grandTotal === 0) return [];
  const ar = (ac: { code: string; ar: string; en: string }, dr: number, cr: number) => ({ code: ac.code, ar: ac.ar, en: ac.en, dr, cr });

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

  // Principal model: Dr AR / Cr Revenue / Cr VAT  +  Dr COGS / Cr AP (if cost known)
  const revenueLines = isVatRegistered && vatAmount > 0
    ? [ar(AC.receivable, grandTotal, 0), ar(AC.revenuePrincipal, 0, subtotalExclVat), ar(AC.vatPayable, 0, vatAmount)]
    : [ar(AC.receivable, grandTotal, 0), ar(AC.revenuePrincipal, 0, grandTotal)];

  if (totalCost > 0) {
    revenueLines.push(ar(AC.costOfServices, totalCost, 0));
    revenueLines.push(ar(AC.payableSupplier, 0, totalCost));
  }
  return revenueLines;
}
