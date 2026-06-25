/**
 * Unit tests — buildSupplierPaymentJournalLines (lib/supplier-payment-journal).
 *
 * The real disbursement GL builder used by api/supplier-payments/create. Verifies
 * every branch (Input-VAT split, FX loss, FX gain, plain) posts to the right
 * accounts and stays balanced (Σdr === Σcr).
 */
import { describe, it, expect } from 'vitest';
import { buildSupplierPaymentJournalLines, apClearedHalalas, type SupplierPaymentLine } from '@/lib/supplier-payment-journal';
import { GL, SUPPLIER_PAYMENT_EXPENSE_ACCOUNT, PAYMENT_METHOD_ACCOUNT } from '@/lib/gl-accounts';

const sum  = (ls: SupplierPaymentLine[], k: 'dr' | 'cr') => ls.reduce((s, l) => s + l[k], 0);
const drOf = (ls: SupplierPaymentLine[], code: string) => ls.filter(l => l.code === code).reduce((s, l) => s + l.dr, 0);
const crOf = (ls: SupplierPaymentLine[], code: string) => ls.filter(l => l.code === code).reduce((s, l) => s + l.cr, 0);
const balanced = (ls: SupplierPaymentLine[]) => sum(ls, 'dr') === sum(ls, 'cr');

const supplierAc = SUPPLIER_PAYMENT_EXPENSE_ACCOUNT['supplier']!; // AP 2000
const rentAc     = SUPPLIER_PAYMENT_EXPENSE_ACCOUNT['rent']!;     // 5200
const bankAc     = PAYMENT_METHOD_ACCOUNT['bank_transfer']!;      // 1110

describe('buildSupplierPaymentJournalLines — plain (no VAT, no FX)', () => {
  const lines = buildSupplierPaymentJournalLines({
    expenseAccount: supplierAc, paymentAccount: bankAc,
    resolvedAmountHalalas: 5_000_00, vatAmountHalalas: 0, expenseDebitHalalas: 5_000_00,
  });
  it('Dr AP 5000 / Cr Bank 5000, balanced', () => {
    expect(drOf(lines, '2000')).toBe(5_000_00);
    expect(crOf(lines, '1110')).toBe(5_000_00);
    expect(lines).toHaveLength(2);
    expect(balanced(lines)).toBe(true);
  });
});

describe('buildSupplierPaymentJournalLines — Input-VAT split (overhead)', () => {
  // Pay 1150 for rent incl. 150 VAT → reclaimable input VAT split out.
  const lines = buildSupplierPaymentJournalLines({
    expenseAccount: rentAc, paymentAccount: bankAc,
    resolvedAmountHalalas: 1_150_00, vatAmountHalalas: 150_00, expenseDebitHalalas: 1_150_00,
  });
  it('Dr rent net 1000 / Dr Input VAT 150 / Cr Bank 1150, balanced', () => {
    expect(drOf(lines, '5200')).toBe(1_000_00);
    expect(drOf(lines, GL.inputVat.code)).toBe(150_00);
    expect(crOf(lines, '1110')).toBe(1_150_00);
    expect(balanced(lines)).toBe(true);
  });
});

describe('buildSupplierPaymentJournalLines — FX loss (paid more SAR than booked)', () => {
  // Booked AP at 1000, actually paid 1050 (rate moved against us) → 50 loss.
  const lines = buildSupplierPaymentJournalLines({
    expenseAccount: supplierAc, paymentAccount: bankAc,
    resolvedAmountHalalas: 1_050_00, vatAmountHalalas: 0, expenseDebitHalalas: 1_000_00,
  });
  it('Dr AP 1000 / Dr FX Loss 50 / Cr Bank 1050, balanced', () => {
    expect(drOf(lines, '2000')).toBe(1_000_00);
    expect(drOf(lines, GL.fxLoss.code)).toBe(50_00);
    expect(crOf(lines, '1110')).toBe(1_050_00);
    expect(balanced(lines)).toBe(true);
  });
});

describe('buildSupplierPaymentJournalLines — FX gain (paid less SAR than booked)', () => {
  // Booked AP at 1000, actually paid 970 → 30 gain.
  const lines = buildSupplierPaymentJournalLines({
    expenseAccount: supplierAc, paymentAccount: bankAc,
    resolvedAmountHalalas: 970_00, vatAmountHalalas: 0, expenseDebitHalalas: 1_000_00,
  });
  it('Dr AP 1000 / Cr Bank 970 / Cr FX Gain 30, balanced', () => {
    expect(drOf(lines, '2000')).toBe(1_000_00);
    expect(crOf(lines, '1110')).toBe(970_00);
    expect(crOf(lines, GL.fxGain.code)).toBe(30_00);
    expect(balanced(lines)).toBe(true);
  });
});

describe('buildSupplierPaymentJournalLines — VAT takes precedence over FX', () => {
  // Both a VAT portion AND an FX original are present; VAT branch wins (matches
  // the route), so no FX leg is produced and the entry stays balanced.
  const lines = buildSupplierPaymentJournalLines({
    expenseAccount: supplierAc, paymentAccount: bankAc,
    resolvedAmountHalalas: 1_150_00, vatAmountHalalas: 150_00, expenseDebitHalalas: 1_000_00,
  });
  it('produces the VAT split, no FX gain/loss line, balanced', () => {
    expect(drOf(lines, GL.inputVat.code)).toBe(150_00);
    expect(drOf(lines, GL.fxLoss.code)).toBe(0);
    expect(crOf(lines, GL.fxGain.code)).toBe(0);
    expect(balanced(lines)).toBe(true);
  });
});

describe('apClearedHalalas — supplier subledger ≡ AP 2000 control (IAS 21)', () => {
  it('plain payment: cleared = full amount (= cash)', () => {
    const lines = buildSupplierPaymentJournalLines({
      expenseAccount: supplierAc, paymentAccount: bankAc,
      resolvedAmountHalalas: 5_000_00, vatAmountHalalas: 0, expenseDebitHalalas: 5_000_00,
    });
    expect(apClearedHalalas(lines)).toBe(5_000_00);
  });

  it('FX loss: cleared = BOOKED SAR (1000), NOT the cash paid (1050) — FX diff stays in P&L', () => {
    const lines = buildSupplierPaymentJournalLines({
      expenseAccount: supplierAc, paymentAccount: bankAc,
      resolvedAmountHalalas: 1_050_00, vatAmountHalalas: 0, expenseDebitHalalas: 1_000_00,
    });
    expect(apClearedHalalas(lines)).toBe(1_000_00);   // the fix: subledger moves by 1000
    expect(apClearedHalalas(lines)).not.toBe(1_050_00);
  });

  it('FX gain: cleared = BOOKED SAR (1000), NOT the cash paid (970)', () => {
    const lines = buildSupplierPaymentJournalLines({
      expenseAccount: supplierAc, paymentAccount: bankAc,
      resolvedAmountHalalas: 970_00, vatAmountHalalas: 0, expenseDebitHalalas: 1_000_00,
    });
    expect(apClearedHalalas(lines)).toBe(1_000_00);
  });

  it('non-supplier expense (rent): nothing posted to AP 2000 → cleared = 0', () => {
    const lines = buildSupplierPaymentJournalLines({
      expenseAccount: rentAc, paymentAccount: bankAc,
      resolvedAmountHalalas: 1_000_00, vatAmountHalalas: 0, expenseDebitHalalas: 1_000_00,
    });
    expect(apClearedHalalas(lines)).toBe(0);
  });
});

describe('buildSupplierPaymentJournalLines — VAT ≥ amount is ignored (no split)', () => {
  // Degenerate VAT (≥ total) must NOT split — falls through to the plain branch.
  const lines = buildSupplierPaymentJournalLines({
    expenseAccount: supplierAc, paymentAccount: bankAc,
    resolvedAmountHalalas: 100_00, vatAmountHalalas: 100_00, expenseDebitHalalas: 100_00,
  });
  it('no Input-VAT line; plain Dr/Cr, balanced', () => {
    expect(drOf(lines, GL.inputVat.code)).toBe(0);
    expect(drOf(lines, '2000')).toBe(100_00);
    expect(crOf(lines, '1110')).toBe(100_00);
    expect(balanced(lines)).toBe(true);
  });
});
