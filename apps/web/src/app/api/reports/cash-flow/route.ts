/**
 * GET /api/reports/cash-flow?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Cash Flow Statement (IAS 7 — Indirect Method).
 * Derives cash movements from journal_lines grouped by account code prefix:
 *   1xxx Assets, 2xxx Liabilities, 3xxx Equity, 4xxx Revenue, 5xxx Expenses
 *
 * Sections:
 *  A. Operating Activities (indirect): net income ± working-capital changes
 *  B. Investing Activities: movements in fixed assets (16xx accounts)
 *  C. Financing Activities: movements in long-term debt (22xx) + equity injections (31xx)
 *
 * All amounts returned in halalas.
 */
import { NextResponse } from 'next/server';
import { eq, and, ne, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { journalLines, journalEntries } from '@/lib/schema';
import { verifyAuth, assertRole, ApiAuthError, ROLES_ACCOUNTANT_UP } from '@/lib/api-auth';

interface AccountMovement {
  accountCode:   string;
  accountNameAr: string;
  accountNameEn: string;
  netDebit:      number;  // totalDebit - totalCredit (positive = net debit)
}

async function getMovements(agencyId: string, from: string, to: string): Promise<AccountMovement[]> {
  const rows = await db
    .select({
      accountCode:   journalLines.accountCode,
      accountNameAr: journalLines.accountNameAr,
      accountNameEn: journalLines.accountNameEn,
      totalDebit:    sql<number>`cast(sum(${journalLines.debitHalalas})  as bigint)`,
      totalCredit:   sql<number>`cast(sum(${journalLines.creditHalalas}) as bigint)`,
    })
    .from(journalLines)
    .innerJoin(journalEntries, eq(journalLines.entryId, journalEntries.id))
    .where(and(
      eq(journalLines.agencyId, agencyId),
      eq(journalEntries.isPosted, true),
      // Exclude year-end closing entries (consistent with P&L and balance-sheet):
      // they transfer P&L balances to retained earnings and would distort net
      // income when the report window spans a close.
      ne(journalEntries.source, 'closing'),
      sql`${journalEntries.date} >= ${from}`,
      sql`${journalEntries.date} <= ${to}`,
    ))
    .groupBy(journalLines.accountCode, journalLines.accountNameAr, journalLines.accountNameEn);

  return rows.map(r => ({
    accountCode:   r.accountCode,
    accountNameAr: r.accountNameAr ?? '',
    accountNameEn: r.accountNameEn ?? '',
    netDebit:      Number(r.totalDebit) - Number(r.totalCredit),
  }));
}

export async function GET(request: Request) {
  try {
    const { agencyId, role } = await verifyAuth(request);
    assertRole(role, [...ROLES_ACCOUNTANT_UP]);
    const url  = new URL(request.url);
    const from = url.searchParams.get('from');
    const to   = url.searchParams.get('to');

    if (!from || !to) {
      return NextResponse.json({ error: 'from و to مطلوبان (YYYY-MM-DD)' }, { status: 400 });
    }

    const movs = await getMovements(agencyId, from, to);

    // ── Helpers ───────────────────────────────────────────────────────────────

    function sum(prefix: string): number {
      return movs
        .filter(m => m.accountCode.startsWith(prefix))
        .reduce((s, m) => s + m.netDebit, 0);
    }

    function lines(prefix: string) {
      return movs
        .filter(m => m.accountCode.startsWith(prefix) && m.netDebit !== 0)
        .map(m => ({ code: m.accountCode, nameAr: m.accountNameAr, nameEn: m.accountNameEn, amount: -m.netDebit }));
    }

    // ── A. Operating Activities (indirect method) ─────────────────────────────

    // Net income = Revenue (4xxx credit-normal) minus Expenses (5xxx debit-normal)
    // Revenue accounts: net credit = -netDebit
    const revenueNet  = -sum('4'); // positive = more credits than debits
    const expenseNet  =  sum('5'); // positive = more debits than credits
    const netIncome   = revenueNet - expenseNet;

    // Working capital changes (operating assets/liabilities, excluding cash & bank)
    // AR (12xx): increase in AR = cash OUTFLOW (negative in operating)
    const arChange          = sum('12');          // increase in AR = net debit increase
    const inventoryChange   = sum('13');          // increase in inventory = outflow
    const prepaidChange     = sum('14');          // increase in prepaid = outflow
    // AP: 2000 (supplier), 20xx, and 21xx (airlines/hotels/BSP)
    const apChange          = sum('20') + sum('21');  // increase in AP = inflow
    const vatPayableChange  = sum('220');              // 2200: VAT payable increase = inflow
    // Accrued liabilities: 23xx deposits, 24xx GOSI, 25xx EOSB
    const accruedChange     = sum('23') + sum('24') + sum('25');

    const workingCapitalAdj = -arChange - inventoryChange - prepaidChange - apChange - vatPayableChange - accruedChange;
    const operatingTotal    = netIncome + workingCapitalAdj;

    // ── B. Investing Activities ───────────────────────────────────────────────
    // Fixed assets (16xx): net debit = cash outflow; net credit = proceeds from disposal
    const fixedAssetChange = sum('16');
    const investingTotal   = -fixedAssetChange;

    // ── C. Financing Activities ───────────────────────────────────────────────
    // Long-term debt (26xx+): net credit = borrowing inflow; net debit = repayment
    // Note: 22xx (VAT Payable) is a current operating liability captured above.
    const ltDebtChange     = sum('26') + sum('27') + sum('28') + sum('29');
    // Equity injections (31xx): net credit = capital contribution
    const equityChange     = sum('31');
    const financingTotal   = -ltDebtChange - equityChange;

    // ── D. Net Change in Cash ─────────────────────────────────────────────────
    // Cash & bank accounts (11xx): net debit = net increase in cash
    const cashChange      = sum('11');
    const computedChange  = operatingTotal + investingTotal + financingTotal;

    return NextResponse.json({
      period: { from, to },
      operating: {
        netIncome,
        adjustments: [
          { labelAr: 'تغيير في الذمم المدينة',       labelEn: 'Change in Accounts Receivable', amount: -arChange },
          { labelAr: 'تغيير في المخزون',              labelEn: 'Change in Inventory',            amount: -inventoryChange },
          { labelAr: 'تغيير في المصروفات المدفوعة مقدماً', labelEn: 'Change in Prepaid Expenses', amount: -prepaidChange },
          { labelAr: 'تغيير في الذمم الدائنة',        labelEn: 'Change in Accounts Payable',    amount: -apChange },
          { labelAr: 'تغيير في ضريبة القيمة المضافة', labelEn: 'Change in VAT Payable',         amount: -vatPayableChange },
          { labelAr: 'تغيير في المستحقات',             labelEn: 'Change in Accrued Liabilities', amount: -accruedChange },
        ],
        total: operatingTotal,
      },
      investing: {
        lines: lines('16'),
        total: investingTotal,
      },
      financing: {
        // Display lines must match financingTotal (= -ltDebtChange - equityChange).
        // VAT (22xx) is an operating liability shown under operating, NOT here.
        // For credit-normal debt/equity accounts, cash effect = -netDebit, which is
        // exactly what lines() returns — no sign flip needed.
        lines: [
          ...lines('26'), ...lines('27'), ...lines('28'), ...lines('29'),
          ...lines('31'),
        ],
        total: financingTotal,
      },
      netCashChange:   computedChange,
      cashAndBankChange: cashChange,
      isReconciled:    Math.abs(computedChange - cashChange) < 100, // within 1 SAR tolerance
    });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(JSON.stringify({ event: 'cash_flow_error', error: String(err) }));
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
