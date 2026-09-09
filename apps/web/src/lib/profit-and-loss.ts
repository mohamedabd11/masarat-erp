import { and, eq, inArray, ne, sql } from 'drizzle-orm';
import type { DB } from './db';
import { chartOfAccounts, journalEntries, journalLines } from './schema/accounting';
import { validateReportRange } from './report-dates';
import type { ReportPeriod } from './reports-dashboard-model';

interface AccountLine {
  code: string; nameAr: string; nameEn: string | null;
  debit: number; credit: number; balance: number;
}
interface ProfitTotals { revenue: number; expenses: number; netIncome: number }

/** Canonical P&L aggregation shared by the statement and the overview. */
export async function getProfitAndLoss(db: Pick<DB, 'select'>, agencyId: string, period: ReportPeriod) {
  const validation = validateReportRange(period.from, period.to);
  if (!validation.valid) throw new Error(validation.error);
  // Existing ledger snapshots can precede the agency's chart. Only those missing
  // accounts use the legacy numbering convention; an explicit chart type wins.
  const accountType = sql<string>`COALESCE(${chartOfAccounts.type}, CASE
    WHEN ${journalLines.accountCode} LIKE '4%' THEN 'revenue'
    WHEN ${journalLines.accountCode} LIKE '5%' OR ${journalLines.accountCode} LIKE '6%'
      OR ${journalLines.accountCode} LIKE '8%' THEN 'expense' ELSE 'other' END)`;
  const month = sql<number>`substring(${journalEntries.date}, 6, 2)::int`;
  const rows = await db.select({
    code: journalLines.accountCode,
    nameAr: sql<string>`COALESCE(${chartOfAccounts.nameAr}, MAX(${journalLines.accountNameAr}), '')`,
    nameEn: sql<string | null>`COALESCE(${chartOfAccounts.nameEn}, MAX(${journalLines.accountNameEn}))`,
    type: accountType, serviceType: journalEntries.serviceType, month,
    debit: sql<string>`COALESCE(SUM(${journalLines.debitHalalas}), 0)::bigint`,
    credit: sql<string>`COALESCE(SUM(${journalLines.creditHalalas}), 0)::bigint`,
  }).from(journalLines)
    .innerJoin(journalEntries, eq(journalEntries.id, journalLines.entryId))
    .leftJoin(chartOfAccounts, and(eq(chartOfAccounts.agencyId, agencyId), eq(chartOfAccounts.code, journalLines.accountCode)))
    .where(and(eq(journalLines.agencyId, agencyId), eq(journalEntries.agencyId, agencyId),
      eq(journalEntries.isPosted, true), ne(journalEntries.source, 'closing'),
      sql`${journalEntries.date} >= ${period.from}`, sql`${journalEntries.date} <= ${period.to}`,
      inArray(accountType, ['revenue', 'expense'])))
    .groupBy(journalLines.accountCode, chartOfAccounts.type, chartOfAccounts.nameAr,
      chartOfAccounts.nameEn, journalEntries.serviceType, month)
    .orderBy(journalLines.accountCode);

  const revenue = new Map<string, AccountLine>();
  const expenses = new Map<string, AccountLine>();
  const services = new Map<string | null, ProfitTotals>();
  const months = new Map<number, ProfitTotals>();
  for (const row of rows) {
    const debit = Number(row.debit), credit = Number(row.credit);
    const isRevenue = row.type === 'revenue';
    const balance = isRevenue ? credit - debit : debit - credit;
    const accounts = isRevenue ? revenue : expenses;
    const account = accounts.get(row.code) ?? { code: row.code, nameAr: row.nameAr,
      nameEn: row.nameEn, debit: 0, credit: 0, balance: 0 };
    account.debit += debit; account.credit += credit; account.balance += balance;
    accounts.set(row.code, account);
    const add = (bucket: ProfitTotals) => {
      if (isRevenue) bucket.revenue += balance; else bucket.expenses += balance;
      bucket.netIncome = bucket.revenue - bucket.expenses;
      return bucket;
    };
    services.set(row.serviceType, add(services.get(row.serviceType) ?? { revenue: 0, expenses: 0, netIncome: 0 }));
    months.set(Number(row.month), add(months.get(Number(row.month)) ?? { revenue: 0, expenses: 0, netIncome: 0 }));
  }
  const revenueRows = [...revenue.values()], expenseRows = [...expenses.values()];
  const totalRevenue = revenueRows.reduce((sum, row) => sum + row.balance, 0);
  const totalExpenses = expenseRows.reduce((sum, row) => sum + row.balance, 0);
  return {
    ...period, revenue: revenueRows, expenses: expenseRows, totalRevenue, totalExpenses,
    netIncome: totalRevenue - totalExpenses,
    byServiceType: [...services].map(([serviceType, totals]) => ({ serviceType, ...totals }))
      .sort((a, b) => b.revenue - a.revenue),
    monthly: [...months].map(([monthNumber, totals]) => ({ month: monthNumber, ...totals }))
      .sort((a, b) => a.month - b.month),
  };
}
