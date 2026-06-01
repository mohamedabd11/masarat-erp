import { NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { agencies, agencyFeatures } from '@/lib/schema';
import { ALL_FEATURES, FEATURE_GROUPS, type FeatureKey } from '@/lib/plan-features';
import { logAudit } from '@/lib/audit';

async function verifySuperAdmin(request: Request): Promise<string> {
  const superAdminEmail = process.env['SUPER_ADMIN_EMAIL'];
  if (!superAdminEmail) throw new Error('SUPER_ADMIN_EMAIL env var is not configured');

  const authHeader = request.headers.get('Authorization') ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) throw new Error('NO_TOKEN');

  const { ensureAdminApp } = await import('@/lib/firebase-admin');
  ensureAdminApp();
  const { getAuth } = await import('firebase-admin/auth');
  const decoded = await getAuth().verifyIdToken(token);
  if (decoded.email !== superAdminEmail) throw new Error('FORBIDDEN');
  return decoded.email;
}

function featureGroup(key: FeatureKey): string {
  return FEATURE_GROUPS.find(g => g.features.includes(key))?.key ?? 'core';
}

// ─── GET — all features + current state for an agency ─────────────────────────

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: agencyId } = await params;
    await verifySuperAdmin(request);

    const [agencyRow, overrides] = await Promise.all([
      db.select({
          subscriptionStatus: agencies.subscriptionStatus,
          nameAr:             agencies.nameAr,
          maxUsers:           agencies.maxUsers,
        })
        .from(agencies)
        .where(eq(agencies.id, agencyId))
        .limit(1)
        .then(r => r[0]),

      db.select({
          featureKey:   agencyFeatures.featureKey,
          overrideType: agencyFeatures.overrideType,
          enabledBy:    agencyFeatures.enabledBy,
          notes:        agencyFeatures.notes,
          updatedAt:    agencyFeatures.updatedAt,
        })
        .from(agencyFeatures)
        .where(eq(agencyFeatures.agencyId, agencyId))
        .catch(() => [] as typeof agencyFeatures.$inferSelect[]),
    ]);

    if (!agencyRow) {
      return NextResponse.json({ error: 'الوكالة غير موجودة' }, { status: 404 });
    }

    const overrideMap = new Map((overrides as { featureKey: string; overrideType: string; enabledBy: string | null; notes: string | null; updatedAt: Date | null }[]).map(o => [o.featureKey, o]));

    const result = ALL_FEATURES.map(key => {
      const override = overrideMap.get(key);
      return {
        featureKey:   key,
        group:        featureGroup(key),
        overrideType: override?.overrideType ?? null,
        enabledBy:    override?.enabledBy ?? null,
        notes:        override?.notes ?? null,
        updatedAt:    override?.updatedAt ?? null,
      };
    });

    return NextResponse.json({ agency: agencyRow, agencyId, features: result });
  } catch (err: unknown) {
    const msg = (err as Error).message ?? '';
    if (msg === 'NO_TOKEN' || msg === 'FORBIDDEN') {
      return NextResponse.json({ error: 'ممنوع الوصول' }, { status: 403 });
    }
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}

// ─── PUT — set / remove override for a single feature ─────────────────────────

interface PutBody {
  featureKey:   string;
  overrideType: 'revoke' | 'remove';   // 'revoke' = disable, 'remove' = re-enable (delete record)
  notes?:       string;
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: agencyId } = await params;
    const adminEmail = await verifySuperAdmin(request);
    const body = await request.json() as PutBody;
    const { featureKey, overrideType, notes } = body;

    if (!featureKey || !overrideType) {
      return NextResponse.json({ error: 'featureKey و overrideType مطلوبان' }, { status: 400 });
    }
    if (!(ALL_FEATURES as readonly string[]).includes(featureKey)) {
      return NextResponse.json({ error: `featureKey غير معروف: ${featureKey}` }, { status: 400 });
    }
    if (!['revoke', 'remove'].includes(overrideType)) {
      return NextResponse.json({ error: 'overrideType يجب أن يكون revoke أو remove' }, { status: 400 });
    }

    const [agencyRow] = await db.select({ id: agencies.id, nameAr: agencies.nameAr })
      .from(agencies).where(eq(agencies.id, agencyId));
    if (!agencyRow) return NextResponse.json({ error: 'الوكالة غير موجودة' }, { status: 404 });

    const [existing] = await db.select({ id: agencyFeatures.id, overrideType: agencyFeatures.overrideType })
      .from(agencyFeatures)
      .where(and(eq(agencyFeatures.agencyId, agencyId), eq(agencyFeatures.featureKey, featureKey)));

    const beforeValue = existing?.overrideType ?? null;
    const now = new Date();

    if (overrideType === 'remove') {
      if (existing) {
        await db.delete(agencyFeatures)
          .where(and(eq(agencyFeatures.agencyId, agencyId), eq(agencyFeatures.featureKey, featureKey)));
      }
    } else {
      if (existing) {
        await db.update(agencyFeatures)
          .set({ overrideType, enabledBy: adminEmail, notes: notes ?? null, updatedAt: now })
          .where(eq(agencyFeatures.id, existing.id));
      } else {
        await db.insert(agencyFeatures).values({
          id: crypto.randomUUID(), agencyId, featureKey,
          overrideType, enabledBy: adminEmail, notes: notes ?? null,
          createdAt: now, updatedAt: now,
        });
      }
    }

    void logAudit({
      agencyId, userId: adminEmail, userEmail: adminEmail,
      action: 'update', resource: 'agency_feature',
      resourceId: `${agencyId}:${featureKey}`,
      before: { featureKey, overrideType: beforeValue },
      after:  { featureKey, overrideType: overrideType === 'remove' ? null : overrideType, notes },
    });

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const msg = (err as Error).message ?? '';
    if (msg === 'NO_TOKEN' || msg === 'FORBIDDEN') {
      return NextResponse.json({ error: 'ممنوع الوصول' }, { status: 403 });
    }
    console.error(JSON.stringify({ event: 'admin_feature_update_error', error: String(err) }));
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}

// ─── POST — bulk actions (enable_all / disable_group / reset) ─────────────────

interface PostBody {
  action: 'enable_all' | 'disable_group' | 'enable_group' | 'reset';
  group?: string;   // for disable_group / enable_group
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: agencyId } = await params;
    const adminEmail = await verifySuperAdmin(request);
    const body = await request.json() as PostBody;
    const { action, group } = body;

    if (!action) return NextResponse.json({ error: 'action مطلوب' }, { status: 400 });

    const [agencyRow] = await db.select({ id: agencies.id })
      .from(agencies).where(eq(agencies.id, agencyId));
    if (!agencyRow) return NextResponse.json({ error: 'الوكالة غير موجودة' }, { status: 404 });

    const now = new Date();

    if (action === 'enable_all' || action === 'reset') {
      // Delete ALL override rows → all features enabled
      await db.delete(agencyFeatures).where(eq(agencyFeatures.agencyId, agencyId));

    } else if (action === 'disable_group' || action === 'enable_group') {
      const groupDef = FEATURE_GROUPS.find(g => g.key === group);
      if (!groupDef) return NextResponse.json({ error: `مجموعة غير معروفة: ${group}` }, { status: 400 });

      for (const featureKey of groupDef.features) {
        const [existing] = await db.select({ id: agencyFeatures.id })
          .from(agencyFeatures)
          .where(and(eq(agencyFeatures.agencyId, agencyId), eq(agencyFeatures.featureKey, featureKey)));

        if (action === 'disable_group') {
          if (existing) {
            await db.update(agencyFeatures).set({ overrideType: 'revoke', enabledBy: adminEmail, updatedAt: now })
              .where(eq(agencyFeatures.id, existing.id));
          } else {
            await db.insert(agencyFeatures).values({
              id: crypto.randomUUID(), agencyId, featureKey, overrideType: 'revoke',
              enabledBy: adminEmail, notes: null, createdAt: now, updatedAt: now,
            });
          }
        } else {
          // enable_group: delete revoke if present
          if (existing) {
            await db.delete(agencyFeatures)
              .where(and(eq(agencyFeatures.agencyId, agencyId), eq(agencyFeatures.featureKey, featureKey)));
          }
        }
      }
    } else {
      return NextResponse.json({ error: `action غير معروف: ${action}` }, { status: 400 });
    }

    void logAudit({
      agencyId, userId: adminEmail, userEmail: adminEmail,
      action: 'update', resource: 'agency_features_bulk', resourceId: agencyId,
      before: null, after: { action, group },
    });

    return NextResponse.json({ success: true, action });
  } catch (err: unknown) {
    const msg = (err as Error).message ?? '';
    if (msg === 'NO_TOKEN' || msg === 'FORBIDDEN') {
      return NextResponse.json({ error: 'ممنوع الوصول' }, { status: 403 });
    }
    console.error(JSON.stringify({ event: 'admin_feature_bulk_error', error: String(err) }));
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
