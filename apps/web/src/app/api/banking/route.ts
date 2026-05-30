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

    return NextResponse.json({ accounts, transactions, rates });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
