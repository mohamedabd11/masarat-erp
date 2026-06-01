import { describe, it, expect } from 'vitest';
import { validateJournalLines } from '@/lib/journal-validation';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function line(code: string, dr: number, cr: number) {
  return { accountCode: code, accountNameAr: `حساب ${code}`, debitHalalas: dr, creditHalalas: cr };
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('validateJournalLines — double-entry enforcement', () => {

  // ── Balanced entries ────────────────────────────────────────────────────────

  it('يقبل قيداً متوازناً بسطرين', () => {
    const result = validateJournalLines([
      line('1120', 93625, 0),
      line('4100', 0, 93625),
    ]);
    expect(result.totalDebit).toBe(93625);
    expect(result.totalCredit).toBe(93625);
  });

  it('يقبل قيداً متوازناً بأكثر من سطرين (invoice with VAT)', () => {
    // Dr AR 108700 / Cr Revenue 94500 / Cr VAT Payable 14200
    const result = validateJournalLines([
      line('1120', 108700, 0),
      line('4100', 0, 94500),
      line('2200', 0, 14200),
    ]);
    expect(result.totalDebit).toBe(108700);
    expect(result.totalCredit).toBe(108700);
  });

  it('يقبل قيداً فيه فرق 1 هللة (تقريب مسموح به)', () => {
    const result = validateJournalLines([
      line('1120', 93626, 0),  // +1 هللة
      line('4100', 0, 93625),
    ]);
    expect(result.totalDebit).toBe(93626);
    expect(result.totalCredit).toBe(93625);
  });

  it('يقبل قيداً بأربعة سطور متوازنة (agent model)', () => {
    // Dr AR / Cr AP Suppliers / Cr Revenue / Cr VAT
    const result = validateJournalLines([
      line('1120', 100000, 0),
      line('2000', 0, 80000),
      line('4000', 0, 15000),
      line('2200', 0, 5000),
    ]);
    expect(result.totalDebit).toBe(100000);
    expect(result.totalCredit).toBe(100000);
  });

  // ── Minimum line count ──────────────────────────────────────────────────────

  it('يرفض قيداً بسطر واحد فقط', () => {
    expect(() =>
      validateJournalLines([line('1120', 1000, 0)])
    ).toThrow('على الأقل سطرين');
  });

  it('يرفض مصفوفة فارغة', () => {
    expect(() => validateJournalLines([])).toThrow('على الأقل سطرين');
  });

  // ── Imbalanced entries ──────────────────────────────────────────────────────

  it('يرفض قيداً فيه فرق 2 هللة', () => {
    expect(() =>
      validateJournalLines([
        line('1120', 93625, 0),
        line('4100', 0, 93623),   // فرق 2
      ])
    ).toThrow('غير متوازن');
  });

  it('يرفض قيداً فيه فرق 100 هللة', () => {
    expect(() =>
      validateJournalLines([
        line('1120', 50000, 0),
        line('4100', 0, 49900),
      ])
    ).toThrow('غير متوازن');
  });

  it('رسالة الخطأ تذكر المبالغ والفرق', () => {
    let msg = '';
    try {
      validateJournalLines([
        line('1120', 10000, 0),
        line('4100', 0, 9000),
      ]);
    } catch (e) {
      msg = (e as Error).message;
    }
    expect(msg).toContain('10000');
    expect(msg).toContain('9000');
    expect(msg).toContain('1000');
  });

  // ── Line-level rule violations ──────────────────────────────────────────────

  it('يرفض سطراً فيه مدين ودائن في آنٍ واحد', () => {
    expect(() =>
      validateJournalLines([
        line('1120', 500, 200),   // خطأ: كلاهما > 0
        line('4100', 0, 300),
      ])
    ).toThrow('مدين ودائن في آنٍ واحد');
  });

  it('يرفض سطراً بصفر في كلا الطرفين', () => {
    expect(() =>
      validateJournalLines([
        line('1120', 1000, 0),
        line('4100', 0, 1000),
        line('9999', 0, 0),       // سطر فارغ
      ])
    ).toThrow('صفراً');
  });

  it('يرفض مبالغ سالبة في المدين', () => {
    expect(() =>
      validateJournalLines([
        line('1120', -500, 0),
        line('4100', 0, -500),
      ])
    ).toThrow('السالبة');
  });

  it('يرفض مبالغ سالبة في الدائن', () => {
    expect(() =>
      validateJournalLines([
        line('1120', 500, 0),
        line('4100', 0, -500),
      ])
    ).toThrow('السالبة');
  });

  it('يرفض مبالغ كسرية (غير صحيحة)', () => {
    expect(() =>
      validateJournalLines([
        line('1120', 936.25, 0),
        line('4100', 0, 936.25),
      ])
    ).toThrow('هللات');
  });

  it('يرفض رمز حساب فارغ', () => {
    expect(() =>
      validateJournalLines([
        { accountCode: '', accountNameAr: 'بدون رمز', debitHalalas: 1000, creditHalalas: 0 },
        line('4100', 0, 1000),
      ])
    ).toThrow('رمز الحساب مطلوب');
  });

  // ── Edge cases ──────────────────────────────────────────────────────────────

  it('يجمع مبالغ صحيحة للتحقق من التوازن', () => {
    // ثلاثة سطور مدينة / سطران دائنة
    const result = validateJournalLines([
      line('1100', 30000, 0),
      line('1110', 50000, 0),
      line('1120', 20000, 0),
      line('4100', 0, 80000),
      line('2200', 0, 20000),
    ]);
    expect(result.totalDebit).toBe(100000);
    expect(result.totalCredit).toBe(100000);
  });

  it('يرفض قيماً NaN', () => {
    expect(() =>
      validateJournalLines([
        { accountCode: '1120', accountNameAr: 'AR', debitHalalas: NaN, creditHalalas: 0 },
        line('4100', 0, 1000),
      ])
    ).toThrow();
  });
});
