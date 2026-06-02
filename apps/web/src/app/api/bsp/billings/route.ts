/**
 * GET  /api/bsp/billings          — list BSP billings (paginated)
 * POST /api/bsp/billings          — record a new BSP billing period
 *   On POST, creates a journal entry:
 *     DR BSP Payable 2150 (net remit)
 *     CR (deferred — created when paid, not on billing)
 *
 * PATCH /api/bsp/billings/[id]/pay — mark billing as paid + create GL entry
 *   DR BSP Payable 2150  / CR Bank 1100
 */
import { NextResponse } from 'next/server';
import { eq, and, desc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { bspBillings, journalEntries, journalLines } from '@/lib/schema';
import { verifyAuth, assertRole, ApiAuthError, ROLES_ADMIN_ONLY, ROLES_MANAGER_UP } from '@/lib/api-auth';
import { getNextJournalNumber } from '@/lib/invoice-counter';
import { GL } from '@/lib/gl-accounts';
import { assertPeriodOpen } from '@/lib/period-lock';

export async function GET(request: Request) {
  try {
    const { agencyId, role } = await verifyAuth(request);
    assertRole(role, [...ROLES_MANAGER_UP]);
    const url    = new URL(request.url);
    const limit  = Math.min(100, parseInt(url.searchParams.get('limit') ?? '50', 10) || 50);
    const offset = parseInt(url.searchParams.get('offset') ?? '0', 10) || 0;

    const rows = await db
      .select()
      .from(bspBillings)
      .where(eq(bspBillings.agencyId, agencyId))
      .orderBy(desc(bspBillings.billingPeriod))
      .limit(limit)
      .offset(offset);

    return NextResponse.json({ billings: rows });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { uid, agencyId, role } = await verifyAuth(request);
    assertRole(role, [...ROLES_ADMIN_ONLY]);

    const body = await request.json() as {
      billingPeriod:           string;   // YYYY-MM
      periodType?:             string;
      totalSalesHalalas:       number;
      totalRefundsHalalas?:    number;
      totalCommissionHalalas?: number;
      netRemitHalalas:         number;
      currency?:               string;
      dueDate:                 string;
      bankAccountId?:          string;
      reference?:              string;
      notes?:                  string;
    };

    if (!body.billingPeriod || !body.netRemitHalalas || !body.dueDate) {
      return NextResponse.json({ error: 'billingPeriod, netRemitHalalas, dueDate مطلوبة' }, { status: 400 });
    }

    const id = crypto.randomUUID();

    // Create journal entry for BSP payable:
    //   DR: BSP Clearing (1350)   — asset reducing, now owed to BSP
    //   CR: BSP Payable (2150)    — liability to IATA
    const entryId     = crypto.randomUUID();

    await db.transaction(async tx => {
      // The billing entry is dated to the billing period — block closed periods.
      await assertPeriodOpen(agencyId, body.billingPeriod + '-01', tx);

      // Allocate the journal number inside the transaction so a rollback does not
      // burn a sequence value and concurrent requests cannot collide.
      const entryNumber = await getNextJournalNumber(agencyId, new Date(body.billingPeriod + '-01').getFullYear(), tx);

      await tx.insert(journalEntries).values({
        id:              entryId,
        agencyId,
        entryNumber,
        date:            body.billingPeriod + '-01',
        descriptionAr:   `فاتورة BSP — فترة ${body.billingPeriod}`,
        descriptionEn:   `BSP Billing — Period ${body.billingPeriod}`,
        reference:       body.reference ?? body.billingPeriod,
        source:          'manual',
        sourceId:        id,
        isPosted:        true,
        totalDebitHalalas:  body.netRemitHalalas,
        totalCreditHalalas: body.netRemitHalalas,
        createdBy:       uid,
      });

      await tx.insert(journalLines).values([
        {
          id:             crypto.randomUUID(),
          entryId,
          agencyId,
          accountCode:    GL.bspClearing.code,
          accountNameAr:  GL.bspClearing.ar,
          accountNameEn:  GL.bspClearing.en,
          debitHalalas:   body.netRemitHalalas,
          creditHalalas:  0,
          description:    `BSP ${body.billingPeriod}`,
          sortOrder:      1,
        },
        {
          id:             crypto.randomUUID(),
          entryId,
          agencyId,
          accountCode:    GL.bspPayable.code,
          accountNameAr:  GL.bspPayable.ar,
          accountNameEn:  GL.bspPayable.en,
          debitHalalas:   0,
          creditHalalas:  body.netRemitHalalas,
          description:    `BSP ${body.billingPeriod}`,
          sortOrder:      2,
        },
      ]);

      await tx.insert(bspBillings).values({
        id,
        agencyId,
        billingPeriod:           body.billingPeriod,
        periodType:              body.periodType ?? 'monthly',
        totalSalesHalalas:       body.totalSalesHalalas,
        totalRefundsHalalas:     body.totalRefundsHalalas ?? 0,
        totalCommissionHalalas:  body.totalCommissionHalalas ?? 0,
        netRemitHalalas:         body.netRemitHalalas,
        currency:                body.currency ?? 'SAR',
        dueDate:                 body.dueDate,
        status:                  'pending',
        bankAccountId:           body.bankAccountId ?? null,
        journalEntryId:          entryId,
        reference:               body.reference ?? null,
        notes:                   body.notes ?? null,
        createdBy:               uid,
      });
    });

    return NextResponse.json({ success: true, id, journalEntryId: entryId });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(JSON.stringify({ event: 'bsp_billing_create_error', error: String(err) }));
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
