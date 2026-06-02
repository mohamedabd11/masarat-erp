import { NextResponse } from 'next/server';
import { eq, and, ne, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { journalLines, journalEntries } from '@/lib/schema';
import { verifyAuth, assertRole, ApiAuthError, BusinessError, ROLES_ACCOUNTANT_UP } from '@/lib/api-auth';
import { requireFeature } from '@/lib/feature-access';

interface AccountLine {
  code:        string;
  nameAr:      string;
  nameEn:      string | null;
  debit:       number;
  credit:      number;
  balance:     number;
}

interface ServiceBreakdown {
  serviceType: string | null;
  revenue:     number;
  expenses:    number;
  netIncome:   number;
}

export async function GET(request: Request) {
  try {
    const { agencyId, role } = await verifyAuth(request);
    assertRole(role, [...ROLES_ACCOUNTANT_UP]);
    await requireFeature(agencyId, 'financial_reports', db);

    const url     = new URL(request.url);
    const from    = url.searchParams.get('from');
    const to      = url.searchParams.get('to');
    const groupBy = url.searchParams.get('groupBy'); // 'serviceType' | null

    if (!from || !to) {
      return NextResponse.json({ error: 'from و to مطلوبان (YYYY-MM-DD)' }, { status: 400 });
    }

    // ── Base P&L by account ────────────────────────────────────────────────
    const rows = await db
      .select({
        accountCode:   journalLines.accountCode,
        accountNameAr: journalLines.accountNameAr,
        accountNameEn: journalLines.accountNameEn,
        serviceType:   journalEntries.serviceType,
        debitTotal:    sql<number>`cast(sum(${journalLines.debitHalalas})  as bigint)`,
        creditTotal:   sql<number>`cast(sum(${journalLines.creditHalalas}) as bigint)`,
      })
      .from(journalLines)
      .innerJoin(journalEntries, eq(journalLines.entryId, journalEntries.id))
      .where(and(
        eq(journalLines.agencyId, agencyId),
        eq(journalEntries.isPosted, true),
        ne(journalEntries.source, 'closing'),   // exclude year-end closing entries
        sql`${journalEntries.date} >= ${from}`,
        sql`${journalEntries.date} <= ${to}`,
      ))
      .groupBy(
        journalLines.accountCode,
        journalLines.accountNameAr,
        journalLines.accountNameEn,
        journalEntries.serviceType,
      )
      .orderBy(journalLines.accountCode);

    const revenue:  AccountLine[] = [];
    const expenses: AccountLine[] = [];

    // Service-type map: serviceType → { revenue, expenses }
    const byService = new Map<string, { revenue: number; expenses: number }>();

    for (const r of rows) {
      const debit  = Number(r.debitTotal)  || 0;
      const credit = Number(r.creditTotal) || 0;
      const code   = r.accountCode ?? '';
      const svc    = r.serviceType ?? 'other';

      if (!byService.has(svc)) byService.set(svc, { revenue: 0, expenses: 0 });
      const bucket = byService.get(svc)!;

      if (code.startsWith('4')) {
        const balance = credit - debit;
        // Aggregate into unique account lines (sum across service types for the top-level P&L)
        const existing = revenue.find(l => l.code === code);
        if (existing) { existing.debit += debit; existing.credit += credit; existing.balance += balance; }
        else revenue.push({ code, nameAr: r.accountNameAr ?? '', nameEn: r.accountNameEn ?? null, debit, credit, balance });
        bucket.revenue += balance;
      } else if (code.startsWith('5') || code.startsWith('6')) {
        const balance = debit - credit;
        const existing = expenses.find(l => l.code === code);
        if (existing) { existing.debit += debit; existing.credit += credit; existing.balance += balance; }
        else expenses.push({ code, nameAr: r.accountNameAr ?? '', nameEn: r.accountNameEn ?? null, debit, credit, balance });
        bucket.expenses += balance;
      }
    }

    const totalRevenue  = revenue.reduce((s, l) => s + l.balance, 0);
    const totalExpenses = expenses.reduce((s, l) => s + l.balance, 0);
    const netIncome     = totalRevenue - totalExpenses;

    const response: Record<string, unknown> = {
      from, to,
      revenue,  totalRevenue,
      expenses, totalExpenses,
      netIncome,
    };

    if (groupBy === 'serviceType') {
      const breakdown: ServiceBreakdown[] = Array.from(byService.entries()).map(([serviceType, v]) => ({
        serviceType: serviceType === 'other' ? null : serviceType,
        revenue:     v.revenue,
        expenses:    v.expenses,
        netIncome:   v.revenue - v.expenses,
      }));
      breakdown.sort((a, b) => b.revenue - a.revenue);
      response['byServiceType'] = breakdown;
    }

    return NextResponse.json(response);
  } catch (err) {
    if (err instanceof ApiAuthError || err instanceof BusinessError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(JSON.stringify({ event: 'pl_report_failed', error: (err as Error).message }));
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
