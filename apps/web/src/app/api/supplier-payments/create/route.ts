import { NextResponse } from 'next/server';
import { eq, and, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { supplierPayments, suppliers, journalEntries, journalLines } from '@/lib/schema';
import { verifyAuth, assertRole, ApiAuthError, BusinessError, ROLES_ACCOUNTANT_UP } from '@/lib/api-auth';
import { getNextPaymentVoucherNumber, getNextJournalNumber } from '@/lib/invoice-counter';
import { assertPeriodOpen } from '@/lib/period-lock';
import { lookupFxRate, fxToHalalas } from '@/lib/fx';
import { GL } from '@/lib/gl-accounts';
import type { Tx } from '@/lib/db';

interface SupplierPaymentBody {
  payeeName:          string;
  expenseCategory:    string;
  // SAR amount in halalas. If 0 or omitted AND foreignCurrency+foreignAmountMinor
  // are provided, the system auto-looks up the rate and computes it.
  amountHalalas:      number;
  // Reclaimable input VAT included in amountHalalas (gross). When > 0 the expense
  // debit is posted net-of-VAT and a Dr 1230 Input VAT leg is added. Default 0.
  vatHalalas?:        number;
  paymentMethod:      string;
  reference?:         string;
  notes?:             string;
  bookingId?:         string;
  bookingNumber?:     string;
  supplierId?:        string;
  // FX fields (IFRS 9)
  foreignCurrency?:   string;  // e.g. 'USD', 'AED'
  foreignAmountMinor?: number; // amount in minor units (cents, fils, etc.)
  fxOriginalHalalas?: number;  // SAR at original booking rate — if supplied, difference posts to 5900/4900
}

// Debit account chosen per expense category.
//
// `supplier`: the cost was ALREADY recognised (Dr 5000 / Cr 2000) when the
// purchase invoice was booked. Paying the supplier merely settles the payable,
// so the debit goes to 2000 Accounts Payable — NOT to 5000 (which would
// double-count the cost). All other categories are genuine direct expenses
// (no prior invoice posting) and keep debiting their expense account.
const EXPENSE_ACCOUNT: Record<string, { code: string; ar: string; en: string }> = {
  supplier:    GL.payableSupplier,
  salaries:    { code: '5100', ar: 'الرواتب والأجور',     en: 'Salaries' },
  rent:        { code: '5200', ar: 'الإيجار',             en: 'Rent' },
  marketing:   { code: '5300', ar: 'التسويق والإعلان',    en: 'Marketing' },
  operational: { code: '5400', ar: 'المصاريف التشغيلية',  en: 'Operating Expenses' },
  office:      { code: '5400', ar: 'المصاريف التشغيلية',  en: 'Operating Expenses' },
  other:       { code: '5400', ar: 'المصاريف التشغيلية',  en: 'Operating Expenses' },
};

// FX differences post to dedicated 5900 (loss) / 4900 (gain) accounts —
// NEVER to 6100 (Salary Expense).
const AC_FX_LOSS = GL.fxLoss;
const AC_FX_GAIN = GL.fxGain;

const METHOD_ACCOUNT: Record<string, { code: string; ar: string; en: string }> = {
  cash:          { code: '1100', ar: 'الصندوق النقدي', en: 'Cash' },
  bank_transfer: { code: '1110', ar: 'البنك',           en: 'Bank' },
  card:          { code: '1115', ar: 'نقاط البيع',      en: 'POS / Card' },
  online:        { code: '1115', ar: 'نقاط البيع',      en: 'POS / Card' },
  check:         { code: '1110', ar: 'البنك',           en: 'Bank' },
};

export async function POST(request: Request) {
  try {
    const { uid, agencyId, role } = await verifyAuth(request);
    assertRole(role, [...ROLES_ACCOUNTANT_UP]);

    const body = await request.json() as SupplierPaymentBody;
    const { payeeName, expenseCategory, amountHalalas, vatHalalas: vatHalalasRaw, paymentMethod, reference, notes,
            bookingId, bookingNumber, supplierId,
            foreignCurrency, foreignAmountMinor, fxOriginalHalalas } = body;
    const vatHalalas = vatHalalasRaw ?? 0;

    if (!payeeName || !expenseCategory || !paymentMethod) {
      return NextResponse.json({ error: 'بيانات مطلوبة ناقصة' }, { status: 400 });
    }

    const today0 = new Date().toISOString().split('T')[0]!;

    // ── FX auto-resolution ────────────────────────────────────────────────────
    // If amountHalalas is 0/absent but foreignCurrency + foreignAmountMinor are
    // supplied, look up the stored rate and compute the SAR amount automatically.
    let resolvedAmountHalalas = amountHalalas;
    let appliedFxRate:    number | null = null;  // decimal (e.g. 3.75), for the response
    let appliedFxRateDate: string | null = null;

    if (foreignCurrency && foreignAmountMinor && foreignAmountMinor > 0 && !amountHalalas) {
      const fxRow = await lookupFxRate(agencyId, foreignCurrency, 'SAR', today0, db);
      if (!fxRow) {
        return NextResponse.json(
          { error: `لا يوجد سعر صرف محدّث لـ ${foreignCurrency.toUpperCase()}/SAR. أضف سعر الصرف أولاً من إدارة الأسعار.` },
          { status: 422 },
        );
      }
      resolvedAmountHalalas = fxToHalalas(foreignAmountMinor, fxRow.storedRate);
      appliedFxRate     = fxRow.storedRate / 10000;
      appliedFxRateDate = fxRow.effectiveDate;
    }

    if (!Number.isInteger(resolvedAmountHalalas) || resolvedAmountHalalas <= 0) {
      return NextResponse.json({ error: 'مبلغ الدفعة غير صالح' }, { status: 400 });
    }

    if (!Number.isInteger(vatHalalas) || vatHalalas < 0 || vatHalalas >= resolvedAmountHalalas) {
      return NextResponse.json({ error: 'مبلغ الضريبة غير صالح' }, { status: 400 });
    }

    const result = await db.transaction(async (tx: Tx) => {
      await assertPeriodOpen(agencyId, today0, tx);
      const now   = new Date();
      const year  = now.getFullYear();
      const today = now.toISOString().split('T')[0]!;

      const voucherNumber = await getNextPaymentVoucherNumber(agencyId, year, tx);
      const jeNumber      = await getNextJournalNumber(agencyId, year, tx);
      const spId          = crypto.randomUUID();
      const jeId          = crypto.randomUUID();

      const expenseAc = EXPENSE_ACCOUNT[expenseCategory] ?? EXPENSE_ACCOUNT['other']!;
      const paymentAc = METHOD_ACCOUNT[paymentMethod]    ?? METHOD_ACCOUNT['cash']!;

      await tx.insert(supplierPayments).values({
        id:              spId,
        agencyId,
        bookingId:       bookingId    ?? null,
        supplierId:      supplierId   ?? null,
        payeeName,
        supplierName:    payeeName,
        amountHalalas:   resolvedAmountHalalas,
        method:          paymentMethod,
        reference:       reference    ?? null,
        voucherNumber,
        expenseCategory,
        bookingNumber:   bookingNumber ?? null,
        date:            today,
        status:          'completed',
        journalEntryId:  jeId,
        createdBy:       uid,
      });

      // Decrease supplier balance if a supplierId was provided (positive = we owe them)
      if (supplierId) {
        await tx.update(suppliers)
          .set({ balanceHalalas: sql`${suppliers.balanceHalalas} - ${resolvedAmountHalalas}`, updatedAt: now })
          .where(and(eq(suppliers.id, supplierId), eq(suppliers.agencyId, agencyId)));
      }

      // FX gain/loss (IFRS 9): if fxOriginalHalalas supplied, post difference to 6100
      const grossExpenseDebit = (fxOriginalHalalas != null && fxOriginalHalalas > 0)
        ? fxOriginalHalalas
        : resolvedAmountHalalas;
      const fxDiff = resolvedAmountHalalas - grossExpenseDebit; // >0 = loss, <0 = gain
      // When input VAT is present, the expense/payable leg is recognised net of VAT
      // and the reclaimable VAT is posted to 1230 Input VAT Receivable.
      const expenseDebit = grossExpenseDebit - vatHalalas;

      const fxNote = foreignCurrency
        ? ` (${foreignCurrency}${foreignAmountMinor != null ? ' ' + (foreignAmountMinor / 100).toFixed(2) : ''}${appliedFxRate ? ' @ ' + appliedFxRate.toFixed(4) : ''})`
        : '';

      await tx.insert(journalEntries).values({
        id:                 jeId,
        agencyId,
        entryNumber:        jeNumber,
        date:               today,
        descriptionAr:      `سند صرف ${voucherNumber} — ${payeeName}${fxNote}`,
        source:             'payment',
        sourceId:           spId,
        isPosted:           true,
        totalDebitHalalas:  resolvedAmountHalalas,
        totalCreditHalalas: resolvedAmountHalalas,
        createdBy:          uid,
      });

      type JLine = { id: string; entryId: string; agencyId: string; accountCode: string; accountNameAr: string; accountNameEn: string; debitHalalas: number; creditHalalas: number; sortOrder: number };
      let sortOrder = 1;
      const mkLine = (ac: { code: string; ar: string; en: string }, dr: number, cr: number): JLine =>
        ({ id: crypto.randomUUID(), entryId: jeId, agencyId, accountCode: ac.code, accountNameAr: ac.ar, accountNameEn: ac.en, debitHalalas: dr, creditHalalas: cr, sortOrder: sortOrder++ });

      // Build journal lines: Dr expense (net of VAT) [/ Dr 1230 input VAT] [/ FX leg] / Cr cash (gross)
      const lines: JLine[] = [ mkLine(expenseAc, expenseDebit, 0) ];

      if (vatHalalas > 0) {
        lines.push(mkLine(GL.inputVat, vatHalalas, 0));
      }

      if (fxDiff > 0) {
        // FX Loss: paid more SAR than originally booked — Dr FX Loss (5900)
        lines.push(mkLine(AC_FX_LOSS, fxDiff, 0));
        lines.push(mkLine(paymentAc, 0, resolvedAmountHalalas));
      } else if (fxDiff < 0) {
        // FX Gain: paid less SAR than originally booked — Cr FX Gain (4900)
        lines.push(mkLine(paymentAc, 0, resolvedAmountHalalas));
        lines.push(mkLine(AC_FX_GAIN, 0, -fxDiff));
      } else {
        lines.push(mkLine(paymentAc, 0, resolvedAmountHalalas));
      }

      await tx.insert(journalLines).values(lines);

      return { id: spId, voucherNumber, resolvedAmountHalalas, appliedFxRate, appliedFxRateDate };
    });

    const { resolvedAmountHalalas: computedAmount, appliedFxRate: fxRate, appliedFxRateDate: fxRateDate, ...rest } = result;
    return NextResponse.json({
      success: true,
      ...rest,
      amountHalalas: computedAmount,
      ...(fxRate !== null ? { appliedFxRate: fxRate, appliedFxRateDate: fxRateDate } : {}),
    });
  } catch (err) {
    if (err instanceof ApiAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    if (err instanceof BusinessError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error(JSON.stringify({ event: 'supplier_payment_create_failed', error: String(err) }));
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
