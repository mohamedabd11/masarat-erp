import { NextResponse } from 'next/server';
import { eq, and, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { journalLines, journalEntries } from '@/lib/schema';
import { verifyAuth, assertRole, ApiAuthError, ROLES_ACCOUNTANT_UP } from '@/lib/api-auth';

interface AccountLine {
  code:        string;
  nameAr:      string;
  nameEn:      string | null;
  debit:       number;
  credit:      number;
  balance:     number;  // positive = net amount in normal direction
}

export async function GET(request: Request) {
  try {
    const { agencyId, role } = await verifyAuth(request);
    assertRole(role, [...ROLES_ACCOUNTANT_UP]);

    const url  = new URL(request.url);
    const from = url.searchParams.get('from');  // YYYY-MM-DD
    const to   = url.searchParams.get('to');    // YYYY-MM-DD

    if (!from || !to) {
      return NextResponse.json({ error: 'from و to مطلوبان (YYYY-MM-DD)' }, { status: 400 });
    }

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
        sql`${journalEntries.date} >= ${from}`,
        sql`${journalEntries.date} <= ${to}`,
      ))
      .groupBy(journalLines.accountCode, journalLines.accountNameAr, journalLines.accountNameEn)
      .orderBy(journalLines.accountCode);

    const revenue:  AccountLine[] = [];
    const expenses: AccountLine[] = [];

    for (const r of rows) {
      const debit  = Number(r.debitTotal)  || 0;
      const credit = Number(r.creditTotal) || 0;
      const code   = r.accountCode ?? '';

      if (code.startsWith('4')) {
        // Revenue: credit normal balance
        revenue.push({ code, nameAr: r.accountNameAr ?? '', nameEn: r.accountNameEn ?? null, debit, credit, balance: credit - debit });
      } else if (code.startsWith('5')) {
        // Expenses: debit normal balance
        expenses.push({ code, nameAr: r.accountNameAr ?? '', nameEn: r.accountNameEn ?? null, debit, credit, balance: debit - credit });
      }
    }

    const totalRevenue  = revenue.reduce((s, l) => s + l.balance, 0);
    const totalExpenses = expenses.reduce((s, l) => s + l.balance, 0);
    const netIncome     = totalRevenue - totalExpenses;

    return NextResponse.json({
      from, to,
      revenue,  totalRevenue,
      expenses, totalExpenses,
      netIncome,
    });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(JSON.stringify({ event: 'pl_report_failed', error: (err as Error).message }));
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
