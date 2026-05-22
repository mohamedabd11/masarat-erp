/**
 * @masarat/accounting — Money Utilities
 *
 * المبدأ الأساسي: كل المبالغ تُخزَّن كأعداد صحيحة (هللات).
 * هذا يتجنب تماماً أخطاء الفاصلة العشرية (floating-point) في العمليات الحسابية.
 *
 * 1 ريال سعودي = 100 هللة
 * مثال: 73.5 ريال = 7350 هللة (عدد صحيح — لا كسور)
 */

import type { Halalas } from './types';

/**
 * يحوّل قيمة الريال إلى هللات (عدد صحيح).
 * استخدم هذه الدالة دائماً عند استقبال قيم من المستخدم أو API خارجي.
 *
 * @example
 * fromSAR(73)      // → 7300
 * fromSAR(73.5)    // → 7350
 * fromSAR("73.15") // → 7315
 * fromSAR(0.1 + 0.2) // → 30 (يعالج floating-point error)
 */
export function fromSAR(sar: number | string): Halalas {
  const value = typeof sar === 'string' ? parseFloat(sar) : sar;
  if (!isFinite(value)) {
    throw new Error(`قيمة ريال غير صالحة: ${sar}`);
  }
  if (value < 0) {
    throw new Error(`المبلغ لا يمكن أن يكون سالباً: ${sar}`);
  }
  // Math.round يعالج حالة 0.1 + 0.2 = 0.30000000000000004
  return Math.round(value * 100);
}

/**
 * يحوّل هللات إلى ريال للعرض فقط.
 * لا تستخدم هذه القيمة في أي حساب — فقط للعرض والطباعة.
 */
export function toSAR(halalas: Halalas): number {
  assertValidHalalas(halalas, 'toSAR');
  return halalas / 100;
}

/**
 * يُنسّق المبلغ كريال سعودي للعرض.
 * @example formatSAR(93625) → "936.25 ر.س"
 */
export function formatSAR(halalas: Halalas, locale = 'ar-SA'): string {
  assertValidHalalas(halalas, 'formatSAR');
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'SAR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(halalas / 100);
}

/**
 * يحسب مبلغ VAT بالهللات باستخدام حساب صحيح (integer arithmetic).
 *
 * المشكلة التي تحلها: 73 × 0.15 = 10.949999999999999 (floating-point error)
 * الحل: 7300 × 15 ÷ 100 = 1095 (عدد صحيح)
 *
 * @param amountHalalas - المبلغ الخاضع للضريبة (بالهللات)
 * @param vatRate - معدل الضريبة (0.15 = 15%)
 * @returns مبلغ الضريبة بالهللات (مقرَّب للأقرب هللة)
 *
 * @example
 * calculateVat(7500, 0.15)  // 75 ر.س × 15% = 1125 هللة = 11.25 ر.س ✓
 * calculateVat(7300, 0.15)  // 73 ر.س × 15% = 1095 هللة = 10.95 ر.س ✓
 */
export function calculateVat(amountHalalas: Halalas, vatRate: number): Halalas {
  assertValidHalalas(amountHalalas, 'calculateVat.amount');
  if (vatRate < 0 || vatRate > 1) {
    throw new Error(`معدل VAT يجب أن يكون بين 0 و 1، القيمة: ${vatRate}`);
  }
  if (vatRate === 0) return 0;

  // تحويل المعدل لنسبة مئوية × 100 لتجنب الكسور العشرية
  // مثال: 0.15 → 1500 (للحفاظ على دقة 2 منزلة عشرية في المعدل)
  const rateInBasisPoints = Math.round(vatRate * 10000); // 0.15 → 1500
  return Math.round((amountHalalas * rateInBasisPoints) / 10000);
}

/**
 * يضيف VAT على مبلغ (exclusive → inclusive).
 * @example addVat(7500, 0.15) // 7500 + 1125 = 8625 هللة
 */
export function addVat(amountExclVat: Halalas, vatRate: number): Halalas {
  return amountExclVat + calculateVat(amountExclVat, vatRate);
}

/**
 * يستخرج VAT من مبلغ شامل (inclusive → exclusive + VAT).
 * المعادلة: VAT = total × rate ÷ (1 + rate)
 *
 * @example
 * extractVat(8625, 0.15) // → 1125 هللة (8625 × 15 ÷ 115)
 */
export function extractVat(amountInclVat: Halalas, vatRate: number): Halalas {
  assertValidHalalas(amountInclVat, 'extractVat.amount');
  if (vatRate === 0) return 0;
  const rateInBasisPoints = Math.round(vatRate * 10000);
  return Math.round(
    (amountInclVat * rateInBasisPoints) / (10000 + rateInBasisPoints)
  );
}

/**
 * يُجمع قائمة من المبالغ بالهللات.
 * آمن للاستخدام (لا overflow لمعاملات وكالات السفر المعتادة).
 */
export function sumHalalas(amounts: Halalas[]): Halalas {
  return amounts.reduce((total, amount) => {
    assertValidHalalas(amount, 'sumHalalas.item');
    return total + amount;
  }, 0);
}

/**
 * يتأكد أن القيمة هللات صحيحة (عدد صحيح غير سالب).
 * يُستخدم كـ runtime assertion قبل أي عملية حسابية.
 */
export function assertValidHalalas(value: unknown, fieldName: string): asserts value is Halalas {
  if (typeof value !== 'number') {
    throw new TypeError(`${fieldName}: يجب أن يكون رقماً، القيمة: ${typeof value}`);
  }
  if (!Number.isInteger(value)) {
    throw new TypeError(
      `${fieldName}: يجب أن يكون عدداً صحيحاً (هللات)، القيمة: ${value}. ` +
      `استخدم fromSAR() لتحويل قيم الريال.`
    );
  }
  if (value < 0) {
    throw new RangeError(`${fieldName}: لا يمكن أن يكون المبلغ سالباً، القيمة: ${value}`);
  }
}
