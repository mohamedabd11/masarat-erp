import { NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { invoices, journalEntries, journalLines } from '@/lib/schema';
import { verifyAuth, assertRole, ApiAuthError, ROLES_MANAGER_UP } from '@/lib/api-auth';
import { logAudit } from '@/lib/audit';
import { getNextInvoiceNumber, getNextJournalNumber, type InvoiceType } from '@/lib/invoice-counter';
import { assertPeriodOpen } from '@/lib/period-lock';
import { GL } from '@/lib/gl-accounts';

// Fallback accounts when no original invoice GL is available
const AC_FALLBACK = {
  receivable: GL.receivable,
  revenue:    GL.revenuePrincipal,
  vatPayable: GL.vatPayable,
};

export async function POST(request: Request) {
  try {
    const { uid, agencyId, role } = await verifyAuth(request);
    assertRole(role, [...ROLES_MANAGER_UP]);

    const body = await request.json() as {
      originalInvoiceId?: string;
      customerId?:        string;
      buyerNameAr?:       string;
      lines:              Array<{ descriptionAr: string; descriptionEn?: string; quantity: number; unitPriceHalalas: number }>;
      reason:             string;
      notes?:             string;
    };

    if (!body.reason?.trim()) {
      return NextResponse.json({ error: 'سبب الإشعار المدين مطلوب' }, { status: 400 });
    }
    if (!Array.isArray(body.lines) || body.lines.length === 0) {
      return NextResponse.json({ error: 'يجب إضافة بند واحد على الأقل' }, { status: 400 });
    }
    for (const line of body.lines) {
      if (!line.descriptionAr?.trim()) {
        return NextResponse.json({ error: 'وصف البند مطلوب لكل سطر' }, { status: 400 });
      }
      if (!Number.isFinite(line.unitPriceHalalas) || line.unitPriceHalalas < 0) {
        return NextResponse.json({ error: 'سعر البند غير صالح' }, { status: 400 });
      }
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
      const now   = new Date();
      const year  = now.getFullYear();
      const today = now.toISOString().split('T')[0]!;
      await assertPeriodOpen(agencyId, today, tx);

      const invNum = await getNextInvoiceNumber(agencyId, 'debitNote' as InvoiceType, year, tx);
      const jeNum  = await getNextJournalNumber(agencyId, year, tx);
      const invId  = crypto.randomUUID();
      const jeId   = crypto.randomUUID();

      // Compute line totals (unit prices are excl. VAT; VAT is tracked separately)
      const computedLines = body.lines.map((l) => {
        const qty     = Math.max(1, Math.round(l.quantity || 1));
        const lineNet = Math.round(qty * l.unitPriceHalalas);
        return { ...l, qty, lineNet };
      });
      const subtotal = computedLines.reduce((s, l) => s + l.lineNet, 0);

      if (subtotal <= 0) {
        throw new Error('إجمالي الإشعار المدين يجب أن يكون أكبر من صفر');
      }

      // Resolve VAT from original invoice if available, otherwise default to 0
      let vatRate = 0;
      if (originalInvoice && originalInvoice.subtotalHalalas > 0) {
        vatRate = originalInvoice.vatHalalas / originalInvoice.subtotalHalalas;
      }
      const vat   = Math.round(subtotal * vatRate);
      const total = subtotal + vat;

      // Build ZATCA-compatible items array
      const items = computedLines.map((l, idx) => {
        const isLast           = idx === computedLines.length - 1;
        const assignedVatSoFar = computedLines.slice(0, idx).reduce((s, x) => s + Math.round(x.lineNet * vatRate), 0);
        const itemVat          = isLast ? vat - assignedVatSoFar : Math.round(l.lineNet * vatRate);
        return {
          description:      l.descriptionAr,
          descriptionEn:    l.descriptionEn ?? null,
          quantity:         l.qty,
          unitPriceHalalas: l.unitPriceHalalas,
          vatHalalas:       itemVat,
          totalHalalas:     l.lineNet + itemVat,
        };
      });

      // ── Resolve GL accounts from original invoice's journal ─────────────────
      type AccLine = { code: string; ar: string; en: string };
      let revenueAc: AccLine = AC_FALLBACK.revenue;

      if (originalInvoice?.journalEntryId) {
        const origLines = await tx.select().from(journalLines)
          .where(eq(journalLines.entryId, originalInvoice.journalEntryId));
        // Revenue line: the Cr line that is NOT AR, NOT VAT
        const revLine = origLines.find(l =>
          l.creditHalalas > 0 &&
          l.accountCode !== '1120' &&
          l.accountCode !== '2200' &&
          l.accountCode !== '5000' &&
          l.accountCode !== '2000',
        );
        if (revLine) {
          revenueAc = { code: revLine.accountCode, ar: revLine.accountNameAr ?? '', en: revLine.accountNameEn ?? revLine.accountNameAr ?? '' };
        }
      }

      // ── Insert debit note invoice ────────────────────────────────────────────
      await tx.insert(invoices).values({
        id:                invId,
        agencyId,
        invoiceNumber:     invNum,
        type:              '383',          // ZATCA type 383 = Debit Note
        originalInvoiceId: body.originalInvoiceId ?? null,
        customerId:        body.customerId         ?? originalInvoice?.customerId ?? null,
        buyerNameAr:       body.buyerNameAr        ?? originalInvoice?.buyerNameAr ?? null,
        buyerNameEn:       originalInvoice?.buyerNameEn ?? null,
        buyerPhone:        originalInvoice?.buyerPhone  ?? null,
        sellerNameAr:      originalInvoice?.sellerNameAr ?? null,
        sellerVatNumber:   originalInvoice?.sellerVatNumber ?? null,
        subtotalHalalas:   subtotal,
        vatHalalas:        vat,
        totalHalalas:      total,
        paidHalalas:       0,
        issueDate:         today,
        status:            'issued',
        items:             items as never,
        notes:             body.notes ? `${body.reason} — ${body.notes}` : body.reason,
        journalEntryId:    jeId,
        createdBy:         uid,
      });

      // ── GL: debit note INCREASES amount owed ────────────────────────────────
      // Dr AR (1120) / Cr Revenue (4100) [+ Cr VAT Payable (2200) if VAT applies]
      type JL = { id: string; entryId: string; agencyId: string; accountCode: string; accountNameAr: string; accountNameEn: string; debitHalalas: number; creditHalalas: number; sortOrder: number };

      const jLines: JL[] = [
        { id: crypto.randomUUID(), entryId: jeId, agencyId, accountCode: AC_FALLBACK.receivable.code, accountNameAr: AC_FALLBACK.receivable.ar, accountNameEn: AC_FALLBACK.receivable.en, debitHalalas: total,    creditHalalas: 0,       sortOrder: 1 },
        { id: crypto.randomUUID(), entryId: jeId, agencyId, accountCode: revenueAc.code,              accountNameAr: revenueAc.ar,              accountNameEn: revenueAc.en,              debitHalalas: 0,        creditHalalas: subtotal, sortOrder: 2 },
        ...(vat > 0 ? [{ id: crypto.randomUUID(), entryId: jeId, agencyId, accountCode: AC_FALLBACK.vatPayable.code, accountNameAr: AC_FALLBACK.vatPayable.ar, accountNameEn: AC_FALLBACK.vatPayable.en, debitHalalas: 0, creditHalalas: vat, sortOrder: 3 } as JL] : []),
      ];

      const totalDr = jLines.reduce((s, l) => s + l.debitHalalas,  0);
      const totalCr = jLines.reduce((s, l) => s + l.creditHalalas, 0);

      await tx.insert(journalEntries).values({
        id:                 jeId,
        agencyId,
        entryNumber:        jeNum,
        date:               today,
        descriptionAr:      `إشعار مدين رقم ${invNum} — ${body.reason}`,
        source:             'invoice',
        sourceId:           invId,
        isPosted:           true,
        totalDebitHalalas:  totalDr,
        totalCreditHalalas: totalCr,
        createdBy:          uid,
      });

      await tx.insert(journalLines).values(jLines);

      return { invoiceId: invId, invoiceNumber: invNum };
    });

    await logAudit({
      agencyId, userId: uid, action: 'create', resource: 'debit_note', resourceId: result.invoiceId,
      after: { invoiceNumber: result.invoiceNumber, reason: body.reason, originalInvoiceId: body.originalInvoiceId },
    });
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(JSON.stringify({ event: 'debit_note_create_failed', error: (err as Error).message }));
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
