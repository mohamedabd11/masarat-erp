import { NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { invoices, journalEntries } from '@/lib/schema';
import { verifyAuth, assertRole, ApiAuthError, ROLES_MANAGER_UP } from '@/lib/api-auth';
import { logAudit } from '@/lib/audit';
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
    // Cancelling an invoice unposts its journal entry — a financial-integrity
    // operation. Restrict to manager+ (owner/admin/manager); viewer/agent/staff
    // and even accountant must not be able to silently void issued invoices.
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
      await assertPeriodOpen(agencyId, new Date().toISOString().split('T')[0]!, tx);

      await tx.update(invoices)
        .set({ status: 'cancelled', updatedAt: new Date() } as never)
        .where(and(eq(invoices.id, params.id), eq(invoices.agencyId, agencyId)));

      // Unpost the linked journal entry so the trial balance stays clean
      if (invoice.journalEntryId) {
        await tx.update(journalEntries)
          .set({ isPosted: false } as never)
          .where(and(eq(journalEntries.id, invoice.journalEntryId), eq(journalEntries.agencyId, agencyId)));
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
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(JSON.stringify({ event: 'cancel_invoice_failed', invoiceId: params.id, error: String(err) }));
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
