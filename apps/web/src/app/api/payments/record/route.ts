import { NextResponse } from 'next/server';
import { eq, and, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { invoices, bookings, payments, journalEntries, journalLines, idempotencyKeys } from '@/lib/schema';
import { verifyAuth, assertRole, ApiAuthError, BusinessError, ROLES_ACCOUNTANT_UP } from '@/lib/api-auth';
import { withIdempotency, buildIdempotencyInsert } from '@/lib/idempotency';
import { getNextReceiptNumber, getNextJournalNumber } from '@/lib/invoice-counter';
import { requireFeature } from '@/lib/feature-access';
import { GL } from '@/lib/gl-accounts';

interface PaymentRecordBody {
  bookingId?:    string;
  invoiceId:     string;
  amountHalalas: number;
  paymentMethod: 'cash' | 'bank_transfer' | 'card' | 'online';
  reference?:    string;
  notes?:        string;
  idempotencyKey?: string;
}

const METHOD_ACCOUNT: Record<string, { code: string; ar: string; en: string }> = {
  cash:          { code: '1100', ar: 'الصندوق النقدي', en: 'Cash' },
  bank_transfer: { code: '1110', ar: 'البنك',           en: 'Bank' },
  card:          { code: '1115', ar: 'نقاط البيع',      en: 'POS / Card' },
  online:        { code: '1115', ar: 'نقاط البيع',      en: 'POS / Card' },
};

export async function POST(request: Request) {
  try {
    const { uid, agencyId, role } = await verifyAuth(request);
    assertRole(role, [...ROLES_ACCOUNTANT_UP]);
    await requireFeature(agencyId, 'payments', db);

    const body = await request.json() as PaymentRecordBody;
    const { bookingId, invoiceId, amountHalalas, paymentMethod, reference, notes } = body;
    const idempKey = body.idempotencyKey ?? crypto.randomUUID();

    if (!invoiceId) {
      return NextResponse.json({ error: 'invoiceId مطلوب' }, { status: 400 });
    }
    if (!Number.isInteger(amountHalalas) || amountHalalas <= 0) {
      return NextResponse.json({ error: 'مبلغ الدفعة غير صالح' }, { status: 400 });
    }

    const result = await withIdempotency(idempKey, agencyId, 'processPayment', async () => {
      return db.transaction(async (tx) => {

        // ── 1. Read ────────────────────────────────────────────────────────
        const [invoice] = await tx.select().from(invoices).where(
          and(eq(invoices.id, invoiceId), eq(invoices.agencyId, agencyId)),
        );
        if (!invoice) throw new BusinessError(`الفاتورة ${invoiceId} غير موجودة`, 404);
        if (bookingId && invoice.bookingId && invoice.bookingId !== bookingId) throw new BusinessError('الفاتورة لا تنتمي لهذا الحجز', 400);

        // SM-01: Block payment on terminal-status invoices
        const TERMINAL = new Set(['cancelled', 'void', 'credit_memo']);
        if (TERMINAL.has(invoice.status ?? '')) {
          throw new BusinessError(`لا يمكن تسجيل دفعة على فاتورة بحالة "${invoice.status}"`, 400);
        }

        // ── 2. Validate (fast-fail before any writes) ──────────────────────
        const currentDue = invoice.totalHalalas - invoice.paidHalalas;
        if (amountHalalas > currentDue) {
          throw new BusinessError(`المبلغ (${amountHalalas / 100} ر.س) يتجاوز المستحق (${currentDue / 100} ر.س)`, 400);
        }

        // ── 3. Calculate ────────────────────────────────────────────────────
        const now  = new Date();
        const year = now.getFullYear();

        // ── 4. Counters + IDs ───────────────────────────────────────────────
        const receiptNumber = await getNextReceiptNumber(agencyId, year, tx);
        const jeNumber      = await getNextJournalNumber(agencyId, year, tx);
        const paymentId     = crypto.randomUUID();
        const jeId          = crypto.randomUUID();
        const today         = now.toISOString().split('T')[0]!;
        const cashAc        = METHOD_ACCOUNT[paymentMethod] ?? METHOD_ACCOUNT['bank_transfer']!;

        // ── 5. Write ────────────────────────────────────────────────────────
        await tx.insert(payments).values({
          id:            paymentId,
          agencyId,
          invoiceId,
          bookingId,
          customerId:    invoice.customerId ?? null,
          customerName:  invoice.buyerNameAr ?? '',
          amountHalalas,
          method:        paymentMethod,
          reference:     reference ?? null,
          voucherNumber: receiptNumber,
          date:          today,
          notes:         notes ?? null,
          journalEntryId: jeId,
          createdBy:     uid,
        });

        await tx.insert(journalEntries).values({
          id:                 jeId,
          agencyId,
          entryNumber:        jeNumber,
          date:               today,
          descriptionAr:      `استلام دفعة — ${invoice.invoiceNumber} — ${receiptNumber}`,
          source:             'payment',
          sourceId:           paymentId,
          isPosted:           true,
          totalDebitHalalas:  amountHalalas,
          totalCreditHalalas: amountHalalas,
          createdBy:          uid,
        });

        await tx.insert(journalLines).values([
          { id: crypto.randomUUID(), entryId: jeId, agencyId, accountCode: cashAc.code,         accountNameAr: cashAc.ar,         accountNameEn: cashAc.en,         debitHalalas: amountHalalas, creditHalalas: 0,             sortOrder: 1 },
          { id: crypto.randomUUID(), entryId: jeId, agencyId, accountCode: GL.receivable.code,  accountNameAr: GL.receivable.ar,  accountNameEn: GL.receivable.en,  debitHalalas: 0,             creditHalalas: amountHalalas, sortOrder: 2 },
        ]);

        // Atomic update: only succeeds if remaining due still covers the amount.
        // This prevents double-payment from concurrent requests that both passed the
        // fast-fail check above with the same snapshot.
        const [updatedInvoice] = await tx.update(invoices)
          .set({
            paidHalalas: sql`${invoices.paidHalalas} + ${amountHalalas}`,
            status: sql`CASE WHEN ${invoices.paidHalalas} + ${amountHalalas} >= ${invoices.totalHalalas} THEN 'paid' ELSE 'partial' END`,
            updatedAt: now,
          })
          .where(
            and(
              eq(invoices.id, invoiceId),
              sql`(${invoices.totalHalalas} - ${invoices.paidHalalas}) >= ${amountHalalas}`,
            ),
          )
          .returning({ paidHalalas: invoices.paidHalalas, totalHalalas: invoices.totalHalalas });

        if (!updatedInvoice) {
          throw new BusinessError('تعذّر تسجيل الدفعة — قد تكون دفعة أخرى سجّلت في نفس الوقت، حاول مجدداً', 400);
        }

        const newPaidHalalas = updatedInvoice.paidHalalas;
        const isFullyPaid    = newPaidHalalas >= updatedInvoice.totalHalalas;

        if (bookingId) {
          await tx.update(bookings)
            .set({ paidHalalas: sql`${bookings.paidHalalas} + ${amountHalalas}`, updatedAt: now })
            .where(eq(bookings.id, bookingId));
        }

        await tx.insert(idempotencyKeys)
          .values(buildIdempotencyInsert(agencyId, 'processPayment', idempKey, { paymentId, receiptNumber }))
          .onConflictDoNothing();

        return {
          paymentId,
          receiptNumber,
          remainingDueHalalas: updatedInvoice.totalHalalas - newPaidHalalas,
          invoiceStatus: isFullyPaid ? 'fully_paid' : 'partial',
        };
      });
    });

    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    if (err instanceof ApiAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    if (err instanceof BusinessError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error(JSON.stringify({ event: 'process_payment_failed', error: String(err) }));
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
