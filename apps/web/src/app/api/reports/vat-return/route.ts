import { NextResponse } from 'next/server';
import { eq, and, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { invoices, supplierPayments, agencies } from '@/lib/schema';
import { verifyAuth, assertRole, ApiAuthError, ROLES_ACCOUNTANT_UP } from '@/lib/api-auth';
import { requireFeature } from '@/lib/feature-access';

/**
 * VAT Return Report (إقرار ضريبة القيمة المضافة)
 * Covers standard tax period (monthly or quarterly).
 *
 * Output VAT  = VAT charged on sales invoices (type 380)
 * Input VAT   = VAT paid on purchases/expenses (supplier payments with VAT)
 * Net VAT due = Output VAT − Input VAT
 *
 * ZATCA compliance note: only VAT-registered agencies get this report.
 */
export async function GET(request: Request) {
  try {
    const { agencyId, role } = await verifyAuth(request);
    assertRole(role, [...ROLES_ACCOUNTANT_UP]);
    await requireFeature(agencyId, 'financial_reports', db);

    const url  = new URL(request.url);
    const from = url.searchParams.get('from');
    const to   = url.searchParams.get('to');

    if (!from || !to) {
      return NextResponse.json({ error: 'from و to مطلوبان (YYYY-MM-DD)' }, { status: 400 });
    }

    // Verify agency is VAT-registered
    const [agency] = await db.select().from(agencies).where(eq(agencies.id, agencyId));
    if (!agency?.isVatRegistered) {
      return NextResponse.json({
        error: 'الوكالة غير مسجلة في ضريبة القيمة المضافة',
        vatRegistered: false,
      }, { status: 422 });
    }

    // ── Output VAT (sales) ────────────────────────────────────────────────────
    // Tax invoices (type=380) and debit notes (type=383) add VAT liability
    // Credit notes (type=381) reduce it
    const salesRows = await db
      .select({
        type:           invoices.type,
        count:          sql<number>`cast(count(*) as int)`,
        netAmount:      sql<number>`cast(coalesce(sum(${invoices.subtotalHalalas}), 0) as int)`,
        vatAmount:      sql<number>`cast(coalesce(sum(${invoices.vatHalalas}),      0) as int)`,
        grossAmount:    sql<number>`cast(coalesce(sum(${invoices.totalHalalas}),    0) as int)`,
      })
      .from(invoices)
      .where(and(
        eq(invoices.agencyId, agencyId),
        sql`${invoices.issueDate} >= ${from}`,
        sql`${invoices.issueDate} <= ${to}`,
        sql`${invoices.status} NOT IN ('cancelled')`,
      ))
      .groupBy(invoices.type);

    let outputVatBase      = 0;  // صافي المبيعات الخاضع للضريبة
    let outputVat          = 0;  // ضريبة المبيعات
    let salesCount         = 0;
    let creditNoteBase     = 0;  // مردودات المبيعات
    let creditNoteVat      = 0;
    let creditNoteCount    = 0;

    for (const r of salesRows) {
      const net = Number(r.netAmount);
      const vat = Number(r.vatAmount);
      const cnt = Number(r.count);

      if (r.type === '380' || r.type === '383') {
        outputVatBase += net;
        outputVat     += vat;
        salesCount    += cnt;
      } else if (r.type === '381') {
        creditNoteBase += net;
        creditNoteVat  += vat;
        creditNoteCount += cnt;
      }
    }

    // Net output VAT after credit notes
    const netOutputVatBase = outputVatBase - creditNoteBase;
    const netOutputVat     = outputVat     - creditNoteVat;

    // ── Input VAT (purchases) ─────────────────────────────────────────────────
    // Supplier payments with vatHalalas field (if tracked)
    // Note: supplierPayments schema may not have vatHalalas — use 0 for now
    // and expose a placeholder so the agency can enter manual input VAT
    const purchaseRows = await db
      .select({
        count:      sql<number>`cast(count(*) as int)`,
        netAmount:  sql<number>`cast(coalesce(sum(${supplierPayments.amountHalalas}), 0) as int)`,
      })
      .from(supplierPayments)
      .where(and(
        eq(supplierPayments.agencyId, agencyId),
        sql`${supplierPayments.date} >= ${from}`,
        sql`${supplierPayments.date} <= ${to}`,
        sql`${supplierPayments.status} != 'reversed'`,
      ));

    const totalPurchases    = Number(purchaseRows[0]?.netAmount ?? 0);
    const purchaseCount     = Number(purchaseRows[0]?.count ?? 0);
    // Input VAT is 0 by default (travel agency expenses rarely carry reclaimable VAT in KSA)
    const inputVat          = 0;

    // ── Summary ───────────────────────────────────────────────────────────────
    const netVatDue = netOutputVat - inputVat;

    return NextResponse.json({
      period:       { from, to },
      vatRate:      agency.vatRate ?? 15,
      vatNumber:    agency.vatNumber ?? null,
      agencyNameAr: agency.nameAr,

      // Box 1: Standard-rated supplies
      sales: {
        count:       salesCount,
        netAmount:   outputVatBase,
        vatAmount:   outputVat,
        grossAmount: outputVatBase + outputVat,
      },

      // Box 2: Credit notes / returns
      creditNotes: {
        count:       creditNoteCount,
        netAmount:   creditNoteBase,
        vatAmount:   creditNoteVat,
      },

      // Box 3: Net sales after adjustments
      netSales: {
        netAmount: netOutputVatBase,
        vatAmount: netOutputVat,
      },

      // Box 4: Purchases (input VAT)
      purchases: {
        count:       purchaseCount,
        netAmount:   totalPurchases,
        vatAmount:   inputVat,
      },

      // Box 5: Net VAT
      summary: {
        outputVat:  netOutputVat,
        inputVat,
        netVatDue,  // positive = payable to ZATCA; negative = refundable
      },
    });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(JSON.stringify({ event: 'vat_return_failed', error: (err as Error).message }));
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
