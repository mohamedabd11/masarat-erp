import { NextResponse } from 'next/server';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { ensureAdminApp } from '@/lib/firebase-admin';
import { verifyAuth, ApiAuthError } from '@/lib/api-auth';
import { withIdempotency, idempotencyDoc } from '@/lib/idempotency';
import { getNextInvoiceNumber } from '@/lib/invoice-counter';

interface RefundBody {
  bookingId: string;
  originalInvoiceId: string;
  refundAmountHalalas: number;
  cancellationFeeHalalas: number;
  reason: string;
  idempotencyKey?: string;
}

const AC = {
  bank:             { code: '1110', ar: 'البنك',                       en: 'Bank' },
  vatPayable:       { code: '2200', ar: 'ضريبة القيمة المضافة مستحقة', en: 'VAT Payable' },
  revenueAgent:     { code: '4000', ar: 'إيراد رسوم الوكالة',          en: 'Revenue - Agency Fees' },
  revenuePrincipal: { code: '4100', ar: 'إيراد خدمات السفر',           en: 'Revenue - Travel Services' },
};

export async function POST(request: Request) {
  try {
    ensureAdminApp();
    const { uid, agencyId } = await verifyAuth(request);

    const body = await request.json() as RefundBody;
    const { bookingId, originalInvoiceId, refundAmountHalalas, cancellationFeeHalalas, reason } = body;
    const idempotencyKey = body.idempotencyKey ?? crypto.randomUUID();

    if (!bookingId || !originalInvoiceId || !reason) {
      return NextResponse.json({ error: 'بيانات مطلوبة ناقصة' }, { status: 400 });
    }
    if (!Number.isInteger(refundAmountHalalas) || refundAmountHalalas < 0) {
      return NextResponse.json({ error: 'مبلغ الاسترداد غير صالح' }, { status: 400 });
    }

    const result = await withIdempotency(idempotencyKey, agencyId, 'processRefund', async () => {
      const db = getFirestore();
      return db.runTransaction(async (tx) => {

        // ── 1. قراءة البيانات ──────────────────────────────────────────────
        const [invoiceSnap, bookingSnap] = await Promise.all([
          tx.get(db.collection('invoices').doc(originalInvoiceId)),
          tx.get(db.collection('bookings').doc(bookingId)),
        ]);

        if (!invoiceSnap.exists) throw new Error(`الفاتورة ${originalInvoiceId} غير موجودة`);
        if (!bookingSnap.exists) throw new Error(`الحجز ${bookingId} غير موجود`);

        const invoice = invoiceSnap.data()!;
        const booking = bookingSnap.data()!;

        // ── 2. التحقق ─────────────────────────────────────────────────────
        if (invoice['agencyId'] !== agencyId) throw new Error(`الفاتورة لا تنتمي لوكالتك`);
        if (invoice['status'] === 'cancelled') throw new Error(`الفاتورة ملغاة بالفعل`);
        if (booking['status'] === 'cancelled') throw new Error(`الحجز ملغى بالفعل`);

        const amountPaid = invoice['amountPaid'] as number;
        if (refundAmountHalalas + cancellationFeeHalalas > amountPaid) {
          throw new Error(
            `المجموع (${(refundAmountHalalas + cancellationFeeHalalas) / 100} ر.س) يتجاوز المدفوع (${amountPaid / 100} ر.س)`
          );
        }

        // ── 3. حساب المبالغ ───────────────────────────────────────────────
        const isVatRegistered = (invoice['isVatRegistered'] as boolean) === true;
        const pricing = (booking['pricing'] ?? {}) as Record<string, unknown>;
        const revenueModel = (pricing['revenueModel'] as string) ?? 'agent';
        const revenueAc = revenueModel === 'agent' ? AC.revenueAgent : AC.revenuePrincipal;

        const refundSubtotal = isVatRegistered
          ? Math.round(refundAmountHalalas / 1.15)
          : refundAmountHalalas;
        const refundVat = isVatRegistered ? refundAmountHalalas - refundSubtotal : 0;

        // ── 4. رقم إشعار دائن تسلسلي ──────────────────────────────────────
        const year = new Date().getFullYear();
        const creditNoteNumber = await getNextInvoiceNumber(agencyId, 'creditNote', year, tx);

        // ── 5. إعداد المستندات ────────────────────────────────────────────
        const now = Timestamp.now();
        const creditNoteRef = db.collection('invoices').doc();
        const journalRef    = db.collection('journal_entries').doc();
        const refundRef     = db.collection('bookings').doc(bookingId).collection('payments').doc();

        const journalLines = buildRefundLines(revenueAc, isVatRegistered, refundAmountHalalas, refundSubtotal, refundVat);

        // ── 6. الكتابات الذرية ────────────────────────────────────────────
        tx.set(creditNoteRef, {
          id: creditNoteRef.id,
          agencyId,
          type: 'credit_note',
          isVatRegistered,
          invoiceNumber: creditNoteNumber,
          originalInvoiceId,
          originalInvoiceNumber: invoice['invoiceNumber'],
          bookingId,
          seller: invoice['seller'],
          buyer: invoice['buyer'],
          totals: {
            subtotalExclVat: refundSubtotal,
            totalVat: refundVat,
            grandTotal: refundAmountHalalas,
            currency: 'SAR',
          },
          refundAmount: refundAmountHalalas,
          cancellationFee: cancellationFeeHalalas,
          reason,
          status: 'issued',
          paymentStatus: 'refunded',
          amountPaid: refundAmountHalalas,
          amountDue: 0,
          zatca: {
            invoiceUUID: crypto.randomUUID(),
            invoiceTypeCode: '381',
            submissionStatus: isVatRegistered ? 'not_submitted' : 'not_applicable',
          },
          journalEntryId: journalRef.id,
          issueDate: now,
          createdAt: now,
          createdBy: uid,
        });

        tx.set(journalRef, {
          id: journalRef.id,
          agencyId,
          description: `مذكرة دائنة ${creditNoteNumber} - استرداد`,
          referenceId: creditNoteRef.id,
          referenceType: 'refund',
          lines: journalLines.map((l, i) => ({
            lineNumber: i + 1,
            accountCode: l.code,
            accountName: { ar: l.ar, en: l.en },
            debit: l.dr,
            credit: l.cr,
            debitSAR: l.dr / 100,
            creditSAR: l.cr / 100,
          })),
          totalDebitHalalas: journalLines.reduce((s, l) => s + l.dr, 0),
          totalCreditHalalas: journalLines.reduce((s, l) => s + l.cr, 0),
          period: `${now.toDate().getFullYear()}-${String(now.toDate().getMonth() + 1).padStart(2, '0')}`,
          isBalanced: true,
          status: 'posted',
          isAuto: true,
          entryDate: now,
          createdAt: now,
          createdBy: 'system',
          postedAt: now,
        });

        tx.set(refundRef, {
          id: refundRef.id,
          agencyId,
          bookingId,
          invoiceId: creditNoteRef.id,
          originalInvoiceId,
          amount: -refundAmountHalalas,
          currency: 'SAR',
          method: 'refund',
          receiptNumber: creditNoteNumber,
          receivedAt: now,
          receivedBy: uid,
          journalEntryId: journalRef.id,
          isRefund: true,
          reason,
          createdAt: now,
        });

        tx.update(db.collection('bookings').doc(bookingId), {
          status: 'cancelled',
          cancelledAt: now,
          cancelReason: reason,
          paymentStatus: refundAmountHalalas === amountPaid ? 'refunded' : 'partial_refund',
          updatedAt: now,
        });

        tx.update(db.collection('invoices').doc(originalInvoiceId), {
          status: 'credited',
          updatedAt: now,
        });

        const idp = idempotencyDoc(agencyId, 'processRefund', idempotencyKey, {
          refundId: refundRef.id,
          creditNoteId: creditNoteRef.id,
          creditNoteNumber,
        });
        tx.set(idp.ref, idp.data);

        return { creditNoteId: creditNoteRef.id, creditNoteNumber, refundAmountHalalas };
      });
    });

    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    if (err instanceof ApiAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error(JSON.stringify({ event: 'process_refund_failed', error: String(err) }));
    const message = err instanceof Error ? err.message : 'خطأ في الخادم';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function buildRefundLines(
  revenueAc: { code: string; ar: string; en: string },
  isVatRegistered: boolean,
  refundAmount: number,
  subtotal: number,
  vatAmount: number,
): Array<{ code: string; ar: string; en: string; dr: number; cr: number }> {
  if (isVatRegistered && vatAmount > 0) {
    return [
      { ...revenueAc, dr: subtotal, cr: 0 },
      { ...AC.vatPayable, dr: vatAmount, cr: 0 },
      { ...AC.bank, dr: 0, cr: refundAmount },
    ];
  }
  return [
    { ...revenueAc, dr: refundAmount, cr: 0 },
    { ...AC.bank, dr: 0, cr: refundAmount },
  ];
}
