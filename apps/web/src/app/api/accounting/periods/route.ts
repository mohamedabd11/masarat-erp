/**
 * GET  /api/accounting/periods          — list all periods for the agency
 * POST /api/accounting/periods          — lock or unlock a period
 *   body: { year, month, isLocked, notes? }
 *
 * When December is locked, a year-end closing entry is automatically created
 * (idempotent — won't duplicate if December is re-locked).
 */
import { NextResponse } from 'next/server';
import { eq, desc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { accountingPeriods } from '@/lib/schema';
import { verifyAuth, assertRole, ApiAuthError, ROLES_ADMIN_ONLY } from '@/lib/api-auth';
import { logAudit } from '@/lib/audit';
import { createYearEndClosingEntry } from '@/lib/fiscal-close';
import type { Tx } from '@/lib/db';

// ── Route handlers ────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  try {
    const { agencyId, role } = await verifyAuth(request);
    assertRole(role, [...ROLES_ADMIN_ONLY]);

    const periods = await db.select().from(accountingPeriods)
      .where(eq(accountingPeriods.agencyId, agencyId))
      .orderBy(desc(accountingPeriods.periodYear), desc(accountingPeriods.periodMonth));

    return NextResponse.json({ periods });
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
      year:     number;
      month:    number;
      isLocked: boolean;
      notes?:   string;
    };

    if (!body.year || !body.month || body.isLocked == null) {
      return NextResponse.json({ error: 'year, month, isLocked مطلوبة' }, { status: 400 });
    }
    if (body.month < 1 || body.month > 12) {
      return NextResponse.json({ error: 'month يجب أن يكون بين 1 و 12' }, { status: 400 });
    }

    const now      = new Date();
    const periodId = crypto.randomUUID();

    await db.transaction(async (tx: Tx) => {
      await tx.insert(accountingPeriods)
        .values({
          id:          periodId,
          agencyId,
          periodYear:  body.year,
          periodMonth: body.month,
          isLocked:    body.isLocked,
          lockedAt:    body.isLocked ? now : null,
          lockedBy:    body.isLocked ? uid : null,
          notes:       body.notes ?? null,
          createdAt:   now,
          updatedAt:   now,
        })
        .onConflictDoUpdate({
          target: [accountingPeriods.agencyId, accountingPeriods.periodYear, accountingPeriods.periodMonth],
          set: {
            isLocked:  body.isLocked,
            lockedAt:  body.isLocked ? now : null,
            lockedBy:  body.isLocked ? uid : null,
            notes:     body.notes ?? null,
            updatedAt: now,
          },
        });

      // Year-end closing: automatically create the closing entry when December is locked
      if (body.isLocked && body.month === 12) {
        await createYearEndClosingEntry(agencyId, uid, body.year, tx);
      }
    });

    const action = body.isLocked ? 'lock_period' : 'unlock_period';
    await logAudit({
      agencyId, userId: uid, action: 'update', resource: 'accounting_period',
      resourceId: `${body.year}-${String(body.month).padStart(2, '0')}`,
      after: { action, year: body.year, month: body.month, notes: body.notes },
    });

    const label = `${body.year}/${String(body.month).padStart(2, '0')}`;
    return NextResponse.json({
      success: true,
      message: body.isLocked ? `الفترة ${label} مقفلة` : `الفترة ${label} مفتوحة`,
    });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(JSON.stringify({ event: 'accounting_periods_failed', error: String(err) }));
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
