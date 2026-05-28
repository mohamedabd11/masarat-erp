import { NextResponse } from 'next/server';
import { eq, and, desc, gte, lte } from 'drizzle-orm';
import { db } from '@/lib/db';
import { auditLog } from '@/lib/schema';
import { verifyAuth, assertRole, ApiAuthError, ROLES_MANAGER_UP } from '@/lib/api-auth';

export async function GET(request: Request) {
  try {
    const { agencyId, role } = await verifyAuth(request);
    assertRole(role, [...ROLES_MANAGER_UP]);

    const url      = new URL(request.url);
    const resource = url.searchParams.get('resource') ?? undefined;
    const userId   = url.searchParams.get('userId')   ?? undefined;
    const from     = url.searchParams.get('from')     ?? undefined;
    const to       = url.searchParams.get('to')       ?? undefined;
    const limit    = Math.min(500, parseInt(url.searchParams.get('limit') ?? '100', 10) || 100);

    const conditions = [eq(auditLog.agencyId, agencyId)];
    if (resource) conditions.push(eq(auditLog.resource, resource));
    if (userId)   conditions.push(eq(auditLog.userId, userId));
    if (from)     conditions.push(gte(auditLog.createdAt, new Date(from)));
    if (to)       conditions.push(lte(auditLog.createdAt, new Date(to)));

    const rows = await db
      .select()
      .from(auditLog)
      .where(and(...conditions))
      .orderBy(desc(auditLog.createdAt))
      .limit(limit);

    return NextResponse.json({ auditLog: rows });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
