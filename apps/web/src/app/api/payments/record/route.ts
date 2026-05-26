import { NextResponse } from 'next/server';
import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore';
import { ensureAdminApp } from '@/lib/firebase-admin';
import { verifyAuth, ApiAuthError } from '@/lib/api-auth';
import { withIdempotency, idempotencyDoc } from '@/lib/idempotency';
import { getNextReceiptNumber } from '@/lib/invoice-counter';

interface PaymentRecordBody {
  bookingId: string;
  invoiceId: string;
  amountHalalas: number;
  paymentMethod: 'cash' | 'bank_transfer' | 'card' | 'online';
  reference?: string;
  notes?: string;
  idempotencyKey?: string;
}

const METHOD_ACCOUNT: Record<string, { code: string; ar: string; en: string }> = {
  cash:          { code: '1100', ar: 'الصندوق النقدي', en: 'Cash' },
  bank_transfer: { code: '1110', ar: 'البنك',          en: 'Bank' },
  card:          { code: '1115', ar: 'نقاط البيع',     en: 'POS / Card' },
  online:        { code: '1115', ar: 'نقاط البيع',     en: 'POS / Card' },
};
const AC_RECEIVABLE = { code: '1120', ar: 'ذمم مدينة - عملاء', en: 'Accounts Receivable' };

export async function POST(request: Request) {
  try {
    ensureAdminApp();
    const { uid, agencyId } = await verifyAuth(request);

    const body = await request.json() as PaymentRecordBody;
    const { bookingId, invoiceId, amountHalalas, paymentMethod, reference, notes } = body;
    const idempotencyKey = body.idempotencyKey ?? crypto.randomUUID();

    if (!bookingId || !invoiceId) {
      return NextResponse.json({ error: 'bookingId و invoiceId مطلوبان' }, { status: 400 });
    }
    if (!Number.isInteger(amountHalalas) || amountHalalas <= 0) {
      return NextResponse.json({ error: 'مبلغ الدفعة غير صالح' }, { status: 400 });
    }

    const result = await withIdempotency(idempotencyKey, agencyId, 'processPayment', async () => {
      const db = getFirestore();
      return db.runTransaction(async (tx) => {

        // ── 1. قراءة البيانات ──────────────────────────────────────────────
        const [invoiceSnap, bookingSnap] = await Promise.all([
          tx.get(db.collection('invoices').doc(invoiceId)),
          tx.get(db.collection('bookings').doc(bookingId)),
        ]);

        if (!invoiceSnap.exists) throw new Error(`الفاتورة ${invoiceId} غير موجودة`);
        if (!bookingSnap.exists) throw new Error(`الحجز ${bookingId} غير موجود`);

        const invoice = invoiceSnap.data()!;
        const booking = bookingSnap.data()!;

        // ── 2. التحقق ─────────────────────────────────────────────────────
        if (invoice['agencyId'] !== agencyId) throw new Error(`الفاتورة لا تنتمي لوكالتك`);
        if (invoice['bookingId'] !== bookingId) throw new Error(`الفاتورة لا تنتمي لهذا الحجز`);

        const currentDue = invoice['amountDue'] as number;
        if (amountHalalas > currentDue) {
          throw new Error(
            `المبلغ (${amountHalalas / 100} ر.س) يتجاوز المستحق (${currentDue / 100} ر.س)`
          );
        }

        // ── 3. الأرقام التسلسلية ──────────────────────────────────────────
        const year = new Date().getFullYear();
        const receiptNumber = await getNextReceiptNumber(agencyId, year, tx);

        // ── 4. حساب الحالة الجديدة ────────────────────────────────────────
        const newAmountPaid = (invoice['amountPaid'] as number) + amountHalalas;
        const newAmountDue  = currentDue - amountHalalas;
        const grandTotal    = (invoice['totals'] as Record<string, number>)?.['grandTotal'] ?? 0;
        const newStatus = newAmountDue === 0 ? 'fully_paid'
          : newAmountPaid > 0 && newAmountPaid < grandTotal ? 'partial'
          : 'unpaid';

        // ── 5. إعداد المستندات ────────────────────────────────────────────
        const now = Timestamp.now();
        const paymentRef = db.collection('payments').doc();
        const journalRef = db.collection('journal_entries').doc();
        const cashAc = METHOD_ACCOUNT[paymentMethod] ?? METHOD_ACCOUNT['bank_transfer']!;

        // ── 6. الكتابات ───────────────────────────────────────────────────
        tx.set(paymentRef, {
          id: paymentRef.id,
          type: 'receipt',
          agencyId,
          bookingId,
          invoiceId,
          invoiceNumber: invoice['invoiceNumber'] as string ?? '',
          customerId: booking['customerId'],
          customerNameAr: (booking['customerName'] as Record<string, string>)?.['ar'] ?? (booking['customerName'] as string) ?? '',
          customerNameEn: (booking['customerName'] as Record<string, string>)?.['en'] ?? '',
          amountHalalas: amountHalalas,
          currency: 'SAR',
          paymentMethod: paymentMethod,
          reference: reference ?? '',
          notes: notes ?? '',
          receiptNumber,
          receivedAt: now,
          receivedBy: uid,
          bankAccountCode: cashAc.code,
          journalEntryId: journalRef.id,
          isRefund: false,
          createdAt: now,
        });

        tx.set(journalRef, {
          id: journalRef.id,
          agencyId,
          description: `استلام دفعة — ${invoice['invoiceNumber'] as string} — ${receiptNumber}`,
          referenceId: paymentRef.id,
          referenceType: 'payment',
          lines: [
            {
              lineNumber: 1,
              accountCode: cashAc.code,
              accountName: { ar: cashAc.ar, en: cashAc.en },
              debit: amountHalalas,
              credit: 0,
              debitSAR: amountHalalas / 100,
              creditSAR: 0,
            },
            {
              lineNumber: 2,
              accountCode: AC_RECEIVABLE.code,
              accountName: { ar: AC_RECEIVABLE.ar, en: AC_RECEIVABLE.en },
              debit: 0,
              credit: amountHalalas,
              debitSAR: 0,
              creditSAR: amountHalalas / 100,
            },
          ],
          totalDebitHalalas: amountHalalas,
          totalCreditHalalas: amountHalalas,
          period: `${now.toDate().getFullYear()}-${String(now.toDate().getMonth() + 1).padStart(2, '0')}`,
          isBalanced: true,
          status: 'posted',
          isAuto: true,
          entryDate: now,
          createdAt: now,
          createdBy: 'system',
          postedAt: now,
        });

        tx.update(db.collection('invoices').doc(invoiceId), {
          amountPaid: newAmountPaid,
          amountDue: newAmountDue,
          paymentStatus: newStatus,
          paymentIds: FieldValue.arrayUnion(paymentRef.id),
          updatedAt: now,
        });

        tx.update(db.collection('bookings').doc(bookingId), {
          totalPaid: FieldValue.increment(amountHalalas),
          totalDue: FieldValue.increment(-amountHalalas),
          paymentStatus: newStatus,
          updatedAt: now,
        });

        const idp = idempotencyDoc(agencyId, 'processPayment', idempotencyKey, {
          paymentId: paymentRef.id,
          receiptNumber,
        });
        tx.set(idp.ref, idp.data);

        return {
          paymentId: paymentRef.id,
          receiptNumber,
          remainingDueHalalas: newAmountDue,
          invoiceStatus: newStatus,
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
