import { NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { cheques, journalEntries, journalLines } from '@/lib/schema';
import { verifyAuth, ApiAuthError, BusinessError } from '@/lib/api-auth';
import { getNextJournalNumber } from '@/lib/invoice-counter';
import { assertPeriodOpen } from '@/lib/period-lock';

const AC_RECEIVABLE  = { code: '1120', ar: 'ذمم مدينة - عملاء', en: 'Accounts Receivable' };
const AC_CHEQUES_RCV = { code: '1125', ar: 'أوراق قبض - شيكات', en: 'Cheques Receivable'  };
const AC_BANK        = { code: '1110', ar: 'البنك',              en: 'Bank'                };

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const { uid, agencyId } = await verifyAuth(request);
    const body = await request.json() as Record<string, unknown>;
    const now  = new Date();

    await db.transaction(async (tx) => {
      // Status changes post a journal entry dated today — block closed periods.
      const txDate = now.toISOString().split('T')[0]!;
      await assertPeriodOpen(agencyId, txDate, tx);

      const [existing] = await tx
        .select()
        .from(cheques)
        .where(and(eq(cheques.id, params.id), eq(cheques.agencyId, agencyId)));

      if (!existing) throw new BusinessError('الشيك غير موجود', 404);

      await tx
        .update(cheques)
        .set({ ...(body as Partial<typeof cheques.$inferInsert>), updatedAt: now })
        .where(and(eq(cheques.id, params.id), eq(cheques.agencyId, agencyId)));

      const newStatus  = body['status'] as string | undefined;
      const prevStatus = existing.status;

      if (newStatus && newStatus !== prevStatus && existing.type === 'incoming') {
        const year  = now.getFullYear();
        const today = now.toISOString().split('T')[0]!;
        const jeId  = crypto.randomUUID();
        const jeNum = await getNextJournalNumber(agencyId, year, tx);
        const amt   = existing.amountHalalas;

        // Cheque cleared → deposit to bank
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
            { id: crypto.randomUUID(), entryId: jeId, agencyId, accountCode: AC_BANK.code,        accountNameAr: AC_BANK.ar,        accountNameEn: AC_BANK.en,        debitHalalas: amt, creditHalalas: 0,   sortOrder: 1 },
            { id: crypto.randomUUID(), entryId: jeId, agencyId, accountCode: AC_CHEQUES_RCV.code, accountNameAr: AC_CHEQUES_RCV.ar, accountNameEn: AC_CHEQUES_RCV.en, debitHalalas: 0,   creditHalalas: amt, sortOrder: 2 },
          ]);
        }

        // Cheque bounced → reverse the receivable transfer
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
