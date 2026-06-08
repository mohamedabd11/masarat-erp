import { NextResponse } from 'next/server';
import { eq, and, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { bankAccounts, bankTransactions, journalEntries, journalLines } from '@/lib/schema';
import { verifyAuth, ApiAuthError, assertRole, ROLES_ACCOUNTANT_UP } from '@/lib/api-auth';
import { getNextJournalNumber } from '@/lib/invoice-counter';
import { assertPeriodOpen } from '@/lib/period-lock';
import { GL } from '@/lib/gl-accounts';
import { lookupFxRate, fxToHalalas } from '@/lib/fx';

export async function POST(request: Request) {
  try {
    const { uid, agencyId, role } = await verifyAuth(request);
    assertRole(role, [...ROLES_ACCOUNTANT_UP]);
    const body = await request.json() as {
      bankAccountId:       string;
      type:                string;    // 'deposit' | 'withdrawal'
      amountHalalas?:      number;    // SAR amount (SAR accounts)
      // Foreign-currency input (FX accounts): amount in the account currency's
      // minor units + optional rate (×10000, else looked up as of `date`).
      fxAmountMinor?:      number;
      fxRate?:             number;
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
    if (!body.bankAccountId || !body.type || !body.date || (!body.amountHalalas && !body.fxAmountMinor)) {
      return NextResponse.json({ error: 'بيانات ناقصة' }, { status: 400 });
    }
    await assertPeriodOpen(agencyId, body.date, db);

    const [account] = await db
      .select({ id: bankAccounts.id, currentBalanceHalalas: bankAccounts.currentBalanceHalalas, type: bankAccounts.type, nameAr: bankAccounts.nameAr, currency: bankAccounts.currency, fxBalanceMinor: bankAccounts.fxBalanceMinor })
      .from(bankAccounts)
      .where(and(eq(bankAccounts.id, body.bankAccountId), eq(bankAccounts.agencyId, agencyId)));
    if (!account) return NextResponse.json({ error: 'حساب غير موجود' }, { status: 404 });

    // Resolve the SAR amount that drives the GL + balance. For FX-tracked accounts
    // the caller supplies the amount in the account currency; we convert at the
    // transaction rate and also advance the foreign-currency balance.
    const accountIsFx = !!account.currency && account.currency !== 'SAR' && account.fxBalanceMinor != null;
    let amountHalalas:     number;          // SAR equivalent
    let txCurrency:        string | null = null;
    let txFxAmountMinor:   number | null = null;
    let txFxRate:          number | null = null;
    let newFxBalanceMinor: number | null = account.fxBalanceMinor;

    if (accountIsFx && body.fxAmountMinor != null) {
      const fxMinor = body.fxAmountMinor;
      if (!Number.isInteger(fxMinor) || fxMinor <= 0) {
        return NextResponse.json({ error: 'مبلغ العملة الأجنبية غير صالح' }, { status: 400 });
      }
      let rate = body.fxRate ?? null;
      if (rate == null) {
        const r = await lookupFxRate(agencyId, account.currency!, 'SAR', body.date, db);
        rate = r?.storedRate ?? null;
      }
      if (rate == null || !Number.isInteger(rate) || rate <= 0) {
        return NextResponse.json({ error: `سعر الصرف مطلوب لحركة بعملة ${account.currency} — أضف سعر صرف أو مرّر fxRate` }, { status: 400 });
      }
      amountHalalas     = fxToHalalas(fxMinor, rate);
      txCurrency        = account.currency;
      txFxAmountMinor   = fxMinor;
      txFxRate          = rate;
      newFxBalanceMinor = (account.fxBalanceMinor ?? 0) + (body.type === 'withdrawal' ? -fxMinor : fxMinor);
    } else {
      amountHalalas = body.amountHalalas ?? 0;
      if (!Number.isInteger(amountHalalas) || amountHalalas <= 0) {
        return NextResponse.json({ error: 'المبلغ غير صالح' }, { status: 400 });
      }
    }

    const delta      = body.type === 'withdrawal' ? -amountHalalas : amountHalalas;
    const newBalance = account.currentBalanceHalalas + delta;
    const isDeposit  = delta > 0;

    // GL codes — map account type to GL code
    const acType = account.type;
    const bankGl     = (acType === 'cash' || acType === 'petty_cash') ? GL.cash : GL.bank;
    const bankGlCode = bankGl.code;
    const bankGlAr   = bankGl.ar;
    const bankGlEn   = bankGl.en;

    await db.transaction(async (tx) => {
      const txId  = crypto.randomUUID();
      await tx.insert(bankTransactions).values({
        id: txId, agencyId, bankAccountId: body.bankAccountId, type: body.type,
        amountHalalas, balanceAfterHalalas: newBalance,
        currency: txCurrency, fxAmountMinor: txFxAmountMinor, fxRate: txFxRate,
        description: body.description ?? null, reference: body.reference ?? null,
        date: body.date,
      });
      await tx.update(bankAccounts)
        .set({
          currentBalanceHalalas: newBalance,
          ...(accountIsFx ? { fxBalanceMinor: newFxBalanceMinor } : {}),
          updatedAt: new Date(),
        })
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
        totalDebitHalalas:   amountHalalas,
        totalCreditHalalas:  amountHalalas,
        createdBy:           uid,
      });

      // Counter-account: use caller-supplied code or a safe default.
      // Deposits  → default 9001 (Suspense - Unclassified Receipts)   NOT Retained Earnings
      // Withdrawals → default 5400 (Operating Expenses)
      const counterDefault = isDeposit ? GL.suspenseIncome : GL.operatingExpenses;
      const counterCode = body.counterAccountCode ?? counterDefault.code;
      const counterAr   = body.counterAccountAr   ?? counterDefault.ar;
      const counterEn   = body.counterAccountEn   ?? counterDefault.en;

      if (isDeposit) {
        // Deposit: Dr Bank/Cash, Cr counter account
        await tx.insert(journalLines).values([
          { id: crypto.randomUUID(), entryId: jeId, agencyId, accountCode: bankGlCode,  accountNameAr: bankGlAr,   accountNameEn: bankGlEn,   debitHalalas: amountHalalas, creditHalalas: 0,             sortOrder: 1 },
          { id: crypto.randomUUID(), entryId: jeId, agencyId, accountCode: counterCode, accountNameAr: counterAr, accountNameEn: counterEn, debitHalalas: 0,             creditHalalas: amountHalalas, sortOrder: 2 },
        ]);
      } else {
        // Withdrawal: Dr counter account, Cr Bank/Cash
        await tx.insert(journalLines).values([
          { id: crypto.randomUUID(), entryId: jeId, agencyId, accountCode: counterCode, accountNameAr: counterAr,   accountNameEn: counterEn,   debitHalalas: amountHalalas, creditHalalas: 0,             sortOrder: 1 },
          { id: crypto.randomUUID(), entryId: jeId, agencyId, accountCode: bankGlCode,  accountNameAr: bankGlAr,    accountNameEn: bankGlEn,    debitHalalas: 0,             creditHalalas: amountHalalas, sortOrder: 2 },
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
