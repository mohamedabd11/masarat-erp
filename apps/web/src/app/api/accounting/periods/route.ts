/**
 * GET  /api/accounting/periods          — list all periods for the agency
 * POST /api/accounting/periods          — lock or unlock a period
 *   body: { year, month, isLocked, notes? }
 */
import { NextResponse } from 'next/server';
import { eq, and, desc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { accountingPeriods } from '@/lib/schema';
import { verifyAuth, assertRole, ApiAuthError, ROLES_ADMIN_ONLY } from '@/lib/api-auth';
import { logAudit } from '@/lib/audit';

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

    const now     = new Date();
    const periodId = crypto.randomUUID();

    await db.insert(accountingPeriods)
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
