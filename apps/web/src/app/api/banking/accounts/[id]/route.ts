import { NextResponse } from 'next/server';
import { eq, and, count } from 'drizzle-orm';
import { db } from '@/lib/db';
import { bankAccounts, bankTransactions, journalEntries, journalLines } from '@/lib/schema';
import { verifyAuth, assertRole, ApiAuthError, ROLES_ACCOUNTANT_UP } from '@/lib/api-auth';
import { logAudit } from '@/lib/audit';

export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    const { uid, agencyId, role } = await verifyAuth(request);
    assertRole(role, [...ROLES_ACCOUNTANT_UP]);

    const [account] = await db.select().from(bankAccounts)
      .where(and(eq(bankAccounts.id, params.id), eq(bankAccounts.agencyId, agencyId)));
    if (!account) return NextResponse.json({ error: 'الحساب غير موجود' }, { status: 404 });

    // Check for linked transactions — cannot delete if any exist
    const [{ txCount }] = await db.select({ txCount: count() }).from(bankTransactions)
      .where(and(eq(bankTransactions.bankAccountId, params.id), eq(bankTransactions.agencyId, agencyId)));

    if (txCount > 0) {
      return NextResponse.json(
        { error: `لا يمكن حذف الحساب — يحتوي على ${txCount} معاملة. يمكنك تعطيله بدلاً من حذفه.`, canDeactivate: true },
        { status: 409 },
      );
    }

    await db.transaction(async (tx) => {
      // Remove opening-balance journal entry if one exists (sourceId = account id)
      const [je] = await tx.select({ id: journalEntries.id }).from(journalEntries)
        .where(and(eq(journalEntries.sourceId, params.id), eq(journalEntries.agencyId, agencyId)))
        .limit(1);

      if (je) {
        await tx.delete(journalLines).where(eq(journalLines.entryId, je.id));
        await tx.delete(journalEntries).where(eq(journalEntries.id, je.id));
      }

      await tx.delete(bankAccounts)
        .where(and(eq(bankAccounts.id, params.id), eq(bankAccounts.agencyId, agencyId)));
    });

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
    console.error(JSON.stringify({ event: 'delete_bank_account_failed', id: params.id, error: String(err) }));
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const { uid, agencyId, role } = await verifyAuth(request);
    assertRole(role, [...ROLES_ACCOUNTANT_UP]);
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
