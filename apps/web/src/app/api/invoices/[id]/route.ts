import { NextResponse } from 'next/server';
import { eq, and, ne } from 'drizzle-orm';
import { db } from '@/lib/db';
import { invoices, journalEntries, journalLines } from '@/lib/schema';
import { verifyAuth, ApiAuthError, BusinessError, assertRole, ROLES_MANAGER_UP } from '@/lib/api-auth';
import { logAudit } from '@/lib/audit';
import { assertPeriodOpen } from '@/lib/period-lock';
import { getNextJournalNumber } from '@/lib/invoice-counter';

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

    await db.transaction(async (tx) => {
      const now = new Date();
      const today = now.toISOString().split('T')[0]!;
      await assertPeriodOpen(agencyId, today, tx);

      // Atomically claim the cancellation: only transition a not-yet-cancelled,
      // unpaid invoice. If 0 rows update, a concurrent cancel already won → abort
      // and roll back so we never post duplicate reversal entries.
      const claim = await tx.update(invoices)
        .set({ status: 'cancelled', updatedAt: now } as never)
        .where(and(
          eq(invoices.id, params.id),
          eq(invoices.agencyId, agencyId),
          ne(invoices.status, 'cancelled'),
          eq(invoices.paidHalalas, 0),
        ))
        .returning({ id: invoices.id });
      if (claim.length === 0) {
        throw new BusinessError('الفاتورة ملغاة بالفعل أو لا يمكن إلغاؤها', 409);
      }

      // Reverse ALL posted JEs linked to this invoice (original booking JE +
      // any subsequent recognition JEs for deferred revenue — IAS 18 / IFRS 15).
      // source='invoice_cancel' prevents re-reversal and distinguishes these entries
      // from the original postings in queries (e.g. balance-sheet already excludes 'closing').
      const allInvoiceJEs = await tx.select().from(journalEntries)
        .where(and(
          eq(journalEntries.agencyId, agencyId),
          eq(journalEntries.sourceId, params.id),
          eq(journalEntries.isPosted, true),
          eq(journalEntries.source, 'invoice'),
        ));

      for (const je of allInvoiceJEs) {
        const origLines = await tx.select().from(journalLines)
          .where(and(eq(journalLines.entryId, je.id), eq(journalLines.agencyId, agencyId)));
        if (origLines.length === 0) continue;

        const revJeNumber = await getNextJournalNumber(agencyId, now.getFullYear(), tx);
        const revJeId = crypto.randomUUID();
        await tx.insert(journalEntries).values({
          id: revJeId,
          agencyId,
          entryNumber: revJeNumber,
          date: today,
          descriptionAr: `عكس: ${je.descriptionAr}${body.reason ? ' — ' + body.reason : ''}`,
          source: 'invoice_cancel',
          sourceId: params.id,
          isPosted: true,
          totalDebitHalalas:  origLines.reduce((s, l) => s + l.creditHalalas, 0),
          totalCreditHalalas: origLines.reduce((s, l) => s + l.debitHalalas,  0),
          createdBy: uid,
        } as never);
        await tx.insert(journalLines).values(
          origLines.map((l, idx) => ({
            id: crypto.randomUUID(), entryId: revJeId, agencyId,
            accountCode: l.accountCode, accountNameAr: l.accountNameAr, accountNameEn: l.accountNameEn,
            debitHalalas:  l.creditHalalas,
            creditHalalas: l.debitHalalas,
            sortOrder: idx + 1,
          }))
        );
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
    if (err instanceof ApiAuthError || err instanceof BusinessError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(JSON.stringify({ event: 'cancel_invoice_failed', invoiceId: params.id, error: String(err) }));
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
