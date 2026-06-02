import { NextResponse } from 'next/server';
import { eq, and, desc, gt } from 'drizzle-orm';
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
  // Refund cash-out account. If omitted, resolved from the original payment method.
  paymentMethod?:         string;
  idempotencyKey?:        string;
}

// Cash/bank account the refund is paid out of — mirrors payments/record route.
const METHOD_ACCOUNT: Record<string, { code: string; ar: string; en: string }> = {
  cash:          GL.cash,
  bank_transfer: GL.bank,
  card:          GL.posCard,
  online:        GL.posCard,
};

const AC = {
  bank:             { code: '1110', ar: 'البنك',                        en: 'Bank' },
  receivable:       GL.receivable,   // 1120 — clear any unpaid AR on cancellation
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
    const bodyPaymentMethod = body.paymentMethod;
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
        // Prevent double refunds — atomic check inside the transaction complements
        // the idempotency-key guard against distinct keys targeting the same invoice.
        if (invoice.status === 'refunded') throw new BusinessError('تم استرداد هذه الفاتورة بالفعل', 409);

        const [booking] = await tx.select().from(bookings).where(
          and(eq(bookings.id, bookingId), eq(bookings.agencyId, agencyId)),
        );
        if (!booking) throw new BusinessError(`الحجز ${bookingId} غير موجود`, 404);
        if (booking.status === 'cancelled') throw new BusinessError('الحجز ملغى بالفعل', 400);

        // Resolve the cash-out account from the original payment method (the refund
        // should leave the same account the money came in on), falling back to the
        // optional body override then to bank_transfer.
        const [lastPayment] = await tx
          .select({ method: payments.method })
          .from(payments)
          .where(and(
            eq(payments.invoiceId, originalInvoiceId),
            eq(payments.agencyId, agencyId),
            gt(payments.amountHalalas, 0),
          ))
          .orderBy(desc(payments.date))
          .limit(1);
        const refundMethod = lastPayment?.method ?? bodyPaymentMethod ?? 'bank_transfer';
        const cashAc       = METHOD_ACCOUNT[refundMethod] ?? GL.bank;

        // ── 2. Validate ────────────────────────────────────────────────────
        if (refundAmountHalalas + cancellationFeeHalalas > invoice.paidHalalas) {
          throw new BusinessError(
            `المجموع (${(refundAmountHalalas + cancellationFeeHalalas) / 100} ر.س) يتجاوز المدفوع (${invoice.paidHalalas / 100} ر.س)`,
            400,
          );
        }

        // ── 3. Calculate ────────────────────────────────────────────────────
        const details      = (booking.details ?? {}) as Record<string, unknown>;
        const revenueModel = (details['revenueModel'] as string | undefined) ?? 'agent';
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
          ? [{ ...revenueAc, dr: refundSubtotal, cr: 0 }, { ...AC.vatPayable, dr: refundVat, cr: 0 }, { ...cashAc, dr: 0, cr: refundAmountHalalas }]
          : [{ ...revenueAc, dr: refundAmountHalalas, cr: 0 }, { ...cashAc, dr: 0, cr: refundAmountHalalas }];

        // Cancellation fee lines — explicitly journalized (BUG-02 fix).
        // The fee was already received in the original payment and remains in bank;
        // we reclassify it from service revenue to cancellation fee revenue.
        // M-A: service revenue was originally recognised NET of VAT (the VAT was
        // credited to 2200 at invoice time and stays there). So the reclassification
        // moves only the NET fee — debiting revenue by the gross fee would
        // over-reverse revenue by the VAT portion.
        //   Dr <service revenue>      cancelFeeNet
        //      Cr 4000 Cancellation Fee Revenue  cancelFeeNet
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

        // ── M-B: write off any uncollected receivable on cancellation ──────────
        // If the customer never fully paid, the unpaid portion still sits on 1120
        // AR from the original invoice posting. Cancelling the invoice voids that
        // claim, so we write it off against revenue:
        //   Dr <service revenue>   unpaidHalalas
        //      Cr 1120 AR          unpaidHalalas
        const unpaidHalalas = invoice.totalHalalas - invoice.paidHalalas;
        if (unpaidHalalas > 0) {
          jLines.push({ ...revenueAc, dr: unpaidHalalas, cr: 0 });
          jLines.push({ ...AC.receivable, dr: 0, cr: unpaidHalalas });
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

        // Update original invoice and booking
        await tx.update(invoices)
          .set({ status: 'refunded', updatedAt: now })
          .where(eq(invoices.id, originalInvoiceId));

        await tx.update(bookings)
          .set({ status: 'cancelled', updatedAt: now })
          .where(eq(bookings.id, bookingId));

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
