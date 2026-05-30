/**
 * GET  /api/travel/credentials  — list agency's configured provider credentials
 * POST /api/travel/credentials  — store new provider credential (payload encrypted at rest)
 *
 * Security notes:
 *  - GET never returns encryptedPayload — only metadata (id, providerCode, label, isActive)
 *  - POST encrypts the credential JSON with AES-256-GCM before persisting
 *  - Only admin/owner roles can write; all authenticated roles can read
 */
import { NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { providerCredentials } from '@/lib/schema';
import { verifyAuth, assertRole, ApiAuthError, ROLES_ADMIN_ONLY } from '@/lib/api-auth';
import { encryptCredential } from '@/lib/credential-crypto';
import { SUPPORTED_PROVIDERS } from '@masarat/travel-providers';
import type { ProviderCode } from '@masarat/travel-providers';
import { checkRateLimit, rateLimitHeaders, getClientIp } from '@/lib/rate-limit';
import { logAudit } from '@/lib/audit';

const VALID_CODES = new Set<string>(SUPPORTED_PROVIDERS.map(p => p.code));

export async function GET(request: Request) {
  try {
    const rl = await checkRateLimit(getClientIp(request), 'api');
    if (!rl.success) {
      return NextResponse.json(
        { error: 'طلبات كثيرة جداً، حاول لاحقاً' },
        { status: 429, headers: rateLimitHeaders(rl) },
      );
    }

    const { agencyId } = await verifyAuth(request);

    const rows = await db
      .select({
        id:           providerCredentials.id,
        providerCode: providerCredentials.providerCode,
        label:        providerCredentials.label,
        isActive:     providerCredentials.isActive,
        createdAt:    providerCredentials.createdAt,
        updatedAt:    providerCredentials.updatedAt,
      })
      .from(providerCredentials)
      .where(eq(providerCredentials.agencyId, agencyId));

    return NextResponse.json({ credentials: rows });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}

export async function POST(request: Request) {
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

    const body = await request.json() as {
      providerCode?: string;
      label?:        string;
      fields?:       Record<string, string>;
    };

    const { providerCode, label, fields } = body;

    if (!providerCode || !VALID_CODES.has(providerCode)) {
      return NextResponse.json(
        { error: `مزود غير معروف. المزودون المدعومون: ${[...VALID_CODES].join(', ')}` },
        { status: 400 },
      );
    }
    if (!label || label.trim().length === 0) {
      return NextResponse.json({ error: 'label مطلوب' }, { status: 400 });
    }
    if (!fields || typeof fields !== 'object') {
      return NextResponse.json({ error: 'fields مطلوب' }, { status: 400 });
    }

    // Validate required fields for this provider
    const provider = SUPPORTED_PROVIDERS.find(p => p.code === providerCode);
    const missing  = provider?.requiredFields
      .filter(f => !f.isSecret)                          // only validate non-secret presence
      .filter(f => !fields[f.key]?.trim())
      .map(f => f.key) ?? [];

    if (missing.length > 0) {
      return NextResponse.json(
        { error: `الحقول التالية مطلوبة: ${missing.join(', ')}` },
        { status: 400 },
      );
    }

    // Encrypt the full fields JSON
    let encryptedPayload: string;
    try {
      encryptedPayload = encryptCredential(JSON.stringify(fields));
    } catch {
      return NextResponse.json(
        { error: 'خطأ في تشفير بيانات الاعتماد — تأكد من إعداد CREDENTIAL_ENCRYPTION_KEY' },
        { status: 503 },
      );
    }

    const id = crypto.randomUUID();
    await db.insert(providerCredentials).values({
      id,
      agencyId,
      providerCode: providerCode as ProviderCode,
      label:        label.trim(),
      encryptedPayload,
      isActive:     true,
      createdBy:    uid,
    });

    await logAudit({
      agencyId,
      userId:     uid,
      action:     'create',
      resource:   'provider_credential',
      resourceId: id,
      after: { providerCode, label: label.trim() },
    });

    return NextResponse.json({
      success: true,
      id,
      message: `تم حفظ بيانات اعتماد ${providerCode} بنجاح`,
    }, { status: 201 });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(JSON.stringify({ event: 'travel_credentials_post_failed', error: String(err) }));
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
