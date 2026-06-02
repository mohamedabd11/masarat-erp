import { NextResponse } from 'next/server';
import { eq, and, isNull, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { receiptVouchers, invoices, journalEntries, journalLines } from '@/lib/schema';
import { verifyAuth, assertRole, ApiAuthError, BusinessError, ROLES_ACCOUNTANT_UP } from '@/lib/api-auth';
import { checkRateLimit, getClientIp, rateLimitHeaders } from '@/lib/rate-limit';
import { getNextJournalNumber } from '@/lib/invoice-counter';
import { assertPeriodOpen } from '@/lib/period-lock';
import { GL } from '@/lib/gl-accounts';

const AC_DEPOSITS   = GL.customerDeposits;  // 2300
const AC_RECEIVABLE = GL.receivable;        // 1120

interface ApplyBody {
  invoiceId: string;
}

/**
 * Apply a previously-recorded customer deposit (booked to 2300 Customer Deposits
 * via POST /api/receipts/create with no invoiceId) against an outstanding invoice.
 *
 * Journal entry:
 *   Dr 2300  Customer Deposits   (release the advance)
 *      Cr 1120 Accounts Receivable (settle the invoice debt)
 *
 * DEP-01: Uses atomic WHERE invoiceId IS NULL to prevent double-application from
 * concurrent requests that both read the voucher before either has linked it.
 */
export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
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

    const { invoiceId } = await request.json() as ApplyBody;
    if (!invoiceId) {
      return NextResponse.json({ error: 'invoiceId مطلوب' }, { status: 400 });
    }

    const result = await db.transaction(async (tx) => {
      const [voucher] = await tx.select().from(receiptVouchers)
        .where(and(eq(receiptVouchers.id, params.id), eq(receiptVouchers.agencyId, agencyId)));
      if (!voucher) throw new BusinessError('سند القبض غير موجود', 404);
      if (voucher.isRefund === 'true') throw new BusinessError('لا يمكن تطبيق سند استرداد', 400);

      const [inv] = await tx.select().from(invoices)
        .where(and(eq(invoices.id, invoiceId), eq(invoices.agencyId, agencyId)));
      if (!inv) throw new BusinessError('الفاتورة غير موجودة', 404);

      // SM-01: Block applying deposit to terminal-status invoice
      const TERMINAL = new Set(['cancelled', 'void', 'credit_memo']);
      if (TERMINAL.has(inv.status ?? '')) {
        throw new BusinessError(`لا يمكن تطبيق وديعة على فاتورة بحالة "${inv.status}"`, 400);
      }

      const outstanding = inv.totalHalalas - inv.paidHalalas;
      if (voucher.amountHalalas > outstanding) {
        throw new BusinessError(
          `مبلغ الوديعة (${voucher.amountHalalas / 100} ر.س) يتجاوز المتبقي على الفاتورة (${outstanding / 100} ر.س)`,
          400,
        );
      }

      const now   = new Date();
      const year  = now.getFullYear();
      const today = now.toISOString().split('T')[0]!;

      await assertPeriodOpen(agencyId, today, tx);

      // DEP-01: Atomically claim the voucher — only succeeds if invoiceId IS NULL.
      // This prevents two concurrent requests from both applying the same deposit.
      const [claimed] = await tx
        .update(receiptVouchers)
        .set({ invoiceId })
        .where(and(
          eq(receiptVouchers.id, voucher.id),
          isNull(receiptVouchers.invoiceId),
        ))
        .returning({ id: receiptVouchers.id });

      if (!claimed) {
        throw new BusinessError('سند القبض مرتبط بفاتورة بالفعل', 409);
      }

      const jeNumber = await getNextJournalNumber(agencyId, year, tx);
      const jeId     = crypto.randomUUID();
      const amount   = voucher.amountHalalas;

      await tx.insert(journalEntries).values({
        id:                 jeId,
        agencyId,
        entryNumber:        jeNumber,
        date:               today,
        descriptionAr:      `تطبيق وديعة ${voucher.voucherNumber} على فاتورة ${inv.invoiceNumber}`,
        source:             'receipt',
        sourceId:           voucher.id,
        isPosted:           true,
        totalDebitHalalas:  amount,
        totalCreditHalalas: amount,
        createdBy:          uid,
      });

      await tx.insert(journalLines).values([
        { id: crypto.randomUUID(), entryId: jeId, agencyId, accountCode: AC_DEPOSITS.code,   accountNameAr: AC_DEPOSITS.ar,   accountNameEn: AC_DEPOSITS.en,   debitHalalas: amount, creditHalalas: 0,      sortOrder: 1 },
        { id: crypto.randomUUID(), entryId: jeId, agencyId, accountCode: AC_RECEIVABLE.code, accountNameAr: AC_RECEIVABLE.ar, accountNameEn: AC_RECEIVABLE.en, debitHalalas: 0,      creditHalalas: amount, sortOrder: 2 },
      ]);

      // Atomic CAS on invoice: only update if outstanding balance still covers the amount
      const [updatedInv] = await tx.update(invoices)
        .set({
          paidHalalas: sql`${invoices.paidHalalas} + ${amount}`,
          status: sql`CASE WHEN ${invoices.paidHalalas} + ${amount} >= ${invoices.totalHalalas} THEN 'paid' ELSE ${invoices.status} END`,
          updatedAt: now,
        })
        .where(and(
          eq(invoices.id, invoiceId),
          sql`(${invoices.totalHalalas} - ${invoices.paidHalalas}) >= ${amount}`,
        ))
        .returning({ id: invoices.id });

      if (!updatedInv) {
        throw new BusinessError('تعذّر تطبيق الوديعة — المبلغ المتبقي على الفاتورة غير كافٍ', 400);
      }

      return { voucherId: voucher.id, invoiceId, appliedHalalas: amount, journalEntryId: jeId };
    });

    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    if (err instanceof ApiAuthError)  return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof BusinessError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(JSON.stringify({ event: 'receipt_apply_failed', error: String(err) }));
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
