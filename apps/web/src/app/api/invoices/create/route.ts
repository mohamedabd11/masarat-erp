import { NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { bookings, agencies, invoices, journalEntries, journalLines } from '@/lib/schema';
import { verifyAuth, ApiAuthError } from '@/lib/api-auth';
import { withIdempotency, buildIdempotencyInsert } from '@/lib/idempotency';
import { idempotencyKeys } from '@/lib/schema';
import { getNextInvoiceNumber, getNextJournalNumber } from '@/lib/invoice-counter';

const AC = {
  receivable:       { code: '1120', ar: 'ذمم مدينة - عملاء',           en: 'Accounts Receivable' },
  payableSupplier:  { code: '2000', ar: 'ذمم دائنة - موردون',          en: 'Accounts Payable' },
  vatPayable:       { code: '2200', ar: 'ضريبة القيمة المضافة مستحقة', en: 'VAT Payable' },
  revenueAgent:     { code: '4000', ar: 'إيراد رسوم الوكالة',           en: 'Revenue - Agency Fees' },
  revenuePrincipal: { code: '4100', ar: 'إيراد خدمات السفر',            en: 'Revenue - Travel Services' },
};

interface InvoiceCreateBody {
  bookingId: string;
  idempotencyKey?: string;
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
        if (!booking) throw new Error(`الحجز ${bookingId} غير موجود`);

        const [agency] = await tx.select().from(agencies).where(eq(agencies.id, agencyId));
        if (!agency) throw new Error(`الوكالة ${agencyId} غير موجودة`);

        // ── 2. Validate ────────────────────────────────────────────────────
        if (booking.status !== 'confirmed' && booking.status !== 'completed') {
          throw new Error(`لا يمكن إصدار فاتورة للحجز بحالة: ${booking.status}`);
        }

        // Check no existing invoice for this booking
        const [existingInvoice] = await tx.select({ id: invoices.id }).from(invoices).where(
          and(eq(invoices.bookingId, bookingId), eq(invoices.agencyId, agencyId)),
        ).limit(1);
        if (existingInvoice) throw new Error(`الحجز ${bookingId} لديه فاتورة بالفعل`);

        // ── 3. Calculate amounts ────────────────────────────────────────────
        const now = new Date();
        const year = now.getFullYear();
        const isVatRegistered = agency.isVatRegistered === true;
        const vatRateDecimal  = (agency.vatRate ?? 15) / 100;

        const grandTotal  = booking.totalPriceHalalas;
        const storedCost  = booking.costPriceHalalas;
        const details     = (booking.details ?? {}) as Record<string, unknown>;
        const revenueModel = (details['revenueModel'] as string | undefined) ?? 'principal';

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
        } else {
          subtotalExclVat = Math.round(grandTotal / (1 + vatRateDecimal));
          totalVat        = grandTotal - subtotalExclVat;
          finalGrandTotal = grandTotal;
        }

        // ── 4. Counter + IDs ────────────────────────────────────────────────
        const invoiceNumber = await getNextInvoiceNumber(agencyId, 'taxInvoice', year, tx);
        const jeNumber      = await getNextJournalNumber(agencyId, year, tx);
        const invoiceId     = crypto.randomUUID();
        const jeId          = crypto.randomUUID();

        const today  = now.toISOString().split('T')[0]!;
        const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

        // ── 5. Build journal lines ──────────────────────────────────────────
        const jLines = buildInvoiceJournalLines(
          revenueModel, isVatRegistered, finalGrandTotal, storedCost,
          (details['serviceFee'] as number | undefined) ?? 0, totalVat, subtotalExclVat,
        );

        const typeLabel = BOOKING_TYPE_LABELS[booking.serviceType ?? ''] ?? { ar: 'خدمة سفر', en: 'Travel Service' };

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
          items:           [{ description: typeLabel.ar, quantity: 1, unitPriceHalalas: subtotalExclVat, vatHalalas: totalVat, totalHalalas: finalGrandTotal }],
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
    console.error(JSON.stringify({ event: 'create_invoice_failed', error: String(err) }));
    const message = err instanceof Error ? err.message : 'خطأ في الخادم';
    return NextResponse.json({ error: message }, { status: 500 });
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

  if (isVatRegistered && vatAmount > 0) {
    return [ar(AC.receivable, grandTotal, 0), ar(AC.revenuePrincipal, 0, subtotalExclVat), ar(AC.vatPayable, 0, vatAmount)];
  }
  return [ar(AC.receivable, grandTotal, 0), ar(AC.revenuePrincipal, 0, grandTotal)];
}
