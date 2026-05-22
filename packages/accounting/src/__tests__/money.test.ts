import { describe, it, expect } from 'vitest';
import {
  fromSAR,
  toSAR,
  formatSAR,
  calculateVat,
  addVat,
  extractVat,
  sumHalalas,
  assertValidHalalas,
} from '../money';

describe('fromSAR', () => {
  it('يحوّل ريالاً صحيحاً لهللات', () => {
    expect(fromSAR(73)).toBe(7300);
    expect(fromSAR(1)).toBe(100);
    expect(fromSAR(0)).toBe(0);
    expect(fromSAR(936)).toBe(93600);
  });

  it('يحوّل ريالاً كسرياً بدقة', () => {
    expect(fromSAR(73.5)).toBe(7350);
    expect(fromSAR(73.15)).toBe(7315);
    expect(fromSAR(0.01)).toBe(1);
    expect(fromSAR(936.25)).toBe(93625);
  });

  it('يعالج خطأ floating-point الشهير', () => {
    // 0.1 + 0.2 = 0.30000000000000004 في JavaScript
    expect(fromSAR(0.1 + 0.2)).toBe(30);
    // 73 × 0.15 = 10.949999999999999
    expect(fromSAR(73 * 0.15)).toBe(1095);
  });

  it('يقبل string كمدخل', () => {
    expect(fromSAR('73.5')).toBe(7350);
    expect(fromSAR('1000')).toBe(100000);
  });

  it('يرفض القيم غير الصالحة', () => {
    expect(() => fromSAR(NaN)).toThrow();
    expect(() => fromSAR(Infinity)).toThrow();
    expect(() => fromSAR(-1)).toThrow();
  });
});

describe('calculateVat', () => {
  it('يحسب VAT 15% بدقة', () => {
    expect(calculateVat(7500, 0.15)).toBe(1125);   // 75 ر.س × 15% = 11.25 ر.س
    expect(calculateVat(85000, 0.15)).toBe(12750); // 850 ر.س × 15% = 127.50 ر.س
    expect(calculateVat(500000, 0.15)).toBe(75000); // 5000 ر.س × 15% = 750 ر.س
  });

  it('يحسب VAT 5% بدقة (دول الخليج الأخرى)', () => {
    expect(calculateVat(10000, 0.05)).toBe(500); // 100 ر.س × 5% = 5 ر.س
  });

  it('يُعيد صفراً لمعدل صفري', () => {
    expect(calculateVat(7300, 0)).toBe(0);
    expect(calculateVat(85000, 0)).toBe(0);
  });

  it('يُقرِّب بشكل صحيح لأقرب هللة', () => {
    // 73 ر.س × 15% = 10.95 ر.س = 1095 هللة (عدد صحيح)
    expect(calculateVat(7300, 0.15)).toBe(1095);
    // حالة التقريب: مبلغ يعطي كسراً بالهللات
    // 1 ر.س × 15% = 0.15 ر.س → 15 هللة
    expect(calculateVat(100, 0.15)).toBe(15);
    // 2 ر.س × 15% = 0.30 ر.س → 30 هللة
    expect(calculateVat(200, 0.15)).toBe(30);
    // 3 ر.س × 15% = 0.45 ر.س → 45 هللة
    expect(calculateVat(300, 0.15)).toBe(45);
  });

  it('يرفض معدلات VAT خارج النطاق', () => {
    expect(() => calculateVat(7500, -0.1)).toThrow();
    expect(() => calculateVat(7500, 1.5)).toThrow();
  });
});

describe('addVat و extractVat', () => {
  it('addVat: يضيف VAT على المبلغ', () => {
    expect(addVat(7500, 0.15)).toBe(8625);    // 75 + 11.25 = 86.25 ر.س
    expect(addVat(500000, 0.15)).toBe(575000); // 5000 + 750 = 5750 ر.س
  });

  it('extractVat: يستخرج VAT من مبلغ شامل', () => {
    expect(extractVat(8625, 0.15)).toBe(1125);    // 86.25 ÷ 1.15 × 0.15 = 11.25
    expect(extractVat(575000, 0.15)).toBe(75000); // 5750 ÷ 1.15 × 0.15 = 750
  });

  it('addVat و extractVat متعاكستان', () => {
    const original = 93625;
    const withVat = addVat(original, 0.15);
    const extractedVat = extractVat(withVat, 0.15);
    // مجموع الأجزاء يساوي الكل
    expect(withVat - extractedVat).toBe(original);
  });
});

describe('sumHalalas', () => {
  it('يجمع قائمة المبالغ', () => {
    expect(sumHalalas([1000, 2000, 3000])).toBe(6000);
    expect(sumHalalas([85000, 7500, 1125])).toBe(93625);
    expect(sumHalalas([])).toBe(0);
  });

  it('يرفض مبالغ غير صحيحة في القائمة', () => {
    expect(() => sumHalalas([100, -50, 200])).toThrow();
    expect(() => sumHalalas([100, 50.5, 200])).toThrow();
  });
});

describe('assertValidHalalas', () => {
  it('يقبل أعداداً صحيحة غير سالبة', () => {
    expect(() => assertValidHalalas(0, 'test')).not.toThrow();
    expect(() => assertValidHalalas(1000, 'test')).not.toThrow();
  });

  it('يرفض أعداداً غير صحيحة', () => {
    expect(() => assertValidHalalas(10.5, 'test')).toThrow(/عدداً صحيحاً/);
    expect(() => assertValidHalalas(-1, 'test')).toThrow(/سالباً/);
    expect(() => assertValidHalalas('100' as any, 'test')).toThrow(/رقماً/);
    expect(() => assertValidHalalas(null as any, 'test')).toThrow(/رقماً/);
  });
});
