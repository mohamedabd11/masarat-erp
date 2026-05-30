// POST /api/travel/credentials/:id/enable
import { NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { providerCredentials } from '@/lib/schema';
import { verifyAuth, assertRole, ApiAuthError, BusinessError, ROLES_ADMIN_ONLY } from '@/lib/api-auth';
import { logAudit } from '@/lib/audit';

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const { uid, agencyId, role } = await verifyAuth(request);
    assertRole(role, [...ROLES_ADMIN_ONLY]);

    const credId = params.id;
    const [existing] = await db
      .select({ id: providerCredentials.id, providerCode: providerCredentials.providerCode, label: providerCredentials.label, isActive: providerCredentials.isActive })
      .from(providerCredentials)
      .where(and(eq(providerCredentials.id, credId), eq(providerCredentials.agencyId, agencyId)))
      .limit(1);

    if (!existing) throw new BusinessError('بيانات الاعتماد غير موجودة', 404);
    if (existing.isActive) return NextResponse.json({ success: true, message: 'بيانات الاعتماد مفعّلة بالفعل' });

    await db.update(providerCredentials)
      .set({ isActive: true, updatedAt: new Date() })
      .where(eq(providerCredentials.id, credId));

    await logAudit({
      agencyId, userId: uid,
      action: 'enable', resource: 'provider_credential', resourceId: credId,
      before: { providerCode: existing.providerCode, label: existing.label, isActive: false },
      after:  { isActive: true },
    });

    return NextResponse.json({ success: true, message: 'تم تفعيل بيانات الاعتماد' });
  } catch (err) {
    if (err instanceof ApiAuthError)  return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof BusinessError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(JSON.stringify({ event: 'credential_enable_failed', error: String(err) }));
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
