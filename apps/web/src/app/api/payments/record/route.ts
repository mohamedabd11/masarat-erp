import { NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { invoices, bookings, payments, journalEntries, journalLines, idempotencyKeys } from '@/lib/schema';
import { verifyAuth, ApiAuthError } from '@/lib/api-auth';
import { withIdempotency, buildIdempotencyInsert } from '@/lib/idempotency';
import { getNextReceiptNumber, getNextJournalNumber } from '@/lib/invoice-counter';

interface PaymentRecordBody {
  bookingId:     string;
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
const AC_RECEIVABLE = { code: '1120', ar: 'ذمم مدينة - عملاء', en: 'Accounts Receivable' };

export async function POST(request: Request) {
  try {
    const { uid, agencyId } = await verifyAuth(request);

    const body = await request.json() as PaymentRecordBody;
    const { bookingId, invoiceId, amountHalalas, paymentMethod, reference, notes } = body;
    const idempKey = body.idempotencyKey ?? crypto.randomUUID();

    if (!bookingId || !invoiceId) {
      return NextResponse.json({ error: 'bookingId و invoiceId مطلوبان' }, { status: 400 });
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
        if (!invoice) throw new Error(`الفاتورة ${invoiceId} غير موجودة`);
        if (invoice.bookingId !== bookingId) throw new Error('الفاتورة لا تنتمي لهذا الحجز');

        // ── 2. Validate ────────────────────────────────────────────────────
        const currentDue = invoice.totalHalalas - invoice.paidHalalas;
        if (amountHalalas > currentDue) {
          throw new Error(`المبلغ (${amountHalalas / 100} ر.س) يتجاوز المستحق (${currentDue / 100} ر.س)`);
        }

        // ── 3. Calculate ────────────────────────────────────────────────────
        const now = new Date();
        const year = now.getFullYear();
        const newPaidHalalas = invoice.paidHalalas + amountHalalas;
        const isFullyPaid    = newPaidHalalas >= invoice.totalHalalas;

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
          { id: crypto.randomUUID(), entryId: jeId, agencyId, accountCode: cashAc.code, accountNameAr: cashAc.ar, accountNameEn: cashAc.en, debitHalalas: amountHalalas, creditHalalas: 0, sortOrder: 1 },
          { id: crypto.randomUUID(), entryId: jeId, agencyId, accountCode: AC_RECEIVABLE.code, accountNameAr: AC_RECEIVABLE.ar, accountNameEn: AC_RECEIVABLE.en, debitHalalas: 0, creditHalalas: amountHalalas, sortOrder: 2 },
        ]);

        await tx.update(invoices)
          .set({ paidHalalas: newPaidHalalas, status: isFullyPaid ? 'paid' : 'issued', updatedAt: now })
          .where(eq(invoices.id, invoiceId));

        await tx.update(bookings)
          .set({ paidHalalas: newPaidHalalas, updatedAt: now })
          .where(eq(bookings.id, bookingId));

        await tx.insert(idempotencyKeys)
          .values(buildIdempotencyInsert(agencyId, 'processPayment', idempKey, { paymentId, receiptNumber }))
          .onConflictDoNothing();

        return {
          paymentId,
          receiptNumber,
          remainingDueHalalas: currentDue - amountHalalas,
          invoiceStatus: isFullyPaid ? 'fully_paid' : 'partial',
        };
      });
    });

    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    if (err instanceof ApiAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error(JSON.stringify({ event: 'process_payment_failed', error: String(err) }));
    const message = err instanceof Error ? err.message : 'خطأ في الخادم';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
