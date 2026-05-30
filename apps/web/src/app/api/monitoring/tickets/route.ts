import { NextResponse } from 'next/server';
import { eq, and, inArray, sql, count, max } from 'drizzle-orm';
import { db } from '@/lib/db';
import { tickets, providerCredentials } from '@/lib/schema';
import { verifyAuth, assertRole, ApiAuthError, ROLES_MANAGER_UP } from '@/lib/api-auth';

// GET /api/monitoring/tickets
// Operational summary of pending / failed tickets for the agency.
//
// Returns:
//   statusCounts:  { [status]: number }  — one entry per pending_* status with > 0 tickets
//   stalledByCredential: credential-level health (affectedTickets, maxAttempts, providerCode, label)
//   orphanCount:   tickets with reconciliationAttempts >= 20 still in a pending state
//
export async function GET(request: Request) {
  try {
    const { agencyId, role } = await verifyAuth(request);
    assertRole(role, [...ROLES_MANAGER_UP]);

    const PENDING_STATUSES = ['pending', 'pending_void', 'pending_refund', 'pending_exchange'] as const;

    // 1. Count tickets per pending status
    const statusRows = await db
      .select({
        status: tickets.status,
        total:  count(tickets.id),
      })
      .from(tickets)
      .where(and(
        eq(tickets.agencyId, agencyId),
        inArray(tickets.status, [...PENDING_STATUSES]),
      ))
      .groupBy(tickets.status);

    const statusCounts: Record<string, number> = {};
    for (const row of statusRows) {
      statusCounts[row.status] = Number(row.total);
    }

    // 2. Credential-level health: which credentialIds have the most stalled tickets
    const credentialRows = await db
      .select({
        credentialId:  tickets.credentialId,
        affected:      count(tickets.id),
        maxAttempts:   max(tickets.reconciliationAttempts),
      })
      .from(tickets)
      .where(and(
        eq(tickets.agencyId, agencyId),
        inArray(tickets.status, [...PENDING_STATUSES]),
      ))
      .groupBy(tickets.credentialId);

    // Resolve credential metadata (providerCode, label) for display
    const credentialIds = credentialRows
      .map((r) => r.credentialId)
      .filter((id): id is string => id != null);

    const credMeta = credentialIds.length > 0
      ? await db
          .select({
            id:           providerCredentials.id,
            providerCode: providerCredentials.providerCode,
            label:        providerCredentials.label,
          })
          .from(providerCredentials)
          .where(and(
            eq(providerCredentials.agencyId, agencyId),
            inArray(providerCredentials.id, credentialIds),
          ))
      : [];

    const credMetaMap = new Map(credMeta.map((c) => [c.id, c]));

    const stalledByCredential = credentialRows.map((r) => {
      const meta = r.credentialId ? credMetaMap.get(r.credentialId) : undefined;
      return {
        credentialId:  r.credentialId ?? null,
        providerCode:  meta?.providerCode ?? null,
        label:         meta?.label ?? null,
        affectedTickets: Number(r.affected),
        maxAttempts:   Number(r.maxAttempts ?? 0),
      };
    });

    // 3. Orphan count — pending tickets that have exhausted reconciliation attempts
    const [orphanRow] = await db
      .select({ orphanCount: count(tickets.id) })
      .from(tickets)
      .where(and(
        eq(tickets.agencyId, agencyId),
        inArray(tickets.status, [...PENDING_STATUSES]),
        sql`${tickets.reconciliationAttempts} >= 20`,
      ));

    return NextResponse.json({
      statusCounts,
      stalledByCredential,
      orphanCount: Number(orphanRow?.orphanCount ?? 0),
    });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(JSON.stringify({ event: 'monitoring_tickets_error', error: String(err) }));
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
