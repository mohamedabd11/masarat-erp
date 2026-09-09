import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { shifts } from '@/lib/schema';
import { verifyAuth, assertRole, ApiAuthError, BusinessError, ROLES_MANAGER_UP } from '@/lib/api-auth';
import { requireFeature } from '@/lib/feature-access';
import { isTime24h, validDaysOfWeek } from '@/lib/hr-validation';

export async function GET(request: Request) {
  try {
    const { agencyId } = await verifyAuth(request);
    await requireFeature(agencyId, 'attendance', db);
    const rows = await db.select().from(shifts).where(eq(shifts.agencyId, agencyId));
    return NextResponse.json({ shifts: rows });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { agencyId, role } = await verifyAuth(request);
    assertRole(role, [...ROLES_MANAGER_UP]);
    await requireFeature(agencyId, 'attendance', db);

    const body = await request.json() as {
      nameAr:      string;
      nameEn?:     string;
      startTime:   string;
      endTime:     string;
      daysOfWeek?: number[];
      isDefault?:  boolean;
    };

    if (!body.nameAr?.trim()) return NextResponse.json({ error: 'اسم الوردية مطلوب' }, { status: 400 });
    if (!isTime24h(body.startTime) || !isTime24h(body.endTime)) {
      return NextResponse.json({ error: 'صيغة الوقت يجب أن تكون HH:MM' }, { status: 400 });
    }
    if (body.startTime === body.endTime) return NextResponse.json({ error: 'وقت البداية والنهاية لا يمكن أن يكونا متطابقين' }, { status: 400 });
    if (body.daysOfWeek !== undefined && !validDaysOfWeek(body.daysOfWeek)) {
      return NextResponse.json({ error: 'أيام الوردية غير صالحة' }, { status: 400 });
    }

    const id = crypto.randomUUID();
    await db.transaction(async (tx) => {
      if (body.isDefault) {
        await tx.update(shifts).set({ isDefault: false, updatedAt: new Date() }).where(eq(shifts.agencyId, agencyId));
      }
      await tx.insert(shifts).values({
        id,
        agencyId,
        nameAr:     body.nameAr.trim(),
        nameEn:     body.nameEn?.trim() || null,
        startTime:  body.startTime,
        endTime:    body.endTime,
        daysOfWeek: (body.daysOfWeek ?? null) as never,
        isDefault:  body.isDefault ?? false,
      });
    });

    return NextResponse.json({ success: true, id });
  } catch (err) {
    if (err instanceof ApiAuthError || err instanceof BusinessError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
