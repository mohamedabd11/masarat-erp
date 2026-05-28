import { NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { costCenters } from '@/lib/schema';
import { verifyAuth, assertRole, ApiAuthError, ROLES_MANAGER_UP } from '@/lib/api-auth';

export async function GET(request: Request) {
  try {
    const { agencyId } = await verifyAuth(request);
    const rows = await db.select().from(costCenters)
      .where(eq(costCenters.agencyId, agencyId));
    return NextResponse.json({ costCenters: rows });
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
      code:     string;
      nameAr:   string;
      nameEn?:  string;
      type?:    string;
      parentId?: string;
      notes?:   string;
    };

    if (!body.code?.trim() || !body.nameAr?.trim()) {
      return NextResponse.json({ error: 'الكود والاسم مطلوبان' }, { status: 400 });
    }

    const VALID_TYPES = new Set(['department', 'project', 'branch', 'product']);
    const type = body.type ?? 'department';
    if (!VALID_TYPES.has(type)) {
      return NextResponse.json({ error: 'نوع مركز التكلفة غير صالح' }, { status: 400 });
    }

    const id = crypto.randomUUID();
    await db.insert(costCenters).values({
      id,
      agencyId,
      code:     body.code.trim(),
      nameAr:   body.nameAr.trim(),
      nameEn:   body.nameEn  ?? null,
      type,
      parentId: body.parentId ?? null,
      notes:    body.notes    ?? null,
    });

    return NextResponse.json({ success: true, id });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    const msg = (err as Error).message ?? '';
    if (msg.includes('cost_centers_agency_code_uq')) {
      return NextResponse.json({ error: 'كود مركز التكلفة موجود مسبقاً' }, { status: 409 });
    }
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
