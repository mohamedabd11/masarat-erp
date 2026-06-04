import { NextResponse } from 'next/server';
import { eq, and, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { invoices, bookings, payments, journalEntries, journalLines, idempotencyKeys } from '@/lib/schema';
import { verifyAuth, assertRole, ApiAuthError, BusinessError, ROLES_ACCOUNTANT_UP } from '@/lib/api-auth';
import { withIdempotency, buildIdempotencyInsert } from '@/lib/idempotency';
import { getNextInvoiceNumber, getNextJournalNumber } from '@/lib/invoice-counter';
import { assertPeriodOpen } from '@/lib/period-lock';
import { GL } from '@/lib/gl-accounts';

interface RefundBody {
  bookingId:              string;
  originalInvoiceId:      string;
  refundAmountHalalas:    number;
  cancellationFeeHalalas: number;
  reason:                 string;
  idempotencyKey?:        string;
}

const AC = {
  bank:             { code: '1110', ar: 'البنك',                        en: 'Bank' },
  vatPayable:       { code: '2200', ar: 'ضريبة القيمة المضافة مستحقة',  en: 'VAT Payable' },
  revenueAgent:     { code: '4000', ar: 'إيراد رسوم الوكالة',            en: 'Revenue - Agency Fees' },
  revenuePrincipal: { code: '4100', ar: 'إيراد خدمات السفر',             en: 'Revenue - Travel Services' },
  cancellationFee:  { code: '4000', ar: 'إيراد رسوم الإلغاء',            en: 'Cancellation Fee Revenue' },
  // Reversing the original purchase posting (Dr 5000 / Cr 2000 booked at invoice time)
  payableSupplier:  GL.payableSupplier,   // 2000 — Dr to reverse the original AP credit
  costOfServices:   GL.costOfServices,    // 5000 — Cr to reverse the original COGS debit
};

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

        // ── 3. Calculate ────────────────────────────────────────────────────
        const details      = (booking.details ?? {}) as Record<string, unknown>;
        const revenueModel = (details['revenueModel'] as string | undefined) ?? 'principal';
        const revenueAc    = revenueModel === 'agent' ? AC.revenueAgent : AC.revenuePrincipal;

        // Prorate the original invoice's VAT by ratio of each component to the
        // original total. Works for standard rate, margin scheme, or any VAT rate.
        const originalTotal  = invoice.totalHalalas > 0 ? invoice.totalHalalas : 1;
        const refundRatio    = refundAmountHalalas / originalTotal;
        const refundVat      = Math.round(invoice.vatHalalas * refundRatio);
        const refundSubtotal = refundAmountHalalas - refundVat;

        // Cancellation fee VAT (same proportional method)
        const feeRatio       = cancellationFeeHalalas / originalTotal;
        const cancelFeeVat   = invoice.isEInvoice ? Math.round(invoice.vatHalalas * feeRatio) : 0;
        const cancelFeeNet   = cancellationFeeHalalas - cancelFeeVat;

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

        // ── 5. Build journal lines (reversal + cancellation fee) ────────────
        type JLine = { code: string; ar: string; en: string; dr: number; cr: number };
        const jLines: JLine[] = refundVat > 0
          ? [{ ...revenueAc, dr: refundSubtotal, cr: 0 }, { ...AC.vatPayable, dr: refundVat, cr: 0 }, { ...AC.bank, dr: 0, cr: refundAmountHalalas }]
          : [{ ...revenueAc, dr: refundAmountHalalas, cr: 0 }, { ...AC.bank, dr: 0, cr: refundAmountHalalas }];

        // Cancellation fee — reclassify ONLY the net (VAT-exclusive) amount from
        // service revenue to cancellation-fee revenue. The fee money stays in the
        // bank (it was received with the original payment and is not refunded), and
        // the VAT on the retained fee remains in VAT Payable from the original
        // invoice (the fee is still a taxable supply). Debiting service revenue by
        // the GROSS fee and re-crediting VAT here would double-count output VAT and
        // push service revenue negative. This pair is self-balancing (Dr = Cr = net).
        if (cancellationFeeHalalas > 0) {
          jLines.push({
            code: revenueAc.code,
            ar:   'رسوم إلغاء — مقتطعة من الحجز',
            en:   'Cancellation Fee Withheld',
            dr:   cancelFeeNet,
            cr:   0,
          });
          jLines.push({ ...AC.cancellationFee, dr: 0, cr: cancelFeeNet });
        }

        // ── Reverse the original COGS + AP for the refunded portion ─────────
        // The original invoice booked the cost as Dr 5000 (COGS) / Cr 2000 (AP).
        // A refund returns the customer's money AND unwinds the agency's
        // obligation to the supplier, so we reverse the cost proportionally:
        //   Dr 2000 Accounts Payable   (cancel the payable we no longer owe)
        //      Cr 5000 Cost of Services (remove the cost we no longer incur)
        // This pair is self-balancing and does not affect the cash/revenue legs.
        const refundCost = Math.round((booking.costPriceHalalas ?? 0) * refundRatio);
        if (refundCost > 0) {
          jLines.push({ ...AC.payableSupplier, dr: refundCost, cr: 0 });
          jLines.push({ ...AC.costOfServices,  dr: 0, cr: refundCost });
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
          subtotalHalalas: refundSubtotal,
          vatHalalas:      refundVat,
          totalHalalas:    refundAmountHalalas,
          paidHalalas:     refundAmountHalalas,
          issueDate:       today,
          status:          'issued',
          isEInvoice:      invoice.isEInvoice,
          journalEntryId:  jeId,
          zatcaUuid:       crypto.randomUUID(),
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

        // Only cancel the booking on a full refund
        if (isFullyRefunded) {
          await tx.update(bookings)
            .set({ status: 'cancelled', updatedAt: now })
            .where(eq(bookings.id, bookingId));
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
