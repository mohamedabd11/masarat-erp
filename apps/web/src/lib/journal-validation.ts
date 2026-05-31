/**
 * Pure validation for manual journal entries.
 * No DB/auth dependencies — safe to import in tests directly.
 *
 * Rules enforced:
 *   1. At least 2 lines
 *   2. Each line: non-negative integers, either debit or credit (not both / not neither)
 *   3. Σ debit === Σ credit  (±1 halalah rounding tolerance)
 *
 * Returns computed totals so the caller never trusts client-supplied header values.
 */

export interface JournalLineInput {
  accountCode:   string;
  accountNameAr: string;
  debitHalalas:  number;
  creditHalalas: number;
}

export interface JournalValidationResult {
  totalDebit:  number;
  totalCredit: number;
}

export function validateJournalLines(
  lines: JournalLineInput[],
): JournalValidationResult {
  if (!Array.isArray(lines) || lines.length < 2) {
    throw new Error('القيد يحتاج على الأقل سطرين (مدين ودائن)');
  }

  const lineErrors: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const l   = lines[i]!;
    const pos = `السطر ${i + 1} (${l.accountCode} — ${l.accountNameAr})`;

    if (!l.accountCode?.trim()) {
      lineErrors.push(`${pos}: رمز الحساب مطلوب`);
      continue;
    }
    if (!Number.isInteger(l.debitHalalas) || !Number.isInteger(l.creditHalalas)) {
      lineErrors.push(`${pos}: المبالغ يجب أن تكون بالهللات (أعداد صحيحة)`);
      continue;
    }
    if (l.debitHalalas < 0 || l.creditHalalas < 0) {
      lineErrors.push(`${pos}: المبالغ السالبة غير مسموح بها — استخدم قيداً عكسياً`);
      continue;
    }
    if (l.debitHalalas === 0 && l.creditHalalas === 0) {
      lineErrors.push(`${pos}: لا يمكن أن يكون المدين والدائن كلاهما صفراً`);
      continue;
    }
    if (l.debitHalalas > 0 && l.creditHalalas > 0) {
      lineErrors.push(`${pos}: لا يمكن أن يحتوي السطر على مدين ودائن في آنٍ واحد`);
    }
  }

  if (lineErrors.length > 0) {
    throw new Error(lineErrors.join(' | '));
  }

  const totalDebit  = lines.reduce((s, l) => s + l.debitHalalas,  0);
  const totalCredit = lines.reduce((s, l) => s + l.creditHalalas, 0);
  const diff        = Math.abs(totalDebit - totalCredit);

  if (diff > 1) {
    throw new Error(
      `القيد غير متوازن: مجموع المدين ${totalDebit} هللة ≠ مجموع الدائن ${totalCredit} هللة` +
      ` (فرق ${diff} هللة). يُسمح بفرق 1 هللة فقط للتقريب.`,
    );
  }

  return { totalDebit, totalCredit };
}
