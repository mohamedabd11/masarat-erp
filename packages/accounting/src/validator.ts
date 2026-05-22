/**
 * @masarat/accounting — Balance Validator
 *
 * صمام الأمان: يتأكد أن إجمالي المدين = إجمالي الدائن قبل أي commit.
 *
 * سياسة التقريب:
 *   - فرق = 0        → صحيح، لا تعديل
 *   - |فرق| = 1 هللة → صحيح، يُضاف سطر تعديل تقريب تلقائياً
 *   - |فرق| > 1 هللة → خطأ حسابي حقيقي، يُرمى exception
 */

import type { JournalLine, ValidationResult, Halalas } from './types';

/** الحد الأقصى المسموح به لفرق التقريب (هللة واحدة = 0.01 ر.س) */
const MAX_ROUNDING_TOLERANCE: Halalas = 1;

/**
 * يتحقق من توازن سطور القيد اليومي.
 * لا يُعدِّل السطور — فقط يقرأ ويُبلِّغ.
 */
export function validateBalance(lines: JournalLine[]): ValidationResult {
  const errors: string[] = [];

  // ── القاعدة 1: الحد الأدنى سطرين ────────────────────────────────────────
  if (lines.length < 2) {
    errors.push(`القيد يحتاج على الأقل سطرين، عدد السطور الحالي: ${lines.length}`);
    return buildResult(lines, errors);
  }

  // ── القاعدة 2: كل سطر له طرف واحد فقط ───────────────────────────────────
  lines.forEach((line, idx) => {
    const pos = `السطر ${idx + 1} (حساب ${line.accountCode})`;

    if (line.debit === 0 && line.credit === 0) {
      errors.push(`${pos}: المدين والدائن كلاهما صفر`);
    }
    if (line.debit > 0 && line.credit > 0) {
      errors.push(`${pos}: لا يمكن أن يحتوي السطر على مدين ودائن في آنٍ واحد`);
    }
    if (line.debit < 0 || line.credit < 0) {
      errors.push(`${pos}: المبالغ السالبة غير مسموح بها — استخدم قيد عكسي`);
    }
    if (!Number.isInteger(line.debit) || !Number.isInteger(line.credit)) {
      errors.push(`${pos}: المبالغ يجب أن تكون بالهللات (أعداد صحيحة) — لا كسور عشرية`);
    }
  });

  if (errors.length > 0) {
    return buildResult(lines, errors);
  }

  const result = buildResult(lines, errors);

  // ── القاعدة 3: التوازن ───────────────────────────────────────────────────
  if (result.difference !== 0 && Math.abs(result.difference) > MAX_ROUNDING_TOLERANCE) {
    errors.push(
      `القيد غير متوازن: ` +
      `المدين = ${result.totalDebit} هللة (${result.totalDebit / 100} ر.س)، ` +
      `الدائن = ${result.totalCredit} هللة (${result.totalCredit / 100} ر.س)، ` +
      `الفرق = ${result.difference} هللة. ` +
      `الحد الأقصى المسموح به لفروق التقريب: ${MAX_ROUNDING_TOLERANCE} هللة.`
    );
    return { ...buildResult(lines, errors), isValid: false };
  }

  return result;
}

/** يبني ValidationResult من السطور والأخطاء */
function buildResult(lines: JournalLine[], errors: string[]): ValidationResult {
  const totalDebit = lines.reduce((sum, l) => sum + l.debit, 0);
  const totalCredit = lines.reduce((sum, l) => sum + l.credit, 0);
  const difference = totalDebit - totalCredit;

  return {
    isValid: errors.length === 0,
    totalDebit,
    totalCredit,
    difference,
    errors,
  };
}

/**
 * يُضيف سطر تعديل التقريب عند وجود فرق 1 هللة.
 * هذا الفرق ينشأ بشكل طبيعي من حسابات الضريبة (مثال: 73 × 15% = 10.95).
 */
export function applyRoundingCorrection(
  lines: JournalLine[],
  difference: Halalas,
  roundingAccountCode: string,
  roundingAccountName: { ar: string; en: string }
): JournalLine[] {
  if (difference === 0) return lines;

  // difference موجب → المدين أكبر → نضيف دائن لحساب التقريب
  // difference سالب → الدائن أكبر → نضيف مدين لحساب التقريب
  const correctionLine: JournalLine = {
    lineNumber: lines.length + 1,
    accountCode: roundingAccountCode,
    accountName: roundingAccountName,
    debit: difference < 0 ? Math.abs(difference) : 0,
    credit: difference > 0 ? difference : 0,
    description: 'تعديل فروق تقريب ضريبي / Tax rounding adjustment',
  };

  return [...lines, correctionLine];
}

/**
 * خط الأنابيب الكامل: يتحقق ثم يُصحح التقريب إذا لزم.
 * يُرمى AccountingValidationError إذا كان الفرق أكبر من 1 هللة.
 *
 * @returns السطور المعدَّلة (مع سطر تقريب إذا لزم)
 */
export function validateAndCorrect(
  lines: JournalLine[],
  roundingAccountCode: string,
  roundingAccountName: { ar: string; en: string }
): { lines: JournalLine[]; hadRoundingCorrection: boolean } {
  const result = validateBalance(lines);

  if (!result.isValid) {
    throw new AccountingValidationError(result.errors);
  }

  if (result.difference === 0) {
    return { lines, hadRoundingCorrection: false };
  }

  // فرق 1 هللة مسموح به — نُضيف سطر تعديل
  const correctedLines = applyRoundingCorrection(
    lines,
    result.difference,
    roundingAccountCode,
    roundingAccountName
  );

  // تحقق نهائي: بعد التصحيح يجب أن يتوازن القيد تماماً
  const finalResult = validateBalance(correctedLines);
  if (!finalResult.isValid || finalResult.difference !== 0) {
    throw new AccountingValidationError([
      'فشل تصحيح التقريب: القيد لا يزال غير متوازن بعد إضافة سطر التقريب'
    ]);
  }

  return { lines: correctedLines, hadRoundingCorrection: true };
}

/** خطأ التحقق من توازن القيد — يحمل قائمة الأخطاء التفصيلية */
export class AccountingValidationError extends Error {
  readonly validationErrors: string[];

  constructor(validationErrors: string[]) {
    super(
      `فشل التحقق المحاسبي:\n${validationErrors.map(e => `  • ${e}`).join('\n')}`
    );
    this.name = 'AccountingValidationError';
    this.validationErrors = validationErrors;
  }
}
