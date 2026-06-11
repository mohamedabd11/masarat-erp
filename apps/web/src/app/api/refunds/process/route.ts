import { NextResponse } from 'next/server';
import { eq, and, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { invoices, bookings, payments, journalEntries, journalLines, idempotencyKeys, bookingLines, suppliers } from '@/lib/schema';
import { verifyAuth, assertRole, ApiAuthError, BusinessError, ROLES_ACCOUNTANT_UP } from '@/lib/api-auth';
import { withIdempotency, buildIdempotencyInsert } from '@/lib/idempotency';
import { getNextInvoiceNumber, getNextJournalNumber } from '@/lib/invoice-counter';
import { assertPeriodOpen } from '@/lib/period-lock';
import { buildRefundJournalLines } from '@/lib/refund-journal';
import { buildZatcaInvoiceRecord } from '@/lib/zatca-einvoice';

interface RefundBody {
  bookingId:              string;
  originalInvoiceId:      string;
  refundAmountHalalas:    number;
  cancellationFeeHalalas: number;
  reason:                 string;
  /**
   * Total invoiced value being cancelled (VAT-inclusive). Optional; defaults to
   * `refundAmount + cancellationFee`. Pass a larger value to also void the
   * still-open (unpaid) AR for the cancelled portion.
   */
  cancelledTotalHalalas?: number;
  idempotencyKey?:        string;
}

export async function POST(request: Request) {
  try {
    const { uid, agencyId, role } = await verifyAuth(request);
    assertRole(role, [...ROLES_ACCOUNTANT_UP]);

    const body = await request.json() as RefundBody;
    const { bookingId, originalInvoiceId, refundAmountHalalas, cancellationFeeHalalas, reason } = body;
    const idempKey = body.idempotencyKey ?? crypto.randomUUID();

    if (!bookingId || !originalInvoiceId || !reason) {
      return NextResponse.json({ error: 'بيانات مطلوبة ناقصة' }, { status: 400 });
    }
    if (!Number.isInteger(refundAmountHalalas) || refundAmountHalalas < 0) {
      return NextResponse.json({ error: 'مبلغ الاسترداد غير صالح' }, { status: 400 });
    }
    if (!Number.isInteger(cancellationFeeHalalas) || cancellationFeeHalalas < 0) {
      return NextResponse.json({ error: 'رسوم الإلغاء غير صالحة' }, { status: 400 });
    }
    // At least one of the two must be positive — a 0/0 request would otherwise
    // create an empty credit note and a zero-amount payment record.
    if (refundAmountHalalas + cancellationFeeHalalas <= 0) {
      return NextResponse.json({ error: 'يجب أن يكون مبلغ الاسترداد أو رسوم الإلغاء أكبر من صفر' }, { status: 400 });
    }
    // Optional cancelled-total: if supplied, it must cover at least the cash
    // returned + retained fee (otherwise the unwound AR would be negative).
    if (body.cancelledTotalHalalas !== undefined &&
        (!Number.isInteger(body.cancelledTotalHalalas) ||
         body.cancelledTotalHalalas < refundAmountHalalas + cancellationFeeHalalas)) {
      return NextResponse.json({ error: 'قيمة الجزء الملغى غير صالحة' }, { status: 400 });
    }

    const result = await withIdempotency(idempKey, agencyId, 'processRefund', async () => {
      return db.transaction(async (tx) => {

        // ── 1. Read ────────────────────────────────────────────────────────
        const [invoice] = await tx.select().from(invoices).where(
          and(eq(invoices.id, originalInvoiceId), eq(invoices.agencyId, agencyId)),
        );
        if (!invoice) throw new BusinessError(`الفاتورة ${originalInvoiceId} غير موجودة`, 404);
        if (invoice.status === 'cancelled') throw new BusinessError('الفاتورة ملغاة بالفعل', 400);
        if (invoice.status === 'refunded')  throw new BusinessError('تم استرداد هذه الفاتورة بالفعل', 400);

        const [booking] = await tx.select().from(bookings).where(
          and(eq(bookings.id, bookingId), eq(bookings.agencyId, agencyId)),
        );
        if (!booking) throw new BusinessError(`الحجز ${bookingId} غير موجود`, 404);
        if (booking.status === 'cancelled') throw new BusinessError('الحجز ملغى بالفعل', 400);

        // ── 2. Validate ────────────────────────────────────────────────────
        if (refundAmountHalalas + cancellationFeeHalalas > invoice.paidHalalas) {
          throw new BusinessError(
            `المجموع (${(refundAmountHalalas + cancellationFeeHalalas) / 100} ر.س) يتجاوز المدفوع (${invoice.paidHalalas / 100} ر.س)`,
            400,
          );
        }

        // ── 3. Calculate refund-document amounts (credit-note invoice + ZATCA) ─
        // These describe the customer-facing refund document. The GL journal is
        // built separately in step 5 by reversing the ORIGINAL invoice's lines.
        const originalTotal  = invoice.totalHalalas > 0 ? invoice.totalHalalas : 1;
        const refundRatio    = refundAmountHalalas / originalTotal;
        const refundVat      = Math.round(invoice.vatHalalas * refundRatio);
        const refundSubtotal = refundAmountHalalas - refundVat;

        // Fraction of the invoice being unwound (defaults to refund + retained fee).
        const cancelledTotal = body.cancelledTotalHalalas ?? (refundAmountHalalas + cancellationFeeHalalas);
        const reversalRatio  = cancelledTotal / originalTotal;

        // ── 4. Counters + IDs ───────────────────────────────────────────────
        const now  = new Date();
        const year = now.getFullYear();

        const creditNoteNumber = await getNextInvoiceNumber(agencyId, 'creditNote', year, tx);
        const jeNumber         = await getNextJournalNumber(agencyId, year, tx);
        const creditNoteId     = crypto.randomUUID();
        const jeId             = crypto.randomUUID();
        const refundPaymentId  = crypto.randomUUID();
        const today            = now.toISOString().split('T')[0]!;

        // Block posting into a closed accounting period.
        await assertPeriodOpen(agencyId, today, tx);

        // ── 5. Build the refund GL by reversing the ORIGINAL invoice's journal ─
        // Mirrors invoices/credit-note: read the original entry's lines and reverse
        // each pro-rated by `cancelledTotal`. This correctly handles mixed
        // agent+principal revenue, the real per-line COGS/AP, deferred revenue
        // (3201), and the Bank-vs-AR split for partially-paid invoices.
        const origLines = invoice.journalEntryId
          ? await tx.select({
              accountCode:   journalLines.accountCode,
              accountNameAr: journalLines.accountNameAr,
              accountNameEn: journalLines.accountNameEn,
              debitHalalas:  journalLines.debitHalalas,
              creditHalalas: journalLines.creditHalalas,
            }).from(journalLines).where(eq(journalLines.entryId, invoice.journalEntryId))
          : [];

        const details = (booking.details ?? {}) as Record<string, unknown>;
        const fallbackModel: 'agent' | 'principal' =
          (details['revenueModel'] as string | undefined) === 'agent' ? 'agent' : 'principal';

        const jLines = buildRefundJournalLines({
          originalLines:          origLines,
          originalTotalHalalas:   invoice.totalHalalas,
          originalVatHalalas:     invoice.vatHalalas,
          paidHalalas:            invoice.paidHalalas,
          refundAmountHalalas,
          cancellationFeeHalalas,
          cancelledTotalHalalas:  body.cancelledTotalHalalas,
          isEInvoice:             invoice.isEInvoice,
          fallback:               { revenueModel: fallbackModel, costPriceHalalas: booking.costPriceHalalas ?? 0 },
        });

        // ── ZATCA e-invoice record for the refund credit note (type 381) ────
        // refundSubtotal + refundVat = refundAmountHalalas by construction;
        // never block the refund over the QR.
        let zatcaRecord: ReturnType<typeof buildZatcaInvoiceRecord> | null = null;
        if (invoice.isEInvoice && invoice.sellerVatNumber && invoice.sellerNameAr) {
          try {
            zatcaRecord = buildZatcaInvoiceRecord({
              uuid:                  crypto.randomUUID(),
              invoiceNumber:         creditNoteNumber,
              issueDateTime:         now,
              sellerNameAr:          invoice.sellerNameAr,
              sellerNameEn:          invoice.sellerNameEn,
              vatNumber:             invoice.sellerVatNumber,
              crNumber:              invoice.sellerCrNumber,
              buyerName:             invoice.buyerNameAr || invoice.buyerNameEn || 'عميل',
              buyerVatNumber:        invoice.buyerVatNumber,
              vatRatePercent:        15,
              invoiceTypeCode:       '381',
              subtotalHalalas:       refundSubtotal,
              vatHalalas:            refundVat,
              totalHalalas:          refundAmountHalalas,
              originalInvoiceUuid:   invoice.zatcaUuid,
              originalInvoiceNumber: invoice.invoiceNumber,
            });
          } catch (zErr) {
            console.error(JSON.stringify({ event: 'refund_zatca_record_failed', invoiceId: creditNoteId, error: String(zErr) }));
          }
        }

        // ── 6. Write ────────────────────────────────────────────────────────
        // Credit note (stored as invoice with type='381')
        await tx.insert(invoices).values({
          id:              creditNoteId,
          agencyId,
          invoiceNumber:   creditNoteNumber,
          type:            '381',
          bookingId,
          sellerNameAr:    invoice.sellerNameAr,
          sellerNameEn:    invoice.sellerNameEn,
          sellerVatNumber: invoice.sellerVatNumber,
          buyerNameAr:     invoice.buyerNameAr,
          buyerNameEn:     invoice.buyerNameEn,
          buyerVatNumber:  invoice.buyerVatNumber,
          subtotalHalalas: refundSubtotal,
          vatHalalas:      refundVat,
          totalHalalas:    refundAmountHalalas,
          paidHalalas:     refundAmountHalalas,
          issueDate:       today,
          status:          'issued',
          isEInvoice:      invoice.isEInvoice,
          journalEntryId:  jeId,
          zatcaUuid:       zatcaRecord?.uuid ?? crypto.randomUUID(),
          zatcaQr:         zatcaRecord?.qr ?? null,
          createdBy:       uid,
          notes:           reason,
        });

        // Refund payment record
        await tx.insert(payments).values({
          id:            refundPaymentId,
          agencyId,
          invoiceId:     originalInvoiceId,
          bookingId,
          customerName:  invoice.buyerNameAr ?? '',
          amountHalalas: -refundAmountHalalas,
          method:        'bank_transfer',
          voucherNumber: creditNoteNumber,
          date:          today,
          journalEntryId: jeId,
          createdBy:     uid,
          notes:         reason,
        });

        await tx.insert(journalEntries).values({
          id:                 jeId,
          agencyId,
          entryNumber:        jeNumber,
          date:               today,
          descriptionAr:      cancellationFeeHalalas > 0
            ? `مذكرة دائنة ${creditNoteNumber} - استرداد ${refundAmountHalalas / 100} ر.س ورسوم إلغاء ${cancellationFeeHalalas / 100} ر.س`
            : `مذكرة دائنة ${creditNoteNumber} - استرداد`,
          source:             'receipt',
          sourceId:           creditNoteId,
          isPosted:           true,
          totalDebitHalalas:  jLines.reduce((s, l) => s + l.dr, 0),
          totalCreditHalalas: jLines.reduce((s, l) => s + l.cr, 0),
          createdBy:          uid,
        });

        for (let i = 0; i < jLines.length; i++) {
          const l = jLines[i]!;
          await tx.insert(journalLines).values({
            id: crypto.randomUUID(), entryId: jeId, agencyId,
            accountCode: l.code, accountNameAr: l.ar, accountNameEn: l.en,
            debitHalalas: l.dr, creditHalalas: l.cr, sortOrder: i + 1,
          });
        }

        // Update original invoice atomically: decrement paidHalalas ONLY if the
        // current DB balance still covers this refund + retained fee. This guards
        // against a concurrent refund (different idempotency key) double-spending
        // the same paid amount (lost update). 0 rows → another refund won the race
        // → the whole transaction rolls back (no double credit note / cash-out).
        const refundClaim = await tx.update(invoices)
          .set({
            paidHalalas: sql`${invoices.paidHalalas} - ${refundAmountHalalas}`,
            status: sql`CASE
              WHEN ${invoices.paidHalalas} - ${refundAmountHalalas} <= 0 THEN 'refunded'
              WHEN ${invoices.paidHalalas} - ${refundAmountHalalas} < ${invoices.totalHalalas} THEN 'partial'
              ELSE 'issued' END`,
            updatedAt: now,
          } as never)
          .where(and(
            eq(invoices.id, originalInvoiceId),
            sql`${invoices.paidHalalas} >= ${refundAmountHalalas + cancellationFeeHalalas}`,
          ))
          .returning({ paidHalalas: invoices.paidHalalas });
        if (refundClaim.length === 0) {
          throw new BusinessError('تعذّر تنفيذ الاسترداد — قد يكون استرداد آخر نُفّذ في نفس الوقت، حاول مجدداً', 409);
        }
        const isFullyRefunded = (refundClaim[0]!.paidHalalas ?? 0) <= 0;

        // Decrement supplier subledger balances to mirror the AP (2000) reversal
        // posted above, keeping suppliers.balanceHalalas consistent with GL 2000.
        // Read the still-active lines BEFORE the cascade cancels them. The AP was
        // reversed pro-rated by reversalRatio, so decrement each supplier by the
        // same fraction of its line cost.
        const activeLines = await tx.select({ supplierId: bookingLines.supplierId, totalCostHalalas: bookingLines.totalCostHalalas })
          .from(bookingLines)
          .where(and(
            eq(bookingLines.bookingId, bookingId),
            eq(bookingLines.agencyId, agencyId),
            eq(bookingLines.status, 'active'),
          ));
        const apBySupplier = new Map<string, number>();
        for (const l of activeLines) {
          if (l.supplierId && l.totalCostHalalas > 0) {
            const dec = Math.round(l.totalCostHalalas * reversalRatio);
            if (dec > 0) apBySupplier.set(l.supplierId, (apBySupplier.get(l.supplierId) ?? 0) + dec);
          }
        }
        for (const [sid, amt] of apBySupplier) {
          await tx.update(suppliers)
            .set({ balanceHalalas: sql`GREATEST(0, ${suppliers.balanceHalalas} - ${amt})`, updatedAt: now })
            .where(and(eq(suppliers.id, sid), eq(suppliers.agencyId, agencyId)));
        }

        // Sync booking.paidHalalas to reflect the refund
        if (isFullyRefunded) {
          // Full refund → cancel booking + zero out paid amount
          await tx.update(bookings)
            .set({ status: 'cancelled', paidHalalas: 0, updatedAt: now })
            .where(and(eq(bookings.id, bookingId), eq(bookings.agencyId, agencyId)));

          // Cascade to booking_lines — keeps the financial source-of-truth
          // consistent (no 'active' line items survive under a cancelled booking;
          // see booking-financials.ts and invoices/create's status='active' filter).
          await tx.update(bookingLines)
            .set({ status: 'cancelled', cancelledAt: now, updatedAt: now })
            .where(and(
              eq(bookingLines.bookingId, bookingId),
              eq(bookingLines.agencyId, agencyId),
              eq(bookingLines.status, 'active'),
            ));
        } else {
          // Partial refund → decrement paidHalalas, booking stays active
          await tx.update(bookings)
            .set({
              paidHalalas: sql`GREATEST(0, ${bookings.paidHalalas} - ${refundAmountHalalas})`,
              updatedAt: now,
            })
            .where(and(eq(bookings.id, bookingId), eq(bookings.agencyId, agencyId)));
        }

        await tx.insert(idempotencyKeys)
          .values(buildIdempotencyInsert(agencyId, 'processRefund', idempKey, { refundPaymentId, creditNoteId, creditNoteNumber }))
          .onConflictDoNothing();

        return { creditNoteId, creditNoteNumber, refundAmountHalalas, cancellationFeeHalalas };
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
    console.error(JSON.stringify({ event: 'process_refund_failed', error: String(err) }));
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
