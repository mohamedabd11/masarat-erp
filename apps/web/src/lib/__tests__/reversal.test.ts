import { describe, it, expect } from 'vitest';
import { buildReversalLines, buildReversalDescription } from '@/lib/reversal';
import type { OriginalLine } from '@/lib/reversal';

// ── Helpers ───────────────────────────────────────────────────────────────────

function line(
  code: string,
  dr: number,
  cr: number,
  ar = code,
  en: string | null = null,
  desc: string | null = null,
): OriginalLine {
  return { accountCode: code, accountNameAr: ar, accountNameEn: en, debitHalalas: dr, creditHalalas: cr, description: desc };
}

function isBalanced(lines: { debitHalalas: number; creditHalalas: number }[]): boolean {
  const dr = lines.reduce((s, l) => s + l.debitHalalas, 0);
  const cr = lines.reduce((s, l) => s + l.creditHalalas, 0);
  return dr === cr;
}

// ── buildReversalLines ────────────────────────────────────────────────────────

describe('buildReversalLines', () => {
  it('returns empty array for empty input', () => {
    expect(buildReversalLines([])).toHaveLength(0);
  });

  it('swaps debit → credit and credit → debit on a single line', () => {
    const [result] = buildReversalLines([line('1120', 100000, 0)]);
    expect(result!.debitHalalas).toBe(0);
    expect(result!.creditHalalas).toBe(100000);
  });

  it('swaps credit → debit and debit → credit on a credit-only line', () => {
    const [result] = buildReversalLines([line('4000', 0, 80000)]);
    expect(result!.debitHalalas).toBe(80000);
    expect(result!.creditHalalas).toBe(0);
  });

  it('handles lines where both Dr and Cr are zero', () => {
    const [result] = buildReversalLines([line('1100', 0, 0)]);
    expect(result!.debitHalalas).toBe(0);
    expect(result!.creditHalalas).toBe(0);
  });

  it('preserves double-entry balance: balanced original → balanced reversal', () => {
    // Typical invoice: Dr Receivable 115 000, Cr Revenue 100 000, Cr VAT 15 000
    const original = [
      line('1120', 115000, 0),
      line('4000', 0, 100000),
      line('2200', 0, 15000),
    ];
    const reversed = buildReversalLines(original);
    expect(isBalanced(original)).toBe(true);
    expect(isBalanced(reversed)).toBe(true);
  });

  it('correctly mirrors a two-line balanced entry', () => {
    const original = [
      line('1110', 50000, 0, 'البنك'),
      line('1120', 0, 50000, 'ذمم مدينة'),
    ];
    const [r0, r1] = buildReversalLines(original);
    expect(r0!.debitHalalas).toBe(0);
    expect(r0!.creditHalalas).toBe(50000);
    expect(r1!.debitHalalas).toBe(50000);
    expect(r1!.creditHalalas).toBe(0);
  });

  it('assigns sortOrder starting from 1 and incrementing sequentially', () => {
    const original = [
      line('1120', 300000, 0),
      line('4000', 0, 260870),
      line('2200', 0, 39130),
    ];
    const reversed = buildReversalLines(original);
    expect(reversed[0]!.sortOrder).toBe(1);
    expect(reversed[1]!.sortOrder).toBe(2);
    expect(reversed[2]!.sortOrder).toBe(3);
  });

  it('preserves accountCode, accountNameAr, accountNameEn, description on each line', () => {
    const original = [line('5000', 0, 120000, 'تكلفة الخدمات', 'Cost of Services', 'خدمة رحلة')];
    const [r] = buildReversalLines(original);
    expect(r!.accountCode).toBe('5000');
    expect(r!.accountNameAr).toBe('تكلفة الخدمات');
    expect(r!.accountNameEn).toBe('Cost of Services');
    expect(r!.description).toBe('خدمة رحلة');
  });

  it('handles null accountNameEn and null description gracefully', () => {
    const [r] = buildReversalLines([line('1100', 500, 0)]);
    expect(r!.accountNameEn).toBeNull();
    expect(r!.description).toBeNull();
  });

  it('total lines count equals original lines count', () => {
    const original = Array.from({ length: 5 }, (_, i) =>
      line(`10${i}0`, i * 1000, i * 1000),
    );
    expect(buildReversalLines(original)).toHaveLength(5);
  });

  it('reversal of a reversal restores the original (double-flip)', () => {
    const original = [
      line('1120', 200000, 0),
      line('4000', 0, 200000),
    ];
    const firstReversal  = buildReversalLines(original);
    const secondReversal = buildReversalLines(firstReversal);
    expect(secondReversal[0]!.debitHalalas).toBe(original[0]!.debitHalalas);
    expect(secondReversal[0]!.creditHalalas).toBe(original[0]!.creditHalalas);
    expect(secondReversal[1]!.debitHalalas).toBe(original[1]!.debitHalalas);
    expect(secondReversal[1]!.creditHalalas).toBe(original[1]!.creditHalalas);
  });
});

// ── buildReversalDescription ──────────────────────────────────────────────────

describe('buildReversalDescription', () => {
  it('returns Arabic and English descriptions without reason', () => {
    const { ar, en } = buildReversalDescription('JE-2025-001');
    expect(ar).toBe('عكس القيد JE-2025-001');
    expect(en).toBe('Reversal of JE-2025-001');
  });

  it('includes reason in both languages when provided', () => {
    const { ar, en } = buildReversalDescription('JE-2025-042', 'خطأ في المبلغ');
    expect(ar).toBe('عكس القيد JE-2025-042 — خطأ في المبلغ');
    expect(en).toBe('Reversal of JE-2025-042 — خطأ في المبلغ');
  });

  it('embeds the entryNumber correctly in both strings', () => {
    const number = 'JE-2026-999';
    const { ar, en } = buildReversalDescription(number);
    expect(ar).toContain(number);
    expect(en).toContain(number);
  });

  it('handles empty string reason the same as no reason', () => {
    const withEmpty    = buildReversalDescription('JE-001', '');
    const withUndefined = buildReversalDescription('JE-001');
    // empty string is falsy — both should omit the reason suffix
    expect(withEmpty.ar).toBe(withUndefined.ar);
    expect(withEmpty.en).toBe(withUndefined.en);
  });

  it('Arabic description starts with عكس القيد', () => {
    const { ar } = buildReversalDescription('JE-2025-007', 'تعديل');
    expect(ar.startsWith('عكس القيد')).toBe(true);
  });

  it('English description starts with Reversal of', () => {
    const { en } = buildReversalDescription('JE-2025-007');
    expect(en.startsWith('Reversal of')).toBe(true);
  });
});
