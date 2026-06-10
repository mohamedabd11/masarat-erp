import { NextResponse } from 'next/server';
import { eq, and, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { groupTrips, groupTripMembers } from '@/lib/schema';
import { verifyAuth, assertRole, ApiAuthError, ROLES_AGENT_UP } from '@/lib/api-auth';

type RouteCtx = { params: { id: string } };

const VALID_VISA_STATUSES   = new Set(['pending', 'applied', 'approved', 'received', 'rejected']);
const VALID_MEMBER_STATUSES = new Set(['registered', 'confirmed', 'cancelled']);

export async function POST(req: Request, { params }: RouteCtx) {
  try {
    const { agencyId, role } = await verifyAuth(req);
    assertRole(role, [...ROLES_AGENT_UP]);
    const { id: groupTripId } = params;

    const [trip] = await db.select({ id: groupTrips.id, status: groupTrips.status })
      .from(groupTrips)
      .where(and(eq(groupTrips.id, groupTripId), eq(groupTrips.agencyId, agencyId)));
    if (!trip) return NextResponse.json({ error: 'الرحلة غير موجودة' }, { status: 404 });
    if (trip.status === 'cancelled' || trip.status === 'completed') {
      return NextResponse.json({ error: 'لا يمكن تعديل أعضاء رحلة منتهية أو ملغاة' }, { status: 422 });
    }

    const body = await req.json() as Record<string, unknown>;
    const memberIds  = body['memberIds']  as string[] | undefined;
    const visaStatus = body['visaStatus'] as string   | undefined;
    const status     = body['status']     as string   | undefined;

    if (!Array.isArray(memberIds) || memberIds.length === 0) {
      return NextResponse.json({ error: 'يجب تحديد عضو واحد على الأقل' }, { status: 400 });
    }
    if (memberIds.length > 200) {
      return NextResponse.json({ error: 'لا يمكن تحديث أكثر من 200 عضو في آن واحد' }, { status: 400 });
    }
    if (!visaStatus && !status) {
      return NextResponse.json({ error: 'يجب تحديد حقل واحد على الأقل للتحديث' }, { status: 400 });
    }
    if (visaStatus && !VALID_VISA_STATUSES.has(visaStatus)) {
      return NextResponse.json({ error: 'حالة التأشيرة غير صالحة' }, { status: 400 });
    }
    if (status && !VALID_MEMBER_STATUSES.has(status)) {
      return NextResponse.json({ error: 'حالة العضو غير صالحة' }, { status: 400 });
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (visaStatus) updates['visaStatus'] = visaStatus;
    if (status)     updates['status']     = status;

    const updated = await db.update(groupTripMembers)
      .set(updates)
      .where(and(
        inArray(groupTripMembers.id, memberIds),
        eq(groupTripMembers.groupTripId, groupTripId),
        eq(groupTripMembers.agencyId, agencyId),
      ))
      .returning({ id: groupTripMembers.id });

    return NextResponse.json({ updatedCount: updated.length });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(JSON.stringify({ event: 'bulk_update_members_failed', error: String(err) }));
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
