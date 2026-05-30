/**
 * PATCH  /api/travel/credentials/:id  — update label or toggle isActive
 * DELETE /api/travel/credentials/:id  — deactivate credential (sets isActive=false)
 *
 * Hard delete is intentionally not supported — credentials are deactivated so
 * the audit trail remains intact.
 */
import { NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { providerCredentials } from '@/lib/schema';
import { verifyAuth, assertRole, ApiAuthError, BusinessError, ROLES_ADMIN_ONLY } from '@/lib/api-auth';
import { encryptCredential } from '@/lib/credential-crypto';
import { checkRateLimit, rateLimitHeaders, getClientIp } from '@/lib/rate-limit';
import { logAudit } from '@/lib/audit';

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const rl = await checkRateLimit(getClientIp(request), 'register');
    if (!rl.success) {
      return NextResponse.json(
        { error: 'طلبات كثيرة جداً، حاول لاحقاً' },
        { status: 429, headers: rateLimitHeaders(rl) },
      );
    }

    const { uid, agencyId, role } = await verifyAuth(request);
    assertRole(role, [...ROLES_ADMIN_ONLY]);

    const credId = params.id;
    const body = await request.json() as {
      label?:    string;
      isActive?: boolean;
      fields?:   Record<string, string>;
    };

    const [existing] = await db
      .select({ id: providerCredentials.id, providerCode: providerCredentials.providerCode })
      .from(providerCredentials)
      .where(and(eq(providerCredentials.id, credId), eq(providerCredentials.agencyId, agencyId)))
      .limit(1);

    if (!existing) throw new BusinessError('بيانات الاعتماد غير موجودة', 404);

    const patch: Record<string, unknown> = { updatedAt: new Date() };

    if (typeof body.label === 'string' && body.label.trim().length > 0) {
      patch['label'] = body.label.trim();
    }
    if (typeof body.isActive === 'boolean') {
      patch['isActive'] = body.isActive;
    }
    if (body.fields && typeof body.fields === 'object') {
      try {
        patch['encryptedPayload'] = encryptCredential(JSON.stringify(body.fields));
      } catch {
        return NextResponse.json(
          { error: 'خطأ في تشفير بيانات الاعتماد — تأكد من إعداد CREDENTIAL_ENCRYPTION_KEY' },
          { status: 503 },
        );
      }
    }

    await db.update(providerCredentials)
      .set(patch)
      .where(eq(providerCredentials.id, credId));

    await logAudit({
      agencyId,
      userId:     uid,
      action:     'update',
      resource:   'provider_credential',
      resourceId: credId,
      after: { label: patch['label'], isActive: patch['isActive'], fieldsUpdated: !!body.fields },
    });

    return NextResponse.json({ success: true, message: 'تم تحديث بيانات الاعتماد' });
  } catch (err) {
    if (err instanceof ApiAuthError)  return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof BusinessError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(JSON.stringify({ event: 'travel_credentials_patch_failed', error: String(err) }));
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const rl = await checkRateLimit(getClientIp(request), 'register');
    if (!rl.success) {
      return NextResponse.json(
        { error: 'طلبات كثيرة جداً، حاول لاحقاً' },
        { status: 429, headers: rateLimitHeaders(rl) },
      );
    }

    const { uid, agencyId, role } = await verifyAuth(request);
    assertRole(role, [...ROLES_ADMIN_ONLY]);

    const credId = params.id;

    const [existing] = await db
      .select({ id: providerCredentials.id, providerCode: providerCredentials.providerCode, label: providerCredentials.label })
      .from(providerCredentials)
      .where(and(eq(providerCredentials.id, credId), eq(providerCredentials.agencyId, agencyId)))
      .limit(1);

    if (!existing) throw new BusinessError('بيانات الاعتماد غير موجودة', 404);

    // Deactivate rather than hard-delete so audit trail is preserved
    await db.update(providerCredentials)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(providerCredentials.id, credId));

    await logAudit({
      agencyId,
      userId:     uid,
      action:     'delete',
      resource:   'provider_credential',
      resourceId: credId,
      before: { providerCode: existing.providerCode, label: existing.label },
    });

    return NextResponse.json({ success: true, message: 'تم إلغاء تفعيل بيانات الاعتماد' });
  } catch (err) {
    if (err instanceof ApiAuthError)  return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof BusinessError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(JSON.stringify({ event: 'travel_credentials_delete_failed', error: String(err) }));
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
