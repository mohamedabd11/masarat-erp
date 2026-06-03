import { NextResponse } from 'next/server';
import { eq, desc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { suppliers } from '@/lib/schema';
import { verifyAuth, assertRole, ApiAuthError, ROLES_AGENT_UP } from '@/lib/api-auth';

export async function GET(request: Request) {
  try {
    const { agencyId } = await verifyAuth(request);
    const rows = await db.select().from(suppliers).where(eq(suppliers.agencyId, agencyId)).orderBy(desc(suppliers.createdAt));
    return NextResponse.json({ suppliers: rows });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { uid, agencyId, role } = await verifyAuth(request);
    assertRole(role, [...ROLES_AGENT_UP]);
    const body = await request.json() as {
      nameAr: string; nameEn?: string; type?: string; phone?: string;
      email?: string; vatNumber?: string; notes?: string;
    };
    if (!body.nameAr) return NextResponse.json({ error: 'الاسم مطلوب' }, { status: 400 });
    const id = crypto.randomUUID();
    await db.insert(suppliers).values({ id, agencyId, nameAr: body.nameAr, nameEn: body.nameEn ?? null, type: body.type ?? null, phone: body.phone ?? null, email: body.email ?? null, vatNumber: body.vatNumber ?? null, notes: body.notes ?? null });
    return NextResponse.json({ success: true, id });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
