import { NextResponse } from 'next/server';
import { eq, and, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { chartOfAccounts, journalLines, journalEntries } from '@/lib/schema';
import { verifyAuth, assertRole, ApiAuthError, BusinessError, ROLES_ACCOUNTANT_UP } from '@/lib/api-auth';
import { requireFeature } from '@/lib/feature-access';

export async function GET(request: Request) {
  try {
    const { agencyId, role } = await verifyAuth(request);
    assertRole(role, [...ROLES_ACCOUNTANT_UP]);
    // Platform super-admin has no agency context — agency-scoped books don't
    // apply, so return an empty (balanced) sheet instead of a 500.
    if (!agencyId) {
      const asOf = new URL(request.url).searchParams.get('asOf') ?? new Date().toISOString().split('T')[0]!;
      return NextResponse.json({ asOf, from: null, rows: [], grandTotalDebit: 0, grandTotalCredit: 0, isBalanced: true });
    }
    await requireFeature(agencyId, 'financial_reports', db);

    const url   = new URL(request.url);
    const asOf  = url.searchParams.get('asOf') ?? new Date().toISOString().split('T')[0]!;
    const from  = url.searchParams.get('from');  // optional period start

    // ── 1. Fetch all active accounts for this agency ─────────────────────────
    const accounts = await db
      .select()
      .from(chartOfAccounts)
      .where(and(eq(chartOfAccounts.agencyId, agencyId), eq(chartOfAccounts.isActive, true)))
      .orderBy(chartOfAccounts.code);

    // ── 2. Fetch period movements from journal lines ──────────────────────────
    const conditions = [
      eq(journalLines.agencyId, agencyId),
      eq(journalEntries.isPosted, true),
      sql`${journalEntries.date} <= ${asOf}`,
    ];
    if (from) conditions.push(sql`${journalEntries.date} >= ${from}`);

    const movements = await db
      .select({
        accountCode: journalLines.accountCode,
        nameAr:      sql<string | null>`max(${journalLines.accountNameAr})`,
        nameEn:      sql<string | null>`max(${journalLines.accountNameEn})`,
        totalDebit:  sql<number>`cast(coalesce(sum(${journalLines.debitHalalas}),0)  as int)`,
        totalCredit: sql<number>`cast(coalesce(sum(${journalLines.creditHalalas}),0) as int)`,
      })
      .from(journalLines)
      .innerJoin(journalEntries, eq(journalLines.entryId, journalEntries.id))
      .where(and(...conditions))
      .groupBy(journalLines.accountCode);

    const movMap = new Map<string, { debit: number; credit: number; nameAr: string | null; nameEn: string | null }>();
    for (const m of movements) {
      movMap.set(m.accountCode, { debit: Number(m.totalDebit), credit: Number(m.totalCredit), nameAr: m.nameAr, nameEn: m.nameEn });
    }

    // ── 3. Build trial balance rows ───────────────────────────────────────────
    // Normal balance: Assets(1xxx) & Expenses(5xxx) → debit; others → credit
    const rows = accounts
      .filter(a => !a.parentId || a.allowDirectEntry) // leaf or direct-entry accounts
      .map(a => {
        const mov    = movMap.get(a.code) ?? { debit: 0, credit: 0 };
        const open   = a.openingBalanceHalalas ?? 0;
        const type   = a.type; // asset|liability|equity|revenue|expense
        const isDebitNormal = type === 'asset' || type === 'expense';

        // Opening balance sign convention: stored as positive, sign applied here
        const openDebit  = isDebitNormal ? open : 0;
        const openCredit = isDebitNormal ? 0 : open;

        const totalDebit  = openDebit  + mov.debit;
        const totalCredit = openCredit + mov.credit;

        // Closing balance: net in the natural direction
        const balance = isDebitNormal
          ? totalDebit - totalCredit     // positive = debit balance
          : totalCredit - totalDebit;    // positive = credit balance

        return {
          code:         a.code,
          nameAr:       a.nameAr,
          nameEn:       a.nameEn ?? null,
          type,
          level:        a.level,
          openDebit,
          openCredit,
          periodDebit:  mov.debit,
          periodCredit: mov.credit,
          totalDebit,
          totalCredit,
          balance,            // positive = in normal direction
          isDebitNormal,
        };
      })
      .filter(r => r.totalDebit !== 0 || r.totalCredit !== 0 || r.balance !== 0);

    // Defense-in-depth: surface any account that has journal movements but no
    // chart-of-accounts row (e.g. a code added to a journal before the COA caught
    // up). Without this they were dropped entirely, making the trial balance
    // appear unbalanced by exactly their net. Classify by code prefix; 3201/3202
    // are deferred revenue (liability) in substance even without a COA row.
    const coaCodes = new Set(accounts.map(a => a.code));
    const classifyType = (code: string): typeof accounts[number]['type'] => {
      if (code.startsWith('1')) return 'asset';
      if (code.startsWith('2')) return 'liability';
      if (code === '3201' || code === '3202') return 'liability';
      if (code.startsWith('3')) return 'equity';
      if (code.startsWith('4')) return 'revenue';
      return 'expense'; // 5xxx / 6xxx / 8xxx
    };
    for (const [code, mov] of movMap) {
      if (coaCodes.has(code)) continue;
      if (mov.debit === 0 && mov.credit === 0) continue;
      const type = classifyType(code);
      const isDebitNormal = type === 'asset' || type === 'expense';
      rows.push({
        code,
        nameAr:       mov.nameAr ?? `حساب غير معرّف (${code})`,
        nameEn:       mov.nameEn ?? null,
        type,
        level:        1,
        openDebit:    0,
        openCredit:   0,
        periodDebit:  mov.debit,
        periodCredit: mov.credit,
        totalDebit:   mov.debit,
        totalCredit:  mov.credit,
        balance:      isDebitNormal ? mov.debit - mov.credit : mov.credit - mov.debit,
        isDebitNormal,
      });
    }
    rows.sort((a, b) => a.code.localeCompare(b.code));

    const grandTotalDebit  = rows.reduce((s, r) => s + r.totalDebit,  0);
    const grandTotalCredit = rows.reduce((s, r) => s + r.totalCredit, 0);
    const isBalanced       = grandTotalDebit === grandTotalCredit;

    return NextResponse.json({
      asOf,
      from: from ?? null,
      rows,
      grandTotalDebit,
      grandTotalCredit,
      isBalanced,
    });
  } catch (err) {
    if (err instanceof ApiAuthError || err instanceof BusinessError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(JSON.stringify({ event: 'trial_balance_failed', error: (err as Error).message }));
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
