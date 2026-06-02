import { NextResponse } from 'next/server';
import { eq, and, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { bankAccounts, bankTransactions, journalEntries, journalLines } from '@/lib/schema';
import { verifyAuth, assertRole, ApiAuthError, BusinessError, ROLES_ACCOUNTANT_UP } from '@/lib/api-auth';
import { getNextJournalNumber } from '@/lib/invoice-counter';
import { assertPeriodOpen } from '@/lib/period-lock';
import { checkRateLimit, getClientIp, rateLimitHeaders } from '@/lib/rate-limit';

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

    const body = await request.json() as {
      bankAccountId:       string;
      type:                string;    // 'deposit' | 'withdrawal'
      amountHalalas:       number;
      description?:        string;
      reference?:          string;
      date:                string;
      // Optional: override the counter GL account.
      // Deposit default  → 9001 (حساب تعليق - إيرادات غير مصنفة)
      // Withdrawal default → 5400 (مصاريف تشغيلية)
      counterAccountCode?: string;
      counterAccountAr?:   string;
      counterAccountEn?:   string;
    };
    if (!body.bankAccountId || !body.type || !body.amountHalalas || !body.date) {
      return NextResponse.json({ error: 'بيانات ناقصة' }, { status: 400 });
    }
    if (!Number.isInteger(body.amountHalalas) || body.amountHalalas <= 0) {
      return NextResponse.json({ error: 'المبلغ يجب أن يكون عدداً صحيحاً موجباً' }, { status: 400 });
    }
    if (!['deposit', 'withdrawal'].includes(body.type)) {
      return NextResponse.json({ error: 'نوع المعاملة غير صالح' }, { status: 400 });
    }
    await assertPeriodOpen(agencyId, body.date, db);

    const [account] = await db
      .select({ id: bankAccounts.id, currentBalanceHalalas: bankAccounts.currentBalanceHalalas, type: bankAccounts.type, nameAr: bankAccounts.nameAr })
      .from(bankAccounts)
      .where(and(eq(bankAccounts.id, body.bankAccountId), eq(bankAccounts.agencyId, agencyId)));
    if (!account) return NextResponse.json({ error: 'حساب غير موجود' }, { status: 404 });

    const delta      = body.type === 'withdrawal' ? -body.amountHalalas : body.amountHalalas;
    const isDeposit  = delta > 0;

    // GL codes — map account type to GL code
    const acType = account.type;
    const bankGlCode = (acType === 'cash' || acType === 'petty_cash') ? '1100' : '1110';
    const bankGlAr   = (acType === 'cash' || acType === 'petty_cash') ? 'النقدية' : 'البنك';
    const bankGlEn   = (acType === 'cash' || acType === 'petty_cash') ? 'Cash'    : 'Bank';

    await db.transaction(async (tx) => {
      const txId  = crypto.randomUUID();

      // Atomic increment to avoid lost updates under concurrent requests.
      // The DB computes the new balance from its current value, not a stale read.
      const [updatedAccount] = await tx.update(bankAccounts)
        .set({
          currentBalanceHalalas: sql`${bankAccounts.currentBalanceHalalas} + ${delta}`,
          updatedAt: new Date(),
        })
        .where(eq(bankAccounts.id, body.bankAccountId))
        .returning({ currentBalanceHalalas: bankAccounts.currentBalanceHalalas });
      const newBalance = updatedAccount!.currentBalanceHalalas;

      await tx.insert(bankTransactions).values({
        id: txId, agencyId, bankAccountId: body.bankAccountId, type: body.type,
        amountHalalas: body.amountHalalas, balanceAfterHalalas: newBalance,
        description: body.description ?? null, reference: body.reference ?? null,
        date: body.date,
      });

      // Post GL entry for manual deposit / withdrawal
      const now   = new Date();
      const year  = now.getFullYear();
      const jeId  = crypto.randomUUID();
      const jeNum = await getNextJournalNumber(agencyId, year, tx);

      await tx.insert(journalEntries).values({
        id:                  jeId,
        agencyId,
        entryNumber:         jeNum,
        date:                body.date,
        descriptionAr:       body.description ?? `${isDeposit ? 'إيداع' : 'سحب'} — ${account.nameAr}`,
        source:              'manual',
        sourceId:            txId,
        isPosted:            true,
        totalDebitHalalas:   body.amountHalalas,
        totalCreditHalalas:  body.amountHalalas,
        createdBy:           uid,
      });

      // Counter-account: use caller-supplied code or a safe default.
      // Deposits  → default 9001 (Suspense - Unclassified Receipts)   NOT Retained Earnings
      // Withdrawals → default 5400 (Operating Expenses)
      const counterCode = body.counterAccountCode ?? (isDeposit ? '9001' : '5400');
      const counterAr   = body.counterAccountAr   ?? (isDeposit ? 'حساب تعليق - إيرادات غير مصنفة' : 'المصاريف التشغيلية');
      const counterEn   = body.counterAccountEn   ?? (isDeposit ? 'Suspense - Unclassified Receipts' : 'Operating Expenses');

      if (isDeposit) {
        // Deposit: Dr Bank/Cash, Cr counter account
        await tx.insert(journalLines).values([
          { id: crypto.randomUUID(), entryId: jeId, agencyId, accountCode: bankGlCode,  accountNameAr: bankGlAr,   accountNameEn: bankGlEn,   debitHalalas: body.amountHalalas, creditHalalas: 0,                  sortOrder: 1 },
          { id: crypto.randomUUID(), entryId: jeId, agencyId, accountCode: counterCode, accountNameAr: counterAr, accountNameEn: counterEn, debitHalalas: 0,                  creditHalalas: body.amountHalalas, sortOrder: 2 },
        ]);
      } else {
        // Withdrawal: Dr counter account, Cr Bank/Cash
        await tx.insert(journalLines).values([
          { id: crypto.randomUUID(), entryId: jeId, agencyId, accountCode: counterCode, accountNameAr: counterAr,   accountNameEn: counterEn,   debitHalalas: body.amountHalalas, creditHalalas: 0,                  sortOrder: 1 },
          { id: crypto.randomUUID(), entryId: jeId, agencyId, accountCode: bankGlCode,  accountNameAr: bankGlAr,    accountNameEn: bankGlEn,    debitHalalas: 0,                  creditHalalas: body.amountHalalas, sortOrder: 2 },
        ]);
      }
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof ApiAuthError)  return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof BusinessError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(JSON.stringify({ event: 'bank_transaction_failed', error: String(err) }));
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
