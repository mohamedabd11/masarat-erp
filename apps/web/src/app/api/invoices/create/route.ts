import { NextResponse } from 'next/server';
import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore';
import { ensureAdminApp } from '@/lib/firebase-admin';
import { verifyAuth, ApiAuthError } from '@/lib/api-auth';
import { withIdempotency, idempotencyDoc } from '@/lib/idempotency';
import { VAT_RATE } from '@masarat/accounting';
import { getNextInvoiceNumber } from '@/lib/invoice-counter';

// ─── Account codes (standard chart of accounts) ──────────────────────────────
const AC = {
  receivable:       { code: '1120', ar: 'ذمم مدينة - عملاء',          en: 'Accounts Receivable' },
  payableSupplier:  { code: '2000', ar: 'ذمم دائنة - موردون',         en: 'Accounts Payable' },
  vatPayable:       { code: '2200', ar: 'ضريبة القيمة المضافة مستحقة', en: 'VAT Payable' },
  revenueAgent:     { code: '4000', ar: 'إيراد رسوم الوكالة',          en: 'Revenue - Agency Fees' },
  revenuePrincipal: { code: '4100', ar: 'إيراد خدمات السفر',           en: 'Revenue - Travel Services' },
};

interface InvoiceCreateBody {
  bookingId: string;
  idempotencyKey?: string;
}

export async function POST(request: Request) {
  try {
    ensureAdminApp();
    const { uid, agencyId } = await verifyAuth(request);

    const body = await request.json() as InvoiceCreateBody;
    const { bookingId } = body;
    const idempotencyKey = body.idempotencyKey ?? crypto.randomUUID();

    if (!bookingId) {
      return NextResponse.json({ error: 'bookingId مطلوب' }, { status: 400 });
    }

    const result = await withIdempotency(idempotencyKey, agencyId, 'createInvoice', async () => {
      const db = getFirestore();
      return db.runTransaction(async (tx) => {

        // ── 1. قراءة البيانات ──────────────────────────────────────────────
        const [bookingSnap, agencySnap] = await Promise.all([
          tx.get(db.collection('bookings').doc(bookingId)),
          tx.get(db.collection('agencies').doc(agencyId)),
        ]);

        if (!bookingSnap.exists) throw new Error(`الحجز ${bookingId} غير موجود`);
        if (!agencySnap.exists) throw new Error(`الوكالة ${agencyId} غير موجودة`);

        const booking = bookingSnap.data()!;
        const agency  = agencySnap.data()!;

        // ── 2. التحقق ─────────────────────────────────────────────────────
        if (booking['agencyId'] !== agencyId) {
          throw new Error(`الحجز ${bookingId} لا ينتمي لوكالتك`);
        }
        if (booking['status'] !== 'confirmed') {
          throw new Error(`لا يمكن إصدار فاتورة للحجز بحالة: ${booking['status'] as string}`);
        }
        if ((booking['invoiceIds'] as string[] | undefined)?.length) {
          throw new Error(`الحجز ${bookingId} لديه فاتورة بالفعل`);
        }

        // ── 3. رقم فاتورة تسلسلي (ذري) ───────────────────────────────────
        const year = new Date().getFullYear();
        const invoiceNumber = await getNextInvoiceNumber(agencyId, 'taxInvoice', year, tx);

        // ── 4. حساب المبالغ ───────────────────────────────────────────────
        const pricing = (booking['pricing'] ?? {}) as Record<string, number & { revenueModel?: string }>;
        const revenueModel  = (pricing as unknown as Record<string, string>)['revenueModel'] ?? 'principal';
        const isVatRegistered = (agency['isVatRegistered'] as boolean) === true;

        const grandTotal     = (pricing['totalAmount'] ?? 0) as number;
        const storedVat      = (pricing['vatAmount']   ?? 0) as number;
        const storedCost     = (pricing['totalCost']   ?? 0) as number;
        const storedFee      = (pricing['serviceFee']  ?? 0) as number;

        let subtotalExclVat: number;
        let totalVat: number;
        let finalGrandTotal: number;

        if (!isVatRegistered) {
          subtotalExclVat = storedCost + storedFee || Math.round(grandTotal / 1.15);
          totalVat = 0;
          finalGrandTotal = subtotalExclVat;
        } else if (revenueModel === 'agent') {
          subtotalExclVat = storedCost + storedFee;
          totalVat = storedVat;
          finalGrandTotal = grandTotal;
        } else {
          subtotalExclVat = Math.round(grandTotal / 1.15);
          totalVat = grandTotal - subtotalExclVat;
          finalGrandTotal = grandTotal;
        }

        // ── 5. بناء سطور الفاتورة ─────────────────────────────────────────
        const bookingTypeLabels: Record<string, { ar: string; en: string }> = {
          flight: { ar: 'حجز طيران', en: 'Flight Booking' },
          hotel: { ar: 'حجز فندق', en: 'Hotel Booking' },
          package: { ar: 'باقة سياحية', en: 'Tour Package' },
          umrah: { ar: 'برنامج عمرة', en: 'Umrah Program' },
          hajj: { ar: 'برنامج حج', en: 'Hajj Program' },
          visa: { ar: 'خدمة تأشيرة', en: 'Visa Service' },
          insurance: { ar: 'تأمين سفر', en: 'Travel Insurance' },
          transport: { ar: 'خدمة نقل', en: 'Transport Service' },
        };
        const typeLabel = bookingTypeLabels[booking['type'] as string] ?? { ar: 'خدمة سفر', en: 'Travel Service' };

        const invoiceLines = [{
          id: '1',
          nameAr: typeLabel.ar,
          nameEn: typeLabel.en,
          quantity: 1,
          unitCode: 'PCE',
          unitPriceExclVatHalalas: subtotalExclVat,
          totalExclVatHalalas: subtotalExclVat,
          vatRate: totalVat > 0 ? VAT_RATE : 0,
          vatAmountHalalas: totalVat,
          totalInclVatHalalas: finalGrandTotal,
        }];

        const seller = {
          isVatRegistered,
          name: { ar: (agency['nameAr'] as string) ?? '', en: (agency['nameEn'] as string) ?? '' },
          vatNumber: (agency['vatNumber'] as string) ?? '',
          crNumber: (agency['crNumber'] as string) ?? '',
        };

        const cn = booking['customerName'] as { ar?: string; en?: string } | undefined;
        const buyer = {
          id: booking['customerId'] as string,
          name: { ar: cn?.ar ?? '', en: cn?.en ?? '' },
          phone: (booking['customerPhone'] as string) ?? '',
        };

        // ── 6. إعداد المستندات ────────────────────────────────────────────
        const now = Timestamp.now();
        const invoiceRef = db.collection('invoices').doc();
        const journalRef = db.collection('journal_entries').doc();
        const invoiceId  = invoiceRef.id;

        // بناء سطور القيد المحاسبي
        const journalLines = buildInvoiceJournalLines(
          revenueModel, isVatRegistered, finalGrandTotal, storedCost, storedFee, totalVat, subtotalExclVat
        );

        // ── 7. الكتابات الذرية ────────────────────────────────────────────
        tx.set(invoiceRef, {
          id: invoiceId,
          agencyId,
          bookingId,
          bookingNumber: (booking['bookingNumber'] as string) ?? null,
          type: isVatRegistered ? 'tax_invoice' : 'commercial_invoice',
          isVatRegistered,
          invoiceNumber,
          status: 'issued',
          paymentStatus: 'unpaid',
          amountPaid: 0,
          amountDue: finalGrandTotal,
          seller,
          buyer,
          lines: invoiceLines,
          totals: { subtotalExclVat, totalVat, grandTotal: finalGrandTotal, currency: 'SAR' },
          zatca: {
            invoiceUUID: crypto.randomUUID(),
            invoiceTypeCode: '388',
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
          description: `فاتورة رقم ${invoiceNumber} - ${typeLabel.ar}`,
          referenceId: invoiceId,
          referenceType: 'invoice',
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

        tx.update(db.collection('bookings').doc(bookingId), {
          invoiceIds: FieldValue.arrayUnion(invoiceId),
          updatedAt: now,
        });

        const idp = idempotencyDoc(agencyId, 'createInvoice', idempotencyKey, { invoiceId, invoiceNumber });
        tx.set(idp.ref, idp.data);

        return { invoiceId, invoiceNumber };
      });
    });

    return NextResponse.json({ success: true, ...result, qrCodeData: '' });
  } catch (err) {
    if (err instanceof ApiAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error(JSON.stringify({ event: 'create_invoice_failed', error: String(err) }));
    const message = err instanceof Error ? err.message : 'خطأ في الخادم';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function buildInvoiceJournalLines(
  revenueModel: string,
  isVatRegistered: boolean,
  grandTotal: number,
  totalCost: number,
  serviceFee: number,
  vatAmount: number,
  subtotalExclVat: number,
): Array<{ code: string; ar: string; en: string; dr: number; cr: number }> {
  if (grandTotal === 0) return [];

  const ar = (ac: typeof AC[keyof typeof AC], dr: number, cr: number) => ({
    code: ac.code, ar: ac.ar, en: ac.en, dr, cr,
  });

  if (revenueModel === 'agent') {
    const hasBreakdown = totalCost > 0 || serviceFee > 0;
    if (hasBreakdown) {
      const lines = [
        ar(AC.receivable, grandTotal, 0),
        ar(AC.payableSupplier, 0, totalCost),
        ar(AC.revenueAgent, 0, serviceFee),
      ];
      if (isVatRegistered && vatAmount > 0) lines.push(ar(AC.vatPayable, 0, vatAmount));
      return lines;
    }
    if (isVatRegistered && vatAmount > 0) {
      return [ar(AC.receivable, grandTotal, 0), ar(AC.revenueAgent, 0, grandTotal - vatAmount), ar(AC.vatPayable, 0, vatAmount)];
    }
    return [ar(AC.receivable, grandTotal, 0), ar(AC.revenueAgent, 0, grandTotal)];
  }

  if (isVatRegistered && vatAmount > 0) {
    return [ar(AC.receivable, grandTotal, 0), ar(AC.revenuePrincipal, 0, subtotalExclVat), ar(AC.vatPayable, 0, vatAmount)];
  }
  return [ar(AC.receivable, grandTotal, 0), ar(AC.revenuePrincipal, 0, grandTotal)];
}
