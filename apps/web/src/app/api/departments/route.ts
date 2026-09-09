import { NextResponse } from 'next/server';
import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { departments } from '@/lib/schema';
import { ApiAuthError, BusinessError, ROLES_MANAGER_UP, assertRole, verifyAuth } from '@/lib/api-auth';
import { requireFeature } from '@/lib/feature-access';

function normalizeCode(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 64);
}

export async function GET(request: Request) {
  try {
    const { agencyId } = await verifyAuth(request);
    await requireFeature(agencyId, 'employees', db);
    const rows = await db.select().from(departments)
      .where(eq(departments.agencyId, agencyId))
      .orderBy(asc(departments.nameAr));
    return NextResponse.json({ departments: rows });
  } catch (err) {
    if (err instanceof ApiAuthError || err instanceof BusinessError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { agencyId, role } = await verifyAuth(request);
    assertRole(role, [...ROLES_MANAGER_UP]);
    await requireFeature(agencyId, 'employees', db);
    const body = await request.json() as { code?: string; nameAr?: string; nameEn?: string };
    const nameAr = body.nameAr?.trim() ?? '';
    if (!nameAr || nameAr.length > 120) return NextResponse.json({ error: 'اسم القسم مطلوب وبحد أقصى 120 حرفاً' }, { status: 400 });
    const code = normalizeCode(body.code || body.nameEn || `dept_${Date.now()}`);
    if (!code) return NextResponse.json({ error: 'رمز القسم غير صالح' }, { status: 400 });
    const id = crypto.randomUUID();
    await db.insert(departments).values({ id, agencyId, code, nameAr, nameEn: body.nameEn?.trim() || null });
    return NextResponse.json({ success: true, id }, { status: 201 });
  } catch (err) {
    if (err instanceof ApiAuthError || err instanceof BusinessError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === '23505') {
      return NextResponse.json({ error: 'اسم القسم أو رمزه مستخدم مسبقاً' }, { status: 409 });
    }
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
