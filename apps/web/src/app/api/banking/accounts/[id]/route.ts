import { NextResponse } from 'next/server';
import { eq, and, count } from 'drizzle-orm';
import { db } from '@/lib/db';
import { bankAccounts, bankTransactions, journalEntries } from '@/lib/schema';
import { verifyAuth, ApiAuthError, BusinessError } from '@/lib/api-auth';
import { logAudit } from '@/lib/audit';

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    const { uid, agencyId } = await verifyAuth(request);

    const [account] = await db.select().from(bankAccounts)
      .where(and(eq(bankAccounts.id, params.id), eq(bankAccounts.agencyId, agencyId)));
    if (!account) return NextResponse.json({ error: 'الحساب غير موجود' }, { status: 404 });

    // Block deletion if the account has any history. Deleting a bank account used
    // to hard-delete posted journal entries (including those in locked periods),
    // corrupting the trial balance. We now only allow deleting empty, unused,
    // zero-balance accounts.
    const [{ txCount }] = await db.select({ txCount: count() }).from(bankTransactions)
      .where(and(eq(bankTransactions.bankAccountId, params.id), eq(bankTransactions.agencyId, agencyId)));

    const [{ jeCount }] = await db.select({ jeCount: count() }).from(journalEntries)
      .where(and(eq(journalEntries.sourceId, params.id), eq(journalEntries.agencyId, agencyId)));

    if (txCount > 0 || jeCount > 0 || account.currentBalanceHalalas !== 0) {
      throw new BusinessError('لا يمكن حذف حساب بنكي له معاملات أو رصيد غير صفري', 409);
    }

    await db.delete(bankAccounts)
      .where(and(eq(bankAccounts.id, params.id), eq(bankAccounts.agencyId, agencyId)));

    await logAudit({
      agencyId, userId: uid,
      action: 'delete',
      resource: 'bank_account',
      resourceId: params.id,
      before: { nameAr: account.nameAr, type: account.type },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof BusinessError) return NextResponse.json({ error: err.message, canDeactivate: true }, { status: err.status });
    console.error(JSON.stringify({ event: 'delete_bank_account_failed', id: params.id, error: String(err) }));
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const { uid, agencyId } = await verifyAuth(request);
    const body = await request.json() as { isActive: boolean };

    const [account] = await db.select().from(bankAccounts)
      .where(and(eq(bankAccounts.id, params.id), eq(bankAccounts.agencyId, agencyId)));
    if (!account) return NextResponse.json({ error: 'الحساب غير موجود' }, { status: 404 });

    await db.update(bankAccounts)
      .set({ isActive: body.isActive } as never)
      .where(and(eq(bankAccounts.id, params.id), eq(bankAccounts.agencyId, agencyId)));

    await logAudit({
      agencyId, userId: uid,
      action: 'update',
      resource: 'bank_account',
      resourceId: params.id,
      before: { isActive: account.isActive },
      after:  { isActive: body.isActive },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
