/**
 * POST /api/invoices/[id]/apply-advance
 *
 * Applies an existing receipt voucher (advance deposit sitting in account 2300)
 * against this invoice's accounts-receivable balance.
 *
 * IFRS 15 entry produced:
 *   Dr. Customer Deposits (2300)   = applyAmount
 *   Cr. Accounts Receivable (1120) = applyAmount
 *
 * This reclassifies the contract liability into a payment against AR,
 * reducing the amount the customer still owes on the invoice.
 */
import { NextResponse } from 'next/server';
import { eq, and, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { invoices, receiptVouchers, journalEntries, journalLines } from '@/lib/schema';
import { verifyAuth, assertRole, ApiAuthError, BusinessError, ROLES_ACCOUNTANT_UP } from '@/lib/api-auth';
import { logAudit } from '@/lib/audit';
import { getNextJournalNumber } from '@/lib/invoice-counter';

const AC_DEPOSITS    = { code: '2300', ar: 'ودائع العملاء',          en: 'Customer Deposits' };
const AC_RECEIVABLE  = { code: '1120', ar: 'ذمم مدينة - عملاء',      en: 'Accounts Receivable' };

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const { uid, agencyId, role } = await verifyAuth(request);
    assertRole(role, [...ROLES_ACCOUNTANT_UP]);

    const body = await request.json() as { voucherId: string; amountHalalas?: number };
    if (!body.voucherId) {
      return NextResponse.json({ error: 'voucherId مطلوب' }, { status: 400 });
    }

    const result = await db.transaction(async (tx) => {
      // ── 1. Load & validate invoice ─────────────────────────────────────────
      const [invoice] = await tx.select().from(invoices)
        .where(and(eq(invoices.id, params.id), eq(invoices.agencyId, agencyId), isNull(invoices.deletedAt)));
      if (!invoice) throw new BusinessError('الفاتورة غير موجودة', 404);
      if (invoice.status === 'cancelled') throw new BusinessError('لا يمكن التطبيق على فاتورة ملغاة', 400);

      const remainingDue = invoice.totalHalalas - (invoice.paidHalalas ?? 0);
      if (remainingDue <= 0) throw new BusinessError('الفاتورة مسددة بالكامل بالفعل', 400);

      // ── 2. Load & validate receipt voucher ────────────────────────────────
      const [voucher] = await tx.select().from(receiptVouchers)
        .where(and(eq(receiptVouchers.id, body.voucherId), eq(receiptVouchers.agencyId, agencyId)));
      if (!voucher) throw new BusinessError('سند القبض غير موجود', 404);
      if (voucher.invoiceId) throw new BusinessError('سند القبض مُطبَّق مسبقاً على فاتورة أخرى', 409);
      if (voucher.isRefund === 'true') throw new BusinessError('لا يمكن تطبيق سند استرداد', 400);

      // ── 3. Determine apply amount ─────────────────────────────────────────
      const applyAmount = body.amountHalalas
        ? Math.min(body.amountHalalas, voucher.amountHalalas, remainingDue)
        : Math.min(voucher.amountHalalas, remainingDue);

      if (applyAmount <= 0) throw new BusinessError('مبلغ التطبيق غير صالح', 400);

      // ── 4. Journal entry: Dr 2300 / Cr 1120 ─────────────────────────────
      const now      = new Date();
      const year     = now.getFullYear();
      const today    = now.toISOString().split('T')[0]!;
      const jeNum    = await getNextJournalNumber(agencyId, year, tx);
      const jeId     = crypto.randomUUID();

      await tx.insert(journalEntries).values({
        id:                 jeId,
        agencyId,
        entryNumber:        jeNum,
        date:               today,
        descriptionAr:      `تطبيق دفعة مقدمة ${voucher.voucherNumber} على فاتورة ${invoice.invoiceNumber}`,
        descriptionEn:      `Apply advance ${voucher.voucherNumber} to invoice ${invoice.invoiceNumber}`,
        source:             'receipt',
        sourceId:           invoice.id,
        isPosted:           true,
        totalDebitHalalas:  applyAmount,
        totalCreditHalalas: applyAmount,
        createdBy:          uid,
      });

      await tx.insert(journalLines).values([
        {
          id: crypto.randomUUID(), entryId: jeId, agencyId,
          accountCode: AC_DEPOSITS.code, accountNameAr: AC_DEPOSITS.ar, accountNameEn: AC_DEPOSITS.en,
          debitHalalas: applyAmount, creditHalalas: 0, sortOrder: 1,
        },
        {
          id: crypto.randomUUID(), entryId: jeId, agencyId,
          accountCode: AC_RECEIVABLE.code, accountNameAr: AC_RECEIVABLE.ar, accountNameEn: AC_RECEIVABLE.en,
          debitHalalas: 0, creditHalalas: applyAmount, sortOrder: 2,
        },
      ]);

      // ── 5. Update invoice paidHalalas & status ────────────────────────────
      const newPaid = (invoice.paidHalalas ?? 0) + applyAmount;
      const newStatus = newPaid >= invoice.totalHalalas ? 'paid'
        : newPaid > 0 ? 'partial'
        : invoice.status;

      await tx.update(invoices)
        .set({ paidHalalas: newPaid, status: newStatus, updatedAt: now })
        .where(eq(invoices.id, invoice.id));

      // ── 6. Link voucher to invoice ────────────────────────────────────────
      await tx.update(receiptVouchers)
        .set({ invoiceId: invoice.id })
        .where(eq(receiptVouchers.id, body.voucherId));

      return { applyAmount, newPaid, newStatus, journalEntryId: jeId };
    });

    await logAudit({
      agencyId, userId: uid, action: 'update', resource: 'invoice', resourceId: params.id,
      after: { action: 'apply_advance', voucherId: body.voucherId, applyAmount: result.applyAmount },
    });

    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof BusinessError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(JSON.stringify({ event: 'apply_advance_failed', error: String(err) }));
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
