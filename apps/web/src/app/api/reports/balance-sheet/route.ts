import { NextResponse } from 'next/server';
import { eq, and, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { journalLines, journalEntries, chartOfAccounts } from '@/lib/schema';
import { verifyAuth, assertRole, ApiAuthError, BusinessError, ROLES_ACCOUNTANT_UP } from '@/lib/api-auth';
import { requireFeature } from '@/lib/feature-access';

type AccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';

/**
 * Classify an account into a balance-sheet/P&L bucket.
 *
 * Prefers the explicit `type` recorded in the chart of accounts (so a code like
 * 3201 flagged as a `liability` — deferred revenue — is treated correctly rather
 * than as equity just because it starts with "3"). Falls back to the numeric
 * range only when the account has no COA entry.
 */
function classify(code: string, coaType: AccountType | undefined): AccountType {
  if (coaType) return coaType;
  if (code.startsWith('1')) return 'asset';
  if (code.startsWith('2')) return 'liability';
  // Deferred revenue (3201/3202) is a liability in substance even without a COA row.
  if (code === '3201' || code === '3202') return 'liability';
  if (code.startsWith('3')) return 'equity';
  if (code.startsWith('4')) return 'revenue';
  if (code.startsWith('9')) return 'liability'; // suspense/clearing accounts (9001, etc.)
  return 'expense'; // 5xxx + 6xxx
}

interface AccountLine {
  code:    string;
  nameAr:  string;
  nameEn:  string | null;
  debit:   number;
  credit:  number;
  balance: number;
}

export async function GET(request: Request) {
  try {
    const { agencyId, role } = await verifyAuth(request);
    assertRole(role, [...ROLES_ACCOUNTANT_UP]);
    await requireFeature(agencyId, 'financial_reports', db);

    const url  = new URL(request.url);
    const asOf = url.searchParams.get('asOf') ?? new Date().toISOString().split('T')[0]!;

    const rows = await db
      .select({
        accountCode:  journalLines.accountCode,
        accountNameAr: journalLines.accountNameAr,
        accountNameEn: journalLines.accountNameEn,
        debitTotal:   sql<number>`cast(sum(${journalLines.debitHalalas}) as bigint)`,
        creditTotal:  sql<number>`cast(sum(${journalLines.creditHalalas}) as bigint)`,
      })
      .from(journalLines)
      .innerJoin(journalEntries, eq(journalLines.entryId, journalEntries.id))
      .where(and(
        eq(journalLines.agencyId, agencyId),
        eq(journalEntries.isPosted, true),
        sql`${journalEntries.date} <= ${asOf}`,
      ))
      .groupBy(journalLines.accountCode, journalLines.accountNameAr, journalLines.accountNameEn)
      .orderBy(journalLines.accountCode);

    // Authoritative account types from the chart of accounts.
    const coaRows = await db
      .select({ code: chartOfAccounts.code, type: chartOfAccounts.type })
      .from(chartOfAccounts)
      .where(eq(chartOfAccounts.agencyId, agencyId));
    const typeByCode = new Map<string, AccountType>(
      coaRows.map((r) => [r.code, r.type as AccountType]),
    );

    const assets:      AccountLine[] = [];
    const liabilities: AccountLine[] = [];
    const equity:      AccountLine[] = [];

    // Accumulate revenue (4xxx) and expenses (5xxx) to derive current-period
    // net profit, which must be carried into equity so the accounting equation
    // (Assets = Liabilities + Equity) balances during the year (IAS 1).
    let totalRevenue  = 0;
    let totalExpenses = 0;

    for (const r of rows) {
      const debit  = Number(r.debitTotal)  || 0;
      const credit = Number(r.creditTotal) || 0;
      const code   = r.accountCode ?? '';

      const line: AccountLine = { code, nameAr: r.accountNameAr ?? '', nameEn: r.accountNameEn ?? null, debit, credit, balance: 0 };

      switch (classify(code, typeByCode.get(code))) {
        case 'asset':
          line.balance = debit - credit;      // asset: debit normal
          assets.push(line);
          break;
        case 'liability':
          line.balance = credit - debit;      // liability: credit normal
          liabilities.push(line);
          break;
        case 'equity':
          line.balance = credit - debit;      // equity: credit normal
          equity.push(line);
          break;
        case 'revenue':
          totalRevenue += credit - debit;     // revenue: credit normal
          break;
        case 'expense':
          totalExpenses += debit - credit;    // expense: debit normal
          break;
      }
    }

    // Net profit / loss for the period — added to equity as a single line.
    const netProfit = totalRevenue - totalExpenses;
    if (netProfit !== 0) {
      equity.push({
        code:    '3900',
        nameAr:  'صافي الربح / الخسارة',
        nameEn:  'Net Profit / Loss',
        debit:   netProfit < 0 ? -netProfit : 0,
        credit:  netProfit > 0 ?  netProfit : 0,
        balance: netProfit,
      });
    }

    const totalAssets      = assets.reduce((s, l) => s + l.balance, 0);
    const totalLiabilities = liabilities.reduce((s, l) => s + l.balance, 0);
    const totalEquity      = equity.reduce((s, l) => s + l.balance, 0);
    const totalLiabilitiesAndEquity = totalLiabilities + totalEquity;

    return NextResponse.json({
      asOf,
      assets,      totalAssets,
      liabilities, totalLiabilities,
      equity,      totalEquity,
      netProfit,
      totalLiabilitiesAndEquity,
      balanced:    totalAssets === totalLiabilitiesAndEquity,
    });
  } catch (err) {
    if (err instanceof ApiAuthError || err instanceof BusinessError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(JSON.stringify({ event: 'balance_sheet_failed', error: (err as Error).message }));
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
