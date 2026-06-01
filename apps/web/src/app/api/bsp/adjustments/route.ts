/**
 * GET  /api/bsp/adjustments       — list ADM/ACM adjustments
 * POST /api/bsp/adjustments       — record an ADM or ACM
 *
 * ADM (Agency Debit Memo): IATA charges agency for errors/violations.
 *   Journal: DR ADM Expense (5420) / CR BSP Payable (2150)
 *
 * ACM (Agency Credit Memo): IATA credits agency (e.g. commission overclaim reversal credit).
 *   Journal: DR BSP Payable (2150) / CR ADM Recovery Income (4420)
 */
import { NextResponse } from 'next/server';
import { eq, and, desc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { bspAdjustments, journalEntries, journalLines } from '@/lib/schema';
import { verifyAuth, assertRole, ApiAuthError, ROLES_ADMIN_ONLY } from '@/lib/api-auth';
import { getNextJournalNumber } from '@/lib/invoice-counter';

export async function GET(request: Request) {
  try {
    const { agencyId } = await verifyAuth(request);
    const url   = new URL(request.url);
    const type  = url.searchParams.get('type');    // ADM | ACM | null = both
    const limit = Math.min(100, parseInt(url.searchParams.get('limit') ?? '50', 10) || 50);

    const conds = [eq(bspAdjustments.agencyId, agencyId)];
    if (type === 'ADM' || type === 'ACM') conds.push(eq(bspAdjustments.type, type));

    const rows = await db
      .select()
      .from(bspAdjustments)
      .where(and(...conds))
      .orderBy(desc(bspAdjustments.issueDate))
      .limit(limit);

    return NextResponse.json({ adjustments: rows });
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
      type:             'ADM' | 'ACM';
      referenceNumber:  string;
      issueDate:        string;
      dueDate?:         string;
      amountHalalas:    number;
      currency?:        string;
      reason:           string;
      airlineCode?:     string;
      ticketNumbers?:   string;
      bspBillingId?:    string;
      notes?:           string;
    };

    if (!body.type || !['ADM', 'ACM'].includes(body.type)) {
      return NextResponse.json({ error: 'النوع يجب أن يكون ADM أو ACM' }, { status: 400 });
    }
    if (!body.referenceNumber || !body.issueDate || !body.amountHalalas || !body.reason) {
      return NextResponse.json({ error: 'رقم المرجع, تاريخ الإصدار, المبلغ, والسبب مطلوبة' }, { status: 400 });
    }

    const id          = crypto.randomUUID();
    const entryNumber = await getNextJournalNumber(agencyId, db);
    const entryId     = crypto.randomUUID();
    const isADM       = body.type === 'ADM';

    await db.transaction(async tx => {
      await tx.insert(journalEntries).values({
        id:              entryId,
        agencyId,
        entryNumber,
        date:            body.issueDate,
        descriptionAr:   `${body.type} — ${body.referenceNumber}${body.airlineCode ? ` (${body.airlineCode})` : ''}`,
        descriptionEn:   `${body.type} — ${body.referenceNumber}${body.airlineCode ? ` (${body.airlineCode})` : ''}`,
        reference:       body.referenceNumber,
        source:          'manual',
        sourceId:        id,
        isPosted:        true,
        totalDebitHalalas:  body.amountHalalas,
        totalCreditHalalas: body.amountHalalas,
        createdBy:       uid,
      });

      // ADM: DR ADM Expense (5420) / CR BSP Payable (2150)
      // ACM: DR BSP Payable (2150) / CR ADM Recovery (4420)
      await tx.insert(journalLines).values([
        {
          id:             crypto.randomUUID(),
          entryId,
          agencyId,
          accountCode:    isADM ? '5420' : '2150',
          accountNameAr:  isADM ? 'مصروف ADM'      : 'مستحقات BSP',
          accountNameEn:  isADM ? 'ADM Expense'     : 'BSP Payable',
          debitHalalas:   body.amountHalalas,
          creditHalalas:  0,
          description:    `${body.type} ${body.referenceNumber}`,
          sortOrder:      1,
        },
        {
          id:             crypto.randomUUID(),
          entryId,
          agencyId,
          accountCode:    isADM ? '2150' : '4420',
          accountNameAr:  isADM ? 'مستحقات BSP'    : 'إيراد استرداد ADM',
          accountNameEn:  isADM ? 'BSP Payable'     : 'ADM Recovery Income',
          debitHalalas:   0,
          creditHalalas:  body.amountHalalas,
          description:    `${body.type} ${body.referenceNumber}`,
          sortOrder:      2,
        },
      ]);

      await tx.insert(bspAdjustments).values({
        id,
        agencyId,
        type:            body.type,
        referenceNumber: body.referenceNumber,
        issueDate:       body.issueDate,
        dueDate:         body.dueDate ?? null,
        amountHalalas:   body.amountHalalas,
        currency:        body.currency ?? 'SAR',
        reason:          body.reason,
        airlineCode:     body.airlineCode ?? null,
        ticketNumbers:   body.ticketNumbers ?? null,
        status:          'pending',
        bspBillingId:    body.bspBillingId ?? null,
        journalEntryId:  entryId,
        notes:           body.notes ?? null,
        createdBy:       uid,
      });
    });

    return NextResponse.json({ success: true, id, journalEntryId: entryId });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(JSON.stringify({ event: 'bsp_adjustment_create_error', error: String(err) }));
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
