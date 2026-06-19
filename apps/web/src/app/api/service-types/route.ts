import { NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { serviceTypes } from '@/lib/schema';
import { verifyAuth, assertRole, ApiAuthError, ROLES_MANAGER_UP } from '@/lib/api-auth';

export async function GET(request: Request) {
  try {
    const { agencyId } = await verifyAuth(request);
    const rows = await db
      .select()
      .from(serviceTypes)
      .where(eq(serviceTypes.agencyId, agencyId));
    return NextResponse.json({ serviceTypes: rows });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { agencyId, role } = await verifyAuth(request);
    assertRole(role, [...ROLES_MANAGER_UP]);
    const body = await request.json() as { nameAr: string; nameEn?: string; icon?: string };
    if (!body.nameAr) return NextResponse.json({ error: 'الاسم مطلوب' }, { status: 400 });
    const id = crypto.randomUUID();
    await db.transaction(async (tx) => {
      await tx.insert(serviceTypes).values({
        id, agencyId, nameAr: body.nameAr, nameEn: body.nameEn ?? body.nameAr,
        icon: body.icon ?? 'layers',
      });
    });
    return NextResponse.json({ success: true, id });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
