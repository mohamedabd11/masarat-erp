import { NextResponse } from 'next/server';
import { eq, and, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { groupTrips, groupTripMembers } from '@/lib/schema';
import { verifyAuth, assertRole, ApiAuthError, BusinessError, ROLES_MANAGER_UP } from '@/lib/api-auth';

type RouteCtx = { params: { id: string } };

const VALID_STATUSES = new Set(['planning', 'open', 'closed', 'departed', 'completed', 'cancelled']);

const TERMINAL = new Set(['completed', 'cancelled']);

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  planning:  ['open', 'cancelled'],
  open:      ['closed', 'cancelled'],
  closed:    ['departed', 'cancelled'],
  departed:  ['completed'],
  completed: [],
  cancelled: [],
};

// ── GET — trip detail + member stats ─────────────────────────────────────────
export async function GET(_req: Request, { params }: RouteCtx) {
  try {
    const { agencyId } = await verifyAuth(_req);
    const { id } = params;

    const [trip] = await db.select()
      .from(groupTrips)
      .where(and(eq(groupTrips.id, id), eq(groupTrips.agencyId, agencyId)));
    if (!trip) return NextResponse.json({ error: 'الرحلة غير موجودة' }, { status: 404 });

    const [stats] = await db.select({
      total:       sql<number>`count(*)::int`,
      confirmed:   sql<number>`sum(case when ${groupTripMembers.status} = 'confirmed' then 1 else 0 end)::int`,
      cancelled:   sql<number>`sum(case when ${groupTripMembers.status} = 'cancelled' then 1 else 0 end)::int`,
      visaPending: sql<number>`sum(case when ${groupTripMembers.visaStatus} = 'pending' then 1 else 0 end)::int`,
      visaApplied: sql<number>`sum(case when ${groupTripMembers.visaStatus} = 'applied' then 1 else 0 end)::int`,
      visaApproved: sql<number>`sum(case when ${groupTripMembers.visaStatus} IN ('approved','received') then 1 else 0 end)::int`,
      visaRejected: sql<number>`sum(case when ${groupTripMembers.visaStatus} = 'rejected' then 1 else 0 end)::int`,
    })
      .from(groupTripMembers)
      .where(and(
        eq(groupTripMembers.groupTripId, id),
        eq(groupTripMembers.agencyId, agencyId),
      ));

    return NextResponse.json({ trip, stats: stats ?? { total: 0, confirmed: 0, cancelled: 0, visaPending: 0, visaApplied: 0, visaApproved: 0, visaRejected: 0 } });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}

// ── PATCH — update trip details or status ────────────────────────────────────
export async function PATCH(req: Request, { params }: RouteCtx) {
  try {
    const { agencyId, role } = await verifyAuth(req);
    assertRole(role, [...ROLES_MANAGER_UP]);
    const { id } = params;

    const [existing] = await db.select({ id: groupTrips.id, status: groupTrips.status })
      .from(groupTrips)
      .where(and(eq(groupTrips.id, id), eq(groupTrips.agencyId, agencyId)));
    if (!existing) return NextResponse.json({ error: 'الرحلة غير موجودة' }, { status: 404 });
    if (TERMINAL.has(existing.status)) {
      return NextResponse.json({ error: 'لا يمكن تعديل رحلة مكتملة أو ملغاة' }, { status: 422 });
    }

    const body = await req.json() as Record<string, unknown>;
    const now  = new Date();

    if (body['status'] !== undefined) {
      const newStatus = body['status'] as string;
      if (!VALID_STATUSES.has(newStatus)) {
        return NextResponse.json({ error: 'حالة غير صالحة' }, { status: 400 });
      }
      const allowed = ALLOWED_TRANSITIONS[existing.status] ?? [];
      if (newStatus !== existing.status && !allowed.includes(newStatus)) {
        return NextResponse.json({ error: `لا يمكن الانتقال من '${existing.status}' إلى '${newStatus}'` }, { status: 422 });
      }
    }

    const STRIP = new Set(['id', 'agencyId', 'createdBy', 'createdAt']);
    const patch: Record<string, unknown> = { updatedAt: now };
    for (const [k, v] of Object.entries(body)) {
      if (!STRIP.has(k)) patch[k] = v;
    }

    await db.update(groupTrips)
      .set(patch as Partial<typeof groupTrips.$inferInsert>)
      .where(and(eq(groupTrips.id, id), eq(groupTrips.agencyId, agencyId)));

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof BusinessError)  return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}

// ── DELETE — cancel trip ──────────────────────────────────────────────────────
export async function DELETE(req: Request, { params }: RouteCtx) {
  try {
    const { agencyId, role } = await verifyAuth(req);
    assertRole(role, [...ROLES_MANAGER_UP]);
    const { id } = params;

    const [existing] = await db.select({ id: groupTrips.id, status: groupTrips.status })
      .from(groupTrips)
      .where(and(eq(groupTrips.id, id), eq(groupTrips.agencyId, agencyId)));
    if (!existing) return NextResponse.json({ error: 'الرحلة غير موجودة' }, { status: 404 });
    if (existing.status === 'cancelled') {
      return NextResponse.json({ error: 'الرحلة ملغاة بالفعل' }, { status: 400 });
    }
    if (existing.status === 'completed') {
      return NextResponse.json({ error: 'لا يمكن إلغاء رحلة مكتملة' }, { status: 422 });
    }

    await db.update(groupTrips)
      .set({ status: 'cancelled', updatedAt: new Date() })
      .where(and(eq(groupTrips.id, id), eq(groupTrips.agencyId, agencyId)));

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof BusinessError)  return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
