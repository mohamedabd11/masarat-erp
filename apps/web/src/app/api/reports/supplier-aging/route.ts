/**
 * GET /api/reports/supplier-aging?asOf=YYYY-MM-DD
 *
 * Supplier Accounts Payable Aging Report.
 * Uses suppliers.balance_halalas (positive = agency owes supplier) and
 * buckets payments by age from the asOf date.
 *
 * Buckets: Current (0-30d), 31-60d, 61-90d, 90+d
 */
import { NextResponse } from 'next/server';
import { eq, and, lte, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { suppliers, supplierPayments } from '@/lib/schema';
import { verifyAuth, ApiAuthError } from '@/lib/api-auth';

export async function GET(request: Request) {
  try {
    const { agencyId } = await verifyAuth(request);
    const url   = new URL(request.url);
    const asOf  = url.searchParams.get('asOf') ?? new Date().toISOString().slice(0, 10);
    const asOfDate = new Date(asOf + 'T23:59:59');

    // Load all active suppliers with outstanding balance
    const allSuppliers = await db
      .select()
      .from(suppliers)
      .where(and(
        eq(suppliers.agencyId, agencyId),
        eq(suppliers.isActive, true),
        sql`${suppliers.balanceHalalas} > 0`,
      ));

    if (allSuppliers.length === 0) {
      return NextResponse.json({ asOf, rows: [], totals: { current: 0, days31_60: 0, days61_90: 0, days91plus: 0, total: 0 } });
    }

    // For each supplier, bucket their unpaid/outstanding payments by date
    const supplierIds = allSuppliers.map(s => s.id);

    const payments = await db
      .select({
        supplierId:    supplierPayments.supplierId,
        amountHalalas: supplierPayments.amountHalalas,
        date:          supplierPayments.date,
        status:        supplierPayments.status,
      })
      .from(supplierPayments)
      .where(and(
        eq(supplierPayments.agencyId, agencyId),
        eq(supplierPayments.status, 'completed'),
        lte(sql`${supplierPayments.date}::date`, sql`${asOf}::date`),
      ));

    // Build a map: supplierId → payments array
    const payMap = new Map<string, { amountHalalas: number; daysAgo: number }[]>();
    for (const p of payments) {
      if (!p.supplierId || !supplierIds.includes(p.supplierId)) continue;
      const payDate  = new Date(p.date + 'T00:00:00');
      const daysAgo  = Math.floor((asOfDate.getTime() - payDate.getTime()) / 86_400_000);
      if (!payMap.has(p.supplierId)) payMap.set(p.supplierId, []);
      payMap.get(p.supplierId)!.push({ amountHalalas: p.amountHalalas, daysAgo });
    }

    const rows = allSuppliers.map(s => {
      const pmts = payMap.get(s.id) ?? [];
      // Use supplier.balanceHalalas as total outstanding; distribute across buckets by payment age
      const balance = s.balanceHalalas;
      let allocated  = 0;
      const buckets  = { current: 0, days31_60: 0, days61_90: 0, days91plus: 0 };

      // Sort payments oldest first for FIFO aging
      const sorted = [...pmts].sort((a, b) => b.daysAgo - a.daysAgo);
      for (const p of sorted) {
        const remaining = Math.min(p.amountHalalas, balance - allocated);
        if (remaining <= 0) break;
        if (p.daysAgo <= 30)       buckets.current     += remaining;
        else if (p.daysAgo <= 60)  buckets.days31_60   += remaining;
        else if (p.daysAgo <= 90)  buckets.days61_90   += remaining;
        else                       buckets.days91plus  += remaining;
        allocated += remaining;
      }
      // Any unallocated balance goes to current
      const unallocated = balance - allocated;
      if (unallocated > 0) buckets.current += unallocated;

      return {
        supplierId:   s.id,
        supplierName: s.nameAr,
        supplierType: s.type ?? '',
        ...buckets,
        total: balance,
      };
    }).filter(r => r.total > 0);

    const totals = rows.reduce(
      (acc, r) => ({
        current:    acc.current    + r.current,
        days31_60:  acc.days31_60  + r.days31_60,
        days61_90:  acc.days61_90  + r.days61_90,
        days91plus: acc.days91plus + r.days91plus,
        total:      acc.total      + r.total,
      }),
      { current: 0, days31_60: 0, days61_90: 0, days91plus: 0, total: 0 },
    );

    return NextResponse.json({ asOf, rows, totals });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(JSON.stringify({ event: 'supplier_aging_error', error: String(err) }));
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
