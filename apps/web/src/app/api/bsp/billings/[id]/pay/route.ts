/**
 * POST /api/bsp/billings/[id]/pay — settle a BSP billing against the bank/cash
 *   body: { paymentMethod?: 'bank_transfer' | 'cash', notes? }
 *
 * Posts:
 *   DR 2150 BSP Payable   (discharge the IATA/BSP liability)
 *      CR 1110 Bank / 1100 Cash (settled)
 * and marks the billing status = 'paid'.
 */
import { NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { bspBillings, journalEntries, journalLines } from '@/lib/schema';
import { verifyAuth, assertRole, ApiAuthError, BusinessError, ROLES_ADMIN_ONLY } from '@/lib/api-auth';
import { getNextJournalNumber } from '@/lib/invoice-counter';
import { assertPeriodOpen } from '@/lib/period-lock';
import { GL } from '@/lib/gl-accounts';

const METHOD_ACCOUNT: Record<string, { code: string; ar: string; en: string }> = {
  cash:          GL.cash,
  bank_transfer: GL.bank,
  bank:          GL.bank,
};

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const { uid, agencyId, role } = await verifyAuth(request);
    assertRole(role, [...ROLES_ADMIN_ONLY]);

    const body = await request.json().catch(() => ({})) as {
      paymentMethod?: string;
      notes?:         string;
    };
    const paymentAc = METHOD_ACCOUNT[body.paymentMethod ?? 'bank_transfer'] ?? GL.bank;

    const result = await db.transaction(async (tx) => {
      const [billing] = await tx
        .select()
        .from(bspBillings)
        .where(and(eq(bspBillings.id, params.id), eq(bspBillings.agencyId, agencyId)));

      if (!billing) throw new BusinessError('فاتورة BSP غير موجودة', 404);
      if (billing.status === 'paid') throw new BusinessError('فاتورة BSP مدفوعة بالفعل', 409);

      const now   = new Date();
      const today = now.toISOString().split('T')[0]!;
      const year  = now.getFullYear();

      // Settlement posts a journal entry dated today — block closed periods.
      await assertPeriodOpen(agencyId, today, tx);

      const amt   = billing.netRemitHalalas;
      const jeId  = crypto.randomUUID();
      const jeNum = await getNextJournalNumber(agencyId, year, tx);

      await tx.insert(journalEntries).values({
        id:                 jeId,
        agencyId,
        entryNumber:        jeNum,
        date:               today,
        descriptionAr:      `سداد فاتورة BSP — فترة ${billing.billingPeriod}`,
        descriptionEn:      `BSP Billing Settlement — Period ${billing.billingPeriod}`,
        reference:          billing.reference ?? billing.billingPeriod,
        source:             'manual',
        sourceId:           billing.id,
        isPosted:           true,
        totalDebitHalalas:  amt,
        totalCreditHalalas: amt,
        createdBy:          uid,
      });

      await tx.insert(journalLines).values([
        {
          id:            crypto.randomUUID(),
          entryId:       jeId,
          agencyId,
          accountCode:   GL.bspPayable.code,
          accountNameAr: GL.bspPayable.ar,
          accountNameEn: GL.bspPayable.en,
          debitHalalas:  amt,
          creditHalalas: 0,
          description:   `BSP ${billing.billingPeriod}`,
          sortOrder:     1,
        },
        {
          id:            crypto.randomUUID(),
          entryId:       jeId,
          agencyId,
          accountCode:   paymentAc.code,
          accountNameAr: paymentAc.ar,
          accountNameEn: paymentAc.en,
          debitHalalas:  0,
          creditHalalas: amt,
          description:   `BSP ${billing.billingPeriod}`,
          sortOrder:     2,
        },
      ]);

      await tx.update(bspBillings)
        .set({
          status:      'paid',
          paymentDate: today,
          ...(body.notes ? { notes: body.notes } : {}),
          updatedAt:   now,
        })
        .where(and(eq(bspBillings.id, params.id), eq(bspBillings.agencyId, agencyId)));

      return { journalEntryId: jeId };
    });

    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    if (err instanceof ApiAuthError)  return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof BusinessError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(JSON.stringify({ event: 'bsp_billing_pay_failed', error: String(err) }));
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
