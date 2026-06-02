import { NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { invoices, journalEntries, journalLines } from '@/lib/schema';
import { verifyAuth, assertRole, ApiAuthError, BusinessError, ROLES_MANAGER_UP } from '@/lib/api-auth';
import { logAudit } from '@/lib/audit';
import { getNextJournalNumber } from '@/lib/invoice-counter';
import { assertPeriodOpen } from '@/lib/period-lock';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const { agencyId } = await verifyAuth(request);
    const [invoice] = await db.select().from(invoices)
      .where(and(eq(invoices.id, params.id), eq(invoices.agencyId, agencyId)));
    if (!invoice) return NextResponse.json({ error: 'الفاتورة غير موجودة' }, { status: 404 });
    return NextResponse.json({ invoice });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const { uid, agencyId, role } = await verifyAuth(request);
    assertRole(role, [...ROLES_MANAGER_UP]);
    const body = await request.json() as { action: string; reason?: string };

    if (body.action !== 'cancel') {
      return NextResponse.json({ error: 'إجراء غير معروف' }, { status: 400 });
    }

    const [invoice] = await db.select().from(invoices)
      .where(and(eq(invoices.id, params.id), eq(invoices.agencyId, agencyId)));
    if (!invoice) return NextResponse.json({ error: 'الفاتورة غير موجودة' }, { status: 404 });

    if (invoice.status === 'cancelled') {
      return NextResponse.json({ error: 'الفاتورة ملغاة بالفعل' }, { status: 409 });
    }
    if (invoice.status === 'paid' || invoice.paidHalalas > 0) {
      return NextResponse.json({ error: 'لا يمكن إلغاء فاتورة مدفوعة — يرجى إصدار إشعار دائن بدلاً من ذلك' }, { status: 409 });
    }

    const today = new Date().toISOString().split('T')[0]!;
    const year  = new Date().getFullYear();

    await db.transaction(async (tx) => {
      await assertPeriodOpen(agencyId, today, tx);

      await tx.update(invoices)
        .set({ status: 'cancelled', updatedAt: new Date() } as never)
        .where(and(eq(invoices.id, params.id), eq(invoices.agencyId, agencyId)));

      // Post a reversing journal entry — preserves the audit trail of the original JE
      if (invoice.journalEntryId) {
        const origLines = await tx.select().from(journalLines)
          .where(eq(journalLines.entryId, invoice.journalEntryId));
        if (origLines.length > 0) {
          const revJeId = crypto.randomUUID();
          const revNum  = await getNextJournalNumber(agencyId, year, tx);
          const totalDr = origLines.reduce((s, l) => s + l.creditHalalas, 0);
          await tx.insert(journalEntries).values({
            id:                 revJeId,
            agencyId,
            entryNumber:        revNum,
            date:               today,
            descriptionAr:      `إلغاء فاتورة #${invoice.invoiceNumber}`,
            descriptionEn:      `Reversal of invoice #${invoice.invoiceNumber}`,
            source:             'manual',
            sourceId:           invoice.id,
            isPosted:           true,
            totalDebitHalalas:  totalDr,
            totalCreditHalalas: totalDr,
            createdBy:          uid,
          });
          for (let i = 0; i < origLines.length; i++) {
            const l = origLines[i]!;
            await tx.insert(journalLines).values({
              id:            crypto.randomUUID(),
              entryId:       revJeId,
              agencyId,
              accountCode:   l.accountCode,
              accountNameAr: l.accountNameAr ?? null,
              accountNameEn: l.accountNameEn ?? null,
              debitHalalas:  l.creditHalalas,
              creditHalalas: l.debitHalalas,
              description:   l.description ?? null,
              sortOrder:     i + 1,
            });
          }
        }
      }
    });

    await logAudit({
      agencyId, userId: uid,
      action: 'cancel',
      resource: 'invoice',
      resourceId: params.id,
      after: { status: 'cancelled', reason: body.reason ?? '' },
    });

    const [updated] = await db.select().from(invoices)
      .where(and(eq(invoices.id, params.id), eq(invoices.agencyId, agencyId)));
    return NextResponse.json({ invoice: updated });
  } catch (err) {
    if (err instanceof ApiAuthError)  return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof BusinessError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(JSON.stringify({ event: 'cancel_invoice_failed', invoiceId: params.id, error: String(err) }));
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
