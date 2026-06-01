import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { receiptVouchers, journalEntries, journalLines } from '@/lib/schema';
import { verifyAuth, ApiAuthError, BusinessError } from '@/lib/api-auth';
import { getNextReceiptNumber, getNextJournalNumber } from '@/lib/invoice-counter';
import { assertPeriodOpen } from '@/lib/period-lock';
import { logAudit } from '@/lib/audit';
import { checkRateLimit, getClientIp, rateLimitHeaders } from '@/lib/rate-limit';
import { GL } from '@/lib/gl-accounts';

interface StandaloneReceiptBody {
  customerNameAr:  string;
  customerNameEn?: string;
  customerPhone?:  string;
  amountHalalas:   number;
  paymentMethod:   string;
  description?:    string;
  reference?:      string;
  notes?:          string;
}

const METHOD_ACCOUNT: Record<string, { code: string; ar: string; en: string }> = {
  cash:          GL.cash,
  bank_transfer: GL.bank,
  card:          GL.posCard,
  online:        GL.posCard,
};
const AC_DEPOSITS = GL.customerDeposits;

export async function POST(request: Request) {
  try {
    const { uid, agencyId } = await verifyAuth(request);

    const rl = await checkRateLimit(`${agencyId}:${getClientIp(request)}`, 'financial');
    if (!rl.success) {
      return NextResponse.json(
        { error: 'تجاوزت الحد المسموح به من الطلبات. حاول مرة أخرى بعد دقيقة.' },
        { status: 429, headers: rateLimitHeaders(rl) },
      );
    }

    const body = await request.json() as StandaloneReceiptBody;
    const { customerNameAr, customerNameEn, amountHalalas, paymentMethod, description, reference, notes } = body;

    if (!customerNameAr || !paymentMethod) {
      return NextResponse.json({ error: 'بيانات مطلوبة ناقصة' }, { status: 400 });
    }
    if (!Number.isInteger(amountHalalas) || amountHalalas <= 0) {
      return NextResponse.json({ error: 'مبلغ الدفعة غير صالح' }, { status: 400 });
    }

    const result = await db.transaction(async (tx) => {
      const now   = new Date();
      const year  = now.getFullYear();
      const today = now.toISOString().split('T')[0]!;

      await assertPeriodOpen(agencyId, today, tx);

      const voucherNumber = await getNextReceiptNumber(agencyId, year, tx);
      const jeNumber      = await getNextJournalNumber(agencyId, year, tx);
      const voucherId     = crypto.randomUUID();
      const jeId          = crypto.randomUUID();
      const paymentAc     = METHOD_ACCOUNT[paymentMethod] ?? METHOD_ACCOUNT['cash']!;

      await tx.insert(receiptVouchers).values({
        id:           voucherId,
        agencyId,
        voucherNumber,
        customerName: customerNameAr,
        amountHalalas,
        method:       paymentMethod,
        description:  description ?? null,
        date:         today,
        journalEntryId: jeId,
        createdBy:    uid,
      });

      await tx.insert(journalEntries).values({
        id:                 jeId,
        agencyId,
        entryNumber:        jeNumber,
        date:               today,
        descriptionAr:      `سند قبض ${voucherNumber} — ${customerNameAr}`,
        source:             'receipt',
        sourceId:           voucherId,
        isPosted:           true,
        totalDebitHalalas:  amountHalalas,
        totalCreditHalalas: amountHalalas,
        createdBy:          uid,
      });

      await tx.insert(journalLines).values([
        { id: crypto.randomUUID(), entryId: jeId, agencyId, accountCode: paymentAc.code, accountNameAr: paymentAc.ar, accountNameEn: paymentAc.en, debitHalalas: amountHalalas, creditHalalas: 0, sortOrder: 1 },
        { id: crypto.randomUUID(), entryId: jeId, agencyId, accountCode: AC_DEPOSITS.code, accountNameAr: AC_DEPOSITS.ar, accountNameEn: AC_DEPOSITS.en, debitHalalas: 0, creditHalalas: amountHalalas, sortOrder: 2 },
      ]);

      return { id: voucherId, voucherNumber };
    });

    await logAudit({
      agencyId, userId: uid, action: 'create', resource: 'receipt_voucher',
      resourceId: result.id,
      after: { voucherNumber: result.voucherNumber, amountHalalas, paymentMethod, customerNameAr },
    });

    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    if (err instanceof ApiAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    if (err instanceof BusinessError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error(JSON.stringify({ event: 'receipt_create_failed', error: String(err) }));
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
