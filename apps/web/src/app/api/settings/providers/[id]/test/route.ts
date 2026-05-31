import { NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { providerCredentials } from '@/lib/schema';
import { verifyAuth, assertRole, ApiAuthError, ROLES_ADMIN_ONLY } from '@/lib/api-auth';
import { testAmadeusConnection } from '@/lib/providers/amadeus';

// POST /api/settings/providers/:id/test
// Tests connectivity to the GDS provider using stored credentials.
// Updates testedAt, testStatus, testError on the credential record.
// Returns latencyMs on success or error message on failure.
export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const { agencyId, role } = await verifyAuth(request);
    assertRole(role, [...ROLES_ADMIN_ONLY]);

    const [row] = await db
      .select({
        id:           providerCredentials.id,
        providerCode: providerCredentials.providerCode,
        credentials:  providerCredentials.credentials,
        isActive:     providerCredentials.isActive,
      })
      .from(providerCredentials)
      .where(and(
        eq(providerCredentials.id, params.id),
        eq(providerCredentials.agencyId, agencyId),
      ));

    if (!row) {
      return NextResponse.json({ error: 'التكوين غير موجود' }, { status: 404 });
    }

    if (!row.isActive) {
      return NextResponse.json({ error: 'هذا التكوين غير نشط' }, { status: 422 });
    }

    const now = new Date();
    let latencyMs: number;

    try {
      latencyMs = await runConnectionTest(row.providerCode, row.credentials);
    } catch (testErr) {
      const errorMsg = (testErr as Error).message;

      await db.update(providerCredentials)
        .set({
          testedAt:   now,
          testStatus: 'failed',
          testError:  errorMsg.slice(0, 1000),  // cap at 1000 chars
          updatedAt:  now,
        })
        .where(eq(providerCredentials.id, params.id));

      return NextResponse.json({ success: false, error: errorMsg }, { status: 502 });
    }

    await db.update(providerCredentials)
      .set({
        testedAt:   now,
        testStatus: 'success',
        testError:  null,
        updatedAt:  now,
      })
      .where(eq(providerCredentials.id, params.id));

    return NextResponse.json({ success: true, latencyMs });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(JSON.stringify({ event: 'provider_test_error', error: String(err) }));
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}

async function runConnectionTest(providerCode: string, credentials: unknown): Promise<number> {
  switch (providerCode) {
    case 'amadeus':
      return testAmadeusConnection(credentials);
    case 'sabre':
    case 'galileo':
    case 'worldspan':
      throw new Error(`اختبار الاتصال لمزود ${providerCode} غير مدعوم بعد`);
    default:
      throw new Error(`مزود غير معروف: ${providerCode}`);
  }
}
