/**
 * POST /api/accounting/pay-liability
 *
 * Unified endpoint for settling an accounting liability (GOSI, EOSB, or VAT)
 * against bank or cash. Posts a single balanced journal entry:
 *
 *   gosi:  Dr 2400 GOSI Payable     / Cr 1110 Bank or 1100 Cash
 *   eosb:  Dr 2500 EOSB Provision   / Cr 1110 Bank or 1100 Cash
 *   vat:   Dr 2200 VAT Payable      / Cr 1110 Bank or 1100 Cash
 */
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { journalEntries, journalLines } from '@/lib/schema';
import { verifyAuth, assertRole, ApiAuthError, BusinessError, ROLES_ACCOUNTANT_UP } from '@/lib/api-auth';
import { getNextJournalNumber } from '@/lib/invoice-counter';
import { assertPeriodOpen } from '@/lib/period-lock';
import { logAudit } from '@/lib/audit';
import { GL } from '@/lib/gl-accounts';

interface PayLiabilityBody {
  liabilityType: 'gosi' | 'eosb' | 'vat';
  amountHalalas: number;          // amount settled
  paymentMethod: 'bank' | 'cash'; // payment method
  bankAccountId?: string;         // when bank
  date: string;                   // YYYY-MM-DD
  reference?: string;             // transfer / receipt number
  notes?: string;
}

const LIABILITY_ACCOUNT: Record<PayLiabilityBody['liabilityType'], { code: string; ar: string; en: string }> = {
  gosi: GL.gosiPayable,    // 2400
  eosb: GL.eosbProvision,  // 2500
  vat:  GL.vatPayable,     // 2200
};

const LIABILITY_LABEL: Record<PayLiabilityBody['liabilityType'], string> = {
  gosi: 'GOSI',
  eosb: 'مكافأة نهاية الخدمة',
  vat:  'ضريبة القيمة المضافة',
};

export async function POST(request: Request) {
  try {
    const { uid, agencyId, role } = await verifyAuth(request);
    assertRole(role, [...ROLES_ACCOUNTANT_UP]);

    const body = await request.json() as PayLiabilityBody;
    const { liabilityType, amountHalalas, paymentMethod, date } = body;

    if (!liabilityType || !['gosi', 'eosb', 'vat'].includes(liabilityType)) {
      return NextResponse.json({ error: 'نوع الالتزام يجب أن يكون gosi أو eosb أو vat' }, { status: 400 });
    }
    if (!Number.isInteger(amountHalalas) || amountHalalas <= 0) {
      return NextResponse.json({ error: 'المبلغ غير صالح' }, { status: 400 });
    }
    if (paymentMethod !== 'bank' && paymentMethod !== 'cash') {
      return NextResponse.json({ error: 'طريقة الدفع يجب أن تكون bank أو cash' }, { status: 400 });
    }
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: 'التاريخ يجب أن يكون بصيغة YYYY-MM-DD' }, { status: 400 });
    }

    const liabilityAc = LIABILITY_ACCOUNT[liabilityType];
    const cashAc      = paymentMethod === 'bank' ? GL.bank : GL.cash;

    const result = await db.transaction(async (tx) => {
      await assertPeriodOpen(agencyId, date, tx);

      const year        = Number(date.slice(0, 4));
      const jeNumber    = await getNextJournalNumber(agencyId, year, tx);
      const jeId        = crypto.randomUUID();
      const label       = LIABILITY_LABEL[liabilityType];

      await tx.insert(journalEntries).values({
        id:                 jeId,
        agencyId,
        entryNumber:        jeNumber,
        date,
        descriptionAr:      `سداد ${label}${body.reference ? ` — ${body.reference}` : ''}`,
        descriptionEn:      `Settle ${liabilityType.toUpperCase()} liability${body.reference ? ` — ${body.reference}` : ''}`,
        reference:          body.reference ?? null,
        source:             'manual',
        sourceId:           jeId,
        isPosted:           true,
        totalDebitHalalas:  amountHalalas,
        totalCreditHalalas: amountHalalas,
        createdBy:          uid,
      });

      // Dr liability (settle obligation) / Cr bank or cash (outflow)
      await tx.insert(journalLines).values([
        { id: crypto.randomUUID(), entryId: jeId, agencyId, accountCode: liabilityAc.code, accountNameAr: liabilityAc.ar, accountNameEn: liabilityAc.en, debitHalalas: amountHalalas, creditHalalas: 0,             sortOrder: 1, description: body.notes ?? null },
        { id: crypto.randomUUID(), entryId: jeId, agencyId, accountCode: cashAc.code,      accountNameAr: cashAc.ar,      accountNameEn: cashAc.en,      debitHalalas: 0,             creditHalalas: amountHalalas, sortOrder: 2, description: body.notes ?? null },
      ]);

      return { journalEntryId: jeId, entryNumber: jeNumber };
    });

    await logAudit({
      agencyId, userId: uid,
      action: 'create',
      resource: 'liability_payment',
      resourceId: result.journalEntryId,
      after: { liabilityType, amountHalalas, paymentMethod, bankAccountId: body.bankAccountId ?? null, date },
    });

    return NextResponse.json({ success: true, journalEntryId: result.journalEntryId, entryNumber: result.entryNumber });
  } catch (err) {
    if (err instanceof ApiAuthError)  return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof BusinessError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(JSON.stringify({ event: 'pay_liability_failed', error: String(err) }));
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
