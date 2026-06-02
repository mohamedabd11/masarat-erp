import { NextResponse } from 'next/server';
import { eq, and, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { chartOfAccounts, journalLines, journalEntries } from '@/lib/schema';
import { verifyAuth, assertRole, ApiAuthError, ROLES_ACCOUNTANT_UP } from '@/lib/api-auth';
import { requireFeature } from '@/lib/feature-access';

export async function GET(request: Request) {
  try {
    const { agencyId, role } = await verifyAuth(request);
    assertRole(role, [...ROLES_ACCOUNTANT_UP]);
    await requireFeature(agencyId, 'financial_reports', db);

    const url   = new URL(request.url);
    const asOf  = url.searchParams.get('asOf') ?? new Date().toISOString().split('T')[0]!;
    const from  = url.searchParams.get('from');  // optional period start

    // ── 1. Chart-of-accounts metadata (type, names, level, opening balance) ──
    // Used only to enrich the journal-sourced rows below — the trial balance is
    // built from journal lines, not from the COA, so postings to parent or
    // non-direct-entry accounts are never dropped (matches balance-sheet/P&L).
    const accounts = await db
      .select()
      .from(chartOfAccounts)
      .where(eq(chartOfAccounts.agencyId, agencyId));

    const coaByCode = new Map(accounts.map(a => [a.code, a]));

    // Resolve an account type, preferring the explicit COA `type` and falling
    // back to the numeric code range when the account has no COA row — mirrors
    // the balance-sheet `classify` so the two reports agree.
    type AccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
    const classifyType = (code: string, coaType: string | undefined): AccountType => {
      if (coaType) return coaType as AccountType;
      if (code.startsWith('1')) return 'asset';
      if (code.startsWith('2')) return 'liability';
      if (code === '3201' || code === '3202') return 'liability'; // deferred revenue
      if (code.startsWith('3')) return 'equity';
      if (code.startsWith('4')) return 'revenue';
      return 'expense'; // 5xxx + 6xxx
    };
    const isDebitNormalType = (type: AccountType): boolean => type === 'asset' || type === 'expense';

    // ── 2. Aggregate movements from journal lines (source of truth) ──────────
    const conditions = [
      eq(journalLines.agencyId, agencyId),
      eq(journalEntries.isPosted, true),
      sql`${journalEntries.date} <= ${asOf}`,
    ];
    if (from) conditions.push(sql`${journalEntries.date} >= ${from}`);

    const movements = await db
      .select({
        accountCode:  journalLines.accountCode,
        accountNameAr: journalLines.accountNameAr,
        accountNameEn: journalLines.accountNameEn,
        totalDebit:  sql<number>`cast(coalesce(sum(${journalLines.debitHalalas}),0)  as bigint)`,
        totalCredit: sql<number>`cast(coalesce(sum(${journalLines.creditHalalas}),0) as bigint)`,
      })
      .from(journalLines)
      .innerJoin(journalEntries, eq(journalLines.entryId, journalEntries.id))
      .where(and(...conditions))
      .groupBy(journalLines.accountCode, journalLines.accountNameAr, journalLines.accountNameEn);

    // Collapse rows so each account code appears once (names may vary per line).
    const movMap = new Map<string, { debit: number; credit: number; nameAr: string | null; nameEn: string | null }>();
    for (const m of movements) {
      const prev = movMap.get(m.accountCode);
      if (prev) {
        prev.debit  += Number(m.totalDebit);
        prev.credit += Number(m.totalCredit);
        if (!prev.nameAr) prev.nameAr = m.accountNameAr ?? null;
        if (!prev.nameEn) prev.nameEn = m.accountNameEn ?? null;
      } else {
        movMap.set(m.accountCode, {
          debit:  Number(m.totalDebit),
          credit: Number(m.totalCredit),
          nameAr: m.accountNameAr ?? null,
          nameEn: m.accountNameEn ?? null,
        });
      }
    }

    // ── 3. Build trial balance rows ───────────────────────────────────────────
    // Codes = every account with journal movement plus any COA account carrying
    // an opening balance (so the opening figure shows even before its first post).
    const codes = new Set<string>(movMap.keys());
    for (const a of accounts) {
      if ((a.openingBalanceHalalas ?? 0) !== 0) codes.add(a.code);
    }

    const rows = Array.from(codes)
      .sort()
      .map(code => {
        const mov   = movMap.get(code) ?? { debit: 0, credit: 0, nameAr: null, nameEn: null };
        const coa   = coaByCode.get(code);
        const open  = coa?.openingBalanceHalalas ?? 0;
        const type  = classifyType(code, coa?.type); // asset|liability|equity|revenue|expense
        const isDebitNormal = isDebitNormalType(type);

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
          code,
          nameAr:       coa?.nameAr ?? mov.nameAr ?? code,
          nameEn:       coa?.nameEn ?? mov.nameEn ?? null,
          type,
          level:        coa?.level ?? 1,
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
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(JSON.stringify({ event: 'trial_balance_failed', error: (err as Error).message }));
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
