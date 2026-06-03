/**
 * Unit tests — FX gain/loss journal entries (NO real DB).
 *
 * The runtime FX gain/loss logic lives in
 *   src/app/api/supplier-payments/create/route.ts
 * inside a DB transaction. It posts the realised exchange difference (IFRS 9)
 * to dedicated accounts:
 *   - 4900 GL.fxGain  — when the SAR actually paid is LESS than the original
 *                       booked SAR (favourable to the agency)
 *   - 5900 GL.fxLoss  — when the SAR actually paid is MORE than the original
 *                       booked SAR (unfavourable)
 *
 * This suite extracts that journal-building logic into a pure helper that
 * mirrors the route exactly (same comparison, same account selection, same
 * sign handling), and verifies the FX line behaviour and the DR=CR invariant
 * against MOCKED inputs only. `fxToHalalas` (from lib/fx) is the same converter
 * the route uses to turn a foreign-currency amount + stored rate into halalas.
 */
import { describe, it, expect } from 'vitest';
import { fxToHalalas } from '@/lib/fx';
import { GL } from '@/lib/gl-accounts';

// ─── Pure replica of the supplier-payment FX journal builder ──────────────────
// Mirrors src/app/api/supplier-payments/create/route.ts lines 143-201 exactly.
//
//   expenseDebit = fxOriginalHalalas (if supplied) else resolvedAmountHalalas
//   fxDiff       = resolvedAmountHalalas - expenseDebit   (>0 loss, <0 gain)
//   fxDiff > 0 → Dr 5900 FX Loss  fxDiff
//   fxDiff < 0 → Cr 4900 FX Gain  -fxDiff
//   fxDiff = 0 → no FX line
// Cash/bank leg is always credited the full resolved (settled) amount.

interface JLine {
  accountCode: string;
  accountNameAr: string;
  accountNameEn: string;
  debitHalalas: number;
  creditHalalas: number;
}

const expenseAc = { code: GL.payableSupplier.code, ar: GL.payableSupplier.ar, en: GL.payableSupplier.en };
const paymentAc = { code: GL.bank.code, ar: GL.bank.ar, en: GL.bank.en };

function buildFxPaymentLines(opts: {
  resolvedAmountHalalas: number;          // SAR actually paid (at settlement rate)
  fxOriginalHalalas?: number;             // SAR originally booked (at booking rate)
}): JLine[] {
  const { resolvedAmountHalalas } = opts;
  const expenseDebit = (opts.fxOriginalHalalas != null && opts.fxOriginalHalalas > 0)
    ? opts.fxOriginalHalalas
    : resolvedAmountHalalas;
  const fxDiff = resolvedAmountHalalas - expenseDebit;

  const lines: JLine[] = [
    { accountCode: expenseAc.code, accountNameAr: expenseAc.ar, accountNameEn: expenseAc.en, debitHalalas: expenseDebit, creditHalalas: 0 },
  ];

  if (fxDiff > 0) {
    // FX Loss — paid MORE SAR than originally booked
    lines.push({ accountCode: GL.fxLoss.code, accountNameAr: GL.fxLoss.ar, accountNameEn: GL.fxLoss.en, debitHalalas: fxDiff, creditHalalas: 0 });
    lines.push({ accountCode: paymentAc.code, accountNameAr: paymentAc.ar, accountNameEn: paymentAc.en, debitHalalas: 0, creditHalalas: resolvedAmountHalalas });
  } else if (fxDiff < 0) {
    // FX Gain — paid LESS SAR than originally booked
    lines.push({ accountCode: paymentAc.code, accountNameAr: paymentAc.ar, accountNameEn: paymentAc.en, debitHalalas: 0, creditHalalas: resolvedAmountHalalas });
    lines.push({ accountCode: GL.fxGain.code, accountNameAr: GL.fxGain.ar, accountNameEn: GL.fxGain.en, debitHalalas: 0, creditHalalas: -fxDiff });
  } else {
    lines.push({ accountCode: paymentAc.code, accountNameAr: paymentAc.ar, accountNameEn: paymentAc.en, debitHalalas: 0, creditHalalas: resolvedAmountHalalas });
  }
  return lines;
}

function totalDr(lines: JLine[]) { return lines.reduce((s, l) => s + l.debitHalalas, 0); }
function totalCr(lines: JLine[]) { return lines.reduce((s, l) => s + l.creditHalalas, 0); }

// Stored rates: rate × 10000. 3.75 → 37500, 3.80 → 38000, 3.70 → 37000.
const RATE_375 = 37500;
const RATE_380 = 38000;
const RATE_370 = 37000;

describe('FX accounting — تحويل الفاتورة بالدولار', () => {

  it('فاتورة 1000 دولار بسعر 3.75 → الإجمالي بالهللات صحيح (375000)', () => {
    // 1000 USD = 100000 cents. 100000 × 37500 / 10000 = 375000 halalas = 3750 SAR
    const totalHalalas = fxToHalalas(100000, RATE_375);
    expect(totalHalalas).toBe(375000);
  });

  it('نفس المبلغ بسعر 3.80 أكبر من سعر 3.75', () => {
    expect(fxToHalalas(100000, RATE_380)).toBe(380000);
    expect(fxToHalalas(100000, RATE_380)).toBeGreaterThan(fxToHalalas(100000, RATE_375));
  });
});

describe('FX gain/loss — قيد فرق سعر الصرف (IFRS 9)', () => {

  it('دفعة بسعر 3.80 مقابل أصل 3.75 → خسارة صرف (سطر 5900 FX Loss)', () => {
    // Booked at 3.75 (375000), settled at 3.80 (380000). Paid MORE → loss = 5000.
    const original = fxToHalalas(100000, RATE_375); // 375000
    const settled  = fxToHalalas(100000, RATE_380); // 380000
    const lines = buildFxPaymentLines({ resolvedAmountHalalas: settled, fxOriginalHalalas: original });

    const fxLine = lines.find(l => l.accountCode === GL.fxLoss.code);
    expect(fxLine).toBeDefined();
    expect(fxLine!.debitHalalas).toBe(settled - original);       // 5000
    expect(fxLine!.debitHalalas).toBe(5000);
    // No FX gain line present
    expect(lines.find(l => l.accountCode === GL.fxGain.code)).toBeUndefined();
  });

  it('خسارة الصرف تساوي (3.80 − 3.75) × المبلغ', () => {
    const amountCents = 100000;
    const original = fxToHalalas(amountCents, RATE_375);
    const settled  = fxToHalalas(amountCents, RATE_380);
    const lines = buildFxPaymentLines({ resolvedAmountHalalas: settled, fxOriginalHalalas: original });
    // (38000 - 37500) × 100000 / 10000 = 5000 halalas
    const expectedDiff = fxToHalalas(amountCents, RATE_380 - RATE_375);
    expect(lines.find(l => l.accountCode === GL.fxLoss.code)!.debitHalalas).toBe(expectedDiff);
  });

  it('دفعة بسعر 3.70 مقابل أصل 3.75 → ربح صرف (سطر 4900 FX Gain)', () => {
    // Booked at 3.75 (375000), settled at 3.70 (370000). Paid LESS → gain = 5000.
    const original = fxToHalalas(100000, RATE_375); // 375000
    const settled  = fxToHalalas(100000, RATE_370); // 370000
    const lines = buildFxPaymentLines({ resolvedAmountHalalas: settled, fxOriginalHalalas: original });

    const fxLine = lines.find(l => l.accountCode === GL.fxGain.code);
    expect(fxLine).toBeDefined();
    expect(fxLine!.creditHalalas).toBe(original - settled);      // 5000
    expect(fxLine!.creditHalalas).toBe(5000);
    expect(lines.find(l => l.accountCode === GL.fxLoss.code)).toBeUndefined();
  });

  it('FX Gain يستخدم الحساب 4900 و FX Loss يستخدم 5900', () => {
    expect(GL.fxGain.code).toBe('4900');
    expect(GL.fxLoss.code).toBe('5900');
  });

  it('دفعة بنفس العملة/السعر (لا أصل مختلف) → لا يوجد سطر فرق صرف', () => {
    // Same-currency payment: no fxOriginalHalalas → expenseDebit = settled, fxDiff = 0
    const settled = fxToHalalas(100000, RATE_375);
    const lines = buildFxPaymentLines({ resolvedAmountHalalas: settled });
    expect(lines.find(l => l.accountCode === GL.fxGain.code)).toBeUndefined();
    expect(lines.find(l => l.accountCode === GL.fxLoss.code)).toBeUndefined();
    expect(lines).toHaveLength(2); // expense + payment only
  });

  it('فرق صرف صفري (نفس السعر للأصل والتسوية) → لا يوجد سطر فرق صرف', () => {
    const same = fxToHalalas(100000, RATE_375);
    const lines = buildFxPaymentLines({ resolvedAmountHalalas: same, fxOriginalHalalas: same });
    expect(lines.find(l => l.accountCode === GL.fxGain.code)).toBeUndefined();
    expect(lines.find(l => l.accountCode === GL.fxLoss.code)).toBeUndefined();
    expect(lines).toHaveLength(2);
  });
});

describe('FX journal — ثبات التوازن DR = CR مع سطر فرق الصرف', () => {

  it('قيد خسارة الصرف متوازن (المدين = الدائن متضمناً سطر FX)', () => {
    const lines = buildFxPaymentLines({
      resolvedAmountHalalas: fxToHalalas(100000, RATE_380),
      fxOriginalHalalas:     fxToHalalas(100000, RATE_375),
    });
    expect(totalDr(lines)).toBe(totalCr(lines));
  });

  it('قيد ربح الصرف متوازن (المدين = الدائن متضمناً سطر FX)', () => {
    const lines = buildFxPaymentLines({
      resolvedAmountHalalas: fxToHalalas(100000, RATE_370),
      fxOriginalHalalas:     fxToHalalas(100000, RATE_375),
    });
    expect(totalDr(lines)).toBe(totalCr(lines));
  });

  it('قيد بدون فرق صرف متوازن', () => {
    const lines = buildFxPaymentLines({ resolvedAmountHalalas: fxToHalalas(100000, RATE_375) });
    expect(totalDr(lines)).toBe(totalCr(lines));
  });

  it('لا توجد قيم هللات سالبة في أي سطر (ربح أو خسارة)', () => {
    const loss = buildFxPaymentLines({ resolvedAmountHalalas: fxToHalalas(100000, RATE_380), fxOriginalHalalas: fxToHalalas(100000, RATE_375) });
    const gain = buildFxPaymentLines({ resolvedAmountHalalas: fxToHalalas(100000, RATE_370), fxOriginalHalalas: fxToHalalas(100000, RATE_375) });
    for (const lines of [loss, gain]) {
      for (const l of lines) {
        expect(l.debitHalalas).toBeGreaterThanOrEqual(0);
        expect(l.creditHalalas).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('كل سطر له اسم حساب عربي غير فارغ', () => {
    const lines = buildFxPaymentLines({ resolvedAmountHalalas: fxToHalalas(100000, RATE_380), fxOriginalHalalas: fxToHalalas(100000, RATE_375) });
    for (const l of lines) {
      expect(l.accountNameAr).toBeTruthy();
      expect(l.accountNameAr.length).toBeGreaterThan(0);
    }
  });
});
