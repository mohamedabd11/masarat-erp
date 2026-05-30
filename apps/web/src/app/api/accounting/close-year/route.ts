/**
 * POST /api/accounting/close-year
 * Body: { year: number, notes?: string }
 *
 * Performs a full fiscal year close:
 *  1. Creates the year-end closing journal entry (4xxx/5xxx → 3200)
 *  2. Locks all 12 accounting periods for the year
 *
 * Both steps are idempotent — safe to call multiple times.
 * Editing any period in a closed year is blocked by assertPeriodOpen on every
 * journal-writing route.
 */
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { accountingPeriods } from '@/lib/schema';
import { verifyAuth, assertRole, ApiAuthError, ROLES_ADMIN_ONLY } from '@/lib/api-auth';
import { logAudit } from '@/lib/audit';
import { createYearEndClosingEntry } from '@/lib/fiscal-close';
import type { Tx } from '@/lib/db';

export async function POST(request: Request) {
  try {
    const { uid, agencyId, role } = await verifyAuth(request);
    assertRole(role, [...ROLES_ADMIN_ONLY]);

    const body = await request.json() as { year?: number; notes?: string };
    const year  = body.year;

    if (!year || !Number.isInteger(year) || year < 2000 || year > new Date().getFullYear()) {
      return NextResponse.json(
        { error: `year يجب أن يكون سنة صحيحة بين 2000 و ${new Date().getFullYear()}` },
        { status: 400 },
      );
    }

    const now = new Date();

    const result = await db.transaction(async (tx: Tx) => {
      // 1. Create closing journal entry (idempotent)
      const closing = await createYearEndClosingEntry(agencyId, uid, year, tx);

      // 2. Lock all 12 months for the year
      for (let month = 1; month <= 12; month++) {
        await tx.insert(accountingPeriods)
          .values({
            id:          crypto.randomUUID(),
            agencyId,
            periodYear:  year,
            periodMonth: month,
            isLocked:    true,
            lockedAt:    now,
            lockedBy:    uid,
            notes:       body.notes ?? `إقفال السنة المالية ${year}`,
            createdAt:   now,
            updatedAt:   now,
          })
          .onConflictDoUpdate({
            target: [accountingPeriods.agencyId, accountingPeriods.periodYear, accountingPeriods.periodMonth],
            set: {
              isLocked:  true,
              lockedAt:  now,
              lockedBy:  uid,
              notes:     body.notes ?? `إقفال السنة المالية ${year}`,
              updatedAt: now,
            },
          });
      }

      return closing;
    });

    await logAudit({
      agencyId,
      userId:     uid,
      action:     'create',
      resource:   'fiscal_year_close',
      resourceId: String(year),
      after: {
        year,
        closingEntryId:   result.closingEntryId,
        netIncomeHalalas: result.netIncomeHalalas,
        alreadyClosed:    result.alreadyClosed,
      },
    });

    const netLabel = result.netIncomeHalalas >= 0
      ? `ربح ${(result.netIncomeHalalas / 100).toFixed(2)} ر.س`
      : `خسارة ${(Math.abs(result.netIncomeHalalas) / 100).toFixed(2)} ر.س`;

    return NextResponse.json({
      success:          true,
      year,
      closingEntryId:   result.closingEntryId,
      netIncomeHalalas: result.netIncomeHalalas,
      alreadyClosed:    result.alreadyClosed,
      message:          result.alreadyClosed
        ? `السنة المالية ${year} مقفلة مسبقاً`
        : `تم إقفال السنة المالية ${year} بنجاح — ${netLabel}`,
    });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(JSON.stringify({ event: 'fiscal_year_close_failed', error: String(err) }));
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
