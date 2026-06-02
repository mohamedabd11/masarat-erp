import { NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { cheques, journalEntries, journalLines } from '@/lib/schema';
import { verifyAuth, assertRole, ApiAuthError, BusinessError, ROLES_ACCOUNTANT_UP } from '@/lib/api-auth';
import { requireFeature } from '@/lib/feature-access';
import { getNextJournalNumber } from '@/lib/invoice-counter';
import { GL } from '@/lib/gl-accounts';

// SM-02: Valid incoming-cheque status transitions.
// bounced→cleared or cancelled→cleared would create phantom bank entries.
const ALLOWED_TRANSITIONS: Record<string, Set<string>> = {
  pending:   new Set(['cleared', 'bounced', 'cancelled']),
  bounced:   new Set(['cancelled']),          // re-presenting → create NEW cheque
  cancelled: new Set([]),                     // terminal — no further transitions
  cleared:   new Set([]),                     // terminal
};

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const { uid, agencyId, role } = await verifyAuth(request);
    assertRole(role, [...ROLES_ACCOUNTANT_UP]);
    await requireFeature(agencyId, 'cheques', db);
    const body = await request.json() as Record<string, unknown>;
    const now  = new Date();

    await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(cheques)
        .where(and(eq(cheques.id, params.id), eq(cheques.agencyId, agencyId)));

      if (!existing) throw new BusinessError('الشيك غير موجود', 404);

      const newStatus  = body['status'] as string | undefined;
      const prevStatus = existing.status ?? 'pending';

      // SM-02: Enforce state machine for incoming cheques
      if (newStatus && newStatus !== prevStatus && existing.type === 'incoming') {
        const allowed = ALLOWED_TRANSITIONS[prevStatus] ?? new Set();
        if (!allowed.has(newStatus)) {
          throw new BusinessError(
            `لا يمكن تغيير حالة الشيك من "${prevStatus}" إلى "${newStatus}". لإعادة تقديم شيك مرتجع، أنشئ شيكاً جديداً.`,
            422,
          );
        }
      }

      await tx
        .update(cheques)
        .set({ ...(body as Partial<typeof cheques.$inferInsert>), updatedAt: now })
        .where(and(eq(cheques.id, params.id), eq(cheques.agencyId, agencyId)));

      if (newStatus && newStatus !== prevStatus && existing.type === 'incoming') {
        const year  = now.getFullYear();
        const today = now.toISOString().split('T')[0]!;
        const jeId  = crypto.randomUUID();
        const jeNum = await getNextJournalNumber(agencyId, year, tx);
        const amt   = existing.amountHalalas;

        // Cheque cleared (only valid from pending) → deposit to bank
        if (newStatus === 'cleared') {
          await tx.insert(journalEntries).values({
            id: jeId, agencyId, entryNumber: jeNum, date: today,
            descriptionAr:      `تحصيل شيك ${existing.chequeNumber}`,
            descriptionEn:      `Cheque cleared ${existing.chequeNumber}`,
            source: 'cheque', sourceId: existing.id,
            isPosted: true, totalDebitHalalas: amt, totalCreditHalalas: amt,
            createdBy: uid,
          });
          await tx.insert(journalLines).values([
            { id: crypto.randomUUID(), entryId: jeId, agencyId, accountCode: GL.bank.code,             accountNameAr: GL.bank.ar,             accountNameEn: GL.bank.en,             debitHalalas: amt, creditHalalas: 0,   sortOrder: 1 },
            { id: crypto.randomUUID(), entryId: jeId, agencyId, accountCode: GL.chequesReceivable.code, accountNameAr: GL.chequesReceivable.ar, accountNameEn: GL.chequesReceivable.en, debitHalalas: 0,   creditHalalas: amt, sortOrder: 2 },
          ]);
        }

        // Cheque bounced (only valid from pending) → reverse the receivable transfer
        if (newStatus === 'bounced') {
          await tx.insert(journalEntries).values({
            id: jeId, agencyId, entryNumber: jeNum, date: today,
            descriptionAr:      `شيك مرتجع ${existing.chequeNumber}`,
            descriptionEn:      `Cheque bounced ${existing.chequeNumber}`,
            source: 'cheque', sourceId: existing.id,
            isPosted: true, totalDebitHalalas: amt, totalCreditHalalas: amt,
            createdBy: uid,
          });
          await tx.insert(journalLines).values([
            { id: crypto.randomUUID(), entryId: jeId, agencyId, accountCode: GL.receivable.code,       accountNameAr: GL.receivable.ar,       accountNameEn: GL.receivable.en,       debitHalalas: amt, creditHalalas: 0,   sortOrder: 1 },
            { id: crypto.randomUUID(), entryId: jeId, agencyId, accountCode: GL.chequesReceivable.code, accountNameAr: GL.chequesReceivable.ar, accountNameEn: GL.chequesReceivable.en, debitHalalas: 0,   creditHalalas: amt, sortOrder: 2 },
          ]);
        }
      }
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof BusinessError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(JSON.stringify({ event: 'update_cheque_failed', error: String(err) }));
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
