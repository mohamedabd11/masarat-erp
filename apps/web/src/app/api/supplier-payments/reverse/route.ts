import { NextResponse } from 'next/server';
import { eq, and, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { supplierPayments, suppliers, journalEntries, journalLines } from '@/lib/schema';
import { verifyAuth, assertRole, ApiAuthError, BusinessError, ROLES_ADMIN_ONLY } from '@/lib/api-auth';
import { getNextJournalNumber } from '@/lib/invoice-counter';
import { assertPeriodOpen } from '@/lib/period-lock';
import { GL } from '@/lib/gl-accounts';

interface ReverseBody {
  supplierPaymentId: string;
  reason?:           string;
}

// Must mirror create/route.ts exactly so the reversal credits the same account
// the original debited. 'supplier' debits 2000 (AP), not 5000 (COGS).
// Salaries unified on GL.salaryExpense (6100) to match create/route.ts and the
// primary payroll path — NOT the old local 5100.
const EXPENSE_ACCOUNT: Record<string, { code: string; ar: string; en: string }> = {
  supplier:    GL.payableSupplier,
  salaries:    GL.salaryExpense,
  rent:        { code: '5200', ar: 'الإيجار',             en: 'Rent' },
  marketing:   { code: '5300', ar: 'التسويق والإعلان',    en: 'Marketing' },
  operational: { code: '5400', ar: 'المصاريف التشغيلية',  en: 'Operating Expenses' },
  office:      { code: '5400', ar: 'المصاريف التشغيلية',  en: 'Operating Expenses' },
  other:       { code: '5400', ar: 'المصاريف التشغيلية',  en: 'Operating Expenses' },
};

const METHOD_ACCOUNT: Record<string, { code: string; ar: string; en: string }> = {
  cash:          { code: '1100', ar: 'الصندوق النقدي', en: 'Cash' },
  bank_transfer: { code: '1110', ar: 'البنك',           en: 'Bank' },
  card:          { code: '1115', ar: 'نقاط البيع',      en: 'POS / Card' },
  online:        { code: '1115', ar: 'نقاط البيع',      en: 'POS / Card' },
  check:         { code: '1110', ar: 'البنك',           en: 'Bank' },
};

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

      // Block reversal posting into a closed accounting period.
      await assertPeriodOpen(agencyId, today, tx);

      const expenseAc = EXPENSE_ACCOUNT[expenseCategory] ?? EXPENSE_ACCOUNT['other']!;
      const paymentAc = METHOD_ACCOUNT[paymentMethod]    ?? METHOD_ACCOUNT['cash']!;

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

      // Reversal: credit the payment account, debit the expense account (opposite of original)
      await tx.insert(journalLines).values([
        { id: crypto.randomUUID(), entryId: jeId, agencyId, accountCode: paymentAc.code, accountNameAr: paymentAc.ar, accountNameEn: paymentAc.en, debitHalalas: amountHalalas, creditHalalas: 0, sortOrder: 1 },
        { id: crypto.randomUUID(), entryId: jeId, agencyId, accountCode: expenseAc.code, accountNameAr: expenseAc.ar, accountNameEn: expenseAc.en, debitHalalas: 0, creditHalalas: amountHalalas, sortOrder: 2 },
      ]);

      await tx.update(supplierPayments)
        .set({ status: 'reversed' })
        .where(eq(supplierPayments.id, supplierPaymentId));

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
