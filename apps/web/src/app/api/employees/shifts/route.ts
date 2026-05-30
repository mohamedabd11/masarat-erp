import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { shifts } from '@/lib/schema';
import { verifyAuth, assertRole, ApiAuthError, ROLES_MANAGER_UP } from '@/lib/api-auth';

export async function GET(request: Request) {
  try {
    const { agencyId } = await verifyAuth(request);
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

    const body = await request.json() as {
      nameAr:      string;
      nameEn?:     string;
      startTime:   string;
      endTime:     string;
      daysOfWeek?: number[];
      isDefault?:  boolean;
    };

    if (!body.nameAr?.trim()) return NextResponse.json({ error: 'اسم الوردية مطلوب' }, { status: 400 });
    if (!/^\d{2}:\d{2}$/.test(body.startTime ?? '') || !/^\d{2}:\d{2}$/.test(body.endTime ?? '')) {
      return NextResponse.json({ error: 'صيغة الوقت يجب أن تكون HH:MM' }, { status: 400 });
    }

    const id = crypto.randomUUID();
    await db.insert(shifts).values({
      id,
      agencyId,
      nameAr:     body.nameAr.trim(),
      nameEn:     body.nameEn ?? null,
      startTime:  body.startTime,
      endTime:    body.endTime,
      daysOfWeek: (body.daysOfWeek ?? null) as never,
      isDefault:  body.isDefault ?? false,
    });

    return NextResponse.json({ success: true, id });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
