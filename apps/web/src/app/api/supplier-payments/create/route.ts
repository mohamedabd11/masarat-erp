import { NextResponse } from 'next/server';
import { eq, and, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { supplierPayments, suppliers, journalEntries, journalLines } from '@/lib/schema';
import { verifyAuth, assertRole, ApiAuthError, BusinessError, ROLES_ACCOUNTANT_UP } from '@/lib/api-auth';
import { requireFeature } from '@/lib/feature-access';
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
  paymentMethod:      string;
  reference?:         string;
  notes?:             string;
  bookingId?:         string;
  bookingNumber?:     string;
  supplierId?:        string;
  // Input VAT on this supplier invoice (IAS 12 / ZATCA).
  // Only for direct-expense categories (rent, marketing, operational, etc.).
  // For 'supplier' AP payments the VAT was already posted at invoice creation time.
  vatHalalas?:        number;
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
    await requireFeature(agencyId, 'supplier_payments', db);

    const body = await request.json() as SupplierPaymentBody;
    const { payeeName, expenseCategory, amountHalalas, paymentMethod, reference, notes,
            bookingId, bookingNumber, supplierId,
            vatHalalas: rawVatHalalas,
            foreignCurrency, foreignAmountMinor, fxOriginalHalalas } = body;
    const vatHalalas = rawVatHalalas ?? 0;

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
      if (vatHalalas !== 0) {
        return NextResponse.json({ error: 'مبلغ الضريبة غير صالح' }, { status: 400 });
      }
    }

    await assertPeriodOpen(agencyId, today0, db);

    const result = await db.transaction(async (tx: Tx) => {
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

      // AP-01: Decrease supplier AP balance if supplierId provided.
      // Atomic CAS: only update if the supplier's balance covers the payment amount
      // (prevents paying more than owed and driving AP negative).
      if (supplierId && expenseCategory === 'supplier') {
        const [updatedSupplier] = await tx.update(suppliers)
          .set({ balanceHalalas: sql`${suppliers.balanceHalalas} - ${resolvedAmountHalalas}`, updatedAt: now })
          .where(and(
            eq(suppliers.id, supplierId),
            eq(suppliers.agencyId, agencyId),
            sql`${suppliers.balanceHalalas} >= ${resolvedAmountHalalas}`,
          ))
          .returning({ id: suppliers.id });
        if (!updatedSupplier) {
          throw new BusinessError('رصيد المورد غير كافٍ لتغطية هذه الدفعة — تحقق من ذمم المورد أولاً', 400);
        }
      } else if (supplierId) {
        await tx.update(suppliers)
          .set({ balanceHalalas: sql`${suppliers.balanceHalalas} - ${resolvedAmountHalalas}`, updatedAt: now })
          .where(and(eq(suppliers.id, supplierId), eq(suppliers.agencyId, agencyId)));
      }

      // FX gain/loss (IFRS 9): if fxOriginalHalalas supplied, post difference to 6100
      const expenseDebit = (fxOriginalHalalas != null && fxOriginalHalalas > 0)
        ? fxOriginalHalalas
        : resolvedAmountHalalas;
      const fxDiff = resolvedAmountHalalas - expenseDebit; // >0 = loss, <0 = gain

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

      // When vatHalalas > 0, split the expense debit: net expense + input VAT (1230).
      // The 'supplier' AP category doesn't carry separate VAT here — it was already
      // posted at purchase-invoice time, so vatHalalas is expected 0 for that category.
      const netExpenseDebit = expenseDebit - vatHalalas;

      // Build journal lines with optional VAT and FX legs
      const lines: JLine[] = [
        { id: crypto.randomUUID(), entryId: jeId, agencyId, accountCode: expenseAc.code, accountNameAr: expenseAc.ar, accountNameEn: expenseAc.en, debitHalalas: netExpenseDebit, creditHalalas: 0, sortOrder: 1 },
      ];

      // Input VAT line — Dr 1230 Input VAT Receivable
      if (vatHalalas > 0) {
        lines.push({ id: crypto.randomUUID(), entryId: jeId, agencyId, accountCode: GL.inputVat.code, accountNameAr: GL.inputVat.ar, accountNameEn: GL.inputVat.en, debitHalalas: vatHalalas, creditHalalas: 0, sortOrder: 2 });
      }

      const nextSort = vatHalalas > 0 ? 3 : 2;

      if (fxDiff > 0) {
        // FX Loss: paid more SAR than originally booked — Dr FX Loss (5900)
        lines.push({ id: crypto.randomUUID(), entryId: jeId, agencyId, accountCode: AC_FX_LOSS.code, accountNameAr: AC_FX_LOSS.ar, accountNameEn: AC_FX_LOSS.en, debitHalalas: fxDiff, creditHalalas: 0, sortOrder: nextSort });
        lines.push({ id: crypto.randomUUID(), entryId: jeId, agencyId, accountCode: paymentAc.code, accountNameAr: paymentAc.ar, accountNameEn: paymentAc.en, debitHalalas: 0, creditHalalas: resolvedAmountHalalas, sortOrder: nextSort + 1 });
      } else if (fxDiff < 0) {
        // FX Gain: paid less SAR than originally booked — Cr FX Gain (4900)
        lines.push({ id: crypto.randomUUID(), entryId: jeId, agencyId, accountCode: paymentAc.code, accountNameAr: paymentAc.ar, accountNameEn: paymentAc.en, debitHalalas: 0, creditHalalas: resolvedAmountHalalas, sortOrder: nextSort });
        lines.push({ id: crypto.randomUUID(), entryId: jeId, agencyId, accountCode: AC_FX_GAIN.code, accountNameAr: AC_FX_GAIN.ar, accountNameEn: AC_FX_GAIN.en, debitHalalas: 0, creditHalalas: -fxDiff, sortOrder: nextSort + 1 });
      } else {
        lines.push({ id: crypto.randomUUID(), entryId: jeId, agencyId, accountCode: paymentAc.code, accountNameAr: paymentAc.ar, accountNameEn: paymentAc.en, debitHalalas: 0, creditHalalas: resolvedAmountHalalas, sortOrder: nextSort });
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
