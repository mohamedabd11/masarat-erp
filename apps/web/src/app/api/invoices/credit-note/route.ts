import { NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { invoices, journalEntries, journalLines } from '@/lib/schema';
import { verifyAuth, assertRole, ApiAuthError, BusinessError, ROLES_MANAGER_UP } from '@/lib/api-auth';
import { logAudit } from '@/lib/audit';
import { getNextInvoiceNumber, getNextJournalNumber, type InvoiceType } from '@/lib/invoice-counter';
import { assertPeriodOpen } from '@/lib/period-lock';
import { GL } from '@/lib/gl-accounts';
import { buildZatcaInvoiceRecord, parseStoredInvoiceItems } from '@/lib/zatca-einvoice';

// Fallback accounts when no original invoice GL is available
const AC_FALLBACK = {
  receivable: GL.receivable,
  revenue:    GL.revenuePrincipal,
  vatPayable: GL.vatPayable,
  cogs:       GL.costOfServices,
  apSupplier: GL.payableSupplier,
};

export async function POST(request: Request) {
  try {
    const { uid, agencyId, role } = await verifyAuth(request);
    assertRole(role, [...ROLES_MANAGER_UP]);

    const body = await request.json() as {
      originalInvoiceId?: string;
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
      const now   = new Date();
      const year  = now.getFullYear();
      const today = now.toISOString().split('T')[0]!;
      await assertPeriodOpen(agencyId, today, tx);
      const invNum = await getNextInvoiceNumber(agencyId, 'creditNote' as InvoiceType, year, tx);
      const jeNum  = await getNextJournalNumber(agencyId, year, tx);
      const invId  = crypto.randomUUID();
      const jeId   = crypto.randomUUID();

      const subtotal = body.subtotalHalalas;
      const vat      = body.vatHalalas ?? 0;
      const total    = body.totalHalalas ?? subtotal + vat;

      // ── Resolve GL accounts from original invoice's journal ───────────────
      // When we have the original invoice's journal entry, mirror its accounts
      // so the credit note perfectly reverses the same lines (IFRS 15 / ZATCA).
      type AccLine = { code: string; ar: string; en: string };
      let revenueAc: AccLine = AC_FALLBACK.revenue;
      let cogsDebit = 0;
      let cogsAc: AccLine = AC_FALLBACK.cogs;
      let apAc: AccLine   = AC_FALLBACK.apSupplier;

      if (originalInvoice?.journalEntryId) {
        const origLines = await tx.select().from(journalLines)
          .where(eq(journalLines.entryId, originalInvoice.journalEntryId));

        // Revenue line: the Cr line(s) that are NOT AR, NOT VAT, NOT COGS
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

        // COGS line: Dr 5000 in original → reverse it (Cr 5000, Dr AP)
        const cogsLine = origLines.find(l => l.accountCode === '5000' && l.debitHalalas > 0);
        if (cogsLine && cogsLine.debitHalalas > 0) {
          cogsDebit = cogsLine.debitHalalas;
          // Find the matching AP credit line in the original
          const apLine = origLines.find(l => l.accountCode === '2000' && l.creditHalalas > 0);
          if (apLine) apAc = { code: apLine.accountCode, ar: apLine.accountNameAr ?? '', en: apLine.accountNameEn ?? apLine.accountNameAr ?? '' };
        }
      }

      // ── ZATCA e-invoice record (type 381) ──────────────────────────────────
      // Built from the original invoice's seller snapshot; standalone notes
      // (no original) keep the legacy no-QR behaviour. Client-supplied amounts
      // may not reconcile — never block note creation over the QR.
      let zatcaRecord: ReturnType<typeof buildZatcaInvoiceRecord> | null = null;
      if (originalInvoice?.sellerVatNumber && originalInvoice.sellerNameAr && originalInvoice.isEInvoice) {
        try {
          zatcaRecord = buildZatcaInvoiceRecord({
            uuid:                  crypto.randomUUID(),
            invoiceNumber:         invNum,
            issueDateTime:         now,
            sellerNameAr:          originalInvoice.sellerNameAr,
            sellerNameEn:          originalInvoice.sellerNameEn,
            vatNumber:             originalInvoice.sellerVatNumber,
            crNumber:              originalInvoice.sellerCrNumber,
            buyerName:             body.buyerNameAr ?? originalInvoice.buyerNameAr ?? 'عميل',
            vatRatePercent:        15,
            invoiceTypeCode:       '381',
            subtotalHalalas:       subtotal,
            vatHalalas:            vat,
            totalHalalas:          total,
            items:                 parseStoredInvoiceItems(body.items),
            originalInvoiceUuid:   originalInvoice.zatcaUuid,
            originalInvoiceNumber: originalInvoice.invoiceNumber,
          });
        } catch (zErr) {
          console.error(JSON.stringify({ event: 'credit_note_zatca_record_failed', invoiceId: invId, error: String(zErr) }));
        }
      }

      // ── Insert credit note invoice ─────────────────────────────────────────
      await tx.insert(invoices).values({
        id:               invId,
        agencyId,
        invoiceNumber:    invNum,
        type:             '381',          // ZATCA type 381 = Credit Note
        originalInvoiceId: body.originalInvoiceId ?? null,
        customerId:       body.customerId         ?? originalInvoice?.customerId ?? null,
        buyerNameAr:      body.buyerNameAr        ?? originalInvoice?.buyerNameAr ?? null,
        buyerNameEn:      originalInvoice?.buyerNameEn ?? null,
        buyerPhone:       originalInvoice?.buyerPhone  ?? null,
        sellerNameAr:     originalInvoice?.sellerNameAr ?? null,
        sellerVatNumber:  originalInvoice?.sellerVatNumber ?? null,
        subtotalHalalas:  subtotal,
        vatHalalas:       vat,
        totalHalalas:     total,
        paidHalalas:      0,
        issueDate:        today,
        status:           'issued',
        isEInvoice:       originalInvoice?.isEInvoice ?? false,
        items:            (body.items ?? null) as never,
        notes:            body.notes ? `${body.reason} — ${body.notes}` : body.reason,
        journalEntryId:   jeId,
        createdBy:        uid,
        zatcaUuid:        zatcaRecord?.uuid ?? crypto.randomUUID(),
        zatcaQr:          zatcaRecord?.qr ?? null,
      });

      // ── GL: reverse the original invoice's revenue (and COGS if applicable) ─
      // Standard reversal: Dr Revenue / Dr VAT Payable / Cr AR (or Customer Deposits)
      // COGS reversal (if original booked cost): Cr COGS (5000) / Dr AP (2000)

      // IFRS 15.116: if the invoice was already paid the AR balance is zero — the
      // credit note creates a refundable customer liability (2300 Customer Deposits)
      // rather than a negative AR balance (1120).
      const creditAc = (originalInvoice?.paidHalalas ?? 0) > 0
        ? GL.customerDeposits
        : AC_FALLBACK.receivable;

      type JL = { id: string; entryId: string; agencyId: string; accountCode: string; accountNameAr: string; accountNameEn: string; debitHalalas: number; creditHalalas: number; sortOrder: number };

      const jLines: JL[] = [
        { id: crypto.randomUUID(), entryId: jeId, agencyId, accountCode: revenueAc.code,    accountNameAr: revenueAc.ar,            accountNameEn: revenueAc.en,            debitHalalas: subtotal, creditHalalas: 0,     sortOrder: 1 },
        ...(vat > 0 ? [{ id: crypto.randomUUID(), entryId: jeId, agencyId, accountCode: AC_FALLBACK.vatPayable.code, accountNameAr: AC_FALLBACK.vatPayable.ar, accountNameEn: AC_FALLBACK.vatPayable.en, debitHalalas: vat, creditHalalas: 0, sortOrder: 2 } as JL] : []),
        { id: crypto.randomUUID(), entryId: jeId, agencyId, accountCode: creditAc.code,     accountNameAr: creditAc.ar,             accountNameEn: creditAc.en,             debitHalalas: 0,        creditHalalas: total, sortOrder: 3 },
      ];

      // Reverse COGS if the original invoice had a cost-of-services entry
      if (cogsDebit > 0) {
        jLines.push({ id: crypto.randomUUID(), entryId: jeId, agencyId, accountCode: apAc.code,           accountNameAr: apAc.ar,               accountNameEn: apAc.en,               debitHalalas: cogsDebit, creditHalalas: 0,        sortOrder: jLines.length + 1 });
        jLines.push({ id: crypto.randomUUID(), entryId: jeId, agencyId, accountCode: cogsAc.code,         accountNameAr: cogsAc.ar,             accountNameEn: cogsAc.en,             debitHalalas: 0,         creditHalalas: cogsDebit, sortOrder: jLines.length + 1 });
      }

      const totalDr = jLines.reduce((s, l) => s + l.debitHalalas,  0);
      const totalCr = jLines.reduce((s, l) => s + l.creditHalalas, 0);

      // Defense-in-depth: never post an unbalanced journal entry. For a credit note
      // this catches a client-supplied totalHalalas that ≠ subtotal + vat.
      if (totalDr !== totalCr) {
        throw new BusinessError('القيد المحاسبي للإشعار الدائن غير متوازن — يجب أن يساوي الإجمالي المبلغ الخاضع للضريبة مضافاً إليه الضريبة', 422);
      }

      await tx.insert(journalEntries).values({
        id:                 jeId,
        agencyId,
        entryNumber:        jeNum,
        date:               today,
        descriptionAr:      `إشعار دائن ${invNum} — ${body.reason}`,
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
      agencyId, userId: uid, action: 'create', resource: 'credit_note', resourceId: result.invoiceId,
      after: { invoiceNumber: result.invoiceNumber, reason: body.reason, originalInvoiceId: body.originalInvoiceId },
    });
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    if (err instanceof ApiAuthError || err instanceof BusinessError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(JSON.stringify({ event: 'credit_note_create_failed', error: (err as Error).message }));
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
