import { NextResponse } from 'next/server';
import { eq, and, ne, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { bookings, invoices, payments, paymentPlans, paymentPlanInstallments, journalEntries, journalLines } from '@/lib/schema';
import { verifyAuth, assertRole, ApiAuthError, BusinessError, ROLES_ACCOUNTANT_UP } from '@/lib/api-auth';
import { withIdempotency, markIdempotencyComplete } from '@/lib/idempotency';
import { getNextReceiptNumber, getNextJournalNumber } from '@/lib/invoice-counter';
import { assertPeriodOpen } from '@/lib/period-lock';

type RouteCtx = { params: { id: string; installmentId: string } };

const METHOD_ACCOUNT: Record<string, { code: string; ar: string; en: string }> = {
  cash:          { code: '1100', ar: 'الصندوق النقدي', en: 'Cash' },
  bank_transfer: { code: '1110', ar: 'البنك',           en: 'Bank' },
  card:          { code: '1115', ar: 'نقاط البيع',      en: 'POS / Card' },
  online:        { code: '1115', ar: 'نقاط البيع',      en: 'POS / Card' },
};
const AC_RECEIVABLE = { code: '1120', ar: 'ذمم مدينة - عملاء', en: 'Accounts Receivable' };

export async function POST(req: Request, { params }: RouteCtx) {
  try {
    const { uid, agencyId, role } = await verifyAuth(req);
    assertRole(role, [...ROLES_ACCOUNTANT_UP]);
    const { id: bookingId, installmentId } = params;

    const body = await req.json() as Record<string, unknown>;
    const paymentMethod = body['paymentMethod'] as string | undefined;
    if (!paymentMethod || !['cash', 'bank_transfer', 'card', 'online'].includes(paymentMethod)) {
      return NextResponse.json({ error: 'طريقة الدفع يجب أن تكون: cash | bank_transfer | card | online' }, { status: 400 });
    }
    // Idempotency key is server-derived per installment — clients may NOT override
    // it. A client-supplied key would let the same installment be paid twice by
    // sending a fresh key on each retry, bypassing the per-installment guard.
    const idempKey = `inst-pay-${installmentId}`;

    const result = await withIdempotency(idempKey, agencyId, 'installmentPay', async () => {
      return db.transaction(async (tx) => {

        // ── 0. Period lock ────────────────────────────────────────────────────
        const today = new Date().toISOString().split('T')[0]!;
        await assertPeriodOpen(agencyId, today, tx);

        // ── 1. Fetch installment ──────────────────────────────────────────────
        const [installment] = await tx.select()
          .from(paymentPlanInstallments)
          .where(and(
            eq(paymentPlanInstallments.id, installmentId),
            eq(paymentPlanInstallments.agencyId, agencyId),
            eq(paymentPlanInstallments.bookingId, bookingId),
          ));
        if (!installment) throw new BusinessError('القسط غير موجود', 404);
        if (installment.status === 'paid') throw new BusinessError('هذا القسط مدفوع بالفعل', 400);

        const amountHalalas = installment.amountHalalas;

        // ── 2. Fetch invoice ──────────────────────────────────────────────────
        const [invoice] = await tx.select()
          .from(invoices)
          .where(and(eq(invoices.id, installment.invoiceId), eq(invoices.agencyId, agencyId)));
        if (!invoice) throw new BusinessError('الفاتورة غير موجودة', 404);
        if (invoice.status === 'cancelled' || invoice.status === 'refunded' || invoice.status === 'credit_noted') {
          throw new BusinessError('لا يمكن تسجيل دفعة على فاتورة ملغاة أو مستردة أو مُصدر بها إشعار دائن', 422);
        }

        // Also block payment when the underlying booking is cancelled — the
        // invoice may still read 'issued' while the operational booking is dead.
        const [booking] = await tx.select({ status: bookings.status })
          .from(bookings)
          .where(and(eq(bookings.id, bookingId), eq(bookings.agencyId, agencyId)));
        if (booking && booking.status === 'cancelled') {
          throw new BusinessError('لا يمكن تسجيل دفعة على حجز ملغي', 422);
        }

        const remaining = invoice.totalHalalas - invoice.paidHalalas;
        if (amountHalalas > remaining) {
          throw new BusinessError(`مبلغ القسط (${amountHalalas / 100} ر.س) يتجاوز المتبقي (${remaining / 100} ر.س)`, 400);
        }

        // ── 3. Counters + IDs ─────────────────────────────────────────────────
        const now          = new Date();
        const year         = now.getFullYear();
        const receiptNumber = await getNextReceiptNumber(agencyId, year, tx);
        const jeNumber      = await getNextJournalNumber(agencyId, year, tx);
        const paymentId     = crypto.randomUUID();
        const jeId          = crypto.randomUUID();
        const cashAc        = METHOD_ACCOUNT[paymentMethod] ?? METHOD_ACCOUNT['bank_transfer']!;

        // ── 4. Insert payment record ──────────────────────────────────────────
        await tx.insert(payments).values({
          id:            paymentId,
          agencyId,
          invoiceId:     invoice.id,
          bookingId,
          customerId:    invoice.customerId ?? null,
          customerName:  invoice.buyerNameAr ?? '',
          amountHalalas,
          method:        paymentMethod as 'cash' | 'bank_transfer' | 'card' | 'online',
          reference:     (body['reference'] as string | undefined)?.trim() || null,
          voucherNumber: receiptNumber,
          date:          today,
          notes:         (body['notes'] as string | undefined)?.trim() || null,
          journalEntryId: jeId,
          createdBy:     uid,
        });

        // ── 5. GL journal entry ───────────────────────────────────────────────
        await tx.insert(journalEntries).values({
          id:                 jeId,
          agencyId,
          entryNumber:        jeNumber,
          date:               today,
          descriptionAr:      `دفعة قسط #${installment.installmentNumber} — ${invoice.invoiceNumber} — ${receiptNumber}`,
          source:             'payment',
          sourceId:           paymentId,
          isPosted:           true,
          totalDebitHalalas:  amountHalalas,
          totalCreditHalalas: amountHalalas,
          createdBy:          uid,
        });

        await tx.insert(journalLines).values([
          { id: crypto.randomUUID(), entryId: jeId, agencyId, accountCode: cashAc.code, accountNameAr: cashAc.ar, accountNameEn: cashAc.en, debitHalalas: amountHalalas, creditHalalas: 0, sortOrder: 1 },
          { id: crypto.randomUUID(), entryId: jeId, agencyId, accountCode: AC_RECEIVABLE.code, accountNameAr: AC_RECEIVABLE.ar, accountNameEn: AC_RECEIVABLE.en, debitHalalas: 0, creditHalalas: amountHalalas, sortOrder: 2 },
        ]);

        // ── 6. Update invoice (atomic, race-safe) ─────────────────────────────
        const [updatedInv] = await tx.update(invoices)
          .set({
            paidHalalas: sql`${invoices.paidHalalas} + ${amountHalalas}`,
            status: sql`CASE WHEN ${invoices.paidHalalas} + ${amountHalalas} >= ${invoices.totalHalalas} THEN 'paid' ELSE 'partial' END`,
            updatedAt: now,
          })
          .where(and(
            eq(invoices.id, invoice.id),
            sql`(${invoices.totalHalalas} - ${invoices.paidHalalas}) >= ${amountHalalas}`,
          ))
          .returning({ paidHalalas: invoices.paidHalalas, totalHalalas: invoices.totalHalalas });

        if (!updatedInv) throw new BusinessError('تعذّر تسجيل الدفعة — تعارض متزامن، حاول مجدداً', 409);

        // ── 7. Update booking.paidHalalas ─────────────────────────────────────
        await tx.update(bookings)
          .set({ paidHalalas: sql`${bookings.paidHalalas} + ${amountHalalas}`, updatedAt: now })
          .where(and(eq(bookings.id, bookingId), eq(bookings.agencyId, agencyId)));

        // ── 8. Mark installment paid (atomic, race-safe) ──────────────────────
        // Guard on status != 'paid' so a concurrent request (or retry that slipped
        // past the read-check at step 1) cannot flip an already-paid installment a
        // second time. 0 rows → another request won the race → abort.
        const flipped = await tx.update(paymentPlanInstallments)
          .set({ status: 'paid', paidAt: now, paymentId, updatedAt: now })
          .where(and(
            eq(paymentPlanInstallments.id, installmentId),
            ne(paymentPlanInstallments.status, 'paid'),
          ))
          .returning({ id: paymentPlanInstallments.id });
        if (flipped.length === 0) {
          throw new BusinessError('هذا القسط مدفوع بالفعل', 409);
        }

        // ── 9. Check if plan is complete ──────────────────────────────────────
        const unpaid = await tx.select({ id: paymentPlanInstallments.id })
          .from(paymentPlanInstallments)
          .where(and(
            eq(paymentPlanInstallments.planId, installment.planId),
            eq(paymentPlanInstallments.agencyId, agencyId),
          ))
          .then((rows) => rows.filter((r) => r.id !== installmentId));

        // After our update the current installment is paid; check remaining
        const allPaidNow = (await tx.select({ id: paymentPlanInstallments.id, status: paymentPlanInstallments.status })
          .from(paymentPlanInstallments)
          .where(and(
            eq(paymentPlanInstallments.planId, installment.planId),
            eq(paymentPlanInstallments.agencyId, agencyId),
          ))).every((r) => r.status === 'paid' || r.id === installmentId);

        if (allPaidNow) {
          await tx.update(paymentPlans)
            .set({ status: 'completed', updatedAt: now })
            .where(and(eq(paymentPlans.id, installment.planId), eq(paymentPlans.agencyId, agencyId)));
        }

        // ── 10. Idempotency (authoritative, inside the tx — see markIdempotencyComplete)
        await markIdempotencyComplete(tx, agencyId, 'installmentPay', idempKey, { paymentId, receiptNumber });

        return {
          paymentId,
          receiptNumber,
          remainingDueHalalas: updatedInv.totalHalalas - updatedInv.paidHalalas,
        };
      });
    });

    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof BusinessError)  return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(JSON.stringify({ event: 'installment_pay_failed', error: String(err) }));
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
