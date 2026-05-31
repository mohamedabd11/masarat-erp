import { NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { agencies, agencyFeatures } from '@/lib/schema';
import { FEATURE_MIN_RANK, PACKAGE_TEMPLATES, type FeatureKey } from '@/lib/plan-features';
import { logAudit } from '@/lib/audit';

const SUPER_ADMIN_EMAIL = process.env['SUPER_ADMIN_EMAIL'];
if (!SUPER_ADMIN_EMAIL) throw new Error('SUPER_ADMIN_EMAIL env var is not configured');

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

// ─── GET — list all features + their current state for an agency ──────────────

export async function GET(
  request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const agencyId = params.id;

    await verifySuperAdmin(request);

    const [agencyRow, overrides] = await Promise.all([
      db.select({ plan: agencies.plan, subscriptionStatus: agencies.subscriptionStatus, nameAr: agencies.nameAr })
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
        .where(eq(agencyFeatures.agencyId, agencyId)),
    ]);

    if (!agencyRow) {
      return NextResponse.json({ error: 'الوكالة غير موجودة' }, { status: 404 });
    }

    const overrideMap = new Map(overrides.map(o => [o.featureKey, o]));

    const allFeatures = Object.keys(FEATURE_MIN_RANK) as FeatureKey[];
    const result = allFeatures.map(key => {
      const override = overrideMap.get(key);
      return {
        featureKey:   key,
        minRank:      FEATURE_MIN_RANK[key],
        planAllows:   (agencyRow.plan ? FEATURE_MIN_RANK[key] <= (
          agencyRow.subscriptionStatus === 'trial' || agencyRow.subscriptionStatus === 'lifetime' ? 10
            : key in FEATURE_MIN_RANK ? 999 : 0
        ) : false),
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

// ─── PUT — set / remove feature override ─────────────────────────────────────

interface PutBody {
  featureKey:   string;
  overrideType: 'grant' | 'revoke' | 'remove';   // remove = delete the override row
  notes?:       string;
}

export async function PUT(
  request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const agencyId = params.id;
    const adminEmail = await verifySuperAdmin(request);
    const body = await request.json() as PutBody;

    const { featureKey, overrideType, notes } = body;

    if (!featureKey || !overrideType) {
      return NextResponse.json({ error: 'featureKey و overrideType مطلوبان' }, { status: 400 });
    }
    if (!Object.keys(FEATURE_MIN_RANK).includes(featureKey)) {
      return NextResponse.json({ error: `featureKey غير معروف: ${featureKey}` }, { status: 400 });
    }
    if (!['grant', 'revoke', 'remove'].includes(overrideType)) {
      return NextResponse.json({ error: 'overrideType يجب أن يكون grant أو revoke أو remove' }, { status: 400 });
    }

    const [agencyRow] = await db.select({ id: agencies.id, nameAr: agencies.nameAr })
      .from(agencies)
      .where(eq(agencies.id, agencyId));
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
    } else if (existing) {
      await db.update(agencyFeatures)
        .set({ overrideType, enabledBy: adminEmail, notes: notes ?? null, updatedAt: now })
        .where(eq(agencyFeatures.id, existing.id));
    } else {
      await db.insert(agencyFeatures).values({
        id:           crypto.randomUUID(),
        agencyId,
        featureKey,
        overrideType,
        enabledBy:    adminEmail,
        notes:        notes ?? null,
        createdAt:    now,
        updatedAt:    now,
      });
    }

    // Non-blocking audit log
    void logAudit({
      agencyId,
      userId:     adminEmail,
      userEmail:  adminEmail,
      action:     'update',
      resource:   'agency_feature',
      resourceId: `${agencyId}:${featureKey}`,
      before:     { featureKey, overrideType: beforeValue },
      after:      { featureKey, overrideType: overrideType === 'remove' ? null : overrideType, notes },
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

// ─── POST — apply a package template ─────────────────────────────────────────

interface PostBody {
  packageKey: string;   // 'operations' | 'business' | 'enterprise'
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const agencyId = params.id;
    const adminEmail = await verifySuperAdmin(request);
    const body = await request.json() as PostBody;

    const { packageKey } = body;
    const templateFeatures = PACKAGE_TEMPLATES[packageKey];
    if (!templateFeatures) {
      return NextResponse.json({ error: `الباقة غير معروفة: ${packageKey}` }, { status: 400 });
    }

    const [agencyRow] = await db.select({ id: agencies.id })
      .from(agencies)
      .where(eq(agencies.id, agencyId));
    if (!agencyRow) return NextResponse.json({ error: 'الوكالة غير موجودة' }, { status: 404 });

    const allFeatures = Object.keys(FEATURE_MIN_RANK) as FeatureKey[];
    const now = new Date();

    // Delete all existing overrides then set new ones
    await db.delete(agencyFeatures).where(eq(agencyFeatures.agencyId, agencyId));

    // Grant all features in the template, revoke the rest
    const toGrant  = new Set(templateFeatures);
    const inserts  = allFeatures.map(key => ({
      id:           crypto.randomUUID(),
      agencyId,
      featureKey:   key,
      overrideType: toGrant.has(key) ? 'grant' : 'revoke',
      enabledBy:    adminEmail,
      notes:        `باقة ${packageKey} — طُبِّقت بواسطة Super Admin`,
      createdAt:    now,
      updatedAt:    now,
    }));

    if (inserts.length > 0) {
      await db.insert(agencyFeatures).values(inserts);
    }

    void logAudit({
      agencyId,
      userId:     adminEmail,
      userEmail:  adminEmail,
      action:     'update',
      resource:   'agency_features_bulk',
      resourceId: agencyId,
      before:     null,
      after:      { packageKey, grantedFeatures: [...toGrant] },
    });

    return NextResponse.json({ success: true, applied: packageKey });
  } catch (err: unknown) {
    const msg = (err as Error).message ?? '';
    if (msg === 'NO_TOKEN' || msg === 'FORBIDDEN') {
      return NextResponse.json({ error: 'ممنوع الوصول' }, { status: 403 });
    }
    console.error(JSON.stringify({ event: 'admin_feature_template_error', error: String(err) }));
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
