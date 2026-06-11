/**
 * Unit tests — buildRefundJournalLines (CRIT-10).
 *
 * Pure, no DB. Verifies the refund GL reverses the ORIGINAL invoice's journal
 * lines correctly for every scenario the audit flagged, and stays balanced
 * (Σdr === Σcr) in all cases.
 *
 * Original-invoice journal shapes (mirroring invoices/create):
 *   principal: Dr 1120 (rev+vat) / Cr 4100 rev / Cr 2200 vat  +  Dr 5000 cost / Cr 2000 cost
 *   agent:     Dr 1120 (fee+cost+vat) / Cr 2000 cost / Cr 4000 fee / Cr 2200 vat   (no COGS)
 */
import { describe, it, expect } from 'vitest';
import { buildRefundJournalLines, type OriginalJournalLine } from '@/lib/refund-journal';

interface InvoiceShape {
  agentFee?:     number;
  agentCost?:    number;   // pass-through → Cr 2000 only (no 5000)
  principalRev?: number;
  principalCost?: number;  // Dr 5000 / Cr 2000
  deferred?:     number;
  vat?:          number;
}

function L(code: string, dr: number, cr: number): OriginalJournalLine {
  return { accountCode: code, accountNameAr: code, accountNameEn: code, debitHalalas: dr, creditHalalas: cr };
}

/** Build a balanced original sales-invoice journal; AR is the balancing debit. */
function originalInvoice(o: InvoiceShape): OriginalJournalLine[] {
  const body: OriginalJournalLine[] = [];
  if (o.agentFee)      body.push(L('4000', 0, o.agentFee));
  if (o.principalRev)  body.push(L('4100', 0, o.principalRev));
  if (o.deferred)      body.push(L('3201', 0, o.deferred));
  if (o.vat)           body.push(L('2200', 0, o.vat));
  if (o.agentCost)     body.push(L('2000', 0, o.agentCost));
  if (o.principalCost) { body.push(L('5000', o.principalCost, 0)); body.push(L('2000', 0, o.principalCost)); }
  const cr = body.reduce((s, l) => s + l.creditHalalas, 0);
  const dr = body.reduce((s, l) => s + l.debitHalalas, 0);
  return [L('1120', cr - dr, 0), ...body];
}

/** Customer-facing total (= AR debit) for the shapes above. */
function totalOf(o: InvoiceShape): number {
  return (o.agentFee ?? 0) + (o.principalRev ?? 0) + (o.deferred ?? 0) + (o.vat ?? 0) + (o.agentCost ?? 0);
}

const sum  = (ls: { dr: number; cr: number }[], k: 'dr' | 'cr') => ls.reduce((s, l) => s + l[k], 0);
const drOf = (ls: { code: string; dr: number }[], code: string) => ls.filter(l => l.code === code).reduce((s, l) => s + l.dr, 0);
const crOf = (ls: { code: string; cr: number }[], code: string) => ls.filter(l => l.code === code).reduce((s, l) => s + l.cr, 0);

describe('buildRefundJournalLines — full-paid principal', () => {
  const shape = { principalRev: 10_000_00, vat: 1_500_00, principalCost: 6_000_00 };
  const lines = buildRefundJournalLines({
    originalLines: originalInvoice(shape), originalTotalHalalas: totalOf(shape), originalVatHalalas: 1_500_00,
    paidHalalas: totalOf(shape), refundAmountHalalas: totalOf(shape), cancellationFeeHalalas: 0, isEInvoice: true,
  });
  it('reverses revenue (Dr 4100), VAT (Dr 2200), COGS (Cr 5000), AP (Dr 2000), returns cash (Cr 1110)', () => {
    expect(drOf(lines, '4100')).toBe(10_000_00);
    expect(drOf(lines, '2200')).toBe(1_500_00);
    expect(crOf(lines, '5000')).toBe(6_000_00);
    expect(drOf(lines, '2000')).toBe(6_000_00);
    expect(crOf(lines, '1110')).toBe(11_500_00);
  });
  it('fully paid → no AR (1120) credit, balanced', () => {
    expect(crOf(lines, '1120')).toBe(0);
    expect(sum(lines, 'dr')).toBe(sum(lines, 'cr'));
  });
});

describe('buildRefundJournalLines — full-paid agent (no COGS line)', () => {
  const shape = { agentFee: 2_000_00, vat: 300_00, agentCost: 6_000_00 };
  const lines = buildRefundJournalLines({
    originalLines: originalInvoice(shape), originalTotalHalalas: totalOf(shape), originalVatHalalas: 300_00,
    paidHalalas: totalOf(shape), refundAmountHalalas: totalOf(shape), cancellationFeeHalalas: 0, isEInvoice: true,
  });
  it('reverses agent fee (Dr 4000) and AP (Dr 2000), no 4100, no 5000, balanced', () => {
    expect(drOf(lines, '4000')).toBe(2_000_00);
    expect(drOf(lines, '4100')).toBe(0);
    expect(drOf(lines, '2000')).toBe(6_000_00);
    expect(crOf(lines, '5000')).toBe(0);
    expect(crOf(lines, '1110')).toBe(8_300_00);
    expect(sum(lines, 'dr')).toBe(sum(lines, 'cr'));
  });
});

describe('buildRefundJournalLines — mixed agent+principal (defect #1)', () => {
  const shape = { agentFee: 2_000_00, principalRev: 8_000_00, vat: 1_500_00, principalCost: 6_000_00 };
  const lines = buildRefundJournalLines({
    originalLines: originalInvoice(shape), originalTotalHalalas: totalOf(shape), originalVatHalalas: 1_500_00,
    paidHalalas: totalOf(shape), refundAmountHalalas: 5_500_00, cancellationFeeHalalas: 250_00, isEInvoice: true,
  });
  it('reverses BOTH revenue accounts pro-rated (Dr 4000 AND Dr 4100)', () => {
    expect(drOf(lines, '4000')).toBe(1_000_00);   // 2000 * 0.5
    expect(drOf(lines, '4100')).toBe(4_000_00);   // 8000 * 0.5
  });
  it('returns only the cash refund on Bank, re-recognises the net fee on 4200, balanced', () => {
    expect(crOf(lines, '1110')).toBe(5_500_00);
    expect(crOf(lines, '4200')).toBeGreaterThan(0);
    expect(sum(lines, 'dr')).toBe(sum(lines, 'cr'));
  });
});

describe('buildRefundJournalLines — deferred revenue (defect #3)', () => {
  const shape = { deferred: 10_000_00, vat: 1_500_00, principalCost: 6_000_00 };
  const lines = buildRefundJournalLines({
    originalLines: originalInvoice(shape), originalTotalHalalas: totalOf(shape), originalVatHalalas: 1_500_00,
    paidHalalas: totalOf(shape), refundAmountHalalas: totalOf(shape), cancellationFeeHalalas: 0, isEInvoice: true,
  });
  it('debits deferred revenue (3201), never 4100/4000, balanced', () => {
    expect(drOf(lines, '3201')).toBe(10_000_00);
    expect(drOf(lines, '4100')).toBe(0);
    expect(drOf(lines, '4000')).toBe(0);
    expect(sum(lines, 'dr')).toBe(sum(lines, 'cr'));
  });
});

describe('buildRefundJournalLines — partially paid full cancel (defect #4)', () => {
  // Total 11,500; only 5,750 collected. Cancel the WHOLE invoice: return the
  // 5,750 cash AND write off the open 5,750 AR.
  const shape = { principalRev: 10_000_00, vat: 1_500_00, principalCost: 6_000_00 };
  const lines = buildRefundJournalLines({
    originalLines: originalInvoice(shape), originalTotalHalalas: totalOf(shape), originalVatHalalas: 1_500_00,
    paidHalalas: 5_750_00, refundAmountHalalas: 5_750_00, cancellationFeeHalalas: 0,
    cancelledTotalHalalas: totalOf(shape), isEInvoice: true,
  });
  it('splits the credit: Bank = cash returned, AR (1120) = open unpaid portion voided', () => {
    expect(crOf(lines, '1110')).toBe(5_750_00);
    expect(crOf(lines, '1120')).toBe(5_750_00);
  });
  it('reverses the FULL revenue and VAT (whole supply cancelled), balanced', () => {
    expect(drOf(lines, '4100')).toBe(10_000_00);
    expect(drOf(lines, '2200')).toBe(1_500_00);
    expect(sum(lines, 'dr')).toBe(sum(lines, 'cr'));
  });
});

describe('buildRefundJournalLines — odd-ratio rounding', () => {
  it('absorbs the residual and stays exactly balanced', () => {
    const shape = { principalRev: 9_999_00, vat: 1_499_85, principalCost: 3_333_00 };
    const lines = buildRefundJournalLines({
      originalLines: originalInvoice(shape), originalTotalHalalas: totalOf(shape), originalVatHalalas: 1_499_85,
      paidHalalas: totalOf(shape), refundAmountHalalas: 3_333_00, cancellationFeeHalalas: 0, isEInvoice: true,
    });
    expect(sum(lines, 'dr')).toBe(sum(lines, 'cr'));
  });
});

describe('buildRefundJournalLines — legacy fallback (no original journal)', () => {
  const lines = buildRefundJournalLines({
    originalLines: [],
    originalTotalHalalas: 11_500_00, originalVatHalalas: 1_500_00, paidHalalas: 11_500_00,
    refundAmountHalalas: 5_750_00, cancellationFeeHalalas: 0, isEInvoice: true,
    fallback: { revenueModel: 'principal', costPriceHalalas: 6_000_00 },
  });
  it('reproduces single-account behaviour and stays balanced', () => {
    expect(drOf(lines, '4100')).toBe(5_000_00);   // 5750 − 750 VAT
    expect(drOf(lines, '2200')).toBe(750_00);
    expect(crOf(lines, '1110')).toBe(5_750_00);
    expect(drOf(lines, '2000')).toBe(3_000_00);   // 6000 * 0.5
    expect(crOf(lines, '5000')).toBe(3_000_00);
    expect(sum(lines, 'dr')).toBe(sum(lines, 'cr'));
  });
});

describe('buildRefundJournalLines — guards', () => {
  it('throws on an over-refund (cancelled portion < cash + fee)', () => {
    expect(() => buildRefundJournalLines({
      originalLines: originalInvoice({ principalRev: 10_000_00, vat: 1_500_00 }),
      originalTotalHalalas: 11_500_00, originalVatHalalas: 1_500_00, paidHalalas: 11_500_00,
      refundAmountHalalas: 2_000_00, cancellationFeeHalalas: 0, cancelledTotalHalalas: 1_000_00, isEInvoice: true,
    })).toThrow();
  });
});
