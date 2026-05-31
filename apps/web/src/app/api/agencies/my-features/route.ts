import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyAuth, ApiAuthError } from '@/lib/api-auth';
import { getAgencyFeatureOverrides } from '@/lib/feature-access';

// GET /api/agencies/my-features
// Returns per-agency feature overrides for the authenticated agency.
// Used by SubscriptionProvider to merge with plan-based access.
export async function GET(request: Request) {
  try {
    const { agencyId } = await verifyAuth(request);
    const overrides = await getAgencyFeatureOverrides(agencyId, db);
    return NextResponse.json({ overrides });
  } catch (err) {
    if (err instanceof ApiAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
