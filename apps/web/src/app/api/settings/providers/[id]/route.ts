import { NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { providerCredentials } from '@/lib/schema';
import { verifyAuth, assertRole, ApiAuthError, ROLES_ADMIN_ONLY } from '@/lib/api-auth';
import { logAudit } from '@/lib/audit';
import { encryptJson } from '@/lib/crypto';

// GET /api/settings/providers/:id
// Returns a single credential — credentials JSONB is NEVER returned.
export async function GET(
  request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const { agencyId } = await verifyAuth(request);

    const [row] = await db
      .select({
        id:           providerCredentials.id,
        agencyId:     providerCredentials.agencyId,
        providerCode: providerCredentials.providerCode,
        label:        providerCredentials.label,
        isActive:     providerCredentials.isActive,
        testedAt:     providerCredentials.testedAt,
        testStatus:   providerCredentials.testStatus,
        testError:    providerCredentials.testError,
        createdAt:    providerCredentials.createdAt,
        updatedAt:    providerCredentials.updatedAt,
        // credentials intentionally omitted
      })
      .from(providerCredentials)
      .where(and(
        eq(providerCredentials.id, params.id),
        eq(providerCredentials.agencyId, agencyId),
      ));

    if (!row) {
      return NextResponse.json({ error: 'التكوين غير موجود' }, { status: 404 });
    }

    return NextResponse.json({ provider: row });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(JSON.stringify({ event: 'provider_get_error', error: String(err) }));
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}

// PATCH /api/settings/providers/:id
// Updates label, isActive, or replaces credentials. Admin+ only.
// Body: { label?, isActive?, credentials? }
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const { uid, agencyId, role } = await verifyAuth(request);
    assertRole(role, [...ROLES_ADMIN_ONLY]);

    const body = await request.json() as {
      label?:       string;
      isActive?:    boolean;
      credentials?: unknown;
    };

    const [existing] = await db
      .select({
        id:           providerCredentials.id,
        providerCode: providerCredentials.providerCode,
        label:        providerCredentials.label,
        isActive:     providerCredentials.isActive,
      })
      .from(providerCredentials)
      .where(and(
        eq(providerCredentials.id, params.id),
        eq(providerCredentials.agencyId, agencyId),
      ));

    if (!existing) {
      return NextResponse.json({ error: 'التكوين غير موجود' }, { status: 404 });
    }

    const patch: Record<string, unknown> = { updatedAt: new Date() };

    if (body.label !== undefined)       patch.label       = body.label.trim() || null;
    if (body.isActive !== undefined)    patch.isActive    = body.isActive;
    if (body.credentials !== undefined) {
      if (!body.credentials || typeof body.credentials !== 'object') {
        return NextResponse.json({ error: 'credentials يجب أن تكون كائن JSON صالح' }, { status: 400 });
      }
      patch.credentials = await encryptJson(body.credentials);  // encrypted at rest
      // Reset test status when credentials change — previous test result is no longer valid
      patch.testStatus = null;
      patch.testError  = null;
      patch.testedAt   = null;
    }

    await db.update(providerCredentials)
      .set(patch as Partial<typeof providerCredentials.$inferInsert>)
      .where(and(
        eq(providerCredentials.id, params.id),
        eq(providerCredentials.agencyId, agencyId),
      ));

    await logAudit({
      agencyId,
      userId:     uid,
      action:     'update',
      resource:   'provider_credential',
      resourceId: params.id,
      before:     { label: existing.label, isActive: existing.isActive },
      after:      { label: body.label, isActive: body.isActive, credentialsChanged: body.credentials !== undefined },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(JSON.stringify({ event: 'provider_patch_error', error: String(err) }));
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}

// DELETE /api/settings/providers/:id
// Hard-deletes the credential record. Admin+ only.
// Warning: any tickets referencing this credentialId will retain the FK (no cascade).
export async function DELETE(
  request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const { uid, agencyId, role } = await verifyAuth(request);
    assertRole(role, [...ROLES_ADMIN_ONLY]);

    const [existing] = await db
      .select({ id: providerCredentials.id, providerCode: providerCredentials.providerCode })
      .from(providerCredentials)
      .where(and(
        eq(providerCredentials.id, params.id),
        eq(providerCredentials.agencyId, agencyId),
      ));

    if (!existing) {
      return NextResponse.json({ error: 'التكوين غير موجود' }, { status: 404 });
    }

    await db.delete(providerCredentials)
      .where(and(
        eq(providerCredentials.id, params.id),
        eq(providerCredentials.agencyId, agencyId),
      ));

    await logAudit({
      agencyId,
      userId:     uid,
      action:     'delete',
      resource:   'provider_credential',
      resourceId: params.id,
      before:     { providerCode: existing.providerCode },
      after:      null,
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(JSON.stringify({ event: 'provider_delete_error', error: String(err) }));
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
