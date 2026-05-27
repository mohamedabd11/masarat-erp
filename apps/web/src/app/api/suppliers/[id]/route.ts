import { NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { suppliers } from '@/lib/schema';
import { verifyAuth, ApiAuthError } from '@/lib/api-auth';

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const { agencyId } = await verifyAuth(request);
    const body = await request.json() as Partial<{
      nameAr: string; nameEn: string | null; type: string | null;
      phone: string | null; email: string | null; vatNumber: string | null;
      notes: string | null; isActive: boolean;
    }>;
    const now = new Date();
    await db.update(suppliers).set({ ...body, updatedAt: now })
      .where(and(eq(suppliers.id, params.id), eq(suppliers.agencyId, agencyId)));
    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
