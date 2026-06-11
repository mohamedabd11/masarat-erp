import { NextResponse } from 'next/server';
import { eq, and, ne, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { supplierPayments, suppliers, journalEntries, journalLines } from '@/lib/schema';
import { verifyAuth, assertRole, ApiAuthError, BusinessError, ROLES_ADMIN_ONLY } from '@/lib/api-auth';
import { getNextJournalNumber } from '@/lib/invoice-counter';
import { SUPPLIER_PAYMENT_EXPENSE_ACCOUNT, PAYMENT_METHOD_ACCOUNT } from '@/lib/gl-accounts';
import { assertPeriodOpen } from '@/lib/period-lock';

interface ReverseBody {
  supplierPaymentId: string;
  reason?:           string;
}

export async function POST(request: Request) {
  try {
    const { uid, agencyId, role } = await verifyAuth(request);
    assertRole(role, [...ROLES_ADMIN_ONLY]);

    const body = await request.json() as ReverseBody;
    const { supplierPaymentId, reason } = body;

    if (!supplierPaymentId) {
      return NextResponse.json({ error: 'supplierPaymentId مطلوب' }, { status: 400 });
    }

    const result = await db.transaction(async (tx) => {

      const [orig] = await tx.select().from(supplierPayments).where(
        and(eq(supplierPayments.id, supplierPaymentId), eq(supplierPayments.agencyId, agencyId)),
      );
      if (!orig) throw new BusinessError(`سند الصرف ${supplierPaymentId} غير موجود`, 404);
      if (orig.isRefund === 'true') throw new BusinessError('لا يمكن عكس سند استرداد', 400);
      if (orig.status === 'reversed') throw new BusinessError('سند الصرف مُعكوس بالفعل', 409);

      const now  = new Date();
      const year = now.getFullYear();

      const amountHalalas       = orig.amountHalalas;
      const paymentMethod       = orig.method;
      const expenseCategory     = orig.expenseCategory ?? 'other';
      const payeeName           = orig.payeeName ?? orig.supplierName ?? '';
      const originalVoucherNumber = orig.voucherNumber ?? supplierPaymentId;

      const jeNumber            = await getNextJournalNumber(agencyId, year, tx);
      const reversalId          = crypto.randomUUID();
      const jeId                = crypto.randomUUID();
      const reversalVoucherNumber = `${originalVoucherNumber}-REV`;
      const today               = now.toISOString().split('T')[0]!;

      await assertPeriodOpen(agencyId, today, tx);

      const expenseAc = SUPPLIER_PAYMENT_EXPENSE_ACCOUNT[expenseCategory] ?? SUPPLIER_PAYMENT_EXPENSE_ACCOUNT['other']!;
      const paymentAc = PAYMENT_METHOD_ACCOUNT[paymentMethod]             ?? PAYMENT_METHOD_ACCOUNT['cash']!;

      const origJLines = orig.journalEntryId
        ? await tx.select().from(journalLines)
            .where(eq(journalLines.entryId, orig.journalEntryId))
        : [];

      const reversalJLines = origJLines.length > 0
        ? origJLines.map((line, idx) => ({
            id: crypto.randomUUID(), entryId: jeId, agencyId,
            accountCode: line.accountCode,
            accountNameAr: line.accountNameAr,
            accountNameEn: line.accountNameEn,
            debitHalalas: line.creditHalalas,   // flipped
            creditHalalas: line.debitHalalas,   // flipped
            sortOrder: idx + 1,
          }))
        : null; // will fall back to 2-line below

      await tx.insert(supplierPayments).values({
        id:              reversalId,
        agencyId,
        payeeName,
        supplierName:    payeeName,
        amountHalalas,
        method:          paymentMethod,
        voucherNumber:   reversalVoucherNumber,
        expenseCategory,
        date:            today,
        status:          'completed',
        isRefund:        'true',
        originalPaymentId: supplierPaymentId,
        journalEntryId:  jeId,
        createdBy:       uid,
        ...(reason ? { reference: reason } : {}),
      });

      await tx.insert(journalEntries).values({
        id:                 jeId,
        agencyId,
        entryNumber:        jeNumber,
        date:               today,
        descriptionAr:      `عكس سند صرف ${originalVoucherNumber} — ${payeeName}`,
        source:             'payment',
        sourceId:           reversalId,
        isPosted:           true,
        totalDebitHalalas:  amountHalalas,
        totalCreditHalalas: amountHalalas,
        createdBy:          uid,
      });

      // Reversal: reconstruct from original journal lines if available, else fall back to 2-line
      await tx.insert(journalLines).values(
        reversalJLines ?? [
          // fallback 2-line if no original journal found
          { id: crypto.randomUUID(), entryId: jeId, agencyId, accountCode: paymentAc.code, accountNameAr: paymentAc.ar, accountNameEn: paymentAc.en, debitHalalas: amountHalalas, creditHalalas: 0, sortOrder: 1 },
          { id: crypto.randomUUID(), entryId: jeId, agencyId, accountCode: expenseAc.code, accountNameAr: expenseAc.ar, accountNameEn: expenseAc.en, debitHalalas: 0, creditHalalas: amountHalalas, sortOrder: 2 },
        ]
      );

      // Atomically claim the reversal. The row-level lock on UPDATE makes this
      // race-safe: a concurrent reverse will re-evaluate against the committed
      // 'reversed' row, match 0 rows, and roll back (no double reversal).
      const claim = await tx.update(supplierPayments)
        .set({ status: 'reversed' })
        .where(and(eq(supplierPayments.id, supplierPaymentId), ne(supplierPayments.status, 'reversed')))
        .returning({ id: supplierPayments.id });
      if (claim.length === 0) {
        throw new BusinessError('سند الصرف مُعكوس بالفعل', 409);
      }

      // Restore supplier balance if the original payment was linked to a supplier
      if (orig.supplierId) {
        await tx.update(suppliers)
          .set({ balanceHalalas: sql`${suppliers.balanceHalalas} + ${amountHalalas}`, updatedAt: now })
          .where(and(eq(suppliers.id, orig.supplierId), eq(suppliers.agencyId, agencyId)));
      }

      return { id: reversalId, reversalVoucherNumber };
    });

    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    if (err instanceof ApiAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    if (err instanceof BusinessError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error(JSON.stringify({ event: 'supplier_payment_reverse_failed', error: String(err) }));
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
