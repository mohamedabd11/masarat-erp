import { NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { cheques, journalEntries, journalLines } from '@/lib/schema';
import { verifyAuth, assertRole, ApiAuthError, BusinessError, ROLES_ACCOUNTANT_UP } from '@/lib/api-auth';
import { getNextJournalNumber } from '@/lib/invoice-counter';
import { assertPeriodOpen } from '@/lib/period-lock';

const AC_RECEIVABLE  = { code: '1120', ar: 'ذمم مدينة - عملاء', en: 'Accounts Receivable' };
const AC_CHEQUES_RCV = { code: '1125', ar: 'أوراق قبض - شيكات', en: 'Cheques Receivable'  };
const AC_BANK        = { code: '1110', ar: 'البنك',              en: 'Bank'                };

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const { uid, agencyId, role } = await verifyAuth(request);
    assertRole(role, [...ROLES_ACCOUNTANT_UP]);
    const body = await request.json() as Record<string, unknown>;
    const now  = new Date();

    await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(cheques)
        .where(and(eq(cheques.id, params.id), eq(cheques.agencyId, agencyId)));

      if (!existing) throw new BusinessError('الشيك غير موجود', 404);

      const newStatus  = body['status'] as string | undefined;
      const prevStatus = existing.status;

      // Validate the status transition BEFORE any write. Only forward transitions
      // are allowed (e.g. cleared→bounced is rejected — it would need extra GL reversal).
      const ALLOWED_CHEQUE_TRANSITIONS: Record<string, string[]> = {
        pending:   ['cleared', 'bounced', 'cancelled'],
        cleared:   [],
        bounced:   [],
        cancelled: [],
      };
      if (newStatus && prevStatus) {
        const allowed = ALLOWED_CHEQUE_TRANSITIONS[prevStatus] ?? [];
        if (!allowed.includes(newStatus)) {
          throw new BusinessError(`انتقال حالة غير مسموح: ${prevStatus} → ${newStatus}`, 422);
        }
      }

      // Allowlist updatable fields — NEVER spread the raw body. Financial/identity
      // columns (amountHalalas, agencyId, id, type, chequeNumber) are immutable here;
      // allowing them would let a status update silently rewrite the cheque amount
      // (which drives the clearance/bounce journal) or move it to another tenant.
      const patch: Record<string, unknown> = { updatedAt: now };
      for (const k of ['status', 'dueDate', 'payerName', 'payeeName', 'notes', 'bankAccountId'] as const) {
        if (body[k] !== undefined) patch[k] = body[k];
      }
      await tx
        .update(cheques)
        .set(patch as Partial<typeof cheques.$inferInsert>)
        .where(and(eq(cheques.id, params.id), eq(cheques.agencyId, agencyId)));

      if (newStatus && newStatus !== prevStatus && existing.type === 'incoming') {
        const year  = now.getFullYear();
        const today = now.toISOString().split('T')[0]!;
        const jeId  = crypto.randomUUID();
        const jeNum = await getNextJournalNumber(agencyId, year, tx);
        const amt   = existing.amountHalalas;

        // Cheque cleared → deposit to bank
        if (newStatus === 'cleared') {
          await assertPeriodOpen(agencyId, today, tx);
          await tx.insert(journalEntries).values({
            id: jeId, agencyId, entryNumber: jeNum, date: today,
            descriptionAr:      `تحصيل شيك ${existing.chequeNumber}`,
            descriptionEn:      `Cheque cleared ${existing.chequeNumber}`,
            source: 'cheque', sourceId: existing.id,
            isPosted: true, totalDebitHalalas: amt, totalCreditHalalas: amt,
            createdBy: uid,
          });
          await tx.insert(journalLines).values([
            { id: crypto.randomUUID(), entryId: jeId, agencyId, accountCode: AC_BANK.code,        accountNameAr: AC_BANK.ar,        accountNameEn: AC_BANK.en,        debitHalalas: amt, creditHalalas: 0,   sortOrder: 1 },
            { id: crypto.randomUUID(), entryId: jeId, agencyId, accountCode: AC_CHEQUES_RCV.code, accountNameAr: AC_CHEQUES_RCV.ar, accountNameEn: AC_CHEQUES_RCV.en, debitHalalas: 0,   creditHalalas: amt, sortOrder: 2 },
          ]);
        }

        // Cheque bounced → reverse the receivable transfer
        if (newStatus === 'bounced') {
          await assertPeriodOpen(agencyId, today, tx);
          await tx.insert(journalEntries).values({
            id: jeId, agencyId, entryNumber: jeNum, date: today,
            descriptionAr:      `شيك مرتجع ${existing.chequeNumber}`,
            descriptionEn:      `Cheque bounced ${existing.chequeNumber}`,
            source: 'cheque', sourceId: existing.id,
            isPosted: true, totalDebitHalalas: amt, totalCreditHalalas: amt,
            createdBy: uid,
          });
          await tx.insert(journalLines).values([
            { id: crypto.randomUUID(), entryId: jeId, agencyId, accountCode: AC_RECEIVABLE.code,  accountNameAr: AC_RECEIVABLE.ar,  accountNameEn: AC_RECEIVABLE.en,  debitHalalas: amt, creditHalalas: 0,   sortOrder: 1 },
            { id: crypto.randomUUID(), entryId: jeId, agencyId, accountCode: AC_CHEQUES_RCV.code, accountNameAr: AC_CHEQUES_RCV.ar, accountNameEn: AC_CHEQUES_RCV.en, debitHalalas: 0,   creditHalalas: amt, sortOrder: 2 },
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
