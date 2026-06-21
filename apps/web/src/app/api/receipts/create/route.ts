import { NextResponse } from 'next/server';
import { eq, and, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { receiptVouchers, journalEntries, journalLines, invoices } from '@/lib/schema';
import { verifyAuth, assertRole, ApiAuthError, BusinessError, ROLES_ACCOUNTANT_UP } from '@/lib/api-auth';
import { getNextReceiptNumber, getNextJournalNumber } from '@/lib/invoice-counter';
import { assertPeriodOpen } from '@/lib/period-lock';
import { logAudit } from '@/lib/audit';
import { checkRateLimit, getClientIp, rateLimitHeaders } from '@/lib/rate-limit';
import { withIdempotency, markIdempotencyComplete } from '@/lib/idempotency';
import { GL } from '@/lib/gl-accounts';

interface StandaloneReceiptBody {
  customerNameAr:  string;
  customerNameEn?: string;
  customerPhone?:  string;
  amountHalalas:   number;
  paymentMethod:   string;
  description?:    string;
  reference?:      string;
  notes?:          string;
  // When supplied, the receipt settles an outstanding invoice (Dr cash / Cr 1120 AR)
  // and updates that invoice's paid amount/status. When omitted, the receipt is a
  // future deposit credited to 2300 Customer Deposits.
  invoiceId?:      string;
  idempotencyKey?: string;
}

const METHOD_ACCOUNT: Record<string, { code: string; ar: string; en: string }> = {
  cash:          GL.cash,
  bank_transfer: GL.bank,
  card:          GL.posCard,
  online:        GL.posCard,
};
const AC_DEPOSITS   = GL.customerDeposits;
const AC_RECEIVABLE = GL.receivable;

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

    const body = await request.json() as StandaloneReceiptBody;
    const { customerNameAr, customerNameEn, amountHalalas, paymentMethod, description, reference, notes, invoiceId } = body;
    const idempKey = body.idempotencyKey ?? crypto.randomUUID();

    if (!customerNameAr || !paymentMethod) {
      return NextResponse.json({ error: 'بيانات مطلوبة ناقصة' }, { status: 400 });
    }
    if (!Number.isInteger(amountHalalas) || amountHalalas <= 0) {
      return NextResponse.json({ error: 'مبلغ الدفعة غير صالح' }, { status: 400 });
    }

    const result = await withIdempotency(idempKey, agencyId, 'createReceipt', async () => db.transaction(async (tx) => {
      const now   = new Date();
      const year  = now.getFullYear();
      const today = now.toISOString().split('T')[0]!;

      await assertPeriodOpen(agencyId, today, tx);

      const voucherNumber = await getNextReceiptNumber(agencyId, year, tx);
      const jeNumber      = await getNextJournalNumber(agencyId, year, tx);
      const voucherId     = crypto.randomUUID();
      const jeId          = crypto.randomUUID();
      const paymentAc     = METHOD_ACCOUNT[paymentMethod] ?? METHOD_ACCOUNT['cash']!;

      // If the receipt is applied to a specific invoice, credit Accounts Receivable
      // (settling the customer's debt). Otherwise credit Customer Deposits (a future
      // advance the customer can apply later).
      let creditAc: { code: string; ar: string; en: string } = AC_DEPOSITS;
      if (invoiceId) {
        const [inv] = await tx.select().from(invoices)
          .where(and(eq(invoices.id, invoiceId), eq(invoices.agencyId, agencyId)));
        if (!inv) throw new BusinessError('الفاتورة غير موجودة', 404);
        const outstanding = inv.totalHalalas - inv.paidHalalas;
        if (amountHalalas > outstanding) {
          throw new BusinessError(
            `مبلغ السند (${amountHalalas / 100} ر.س) يتجاوز المتبقي على الفاتورة (${outstanding / 100} ر.س)`,
            400,
          );
        }
        creditAc = AC_RECEIVABLE;

        const [updatedInv] = await tx.update(invoices)
          .set({
            paidHalalas: sql`${invoices.paidHalalas} + ${amountHalalas}`,
            status:      sql`CASE WHEN ${invoices.paidHalalas} + ${amountHalalas} >= ${invoices.totalHalalas} THEN 'paid' ELSE ${invoices.status} END`,
            updatedAt:   now,
          })
          .where(and(
            eq(invoices.id, invoiceId),
            sql`(${invoices.totalHalalas} - ${invoices.paidHalalas}) >= ${amountHalalas}`,
          ))
          .returning({ id: invoices.id });
        if (!updatedInv) throw new BusinessError('تعارض متزامن — حاول مرة أخرى', 409);
      }

      await tx.insert(receiptVouchers).values({
        id:           voucherId,
        agencyId,
        voucherNumber,
        customerName: customerNameAr,
        amountHalalas,
        method:       paymentMethod,
        description:  description ?? null,
        invoiceId:    invoiceId ?? null,
        date:         today,
        journalEntryId: jeId,
        createdBy:    uid,
      });

      await tx.insert(journalEntries).values({
        id:                 jeId,
        agencyId,
        entryNumber:        jeNumber,
        date:               today,
        descriptionAr:      `سند قبض ${voucherNumber} — ${customerNameAr}`,
        source:             'receipt',
        sourceId:           voucherId,
        isPosted:           true,
        totalDebitHalalas:  amountHalalas,
        totalCreditHalalas: amountHalalas,
        createdBy:          uid,
      });

      await tx.insert(journalLines).values([
        { id: crypto.randomUUID(), entryId: jeId, agencyId, accountCode: paymentAc.code, accountNameAr: paymentAc.ar, accountNameEn: paymentAc.en, debitHalalas: amountHalalas, creditHalalas: 0, sortOrder: 1 },
        { id: crypto.randomUUID(), entryId: jeId, agencyId, accountCode: creditAc.code, accountNameAr: creditAc.ar, accountNameEn: creditAc.en, debitHalalas: 0, creditHalalas: amountHalalas, sortOrder: 2 },
      ]);

      // Finalize idempotency inside the tx so commit-and-claim is atomic: a retry
      // after a crash replays the stored result instead of posting a second receipt.
      await markIdempotencyComplete(tx, agencyId, 'createReceipt', idempKey, { id: voucherId, voucherNumber });

      return { id: voucherId, voucherNumber };
    }));

    await logAudit({
      agencyId, userId: uid, action: 'create', resource: 'receipt_voucher',
      resourceId: result.id,
      after: { voucherNumber: result.voucherNumber, amountHalalas, paymentMethod, customerNameAr },
    });

    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    if (err instanceof ApiAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    if (err instanceof BusinessError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error(JSON.stringify({ event: 'receipt_create_failed', error: String(err) }));
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
