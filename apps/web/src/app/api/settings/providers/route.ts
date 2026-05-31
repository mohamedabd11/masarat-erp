import { NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { providerCredentials } from '@/lib/schema';
import { verifyAuth, assertRole, ApiAuthError, ROLES_ADMIN_ONLY } from '@/lib/api-auth';
import { logAudit } from '@/lib/audit';

const VALID_PROVIDERS = ['amadeus', 'sabre', 'galileo', 'worldspan'] as const;

// GET /api/settings/providers
// Lists all provider credentials for the agency — credentials JSONB is NEVER returned.
export async function GET(request: Request) {
  try {
    const { agencyId } = await verifyAuth(request);

    const rows = await db
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
        // credentials intentionally omitted — API keys never sent to client
      })
      .from(providerCredentials)
      .where(eq(providerCredentials.agencyId, agencyId));

    return NextResponse.json({ providers: rows });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(JSON.stringify({ event: 'providers_list_error', error: String(err) }));
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}

// POST /api/settings/providers
// Creates a new provider credential. Admin+ only.
// Body: { providerCode, label?, credentials, isActive? }
export async function POST(request: Request) {
  try {
    const { uid, agencyId, role } = await verifyAuth(request);
    assertRole(role, [...ROLES_ADMIN_ONLY]);

    const body = await request.json() as {
      providerCode: string;
      label?:       string;
      credentials:  unknown;
      isActive?:    boolean;
    };

    if (!body.providerCode || !VALID_PROVIDERS.includes(body.providerCode as typeof VALID_PROVIDERS[number])) {
      return NextResponse.json(
        { error: `providerCode غير صالح — القيم المقبولة: ${VALID_PROVIDERS.join(', ')}` },
        { status: 400 },
      );
    }

    if (!body.credentials || typeof body.credentials !== 'object') {
      return NextResponse.json({ error: 'credentials مطلوبة' }, { status: 400 });
    }

    // Check for existing credential for this provider (unique constraint)
    const [existing] = await db
      .select({ id: providerCredentials.id })
      .from(providerCredentials)
      .where(and(
        eq(providerCredentials.agencyId, agencyId),
        eq(providerCredentials.providerCode, body.providerCode),
      ));

    if (existing) {
      return NextResponse.json(
        { error: 'يوجد بالفعل تكوين لهذا المزود — استخدم PATCH لتحديثه أو أوقف القديم أولاً' },
        { status: 409 },
      );
    }

    const id = crypto.randomUUID();

    await db.insert(providerCredentials).values({
      id,
      agencyId,
      providerCode: body.providerCode,
      label:        body.label?.trim() || null,
      credentials:  body.credentials,
      isActive:     body.isActive ?? true,
    });

    await logAudit({
      agencyId,
      userId:     uid,
      action:     'create',
      resource:   'provider_credential',
      resourceId: id,
      before:     null,
      after:      { providerCode: body.providerCode, label: body.label },
    });

    return NextResponse.json({ id }, { status: 201 });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    // Unique constraint violation (race condition)
    if ((err as { code?: string }).code === '23505') {
      return NextResponse.json(
        { error: 'يوجد بالفعل تكوين لهذا المزود' },
        { status: 409 },
      );
    }
    console.error(JSON.stringify({ event: 'providers_create_error', error: String(err) }));
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
