import { NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { bspBillings, journalEntries, journalLines } from '@/lib/schema';
import { verifyAuth, assertRole, ApiAuthError, BusinessError, ROLES_ADMIN_ONLY } from '@/lib/api-auth';
import { logAudit } from '@/lib/audit';
import { getNextJournalNumber } from '@/lib/invoice-counter';
import { assertPeriodOpen } from '@/lib/period-lock';
import { GL } from '@/lib/gl-accounts';

/**
 * PATCH /api/bsp/billings/[id]   { action: 'pay', paymentDate?: 'YYYY-MM-DD' }
 *   Marks a pending BSP billing as paid and posts the settlement GL entry:
 *     DR BSP Payable 2150  (clears the liability)
 *     CR Bank 1110         (records the outflow)
 */
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const { uid, agencyId, role } = await verifyAuth(request);
    assertRole(role, [...ROLES_ADMIN_ONLY]);

    const body = await request.json() as { action: string; paymentDate?: string };

    if (body.action !== 'pay') {
      return NextResponse.json({ error: 'الإجراء غير معروف. القيمة المقبولة: pay' }, { status: 400 });
    }

    const [billing] = await db.select().from(bspBillings)
      .where(and(eq(bspBillings.id, params.id), eq(bspBillings.agencyId, agencyId)));
    if (!billing) return NextResponse.json({ error: 'فاتورة BSP غير موجودة' }, { status: 404 });
    if (billing.status === 'paid') return NextResponse.json({ error: 'الفاتورة مدفوعة بالفعل' }, { status: 409 });

    const today = body.paymentDate ?? new Date().toISOString().split('T')[0]!;
    const year  = new Date(today).getFullYear();
    const jeId  = crypto.randomUUID();

    await db.transaction(async (tx) => {
      await assertPeriodOpen(agencyId, today, tx);
      const jeNumber = await getNextJournalNumber(agencyId, year, tx);

      await tx.insert(journalEntries).values({
        id:                 jeId,
        agencyId,
        entryNumber:        jeNumber,
        date:               today,
        descriptionAr:      `دفع BSP — فترة ${billing.billingPeriod}`,
        descriptionEn:      `BSP Payment — Period ${billing.billingPeriod}`,
        reference:          billing.reference ?? billing.billingPeriod,
        source:             'manual',
        sourceId:           billing.id,
        isPosted:           true,
        totalDebitHalalas:  billing.netRemitHalalas,
        totalCreditHalalas: billing.netRemitHalalas,
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
          debitHalalas:  billing.netRemitHalalas,
          creditHalalas: 0,
          description:   `BSP ${billing.billingPeriod}`,
          sortOrder:     1,
        },
        {
          id:            crypto.randomUUID(),
          entryId:       jeId,
          agencyId,
          accountCode:   GL.bank.code,
          accountNameAr: GL.bank.ar,
          accountNameEn: GL.bank.en,
          debitHalalas:  0,
          creditHalalas: billing.netRemitHalalas,
          description:   `BSP ${billing.billingPeriod}`,
          sortOrder:     2,
        },
      ]);

      await tx.update(bspBillings)
        .set({ status: 'paid', paymentDate: today, updatedAt: new Date() } as never)
        .where(and(eq(bspBillings.id, params.id), eq(bspBillings.agencyId, agencyId)));
    });

    await logAudit({
      agencyId, userId: uid, action: 'update', resource: 'bsp_billing', resourceId: params.id,
      after: { status: 'paid', paymentDate: today, journalEntryId: jeId },
    });
    return NextResponse.json({ success: true, journalEntryId: jeId });
  } catch (err) {
    if (err instanceof ApiAuthError)  return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof BusinessError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(JSON.stringify({ event: 'bsp_billing_pay_error', error: String(err) }));
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
