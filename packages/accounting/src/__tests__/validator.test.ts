import { describe, it, expect } from 'vitest';
import {
  validateBalance,
  validateAndCorrect,
  AccountingValidationError,
} from '../validator';
import type { JournalLine } from '../types';

// ─── بيانات الاختبار ─────────────────────────────────────────────────────────

const ROUNDING_ACCOUNT = '8399';
const ROUNDING_NAME = { ar: 'فروق التقريب', en: 'Rounding' };

function makeLine(
  accountCode: string,
  debit: number,
  credit: number,
  lineNumber = 1
): JournalLine {
  return {
    lineNumber,
    accountCode,
    accountName: { ar: `حساب ${accountCode}`, en: `Account ${accountCode}` },
    debit,
    credit,
    description: `اختبار`,
  };
}

// ─── validateBalance ─────────────────────────────────────────────────────────

describe('validateBalance', () => {
  it('يقبل قيداً متوازناً', () => {
    const lines: JournalLine[] = [
      makeLine('1002', 93625, 0, 1),
      makeLine('3202', 0, 85000, 2),
      makeLine('3201', 0, 7500, 3),
      makeLine('3101', 0, 1125, 4),
    ];
    const result = validateBalance(lines);
    expect(result.isValid).toBe(true);
    expect(result.totalDebit).toBe(93625);
    expect(result.totalCredit).toBe(93625);
    expect(result.difference).toBe(0);
  });

  it('يقبل فرق 1 هللة (تقريب مسموح به)', () => {
    const lines: JournalLine[] = [
      makeLine('1002', 93626, 0, 1), // زيادة 1 هللة
      makeLine('3202', 0, 93625, 2),
    ];
    const result = validateBalance(lines);
    expect(result.isValid).toBe(true);
    expect(result.difference).toBe(1);
  });

  it('يرفض فرقاً أكبر من 1 هللة', () => {
    const lines: JournalLine[] = [
      makeLine('1002', 93625, 0, 1),
      makeLine('3202', 0, 93623, 2), // فرق 2 هللة
    ];
    const result = validateBalance(lines);
    expect(result.isValid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain('غير متوازن');
  });

  it('يرفض سطراً بمدين ودائن معاً', () => {
    const lines: JournalLine[] = [
      makeLine('1002', 500, 200, 1), // خطأ
      makeLine('3202', 0, 300, 2),
    ];
    const result = validateBalance(lines);
    expect(result.isValid).toBe(false);
    expect(result.errors.some(e => e.includes('مدين ودائن'))).toBe(true);
  });

  it('يرفض سطراً بصفر في كلا الطرفين', () => {
    const lines: JournalLine[] = [
      makeLine('1002', 500, 0, 1),
      makeLine('3202', 0, 500, 2),
      makeLine('9999', 0, 0, 3), // سطر فارغ
    ];
    const result = validateBalance(lines);
    expect(result.isValid).toBe(false);
    expect(result.errors.some(e => e.includes('صفر'))).toBe(true);
  });

  it('يرفض مبالغ سالبة', () => {
    const lines: JournalLine[] = [
      makeLine('1002', 500, 0, 1),
      makeLine('3202', 0, -500, 2),
    ];
    const result = validateBalance(lines);
    expect(result.isValid).toBe(false);
    expect(result.errors.some(e => e.includes('السالبة'))).toBe(true);
  });

  it('يرفض مبالغ كسرية (ليست هللات)', () => {
    const lines: JournalLine[] = [
      makeLine('1002', 936.25, 0, 1), // يجب أن يكون 93625
      makeLine('3202', 0, 936.25, 2),
    ];
    const result = validateBalance(lines);
    expect(result.isValid).toBe(false);
    expect(result.errors.some(e => e.includes('هللات'))).toBe(true);
  });

  it('يرفض قيداً بسطر واحد فقط', () => {
    const lines: JournalLine[] = [makeLine('1002', 1000, 0, 1)];
    const result = validateBalance(lines);
    expect(result.isValid).toBe(false);
  });
});

// ─── validateAndCorrect ───────────────────────────────────────────────────────

describe('validateAndCorrect', () => {
  it('يُعيد نفس السطور إذا كان القيد متوازناً', () => {
    const lines: JournalLine[] = [
      makeLine('1002', 93625, 0, 1),
      makeLine('3202', 0, 93625, 2),
    ];
    const { lines: result, hadRoundingCorrection } = validateAndCorrect(lines, ROUNDING_ACCOUNT, ROUNDING_NAME);
    expect(result).toHaveLength(2);
    expect(hadRoundingCorrection).toBe(false);
  });

  it('يُضيف سطر تقريب عند فرق 1 هللة', () => {
    // سيناريو واقعي: 73 ر.س × 15% = 1095 هللة، لكن الجمع يعطي فرقاً
    const lines: JournalLine[] = [
      makeLine('1002', 93626, 0, 1), // +1 هللة زيادة
      makeLine('3202', 0, 93625, 2),
    ];
    const { lines: result, hadRoundingCorrection } = validateAndCorrect(lines, ROUNDING_ACCOUNT, ROUNDING_NAME);

    expect(result).toHaveLength(3);
    expect(hadRoundingCorrection).toBe(true);

    const roundingLine = result.find(l => l.accountCode === ROUNDING_ACCOUNT);
    expect(roundingLine).toBeDefined();
    expect(roundingLine!.credit).toBe(1); // المدين أكبر → نُضيف دائن

    // التحقق من التوازن النهائي
    const totalDebit = result.reduce((s, l) => s + l.debit, 0);
    const totalCredit = result.reduce((s, l) => s + l.credit, 0);
    expect(totalDebit).toBe(totalCredit);
  });

  it('يُضيف سطر تقريب مديناً عندما الدائن أكبر', () => {
    const lines: JournalLine[] = [
      makeLine('1002', 93624, 0, 1), // -1 هللة نقص
      makeLine('3202', 0, 93625, 2),
    ];
    const { lines: result } = validateAndCorrect(lines, ROUNDING_ACCOUNT, ROUNDING_NAME);
    const roundingLine = result.find(l => l.accountCode === ROUNDING_ACCOUNT);
    expect(roundingLine!.debit).toBe(1); // الدائن أكبر → نُضيف مدين
  });

  it('يرمي AccountingValidationError عند فرق أكبر من 1 هللة', () => {
    const lines: JournalLine[] = [
      makeLine('1002', 93625, 0, 1),
      makeLine('3202', 0, 93620, 2), // فرق 5 هللات
    ];
    expect(() => validateAndCorrect(lines, ROUNDING_ACCOUNT, ROUNDING_NAME))
      .toThrow(AccountingValidationError);
  });

  it('خطأ AccountingValidationError يحمل قائمة الأخطاء', () => {
    const lines: JournalLine[] = [
      makeLine('1002', 1000, 0, 1),
      makeLine('3202', 0, 1100, 2), // فرق 100 هللة
    ];
    try {
      validateAndCorrect(lines, ROUNDING_ACCOUNT, ROUNDING_NAME);
      expect.fail('يجب أن يُرمى خطأ');
    } catch (e) {
      expect(e).toBeInstanceOf(AccountingValidationError);
      expect((e as AccountingValidationError).validationErrors).toHaveLength(1);
    }
  });
});
