import { NextResponse } from 'next/server';
import { eq, and, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { bankAccounts, bankTransactions, journalEntries, journalLines } from '@/lib/schema';
import { verifyAuth, ApiAuthError } from '@/lib/api-auth';
import { getNextJournalNumber } from '@/lib/invoice-counter';

export async function POST(request: Request) {
  try {
    const { uid, agencyId } = await verifyAuth(request);
    const body = await request.json() as {
      bankAccountId: string; type: string; amountHalalas: number;
      description?: string; reference?: string; date: string;
    };
    if (!body.bankAccountId || !body.type || !body.amountHalalas || !body.date) {
      return NextResponse.json({ error: 'بيانات ناقصة' }, { status: 400 });
    }

    const [account] = await db
      .select({ id: bankAccounts.id, currentBalanceHalalas: bankAccounts.currentBalanceHalalas, type: bankAccounts.type, nameAr: bankAccounts.nameAr })
      .from(bankAccounts)
      .where(and(eq(bankAccounts.id, body.bankAccountId), eq(bankAccounts.agencyId, agencyId)));
    if (!account) return NextResponse.json({ error: 'حساب غير موجود' }, { status: 404 });

    const delta      = body.type === 'withdrawal' ? -body.amountHalalas : body.amountHalalas;
    const newBalance = account.currentBalanceHalalas + delta;
    const isDeposit  = delta > 0;

    // GL codes — map account type to GL code
    const acType = account.type;
    const bankGlCode = (acType === 'cash' || acType === 'petty_cash') ? '1100' : '1110';
    const bankGlAr   = (acType === 'cash' || acType === 'petty_cash') ? 'النقدية' : 'البنك';
    const bankGlEn   = (acType === 'cash' || acType === 'petty_cash') ? 'Cash'    : 'Bank';

    await db.transaction(async (tx) => {
      const txId  = crypto.randomUUID();
      await tx.insert(bankTransactions).values({
        id: txId, agencyId, bankAccountId: body.bankAccountId, type: body.type,
        amountHalalas: body.amountHalalas, balanceAfterHalalas: newBalance,
        description: body.description ?? null, reference: body.reference ?? null,
        date: body.date,
      });
      await tx.update(bankAccounts)
        .set({ currentBalanceHalalas: newBalance, updatedAt: new Date() })
        .where(eq(bankAccounts.id, body.bankAccountId));

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

      if (isDeposit) {
        // Deposit: Dr Bank/Cash, Cr Retained Earnings (3200) as suspense — user should reclassify
        await tx.insert(journalLines).values([
          { id: crypto.randomUUID(), entryId: jeId, agencyId, accountCode: bankGlCode, accountNameAr: bankGlAr,             accountNameEn: bankGlEn,            debitHalalas: body.amountHalalas, creditHalalas: 0,                    sortOrder: 1 },
          { id: crypto.randomUUID(), entryId: jeId, agencyId, accountCode: '3200',     accountNameAr: 'الأرباح المحتجزة',    accountNameEn: 'Retained Earnings', debitHalalas: 0,                   creditHalalas: body.amountHalalas, sortOrder: 2 },
        ]);
      } else {
        // Withdrawal: Dr Operating Expenses (5400), Cr Bank/Cash
        await tx.insert(journalLines).values([
          { id: crypto.randomUUID(), entryId: jeId, agencyId, accountCode: '5400',     accountNameAr: 'المصاريف التشغيلية', accountNameEn: 'Operating Expenses', debitHalalas: body.amountHalalas, creditHalalas: 0,                    sortOrder: 1 },
          { id: crypto.randomUUID(), entryId: jeId, agencyId, accountCode: bankGlCode, accountNameAr: bankGlAr,             accountNameEn: bankGlEn,             debitHalalas: 0,                   creditHalalas: body.amountHalalas, sortOrder: 2 },
        ]);
      }
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(JSON.stringify({ event: 'bank_transaction_failed', error: String(err) }));
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
