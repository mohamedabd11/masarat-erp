import { BusinessError } from './api-auth';
import { GL } from './gl-accounts';
import type { OriginalJournalLine } from './refund-journal';

export interface CreditNoteJournalInput {
  originalLines: OriginalJournalLine[];
  originalTotalHalalas: number;
  originalPaidHalalas: number;
  creditNoteTotalHalalas: number;
  creditNoteVatHalalas?: number;
}

export interface CreditNoteJournalLine {
  code: string;
  ar: string;
  en: string;
  dr: number;
  cr: number;
}

const CUSTOMER_SIDE = new Set<string>([GL.receivable.code, GL.customerDeposits.code]);
const MAX_ROUNDING_HALALAS = 10;

function row(
  source: OriginalJournalLine,
  debitHalalas: number,
  creditHalalas: number,
): CreditNoteJournalLine {
  return {
    code: source.accountCode,
    ar: source.accountNameAr ?? '',
    en: source.accountNameEn ?? source.accountNameAr ?? '',
    dr: debitHalalas,
    cr: creditHalalas,
  };
}

/** Reverse an original invoice journal pro-rata and preserve its account mix. */
export function buildCreditNoteJournalLines(input: CreditNoteJournalInput): CreditNoteJournalLine[] {
  const { originalLines, originalTotalHalalas, originalPaidHalalas, creditNoteTotalHalalas } = input;
  if (!Number.isInteger(originalTotalHalalas) || originalTotalHalalas <= 0) {
    throw new BusinessError('إجمالي الفاتورة الأصلية غير صالح', 422);
  }
  if (!Number.isInteger(creditNoteTotalHalalas) || creditNoteTotalHalalas <= 0
      || creditNoteTotalHalalas > originalTotalHalalas) {
    throw new BusinessError('إجمالي الإشعار الدائن غير صالح', 422);
  }

  const ratio = creditNoteTotalHalalas / originalTotalHalalas;
  const lines: CreditNoteJournalLine[] = [];

  // Reverse every non-customer credit (revenue, VAT, AP, deferred revenue, etc.).
  for (const source of originalLines) {
    if (source.creditHalalas > 0 && !CUSTOMER_SIDE.has(source.accountCode)) {
      const amount = Math.round(source.creditHalalas * ratio);
      if (amount > 0) lines.push(row(source, amount, 0));
    }
  }

  // Reverse every non-customer debit (normally COGS) to preserve mixed invoices.
  for (const source of originalLines) {
    if (source.debitHalalas > 0 && !CUSTOMER_SIDE.has(source.accountCode)) {
      const amount = Math.round(source.debitHalalas * ratio);
      if (amount > 0) lines.push(row(source, 0, amount));
    }
  }

  const paidRatio = Math.min(1, Math.max(0, originalPaidHalalas / originalTotalHalalas));
  const depositsPortion = Math.round(creditNoteTotalHalalas * paidRatio);
  const receivablePortion = creditNoteTotalHalalas - depositsPortion;
  if (receivablePortion > 0) lines.push({ ...GL.receivable, dr: 0, cr: receivablePortion });
  if (depositsPortion > 0) lines.push({ ...GL.customerDeposits, dr: 0, cr: depositsPortion });

  if (input.creditNoteVatHalalas !== undefined) {
    const reversedVat = lines
      .filter((line) => line.code === GL.vatPayable.code)
      .reduce((sum, line) => sum + line.dr - line.cr, 0);
    if (reversedVat !== input.creditNoteVatHalalas) {
      throw new BusinessError('ضريبة الإشعار الدائن لا تطابق النسبة الضريبية للفاتورة الأصلية', 422);
    }
  }

  const residual = lines.reduce((sum, line) => sum + line.dr - line.cr, 0);
  if (residual !== 0) {
    if (Math.abs(residual) > MAX_ROUNDING_HALALAS) {
      throw new BusinessError('تعذّر موازنة قيد الإشعار الدائن مع الفاتورة الأصلية', 422);
    }
    const target = lines.filter((line) => line.dr > 0).toSorted((a, b) => b.dr - a.dr)[0];
    if (!target || target.dr - residual < 0) {
      throw new BusinessError('تعذّر موازنة قيد الإشعار الدائن', 422);
    }
    target.dr -= residual;
  }

  const debit = lines.reduce((sum, line) => sum + line.dr, 0);
  const credit = lines.reduce((sum, line) => sum + line.cr, 0);
  if (debit !== credit) throw new BusinessError('قيد الإشعار الدائن غير متوازن', 422);
  return lines;
}
