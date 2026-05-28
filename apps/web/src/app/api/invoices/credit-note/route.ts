import { NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { invoices, journalEntries, journalLines } from '@/lib/schema';
import { verifyAuth, assertRole, ApiAuthError, ROLES_MANAGER_UP } from '@/lib/api-auth';
import { logAudit } from '@/lib/audit';
import { getNextInvoiceNumber, getNextJournalNumber, type InvoiceType } from '@/lib/invoice-counter';

const AC = {
  receivable: { code: '1120', ar: 'ذمم مدينة - عملاء',            en: 'Accounts Receivable' },
  revenue:    { code: '4100', ar: 'إيراد خدمات السفر',            en: 'Revenue - Travel Services' },
  vatPayable: { code: '2200', ar: 'ضريبة القيمة المضافة مستحقة',  en: 'VAT Payable' },
};

export async function POST(request: Request) {
  try {
    const { uid, agencyId, role } = await verifyAuth(request);
    assertRole(role, [...ROLES_MANAGER_UP]);

    const body = await request.json() as {
      originalInvoiceId?: string;       // optional — link to original invoice
      customerId?:        string;
      buyerNameAr?:       string;
      subtotalHalalas:    number;
      vatHalalas?:        number;
      totalHalalas?:      number;
      reason:             string;
      items?:             unknown;
      notes?:             string;
    };

    if (!body.reason?.trim()) {
      return NextResponse.json({ error: 'سبب الإشعار الدائن مطلوب' }, { status: 400 });
    }
    if (!Number.isInteger(body.subtotalHalalas) || body.subtotalHalalas <= 0) {
      return NextResponse.json({ error: 'المبلغ غير صالح' }, { status: 400 });
    }

    let originalInvoice: typeof invoices.$inferSelect | null = null;
    if (body.originalInvoiceId) {
      const [orig] = await db.select().from(invoices)
        .where(and(eq(invoices.id, body.originalInvoiceId), eq(invoices.agencyId, agencyId)));
      if (!orig) return NextResponse.json({ error: 'الفاتورة الأصلية غير موجودة' }, { status: 404 });
      if (orig.status === 'cancelled') return NextResponse.json({ error: 'الفاتورة الأصلية ملغاة' }, { status: 422 });
      originalInvoice = orig;
    }

    const result = await db.transaction(async (tx) => {
      const year    = new Date().getFullYear();
      const today   = new Date().toISOString().split('T')[0]!;
      const invNum  = await getNextInvoiceNumber(agencyId, 'creditNote' as InvoiceType, year, tx);
      const jeNum   = await getNextJournalNumber(agencyId, year, tx);
      const invId   = crypto.randomUUID();
      const jeId    = crypto.randomUUID();

      const subtotal = body.subtotalHalalas;
      const vat      = body.vatHalalas ?? 0;
      const total    = body.totalHalalas ?? subtotal + vat;

      await tx.insert(invoices).values({
        id:             invId,
        agencyId,
        invoiceNumber:  invNum,
        type:           '381',                    // ZATCA type 381 = Credit Note
        customerId:     body.customerId         ?? originalInvoice?.customerId ?? null,
        buyerNameAr:    body.buyerNameAr        ?? originalInvoice?.buyerNameAr ?? null,
        buyerNameEn:    originalInvoice?.buyerNameEn ?? null,
        buyerPhone:     originalInvoice?.buyerPhone  ?? null,
        sellerNameAr:   originalInvoice?.sellerNameAr ?? null,
        sellerVatNumber: originalInvoice?.sellerVatNumber ?? null,
        subtotalHalalas: subtotal,
        vatHalalas:     vat,
        totalHalalas:   total,
        issueDate:      today,
        status:         'issued',
        items:          (body.items ?? null) as never,
        notes:          body.notes ? `${body.reason} — ${body.notes}` : body.reason,
        createdBy:      uid,
      });

      // GL: Dr Revenue (reverse), Dr VAT Payable (reverse), Cr Receivable
      await tx.insert(journalEntries).values({
        id:                jeId,
        agencyId,
        entryNumber:       jeNum,
        date:              today,
        descriptionAr:     `إشعار دائن ${invNum} — ${body.reason}`,
        source:            'invoice',
        sourceId:          invId,
        isPosted:          true,
        totalDebitHalalas:  total,
        totalCreditHalalas: total,
        createdBy:         uid,
      });

      await tx.insert(journalLines).values([
        { id: crypto.randomUUID(), entryId: jeId, agencyId, accountCode: AC.revenue.code,    accountNameAr: AC.revenue.ar,    accountNameEn: AC.revenue.en,    debitHalalas: subtotal, creditHalalas: 0,       sortOrder: 1 },
        ...(vat > 0 ? [{ id: crypto.randomUUID(), entryId: jeId, agencyId, accountCode: AC.vatPayable.code, accountNameAr: AC.vatPayable.ar, accountNameEn: AC.vatPayable.en, debitHalalas: vat,      creditHalalas: 0,       sortOrder: 2 }] : []),
        { id: crypto.randomUUID(), entryId: jeId, agencyId, accountCode: AC.receivable.code, accountNameAr: AC.receivable.ar, accountNameEn: AC.receivable.en, debitHalalas: 0,        creditHalalas: total,   sortOrder: 3 },
      ]);

      return { invoiceId: invId, invoiceNumber: invNum };
    });

    await logAudit({ agencyId, userId: uid, action: 'create', resource: 'credit_note', resourceId: result.invoiceId, after: { invoiceNumber: result.invoiceNumber, reason: body.reason } });
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(JSON.stringify({ event: 'credit_note_create_failed', error: (err as Error).message }));
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
