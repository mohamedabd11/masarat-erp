import { NextResponse } from 'next/server';
import { eq, and, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { invoices, journalEntries, journalLines, bookingLines, suppliers } from '@/lib/schema';
import { verifyAuth, assertRole, ApiAuthError, BusinessError, ROLES_MANAGER_UP } from '@/lib/api-auth';
import { withIdempotency, markIdempotencyComplete } from '@/lib/idempotency';
import { logAudit } from '@/lib/audit';
import { getNextInvoiceNumber, getNextJournalNumber, type InvoiceType } from '@/lib/invoice-counter';
import { assertPeriodOpen } from '@/lib/period-lock';
import { GL } from '@/lib/gl-accounts';
import { buildZatcaInvoiceRecord, parseStoredInvoiceItems } from '@/lib/zatca-einvoice';
import { buildCreditNoteJournalLines } from '@/lib/credit-note-journal';
import { allocateProRata } from '@/lib/supplier-aging';

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
      subtotalHalalas:    number;
      vatHalalas?:        number;
      totalHalalas?:      number;
      reason:             string;
      items?:             unknown;
      notes?:             string;
      idempotencyKey?:    string;
    };

    if (!body.reason?.trim()) {
      return NextResponse.json({ error: 'سبب الإشعار الدائن مطلوب' }, { status: 400 });
    }
    if (!Number.isSafeInteger(body.subtotalHalalas) || body.subtotalHalalas <= 0) {
      return NextResponse.json({ error: 'المبلغ غير صالح' }, { status: 400 });
    }
    const requestedVat = body.vatHalalas ?? 0;
    const requestedTotal = body.totalHalalas ?? body.subtotalHalalas + requestedVat;
    if (!Number.isSafeInteger(requestedVat) || requestedVat < 0
        || !Number.isSafeInteger(requestedTotal) || requestedTotal <= 0) {
      return NextResponse.json({ error: 'قيمة الضريبة أو الإجمالي غير صالحة' }, { status: 400 });
    }
    if (requestedTotal !== body.subtotalHalalas + requestedVat) {
      return NextResponse.json({
        error: 'القيد المحاسبي للإشعار الدائن غير متوازن — يجب أن يساوي الإجمالي المبلغ الخاضع للضريبة مضافاً إليه الضريبة',
      }, { status: 422 });
    }

    // Idempotency: a retry with the same key replays the first credit note
    // rather than posting a second reversal. The completion marker is written
    // inside the transaction so commit and finalize are atomic.
    const idempKey = body.idempotencyKey ?? crypto.randomUUID();
    const result = await withIdempotency(idempKey, agencyId, 'creditNote', () => db.transaction(async (tx) => {
      const now   = new Date();
      const year  = now.getFullYear();
      const today = now.toISOString().split('T')[0]!;
      await assertPeriodOpen(agencyId, today, tx);

      const subtotalEarly = body.subtotalHalalas;
      const totalEarly    = requestedTotal;
      let originalInvoice: typeof invoices.$inferSelect | null = null;
      if (body.originalInvoiceId) {
        const [orig] = await tx.select().from(invoices)
          .where(and(eq(invoices.id, body.originalInvoiceId), eq(invoices.agencyId, agencyId)));
        if (!orig) throw new BusinessError('الفاتورة الأصلية غير موجودة', 404);
        if (!['380', '388'].includes(orig.type)) {
          throw new BusinessError('لا يمكن إصدار إشعار دائن على إشعار دائن أو مدين', 422);
        }
        if (['cancelled', 'refunded', 'credit_noted'].includes(orig.status)) {
          throw new BusinessError('حالة الفاتورة الأصلية لا تسمح بإصدار إشعار دائن', 422);
        }
        originalInvoice = orig;
      }

      // Atomically reserve the credit against the original invoice. Keeping the
      // cumulative credited/cancelled amounts on that row closes the race where
      // two simultaneous notes both observed the same pre-credit sum.
      if (originalInvoice && body.originalInvoiceId) {
        const claimed = await tx.update(invoices)
          .set({
            creditedHalalas: sql`${invoices.creditedHalalas} + ${totalEarly}`,
            cancelledHalalas: sql`${invoices.cancelledHalalas} + ${totalEarly}`,
            status: sql`CASE
              WHEN ${invoices.creditedHalalas} + ${totalEarly} >= ${invoices.totalHalalas}
                THEN 'credit_noted'
              WHEN ${invoices.paidHalalas} + ${invoices.creditedHalalas} + ${totalEarly} >= ${invoices.totalHalalas}
                THEN 'paid'
              WHEN ${invoices.status} = 'issued' THEN 'partial'
              ELSE ${invoices.status}
            END`,
            updatedAt: now,
          })
          .where(and(
            eq(invoices.id, body.originalInvoiceId),
            eq(invoices.agencyId, agencyId),
            sql`${invoices.type} IN ('380','388')`,
            sql`${invoices.status} IN ('issued','partial','paid')`,
            sql`${invoices.creditedHalalas} + ${totalEarly} <= ${invoices.totalHalalas}`,
            sql`${invoices.cancelledHalalas} + ${totalEarly} <= ${invoices.totalHalalas}`,
          ))
          .returning();
        if (claimed.length === 0) {
          throw new BusinessError('إجمالي الإشعارات الدائنة يتجاوز قيمة الفاتورة الأصلية', 422);
        }
        originalInvoice = claimed[0]!;
      }

      const invNum = await getNextInvoiceNumber(agencyId, 'creditNote' as InvoiceType, year, tx);
      const jeNum  = await getNextJournalNumber(agencyId, year, tx);
      const invId  = crypto.randomUUID();
      const jeId   = crypto.randomUUID();

      const subtotal = body.subtotalHalalas;
      const vat      = requestedVat;
      const total    = requestedTotal;

      // Mirror every account in the original invoice. This preserves mixed
      // agent/principal invoices, supplier AP, COGS and deferred revenue instead
      // of forcing the whole note through one guessed revenue account.
      const originalJournalLines = originalInvoice?.journalEntryId
        ? await tx.select({
            accountCode:   journalLines.accountCode,
            accountNameAr: journalLines.accountNameAr,
            accountNameEn: journalLines.accountNameEn,
            debitHalalas:  journalLines.debitHalalas,
            creditHalalas: journalLines.creditHalalas,
          }).from(journalLines).where(eq(journalLines.entryId, originalInvoice.journalEntryId))
        : [];

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
            buyerVatNumber:        originalInvoice.buyerVatNumber,
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
        buyerVatNumber:   originalInvoice?.buyerVatNumber ?? null,
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

      // Reduce the customer's open AR first. Any excess credit becomes a
      // refundable customer deposit rather than a negative receivable.
      type JL = { id: string; entryId: string; agencyId: string; accountCode: string; accountNameAr: string; accountNameEn: string; debitHalalas: number; creditHalalas: number; sortOrder: number };

      const builtLines = originalInvoice && originalJournalLines.length > 0
        ? buildCreditNoteJournalLines({
            originalLines: originalJournalLines,
            originalTotalHalalas: originalInvoice.totalHalalas,
            originalPaidHalalas: originalInvoice.paidHalalas,
            originalCreditedHalalas: originalInvoice.creditedHalalas - total,
            creditNoteTotalHalalas: total,
            creditNoteVatHalalas: vat,
          })
        : [
            { ...AC_FALLBACK.revenue, dr: subtotal, cr: 0 },
            ...(vat > 0 ? [{ ...AC_FALLBACK.vatPayable, dr: vat, cr: 0 }] : []),
            { ...AC_FALLBACK.receivable, dr: 0, cr: total },
          ];

      const jLines: JL[] = builtLines.map((line, index) => ({
        id: crypto.randomUUID(), entryId: jeId, agencyId,
        accountCode: line.code, accountNameAr: line.ar, accountNameEn: line.en,
        debitHalalas: line.dr, creditHalalas: line.cr, sortOrder: index + 1,
      }));

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

      // Keep the supplier subledger aligned with the exact AP debit posted by the
      // credit note. Allocate the control movement across the original booking's
      // suppliers without per-line rounding drift. A negative supplier balance is
      // valid here: it represents a recoverable amount after an already-paid cost
      // is credited by the supplier.
      const apReversal = jLines
        .filter((line) => line.accountCode === GL.payableSupplier.code)
        .reduce((sum, line) => sum + line.debitHalalas, 0);
      if (apReversal > 0 && originalInvoice?.bookingId) {
        const costLines = await tx.select({
          supplierId: bookingLines.supplierId,
          totalCostHalalas: bookingLines.totalCostHalalas,
        }).from(bookingLines).where(and(
          eq(bookingLines.bookingId, originalInvoice.bookingId),
          eq(bookingLines.agencyId, agencyId),
        ));
        const weights = new Map<string, number>();
        for (const costLine of costLines) {
          if (costLine.supplierId && costLine.totalCostHalalas > 0) {
            weights.set(costLine.supplierId, (weights.get(costLine.supplierId) ?? 0) + costLine.totalCostHalalas);
          }
        }
        for (const [supplierId, amount] of allocateProRata(apReversal, weights)) {
          await tx.update(suppliers)
            .set({ balanceHalalas: sql`${suppliers.balanceHalalas} - ${amount}`, updatedAt: now })
            .where(and(eq(suppliers.id, supplierId), eq(suppliers.agencyId, agencyId)));
        }
      }

      await markIdempotencyComplete(tx, agencyId, 'creditNote', idempKey, { invoiceId: invId, invoiceNumber: invNum });

      return { invoiceId: invId, invoiceNumber: invNum };
    }));

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
