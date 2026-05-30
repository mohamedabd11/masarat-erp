/**
 * Year-end closing logic — shared between:
 *   POST /api/accounting/periods   (auto-triggered when December is locked)
 *   POST /api/accounting/close-year (explicit year-close endpoint)
 *
 * Idempotent: calling multiple times for the same year is safe.
 * Returns null closingEntryId when there is nothing to close.
 */
import { eq, and, ne, sql } from 'drizzle-orm';
import { journalEntries, journalLines } from '@/lib/schema';
import { getNextJournalNumber } from '@/lib/invoice-counter';
import type { Tx } from '@/lib/db';

const RE = { code: '3200', ar: 'الأرباح المحتجزة', en: 'Retained Earnings' };

// ── Pure calculation helper (exported for unit testing) ───────────────────

export interface PlRow {
  accountCode:   string | null;
  accountNameAr: string | null;
  accountNameEn: string | null;
  totalDebit:    number;
  totalCredit:   number;
}

export interface ClosingLine {
  code: string;
  ar:   string;
  en:   string;
  dr:   number;
  cr:   number;
}

export interface ClosingCalculation {
  lines:            ClosingLine[];
  netIncomeHalalas: number;
}

export function calculateClosingLines(plRows: PlRow[]): ClosingCalculation {
  const jLines: ClosingLine[] = [];
  let netIncome = 0;

  for (const row of plRows) {
    const debit  = Number(row.totalDebit)  || 0;
    const credit = Number(row.totalCredit) || 0;
    const code   = row.accountCode ?? '';
    const ar     = row.accountNameAr ?? code;
    const en     = row.accountNameEn ?? '';

    if (code.startsWith('4')) {
      // Revenue: normal credit balance → Dr to zero; surplus flows to net income
      const netCredit = credit - debit;
      if (netCredit !== 0) {
        jLines.push({ code, ar, en, dr: netCredit > 0 ? netCredit : 0, cr: netCredit < 0 ? -netCredit : 0 });
        netIncome += netCredit;
      }
    } else if (code.startsWith('5')) {
      // Expense: normal debit balance → Cr to zero; reduces net income
      const netDebit = debit - credit;
      if (netDebit !== 0) {
        jLines.push({ code, ar, en, dr: netDebit < 0 ? -netDebit : 0, cr: netDebit > 0 ? netDebit : 0 });
        netIncome -= netDebit;
      }
    }
  }

  if (netIncome > 0) {
    jLines.push({ ...RE, dr: 0, cr: netIncome });
  } else if (netIncome < 0) {
    jLines.push({ ...RE, dr: -netIncome, cr: 0 });
  }

  return { lines: jLines, netIncomeHalalas: netIncome };
}

// ── DB-dependent logic ────────────────────────────────────────────────────

export interface YearClosingResult {
  closingEntryId:   string | null;
  netIncomeHalalas: number;
  alreadyClosed:    boolean;
}

export async function createYearEndClosingEntry(
  agencyId: string,
  uid:      string,
  year:     number,
  tx:       Tx,
): Promise<YearClosingResult> {
  const yearStart = `${year}-01-01`;
  const yearEnd   = `${year}-12-31`;

  // Idempotency: return existing entry if already created this year
  const [existing] = await tx
    .select({ id: journalEntries.id })
    .from(journalEntries)
    .where(and(
      eq(journalEntries.agencyId, agencyId),
      eq(journalEntries.source, 'closing'),
      sql`${journalEntries.date} >= ${yearStart}`,
      sql`${journalEntries.date} <= ${yearEnd}`,
    ))
    .limit(1);

  if (existing) {
    return { closingEntryId: existing.id, netIncomeHalalas: 0, alreadyClosed: true };
  }

  // Aggregate posted P&L lines for the year (4xxx revenue, 5xxx expense)
  const plRows = await tx
    .select({
      accountCode:   journalLines.accountCode,
      accountNameAr: journalLines.accountNameAr,
      accountNameEn: journalLines.accountNameEn,
      totalDebit:    sql<number>`cast(sum(${journalLines.debitHalalas})  as int)`,
      totalCredit:   sql<number>`cast(sum(${journalLines.creditHalalas}) as int)`,
    })
    .from(journalLines)
    .innerJoin(journalEntries, eq(journalLines.entryId, journalEntries.id))
    .where(and(
      eq(journalLines.agencyId, agencyId),
      eq(journalEntries.isPosted, true),
      ne(journalEntries.source, 'closing'),
      sql`${journalEntries.date} >= ${yearStart}`,
      sql`${journalEntries.date} <= ${yearEnd}`,
      sql`(${journalLines.accountCode} LIKE '4%' OR ${journalLines.accountCode} LIKE '5%')`,
    ))
    .groupBy(
      journalLines.accountCode,
      journalLines.accountNameAr,
      journalLines.accountNameEn,
    );

  const { lines: jLines, netIncomeHalalas: netIncome } = calculateClosingLines(plRows);

  if (jLines.length === 0) {
    return { closingEntryId: null, netIncomeHalalas: 0, alreadyClosed: false };
  }

  const jeId     = crypto.randomUUID();
  const jeNumber = await getNextJournalNumber(agencyId, year, tx);

  await tx.insert(journalEntries).values({
    id:                 jeId,
    agencyId,
    entryNumber:        jeNumber,
    date:               yearEnd,
    descriptionAr:      `قيد إقفال السنة المالية ${year}`,
    descriptionEn:      `Year-End Closing Entry ${year}`,
    source:             'closing',
    isPosted:           true,
    totalDebitHalalas:  jLines.reduce((s, l) => s + l.dr, 0),
    totalCreditHalalas: jLines.reduce((s, l) => s + l.cr, 0),
    createdBy:          uid,
  });

  for (let i = 0; i < jLines.length; i++) {
    const l = jLines[i]!;
    await tx.insert(journalLines).values({
      id:            crypto.randomUUID(),
      entryId:       jeId,
      agencyId,
      accountCode:   l.code,
      accountNameAr: l.ar,
      accountNameEn: l.en,
      debitHalalas:  l.dr,
      creditHalalas: l.cr,
      sortOrder:     i + 1,
    });
  }

  return { closingEntryId: jeId, netIncomeHalalas: netIncome, alreadyClosed: false };
}
