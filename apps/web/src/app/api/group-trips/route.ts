import { NextResponse } from 'next/server';
import { eq, and, ilike, desc, inArray, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { groupTrips, groupTripMembers } from '@/lib/schema';
import { verifyAuth, assertRole, ApiAuthError, BusinessError, ROLES_AGENT_UP, ROLES_MANAGER_UP } from '@/lib/api-auth';

const VALID_STATUSES = new Set(['planning', 'open', 'closed', 'departed', 'completed', 'cancelled']);
const VALID_SERVICE_TYPES = new Set(['umrah', 'hajj', 'package', 'flight_hotel', 'other']);

// ── GET — list group trips ────────────────────────────────────────────────────
export async function GET(req: Request) {
  try {
    const { agencyId } = await verifyAuth(req);
    const url    = new URL(req.url);
    const status = url.searchParams.get('status') ?? '';
    const q      = url.searchParams.get('q') ?? '';
    const page   = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10));
    const limit  = Math.min(50, Math.max(1, parseInt(url.searchParams.get('limit') ?? '20', 10)));
    const offset = (page - 1) * limit;

    const filters = [eq(groupTrips.agencyId, agencyId)];
    if (status && VALID_STATUSES.has(status)) {
      filters.push(eq(groupTrips.status, status));
    }
    if (q.trim()) {
      filters.push(ilike(groupTrips.name, `%${q.trim()}%`));
    }

    const rows = await db.select()
      .from(groupTrips)
      .where(and(...filters))
      .orderBy(desc(groupTrips.createdAt))
      .limit(limit)
      .offset(offset);

    // Attach member counts
    const ids = rows.map((r) => r.id);
    const counts: Record<string, { total: number; confirmed: number; visaApproved: number }> = {};
    if (ids.length > 0) {
      const memberStats = await db.select({
        groupTripId: groupTripMembers.groupTripId,
        total:       sql<number>`count(*)::int`,
        confirmed:   sql<number>`sum(case when ${groupTripMembers.status} = 'confirmed' then 1 else 0 end)::int`,
        visaApproved: sql<number>`sum(case when ${groupTripMembers.visaStatus} IN ('approved','received') then 1 else 0 end)::int`,
      })
        .from(groupTripMembers)
        .where(and(
          eq(groupTripMembers.agencyId, agencyId),
          inArray(groupTripMembers.groupTripId, ids),
          sql`${groupTripMembers.status} != 'cancelled'`,
        ))
        .groupBy(groupTripMembers.groupTripId);

      for (const s of memberStats) {
        counts[s.groupTripId] = { total: s.total, confirmed: s.confirmed, visaApproved: s.visaApproved };
      }
    }

    const trips = rows.map((r) => ({
      ...r,
      memberCount:      counts[r.id]?.total        ?? 0,
      confirmedCount:   counts[r.id]?.confirmed    ?? 0,
      visaApprovedCount: counts[r.id]?.visaApproved ?? 0,
    }));

    return NextResponse.json({ trips, page, limit });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}

// ── POST — create group trip ──────────────────────────────────────────────────
export async function POST(req: Request) {
  try {
    const { uid, agencyId, role } = await verifyAuth(req);
    assertRole(role, [...ROLES_MANAGER_UP]);

    const body = await req.json() as Record<string, unknown>;
    const name = (body['name'] as string | undefined)?.trim();
    if (!name) return NextResponse.json({ error: 'اسم الرحلة مطلوب' }, { status: 400 });

    const serviceType = (body['serviceType'] as string | undefined) ?? 'umrah';
    if (!VALID_SERVICE_TYPES.has(serviceType)) {
      return NextResponse.json({ error: 'نوع الخدمة غير صالح' }, { status: 400 });
    }

    const capacity = body['capacity'] !== undefined ? Number(body['capacity']) : null;
    if (capacity !== null && (!Number.isInteger(capacity) || capacity < 1)) {
      return NextResponse.json({ error: 'الطاقة الاستيعابية يجب أن تكون عدداً صحيحاً موجباً' }, { status: 400 });
    }

    const now = new Date();
    const [trip] = await db.insert(groupTrips).values({
      id:                    crypto.randomUUID(),
      agencyId,
      name,
      serviceType,
      departureDate:         (body['departureDate'] as string | undefined)?.trim() || null,
      returnDate:            (body['returnDate']    as string | undefined)?.trim() || null,
      capacity,
      pricePerPersonHalalas: body['pricePerPersonHalalas'] !== undefined ? Number(body['pricePerPersonHalalas']) : 0,
      status:                'planning',
      notes:                 (body['notes'] as string | undefined)?.trim() || null,
      createdBy:             uid,
      createdAt:             now,
      updatedAt:             now,
    }).returning();

    return NextResponse.json({ trip }, { status: 201 });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof BusinessError)  return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(JSON.stringify({ event: 'group_trip_create_failed', error: String(err) }));
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
