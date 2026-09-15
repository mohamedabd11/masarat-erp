import { NextResponse } from 'next/server';
import { eq, and, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { agencies, bookings, supplierPayments, suppliers, journalEntries, journalLines } from '@/lib/schema';
import { verifyAuth, assertRole, ApiAuthError, BusinessError, ROLES_ACCOUNTANT_UP } from '@/lib/api-auth';
import { getNextPaymentVoucherNumber, getNextJournalNumber } from '@/lib/invoice-counter';
import { assertPeriodOpen } from '@/lib/period-lock';
import { withIdempotency, markIdempotencyComplete } from '@/lib/idempotency';
import { logAudit } from '@/lib/audit';
import { lookupFxRate, fxToHalalas } from '@/lib/fx';
import { SUPPLIER_PAYMENT_EXPENSE_ACCOUNT, PAYMENT_METHOD_ACCOUNT } from '@/lib/gl-accounts';
import { buildSupplierPaymentJournalLines, apClearedHalalas } from '@/lib/supplier-payment-journal';
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
  idempotencyKey?:    string;
  // FX fields (IFRS 9)
  foreignCurrency?:   string;  // e.g. 'USD', 'AED'
  foreignAmountMinor?: number; // amount in minor units (cents, fils, etc.)
  fxOriginalHalalas?: number;  // SAR at original booking rate — if supplied, difference posts to 5900/4900
  vatAmountHalalas?: number;  // optional: VAT portion of the payment (for Input VAT claim)
}

const VALID_EXPENSE_CATEGORIES = new Set(Object.keys(SUPPLIER_PAYMENT_EXPENSE_ACCOUNT));
const VALID_PAYMENT_METHODS = new Set(Object.keys(PAYMENT_METHOD_ACCOUNT));

// Debit (expense) and credit (payment-method) account maps are centralized in
// gl-accounts.ts (L7) so create + reverse share one source of truth. See
// SUPPLIER_PAYMENT_EXPENSE_ACCOUNT for the per-category posting rationale.
// The balanced GL lines (Input-VAT split / FX gain·loss·none) are built by
// buildSupplierPaymentJournalLines (lib/supplier-payment-journal).

export async function POST(request: Request) {
  try {
    const { uid, agencyId, role } = await verifyAuth(request);
    assertRole(role, [...ROLES_ACCOUNTANT_UP]);

    const body = await request.json() as SupplierPaymentBody;
    const { payeeName, expenseCategory, amountHalalas, paymentMethod, reference, notes,
            bookingId, bookingNumber, supplierId,
            foreignCurrency, foreignAmountMinor, fxOriginalHalalas } = body;
    const vatAmount = body.vatAmountHalalas ?? 0;

    if (!payeeName || !expenseCategory || !paymentMethod) {
      return NextResponse.json({ error: 'بيانات مطلوبة ناقصة' }, { status: 400 });
    }
    if (!VALID_EXPENSE_CATEGORIES.has(expenseCategory)) {
      return NextResponse.json({ error: 'تصنيف المصروف غير صالح' }, { status: 400 });
    }
    if (!VALID_PAYMENT_METHODS.has(paymentMethod)) {
      return NextResponse.json({ error: 'طريقة الدفع غير صالحة' }, { status: 400 });
    }
    if (!Number.isInteger(vatAmount) || vatAmount < 0) {
      return NextResponse.json({ error: 'مبلغ ضريبة المدخلات غير صالح' }, { status: 400 });
    }
    if (fxOriginalHalalas !== undefined &&
        (!Number.isSafeInteger(fxOriginalHalalas) || fxOriginalHalalas <= 0)) {
      return NextResponse.json({ error: 'القيمة الأصلية للعملة غير صالحة' }, { status: 400 });
    }

    const normalizedForeignCurrency = foreignCurrency?.trim().toUpperCase() ?? null;
    if (normalizedForeignCurrency && !/^[A-Z]{3}$/.test(normalizedForeignCurrency)) {
      return NextResponse.json({ error: 'رمز العملة الأجنبية غير صالح' }, { status: 400 });
    }
    if (foreignAmountMinor !== undefined &&
        (!Number.isSafeInteger(foreignAmountMinor) || foreignAmountMinor <= 0)) {
      return NextResponse.json({ error: 'مبلغ العملة الأجنبية غير صالح' }, { status: 400 });
    }
    if ((normalizedForeignCurrency == null) !== (foreignAmountMinor == null)) {
      return NextResponse.json({ error: 'يجب إدخال العملة الأجنبية ومبلغها معاً' }, { status: 400 });
    }
    if (fxOriginalHalalas !== undefined && normalizedForeignCurrency == null) {
      return NextResponse.json({ error: 'القيمة الأصلية تتطلب بيانات العملة الأجنبية' }, { status: 400 });
    }
    if (vatAmount > 0 && normalizedForeignCurrency != null) {
      return NextResponse.json({ error: 'لا يمكن الجمع بين ضريبة المدخلات وتسوية عملة أجنبية في سند واحد' }, { status: 400 });
    }

    const today0 = new Date().toISOString().split('T')[0]!;

    // ── FX auto-resolution ────────────────────────────────────────────────────
    // If amountHalalas is 0/absent but foreignCurrency + foreignAmountMinor are
    // supplied, look up the stored rate and compute the SAR amount automatically.
    let resolvedAmountHalalas = amountHalalas;
    let appliedFxRate:    number | null = null;  // decimal (e.g. 3.75), for the response
    let appliedFxRateDate: string | null = null;

    if (normalizedForeignCurrency && foreignAmountMinor && !amountHalalas) {
      const fxRow = await lookupFxRate(agencyId, normalizedForeignCurrency, 'SAR', today0, db);
      if (!fxRow) {
        return NextResponse.json(
          { error: `لا يوجد سعر صرف محدّث لـ ${normalizedForeignCurrency}/SAR. أضف سعر الصرف أولاً من إدارة الأسعار.` },
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
    if (vatAmount >= resolvedAmountHalalas) {
      return NextResponse.json({ error: 'مبلغ ضريبة المدخلات يجب أن يكون أقل من إجمالي الدفعة' }, { status: 400 });
    }

    // Idempotency: a retry/double-click with the same key replays the first
    // result instead of disbursing cash twice. The completion marker is written
    // INSIDE the transaction (below) so commit and idempotency-finalize are atomic.
    const idempKey = body.idempotencyKey ?? crypto.randomUUID();
    const result = await withIdempotency(idempKey, agencyId, 'supplierPayment', () => db.transaction(async (tx: Tx) => {
      await assertPeriodOpen(agencyId, today0, tx);

      const [agency] = await tx.select({ isVatRegistered: agencies.isVatRegistered })
        .from(agencies)
        .where(eq(agencies.id, agencyId));
      if (!agency) throw new BusinessError('الوكالة غير موجودة', 404);
      if (vatAmount > 0 && !agency.isVatRegistered) {
        throw new BusinessError('لا يمكن المطالبة بضريبة مدخلات لمنشأة غير مسجلة ضريبياً', 422);
      }

      if (supplierId) {
        const [supplier] = await tx.select({ id: suppliers.id }).from(suppliers).where(and(
          eq(suppliers.id, supplierId), eq(suppliers.agencyId, agencyId),
        ));
        if (!supplier) throw new BusinessError('المورد غير موجود في هذه الوكالة', 404);
      }

      let trustedBookingNumber = bookingNumber ?? null;
      if (bookingId) {
        const [booking] = await tx.select({ id: bookings.id, bookingNumber: bookings.bookingNumber })
          .from(bookings)
          .where(and(eq(bookings.id, bookingId), eq(bookings.agencyId, agencyId)));
        if (!booking) throw new BusinessError('الحجز غير موجود في هذه الوكالة', 404);
        trustedBookingNumber = booking.bookingNumber;
      }

      const now   = new Date();
      const year  = now.getFullYear();
      const today = now.toISOString().split('T')[0]!;

      const voucherNumber = await getNextPaymentVoucherNumber(agencyId, year, tx);
      const jeNumber      = await getNextJournalNumber(agencyId, year, tx);
      const spId          = crypto.randomUUID();
      const jeId          = crypto.randomUUID();

      const expenseAc = SUPPLIER_PAYMENT_EXPENSE_ACCOUNT[expenseCategory] ?? SUPPLIER_PAYMENT_EXPENSE_ACCOUNT['other']!;
      const paymentAc = PAYMENT_METHOD_ACCOUNT[paymentMethod]             ?? PAYMENT_METHOD_ACCOUNT['cash']!;

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
        bookingNumber:   trustedBookingNumber,
        date:            today,
        status:          'completed',
        journalEntryId:  jeId,
        createdBy:       uid,
      });

      // Supplier subledger is updated AFTER the journal is built, by the exact
      // amount posted to AP 2000 — see below (keeps subledger ≡ GL control).

      // FX gain/loss (IAS 21): a foreign-currency payable is a monetary item.
      // The expense/payable is debited at the ORIGINAL booked SAR; the settlement
      // exchange difference is recognised in P&L (5900 loss / 4900 gain) and does
      // NOT change the obligation — so it must stay OUT of the supplier subledger.
      const expenseDebit = (fxOriginalHalalas != null && fxOriginalHalalas > 0)
        ? fxOriginalHalalas
        : resolvedAmountHalalas;

      const fxNote = normalizedForeignCurrency
        ? ` (${normalizedForeignCurrency}${foreignAmountMinor != null ? ' ' + (foreignAmountMinor / 100).toFixed(2) : ''}${appliedFxRate ? ' @ ' + appliedFxRate.toFixed(4) : ''})`
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

      // Balanced GL lines (Input-VAT split / FX gain·loss·none) — see
      // buildSupplierPaymentJournalLines.
      const built = buildSupplierPaymentJournalLines({
        expenseAccount:       expenseAc,
        paymentAccount:       paymentAc,
        resolvedAmountHalalas,
        vatAmountHalalas:     vatAmount,
        expenseDebitHalalas:  expenseDebit,
      });
      const jLines = built.map((l, i) => ({
        id: crypto.randomUUID(), entryId: jeId, agencyId,
        accountCode: l.code, accountNameAr: l.ar, accountNameEn: l.en,
        debitHalalas: l.dr, creditHalalas: l.cr, sortOrder: i + 1,
      }));

      await tx.insert(journalLines).values(jLines);

      // Decrease the supplier subledger by EXACTLY what was posted to AP 2000 —
      // the booked SAR that clears the payable, never the FX-adjusted cash
      // (IAS 21) nor the recoverable input-VAT portion. Keeps
      // suppliers.balanceHalalas reconciled with GL control account 2000.
      if (supplierId) {
        const apCleared = apClearedHalalas(built);
        if (apCleared > 0) {
          await tx.update(suppliers)
            .set({ balanceHalalas: sql`${suppliers.balanceHalalas} - ${apCleared}`, updatedAt: now })
            .where(and(eq(suppliers.id, supplierId), eq(suppliers.agencyId, agencyId)));
        }
      }

      await markIdempotencyComplete(tx, agencyId, 'supplierPayment', idempKey, { id: spId, voucherNumber });

      return { id: spId, voucherNumber, resolvedAmountHalalas, appliedFxRate, appliedFxRateDate };
    }));

    // Audit trail (HIGH-6): supplier disbursements were previously untraceable.
    await logAudit({
      agencyId, userId: uid, action: 'create', resource: 'supplier_payment',
      resourceId: result.id,
      after: { voucherNumber: result.voucherNumber, amountHalalas: result.resolvedAmountHalalas, payeeName, expenseCategory, paymentMethod },
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
