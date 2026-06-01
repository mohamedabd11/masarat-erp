import { NextResponse } from 'next/server';
import { eq, desc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { bankAccounts, bankTransactions, exchangeRates } from '@/lib/schema';
import { verifyAuth, ApiAuthError } from '@/lib/api-auth';

export async function GET(request: Request) {
  try {
    const { agencyId } = await verifyAuth(request);

    const [accounts, transactions, rates] = await Promise.all([
      db.select().from(bankAccounts).where(eq(bankAccounts.agencyId, agencyId)).orderBy(desc(bankAccounts.createdAt)),
      db.select().from(bankTransactions).where(eq(bankTransactions.agencyId, agencyId)).orderBy(desc(bankTransactions.createdAt)),
      db.select().from(exchangeRates).where(eq(exchangeRates.agencyId, agencyId)).orderBy(desc(exchangeRates.createdAt)),
    ]);

    // Map DB column names → frontend interface names
    const mappedAccounts = accounts.map(a => ({
      ...a,
      balanceHalalas:   a.currentBalanceHalalas,
      bankNameAr:       a.bankName ?? '',
      bankNameEn:       a.bankName ?? '',
      reconciledAt:     a.reconciledAt ? new Date(a.reconciledAt).getTime() : undefined,
      reconciledBalance: a.reconciledBalanceHalalas ?? undefined,
    }));

    const mappedTxs = transactions.map(t => ({
      ...t,
      date:        new Date(t.date).getTime(),
      descAr:      t.description ?? '',
      descEn:      t.description ?? '',
      isReconciled: t.isReconciled ?? false,
    }));

    return NextResponse.json({ accounts: mappedAccounts, transactions: mappedTxs, rates });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
