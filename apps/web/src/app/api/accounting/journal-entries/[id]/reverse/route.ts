/**
 * POST /api/accounting/journal-entries/:id/reverse
 * Body: { reason?: string }
 *
 * Creates a mirror-image journal entry that exactly reverses the original:
 *  - Every debit becomes a credit and vice-versa
 *  - reversalOf links the new entry back to the original
 *  - The original entry is marked isReversed = true
 *  - The original entry is NEVER deleted or modified (immutable audit trail)
 *
 * Guards:
 *  - Period lock: reversal date (today) must be in an open period
 *  - Closing entries cannot be reversed
 *  - Already-reversed entries cannot be reversed again
 */
import { NextResponse } from 'next/server';
import { eq, and, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { journalEntries, journalLines } from '@/lib/schema';
import { verifyAuth, assertRole, ApiAuthError, BusinessError, ROLES_ACCOUNTANT_UP } from '@/lib/api-auth';
import { assertPeriodOpen } from '@/lib/period-lock';
import { logAudit } from '@/lib/audit';
import { getNextJournalNumber } from '@/lib/invoice-counter';
import type { Tx } from '@/lib/db';

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const { uid, agencyId, role } = await verifyAuth(request);
    assertRole(role, [...ROLES_ACCOUNTANT_UP]);

    const { reason } = await request.json() as { reason?: string };
    const originalId  = params.id;

    const result = await db.transaction(async (tx: Tx) => {
      // ── 1. Load original entry ──────────────────────────────────────────────
      const [original] = await tx
        .select()
        .from(journalEntries)
        .where(and(eq(journalEntries.id, originalId), eq(journalEntries.agencyId, agencyId)))
        .limit(1);

      if (!original) throw new BusinessError('القيد المحاسبي غير موجود', 404);
      if (original.source === 'closing') throw new BusinessError('لا يمكن عكس قيود الإقفال', 400);
      if (original.isReversed) throw new BusinessError('هذا القيد مُعكوس بالفعل', 409);

      // ── 2. Load original lines ──────────────────────────────────────────────
      const lines = await tx
        .select()
        .from(journalLines)
        .where(and(eq(journalLines.entryId, originalId), eq(journalLines.agencyId, agencyId)));

      if (lines.length === 0) throw new BusinessError('القيد لا يحتوي على بنود', 400);

      // ── 3. Period lock — reversal is posted today ───────────────────────────
      const today = new Date().toISOString().split('T')[0]!;
      const year  = new Date().getFullYear();

      await assertPeriodOpen(agencyId, today, tx);

      // ── 4. Create reversal entry ────────────────────────────────────────────
      const reversalId  = crypto.randomUUID();
      const jeNumber    = await getNextJournalNumber(agencyId, year, tx);
      const description = reason
        ? `عكس القيد ${original.entryNumber} — ${reason}`
        : `عكس القيد ${original.entryNumber}`;

      await tx.insert(journalEntries).values({
        id:                 reversalId,
        agencyId,
        entryNumber:        jeNumber,
        date:               today,
        descriptionAr:      description,
        descriptionEn:      `Reversal of ${original.entryNumber}${reason ? ` — ${reason}` : ''}`,
        reference:          original.reference ?? null,
        source:             'reversal',
        sourceId:           originalId,
        reversalOf:         originalId,
        isPosted:           true,
        isReversed:         false,
        totalDebitHalalas:  original.totalCreditHalalas,
        totalCreditHalalas: original.totalDebitHalalas,
        createdBy:          uid,
      });

      // ── 5. Mirror lines with swapped Dr/Cr ─────────────────────────────────
      for (let i = 0; i < lines.length; i++) {
        const l = lines[i]!;
        await tx.insert(journalLines).values({
          id:            crypto.randomUUID(),
          entryId:       reversalId,
          agencyId,
          accountCode:   l.accountCode,
          accountNameAr: l.accountNameAr,
          accountNameEn: l.accountNameEn,
          debitHalalas:  l.creditHalalas,   // swapped
          creditHalalas: l.debitHalalas,    // swapped
          description:   l.description,
          sortOrder:     i + 1,
        });
      }

      // ── 6. Mark original as reversed (immutable flag, no content change) ───
      await tx.update(journalEntries)
        .set({ isReversed: true })
        .where(eq(journalEntries.id, originalId));

      return { reversalId, entryNumber: jeNumber };
    });

    await logAudit({
      agencyId,
      userId:     uid,
      action:     'create',
      resource:   'journal_entry_reversal',
      resourceId: result.reversalId,
      after: { originalId, reversalId: result.reversalId, entryNumber: result.entryNumber, reason },
    });

    return NextResponse.json({
      success:      true,
      reversalId:   result.reversalId,
      entryNumber:  result.entryNumber,
      message:      `تم إنشاء قيد عكسي ${result.entryNumber}`,
    });
  } catch (err) {
    if (err instanceof ApiAuthError)  return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof BusinessError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(JSON.stringify({ event: 'journal_reversal_failed', error: String(err) }));
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
