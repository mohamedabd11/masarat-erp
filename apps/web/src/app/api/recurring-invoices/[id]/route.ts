import { NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { recurringInvoices, invoices, journalEntries, journalLines } from '@/lib/schema';
import { verifyAuth, assertRole, ApiAuthError, ROLES_MANAGER_UP } from '@/lib/api-auth';
import { logAudit } from '@/lib/audit';
import { getNextInvoiceNumber, getNextJournalNumber, type InvoiceType } from '@/lib/invoice-counter';
import { assertPeriodOpen } from '@/lib/period-lock';
import { GL } from '@/lib/gl-accounts';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const { agencyId } = await verifyAuth(request);
    const [row] = await db.select().from(recurringInvoices)
      .where(and(eq(recurringInvoices.id, params.id), eq(recurringInvoices.agencyId, agencyId)));
    if (!row) return NextResponse.json({ error: 'الفاتورة الدورية غير موجودة' }, { status: 404 });
    return NextResponse.json({ recurringInvoice: row });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const { uid, agencyId, role } = await verifyAuth(request);
    assertRole(role, [...ROLES_MANAGER_UP]);
    const body = await request.json() as Partial<{
      title: string; isActive: boolean; endDate: string;
      dayOfMonth: number; notes: string; paymentMethod: string;
    }>;

    const [existing] = await db.select().from(recurringInvoices)
      .where(and(eq(recurringInvoices.id, params.id), eq(recurringInvoices.agencyId, agencyId)));
    if (!existing) return NextResponse.json({ error: 'الفاتورة الدورية غير موجودة' }, { status: 404 });

    const patch: Record<string, unknown> = { updatedAt: new Date() };
    const ALLOWED = ['title', 'isActive', 'endDate', 'dayOfMonth', 'notes', 'paymentMethod'] as const;
    for (const k of ALLOWED) {
      if (body[k] !== undefined) patch[k] = body[k];
    }

    await db.update(recurringInvoices)
      .set(patch as Partial<typeof recurringInvoices.$inferInsert>)
      .where(and(eq(recurringInvoices.id, params.id), eq(recurringInvoices.agencyId, agencyId)));

    await logAudit({ agencyId, userId: uid, action: 'update', resource: 'recurring_invoice', resourceId: params.id, before: existing, after: patch });
    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}

// POST to /api/recurring-invoices/[id]?action=issue — manually trigger invoice generation
export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const { uid, agencyId, role } = await verifyAuth(request);
    assertRole(role, [...ROLES_MANAGER_UP]);

    const [recurring] = await db.select().from(recurringInvoices)
      .where(and(eq(recurringInvoices.id, params.id), eq(recurringInvoices.agencyId, agencyId)));
    if (!recurring) return NextResponse.json({ error: 'الفاتورة الدورية غير موجودة' }, { status: 404 });
    if (!recurring.isActive) return NextResponse.json({ error: 'الفاتورة الدورية معطّلة' }, { status: 422 });

    const result = await db.transaction(async (tx) => {
      const year    = new Date().getFullYear();
      const today   = new Date().toISOString().split('T')[0]!;
      await assertPeriodOpen(agencyId, today, tx);

      const invNum  = await getNextInvoiceNumber(agencyId, 'taxInvoice' as InvoiceType, year, tx);
      const jeNum   = await getNextJournalNumber(agencyId, year, tx);
      const invId   = crypto.randomUUID();
      const jeId    = crypto.randomUUID();

      await tx.insert(invoices).values({
        id:             invId,
        agencyId,
        invoiceNumber:  invNum,
        type:           '380',
        customerId:     recurring.customerId  ?? null,
        buyerNameAr:    recurring.buyerNameAr ?? null,
        subtotalHalalas: recurring.subtotalHalalas,
        vatHalalas:     recurring.vatHalalas,
        totalHalalas:   recurring.totalHalalas,
        issueDate:      today,
        status:         'issued',
        items:          recurring.items as never,
        notes:          recurring.notes ?? null,
        paymentMethod:  recurring.paymentMethod ?? null,
        createdBy:      uid,
        journalEntryId: jeId,
      });

      // GL journal entry — DR Receivable / CR Revenue + CR VAT Payable
      const jeLines: { code: string; ar: string; en: string; dr: number; cr: number; ord: number }[] = [
        { code: GL.receivable.code, ar: GL.receivable.ar, en: GL.receivable.en, dr: recurring.totalHalalas, cr: 0, ord: 1 },
        { code: GL.revenueAgent.code, ar: GL.revenueAgent.ar, en: GL.revenueAgent.en, dr: 0, cr: recurring.subtotalHalalas, ord: 2 },
      ];
      if (recurring.vatHalalas > 0) {
        jeLines.push({ code: GL.vatPayable.code, ar: GL.vatPayable.ar, en: GL.vatPayable.en, dr: 0, cr: recurring.vatHalalas, ord: 3 });
      }
      await tx.insert(journalEntries).values({
        id:                 jeId,
        agencyId,
        entryNumber:        jeNum,
        date:               today,
        descriptionAr:      `فاتورة دورية #${invNum}`,
        descriptionEn:      `Recurring Invoice #${invNum}`,
        source:             'invoice',
        sourceId:           invId,
        isPosted:           true,
        totalDebitHalalas:  recurring.totalHalalas,
        totalCreditHalalas: recurring.totalHalalas,
        createdBy:          uid,
      });
      for (let i = 0; i < jeLines.length; i++) {
        const l = jeLines[i]!;
        await tx.insert(journalLines).values({
          id: crypto.randomUUID(), entryId: jeId, agencyId,
          accountCode: l.code, accountNameAr: l.ar, accountNameEn: l.en,
          debitHalalas: l.dr, creditHalalas: l.cr, sortOrder: l.ord,
        });
      }

      // Compute next issue date
      const freq = recurring.frequency;
      const dom  = recurring.dayOfMonth ?? 1;
      const base = new Date(today);
      let next: Date;
      if (freq === 'weekly')     { next = new Date(base); next.setDate(next.getDate() + 7); }
      else if (freq === 'quarterly') { next = new Date(base); next.setMonth(next.getMonth() + 3); }
      else if (freq === 'yearly')    { next = new Date(base); next.setFullYear(next.getFullYear() + 1); }
      else { next = new Date(base); next.setMonth(next.getMonth() + 1); next.setDate(Math.min(dom, 28)); }

      await tx.update(recurringInvoices).set({
        lastIssuedAt: today,
        nextIssueAt:  next.toISOString().split('T')[0]!,
        totalIssued:  (recurring.totalIssued ?? 0) + 1,
        updatedAt:    new Date(),
      }).where(and(eq(recurringInvoices.id, params.id), eq(recurringInvoices.agencyId, agencyId)));

      return { invoiceId: invId, invoiceNumber: invNum };
    });

    await logAudit({ agencyId, userId: uid, action: 'create', resource: 'invoice', resourceId: result.invoiceId, after: { source: 'recurring', recurringId: params.id } });
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(JSON.stringify({ event: 'recurring_invoice_issue_failed', error: (err as Error).message }));
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
