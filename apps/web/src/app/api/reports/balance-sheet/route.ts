import { NextResponse } from 'next/server';
import { eq, and, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { journalLines, journalEntries } from '@/lib/schema';
import { verifyAuth, assertRole, ApiAuthError, BusinessError, ROLES_ACCOUNTANT_UP } from '@/lib/api-auth';
import { requireFeature } from '@/lib/feature-access';

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
        debitTotal:   sql<number>`cast(sum(${journalLines.debitHalalas}) as int)`,
        creditTotal:  sql<number>`cast(sum(${journalLines.creditHalalas}) as int)`,
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

      if (code.startsWith('1')) {
        line.balance = debit - credit;      // asset: debit normal
        assets.push(line);
      } else if (code.startsWith('2')) {
        line.balance = credit - debit;      // liability: credit normal
        liabilities.push(line);
      } else if (code.startsWith('3')) {
        line.balance = credit - debit;      // equity: credit normal
        equity.push(line);
      } else if (code.startsWith('4')) {
        totalRevenue += credit - debit;     // revenue: credit normal
      } else if (code.startsWith('5')) {
        totalExpenses += debit - credit;    // expense: debit normal
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
