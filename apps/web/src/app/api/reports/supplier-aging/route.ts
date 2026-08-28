/**
 * GET /api/reports/supplier-aging?asOf=YYYY-MM-DD
 *
 * Supplier Accounts Payable Aging Report.
 * Uses suppliers.balance_halalas (positive = agency owes supplier) and assigns
 * the open balance to invoice obligations by FIFO settlement. Payment dates are
 * not obligation dates and must never be used as the age basis.
 *
 * Buckets: Current (0-30d), 31-60d, 61-90d, 90+d
 */
import { NextResponse } from 'next/server';
import { eq, and, ne, lte, inArray, isNotNull, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { suppliers, bookingLines, invoices, journalLines, journalEntries, chartOfAccounts } from '@/lib/schema';
import { verifyAuth, assertRole, ApiAuthError, ROLES_ACCOUNTANT_UP } from '@/lib/api-auth';
import { allocateSupplierBalanceByAge, type SupplierObligation } from '@/lib/supplier-aging';
import { isStrictIsoDate, todayIsoDate } from '@/lib/report-dates';

export async function GET(request: Request) {
  try {
    const { agencyId, role } = await verifyAuth(request);
    assertRole(role, [...ROLES_ACCOUNTANT_UP]);
    const url   = new URL(request.url);
    const asOf  = url.searchParams.get('asOf') ?? todayIsoDate();
    if (!isStrictIsoDate(asOf)) {
      return NextResponse.json({ error: 'asOf يجب أن يكون تاريخاً صحيحاً بصيغة YYYY-MM-DD' }, { status: 400 });
    }
    const balanceSnapshotDate = todayIsoDate();
    const historicalSnapshotAvailable = asOf === balanceSnapshotDate;

    // ── Reconcile the subledger to the GL control account (2000) ──────────────
    // suppliers.balanceHalalas is maintained at invoice time (CRIT-9) and on
    // payment, but in-house/legacy lines with no supplierId book to 2000 without a
    // supplier attribution. Surface the difference between Σ subledger balances and
    // the GL AP balance so it can never silently diverge.
    const apGlRows = await db
      .select({ netCredit: sql<number>`cast(coalesce(sum(${journalLines.creditHalalas} - ${journalLines.debitHalalas}), 0) as bigint)` })
      .from(journalLines)
      .innerJoin(journalEntries, eq(journalLines.entryId, journalEntries.id))
      .where(and(
        eq(journalLines.agencyId, agencyId),
        eq(journalEntries.isPosted, true),
        ne(journalEntries.source, 'closing'),
        sql`${journalLines.accountCode} = '2000'`,
        lte(sql`${journalEntries.date}`, sql`${asOf}`),
      ));
    const [openingRow] = await db
      .select({ opening: chartOfAccounts.openingBalanceHalalas })
      .from(chartOfAccounts)
      .where(and(eq(chartOfAccounts.agencyId, agencyId), eq(chartOfAccounts.code, '2000')));
    const apGlBalance = Number(apGlRows[0]?.netCredit ?? 0) + Number(openingRow?.opening ?? 0);

    const supBalRows = await db
      .select({ total: sql<number>`cast(coalesce(sum(${suppliers.balanceHalalas}), 0) as bigint)` })
      .from(suppliers)
      .where(eq(suppliers.agencyId, agencyId));
    const supplierBalanceTotal = Number(supBalRows[0]?.total ?? 0);

    const reconciliation = {
      supplierBalanceTotal,
      apGlBalance,
      difference: apGlBalance - supplierBalanceTotal,
      reconciled: historicalSnapshotAvailable && apGlBalance === supplierBalanceTotal,
      balanceSnapshotDate,
      historicalSnapshotAvailable,
    };

    // Inactive suppliers may still have a payable. Never hide a real liability
    // merely because the supplier master record was deactivated.
    const allSuppliers = await db
      .select()
      .from(suppliers)
      .where(and(
        eq(suppliers.agencyId, agencyId),
        sql`${suppliers.balanceHalalas} > 0`,
      ));

    if (allSuppliers.length === 0) {
      return NextResponse.json({ asOf, rows: [], totals: { current: 0, days31_60: 0, days61_90: 0, days91plus: 0, unallocated: 0, total: 0 }, reconciliation });
    }

    // Build the dated AP-obligation lots from original invoices and their
    // supplier-attributed booking lines. Credit notes/refunds reduce the current
    // supplier balance; FIFO allocation below leaves that balance on the newest
    // remaining lots.
    const obligationRows = await db
      .select({
        supplierId:    bookingLines.supplierId,
        date:          invoices.issueDate,
        amountHalalas: sql<number>`cast(coalesce(sum(${bookingLines.totalCostHalalas}), 0) as bigint)`,
      })
      .from(bookingLines)
      .innerJoin(invoices, and(
        eq(invoices.bookingId, bookingLines.bookingId),
        eq(invoices.agencyId, agencyId),
      ))
      .where(and(
        eq(bookingLines.agencyId, agencyId),
        isNotNull(bookingLines.supplierId),
        inArray(invoices.type, ['380', '388']),
        lte(invoices.issueDate, asOf),
        sql`${bookingLines.totalCostHalalas} > 0`,
      ))
      .groupBy(bookingLines.supplierId, invoices.issueDate);

    const obligationMap = new Map<string, SupplierObligation[]>();
    for (const obligation of obligationRows) {
      if (!obligation.supplierId) continue;
      const existing = obligationMap.get(obligation.supplierId) ?? [];
      existing.push({ date: obligation.date, amountHalalas: Number(obligation.amountHalalas) });
      obligationMap.set(obligation.supplierId, existing);
    }

    const rows = allSuppliers.map(s => {
      const buckets = allocateSupplierBalanceByAge(
        s.balanceHalalas,
        obligationMap.get(s.id) ?? [],
        asOf,
      );

      return {
        supplierId:   s.id,
        supplierName: s.nameAr,
        supplierType: s.type ?? '',
        ...buckets,
        total: buckets.total,
      };
    }).filter(r => r.total > 0);

    const totals = rows.reduce(
      (acc, r) => ({
        current:    acc.current    + r.current,
        days31_60:  acc.days31_60  + r.days31_60,
        days61_90:  acc.days61_90  + r.days61_90,
        days91plus: acc.days91plus + r.days91plus,
        unallocated: acc.unallocated + r.unallocated,
        total:      acc.total      + r.total,
      }),
      { current: 0, days31_60: 0, days61_90: 0, days91plus: 0, unallocated: 0, total: 0 },
    );

    return NextResponse.json({ asOf, rows, totals, reconciliation });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(JSON.stringify({ event: 'supplier_aging_error', error: String(err) }));
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
