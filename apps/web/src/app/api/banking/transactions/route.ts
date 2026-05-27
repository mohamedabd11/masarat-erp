import { NextResponse } from 'next/server';
import { eq, and, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { bankAccounts, bankTransactions } from '@/lib/schema';
import { verifyAuth, ApiAuthError } from '@/lib/api-auth';

export async function POST(request: Request) {
  try {
    const { agencyId } = await verifyAuth(request);
    const body = await request.json() as {
      bankAccountId: string; type: string; amountHalalas: number;
      description?: string; reference?: string; date: string;
    };
    if (!body.bankAccountId || !body.type || !body.amountHalalas || !body.date) {
      return NextResponse.json({ error: 'بيانات ناقصة' }, { status: 400 });
    }
    // Verify account belongs to agency
    const [account] = await db.select({ id: bankAccounts.id, currentBalanceHalalas: bankAccounts.currentBalanceHalalas })
      .from(bankAccounts).where(and(eq(bankAccounts.id, body.bankAccountId), eq(bankAccounts.agencyId, agencyId)));
    if (!account) return NextResponse.json({ error: 'حساب غير موجود' }, { status: 404 });

    const delta = body.type === 'withdrawal' ? -body.amountHalalas : body.amountHalalas;
    const newBalance = account.currentBalanceHalalas + delta;

    await db.transaction(async (tx) => {
      const id = crypto.randomUUID();
      await tx.insert(bankTransactions).values({
        id, agencyId, bankAccountId: body.bankAccountId, type: body.type,
        amountHalalas: body.amountHalalas, balanceAfterHalalas: newBalance,
        description: body.description ?? null, reference: body.reference ?? null,
        date: body.date,
      });
      await tx.update(bankAccounts).set({ currentBalanceHalalas: newBalance, updatedAt: new Date() })
        .where(eq(bankAccounts.id, body.bankAccountId));
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
