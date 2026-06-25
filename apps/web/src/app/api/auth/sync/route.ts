import { NextResponse } from 'next/server';
import { ensureAdminApp } from '@/lib/firebase-admin';
import { db } from '@/lib/db';
import { agencies, users, chartOfAccounts } from '@/lib/schema';
import { eq } from 'drizzle-orm';
import { DEFAULT_COA } from '@/lib/default-coa';

export async function POST(request: Request): Promise<NextResponse> {
  try {
    ensureAdminApp();

    const authHeader = request.headers.get('Authorization') ?? '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) return NextResponse.json({ error: 'يجب تسجيل الدخول أولاً' }, { status: 401 });

    const { getAuth } = await import('firebase-admin/auth');
    const decoded = await getAuth().verifyIdToken(token);

    const agencyId = decoded['agencyId'] as string | undefined;
    if (!agencyId) {
      return NextResponse.json({ synced: false, reason: 'no_agency' });
    }

    const uid    = decoded.uid;
    const email  = decoded.email ?? '';
    const role   = (decoded['role'] as string) ?? 'staff';
    const nameAr = (decoded['name_ar'] as string) ?? decoded.name ?? email;
    const nameEn = decoded.name ?? nameAr;

    // Ensure the agency row exists in Postgres.
    // Users registered before the DB was provisioned (or from the old Firestore-based
    // system) have valid Firebase claims but no Postgres record — create it here.
    const [existingAgency] = await db
      .select({ id: agencies.id })
      .from(agencies)
      .where(eq(agencies.id, agencyId));

    if (!existingAgency) {
      await db.transaction(async (tx) => {
        await tx.insert(agencies).values({
          id:                 agencyId,
          nameAr:             nameAr,
          nameEn:             nameEn,
          email,
          plan:               'trial',
          subscriptionStatus: 'trial',
          trialEndDate:       new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
          isActive:           true,
          isVatRegistered:    false,
        });

        for (const ac of DEFAULT_COA) {
          await tx.insert(chartOfAccounts).values({
            id:       crypto.randomUUID(),
            agencyId,
            code:     ac.code,
            nameAr:   ac.nameAr,
            nameEn:   ac.nameEn,
            type:     ac.type,
            isSystem: true,
            level:    1,
          });
        }
      });
    }

    // Backfill EVERY standard account introduced after this agency was created.
    // Previously only 4200 was backfilled, so codes added later (3201 deferred
    // revenue, 5900 FX loss, 8399 rounding, GOSI/EOSB, …) were missing from
    // pre-existing agencies — and any journal posted to them vanished from the
    // trial balance (which reads the chart of accounts). Idempotent:
    // onConflictDoNothing on the (agency_id, code) unique index makes this safe
    // to run on every sync, for both new and pre-existing agencies.
    await db.insert(chartOfAccounts).values(
      DEFAULT_COA.map((ac) => ({
        id:       crypto.randomUUID(),
        agencyId,
        code:     ac.code,
        nameAr:   ac.nameAr,
        nameEn:   ac.nameEn,
        type:     ac.type,
        isSystem: true,
        level:    1,
      })),
    ).onConflictDoNothing({ target: [chartOfAccounts.agencyId, chartOfAccounts.code] });

    // Upsert user row
    await db
      .insert(users)
      .values({ id: uid, agencyId, email, nameAr, nameEn, role, isActive: true })
      .onConflictDoUpdate({
        target: users.id,
        set: { email, nameAr, nameEn, role, updatedAt: new Date() },
      });

    const [row] = await db
      .select({
        id:       users.id,
        agencyId: users.agencyId,
        email:    users.email,
        nameAr:   users.nameAr,
        nameEn:   users.nameEn,
        role:     users.role,
        isActive: users.isActive,
      })
      .from(users)
      .where(eq(users.id, uid));

    return NextResponse.json({ synced: true, agencyCreated: !existingAgency, user: row });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'خطأ غير معروف';
    console.error(JSON.stringify({ event: 'auth_sync_failed', error: message }));
    return NextResponse.json({ error: 'فشل مزامنة المستخدم' }, { status: 500 });
  }
}
