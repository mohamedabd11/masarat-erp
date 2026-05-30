/**
 * Pure helpers for building reversal journal entries.
 * Extracted so the logic is unit-testable without a DB connection.
 */

export interface OriginalLine {
  accountCode:   string;
  accountNameAr: string | null;
  accountNameEn: string | null;
  debitHalalas:  number;
  creditHalalas: number;
  description:   string | null;
}

export interface ReversalLine {
  accountCode:   string;
  accountNameAr: string | null;
  accountNameEn: string | null;
  debitHalalas:  number;
  creditHalalas: number;
  description:   string | null;
  sortOrder:     number;
}

/**
 * Swaps debit ↔ credit on every line to produce the mirror-image entry.
 * Double-entry invariant is preserved: if the original was balanced, the
 * reversal is balanced too (sum Dr = sum Cr both before and after).
 */
export function buildReversalLines(originalLines: OriginalLine[]): ReversalLine[] {
  return originalLines.map((l, i) => ({
    accountCode:   l.accountCode,
    accountNameAr: l.accountNameAr,
    accountNameEn: l.accountNameEn,
    debitHalalas:  l.creditHalalas,   // swapped
    creditHalalas: l.debitHalalas,    // swapped
    description:   l.description,
    sortOrder:     i + 1,
  }));
}

/**
 * Builds the Arabic and English descriptions for a reversal journal entry.
 */
export function buildReversalDescription(
  entryNumber: string,
  reason?:     string,
): { ar: string; en: string } {
  return {
    ar: reason
      ? `عكس القيد ${entryNumber} — ${reason}`
      : `عكس القيد ${entryNumber}`,
    en: `Reversal of ${entryNumber}${reason ? ` — ${reason}` : ''}`,
  };
}
