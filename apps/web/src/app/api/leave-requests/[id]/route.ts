import { NextResponse } from 'next/server';
import { eq, and, sql, desc, lte, or, isNull, gte } from 'drizzle-orm';
import { db } from '@/lib/db';
import { leaveRequests, leaveBalances, employeeContracts } from '@/lib/schema';
import { verifyAuth, assertRole, ApiAuthError, BusinessError, ROLES_MANAGER_UP } from '@/lib/api-auth';
import { requireFeature } from '@/lib/feature-access';
import { logAudit } from '@/lib/audit';

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const { uid, agencyId, role } = await verifyAuth(request);
    assertRole(role, [...ROLES_MANAGER_UP]);
    await requireFeature(agencyId, 'leave_management', db);
    const body = await request.json() as { status?: string; notes?: string };
    if (body.status === undefined && body.notes === undefined) return NextResponse.json({ error: 'لا توجد تعديلات للحفظ' }, { status: 400 });

    if (body.status && !['pending', 'approved', 'rejected'].includes(body.status)) {
      return NextResponse.json({ error: 'حالة غير صالحة' }, { status: 400 });
    }

    // The status change and the balance adjustment must be atomic: if the balance
    // guard rejects an over-allocation we must not leave the request flipped to
    // "approved". Wrap both in one transaction.
    const existing = await db.transaction(async (tx) => {
      const [lockedRequest] = await tx
        .select()
        .from(leaveRequests)
        .where(and(eq(leaveRequests.id, params.id), eq(leaveRequests.agencyId, agencyId)))
        .limit(1)
        .for('update');
      if (!lockedRequest) throw new BusinessError('طلب الإجازة غير موجود', 404);

      const nextStatus = body.status ?? lockedRequest.status;
      const consumesBefore = lockedRequest.status === 'approved';
      const consumesAfter = nextStatus === 'approved';
      const usageDelta = consumesAfter === consumesBefore ? 0 : (consumesAfter ? 1 : -1);

      if (usageDelta !== 0) {
        const year      = parseInt(lockedRequest.startDate.slice(0, 4), 10);
        const days      = lockedRequest.days ?? 1;
        const leaveType = lockedRequest.type; // annual | sick | unpaid

        // Ensure a balance row exists for this employee/year. onConflictDoNothing
        // makes this race-safe: two concurrent approvals can't both fail on the
        // unique (employeeId, year) constraint — the loser simply no-ops, then we
        // re-read the row that now definitely exists.
        const [contract] = await tx
          .select({ annualLeaveDays: employeeContracts.annualLeaveDays })
          .from(employeeContracts)
          .where(and(
            eq(employeeContracts.employeeId, lockedRequest.employeeId),
            eq(employeeContracts.agencyId, agencyId),
            eq(employeeContracts.status, 'active'),
            lte(employeeContracts.startDate, lockedRequest.startDate),
            or(isNull(employeeContracts.endDate), gte(employeeContracts.endDate, lockedRequest.startDate)),
          ))
          .orderBy(desc(employeeContracts.startDate))
          .limit(1);

        await tx.insert(leaveBalances)
          .values({
            id:             crypto.randomUUID(),
            agencyId,
            employeeId:     lockedRequest.employeeId,
            year,
            annualEntitled: contract?.annualLeaveDays ?? 21,
            annualUsed:     0,
            sickEntitled:   30,
            sickUsed:       0,
          })
          .onConflictDoNothing();

        const [bal] = await tx
          .select()
          .from(leaveBalances)
          .where(and(
            eq(leaveBalances.employeeId, lockedRequest.employeeId),
            eq(leaveBalances.year, year),
            eq(leaveBalances.agencyId, agencyId),
          ))
          .limit(1)
          .for('update');

        // Guard against over-allocation: approval must not push usage past the
        // entitlement, otherwise balances report negative remaining days.
        if (usageDelta > 0 && bal && leaveType === 'annual' && (bal.annualUsed + days) > bal.annualEntitled) {
          throw new BusinessError(
            `رصيد الإجازة السنوية غير كافٍ — المتبقي ${bal.annualEntitled - bal.annualUsed} يوم والمطلوب ${days} يوم`,
            422,
          );
        }
        if (usageDelta > 0 && bal && leaveType === 'sick' && (bal.sickUsed + days) > bal.sickEntitled) {
          throw new BusinessError(
            `رصيد الإجازة المرضية غير كافٍ — المتبقي ${bal.sickEntitled - bal.sickUsed} يوم والمطلوب ${days} يوم`,
            422,
          );
        }

        if (bal && leaveType === 'annual') {
          if (usageDelta > 0) {
            await tx.update(leaveBalances)
              .set({ annualUsed: sql`${leaveBalances.annualUsed} + ${days}`, updatedAt: new Date() })
              .where(eq(leaveBalances.id, bal.id));
          } else {
            await tx.update(leaveBalances)
              .set({ annualUsed: sql`GREATEST(0, ${leaveBalances.annualUsed} - ${days})`, updatedAt: new Date() })
              .where(eq(leaveBalances.id, bal.id));
          }
        } else if (bal && leaveType === 'sick') {
          if (usageDelta > 0) {
            await tx.update(leaveBalances)
              .set({ sickUsed: sql`${leaveBalances.sickUsed} + ${days}`, updatedAt: new Date() })
              .where(eq(leaveBalances.id, bal.id));
          } else {
            await tx.update(leaveBalances)
              .set({ sickUsed: sql`GREATEST(0, ${leaveBalances.sickUsed} - ${days})`, updatedAt: new Date() })
              .where(eq(leaveBalances.id, bal.id));
          }
        }
      }

      // Apply the request status/notes change last, inside the same transaction,
      // so a balance-guard rejection rolls the whole thing back.
      const patch: Record<string, unknown> = {};
      if (body.status !== undefined) patch['status'] = body.status;
      if (body.notes !== undefined) patch['notes'] = body.notes.trim() || null;
      await tx
        .update(leaveRequests)
        .set(patch as Partial<typeof leaveRequests.$inferInsert>)
        .where(and(eq(leaveRequests.id, params.id), eq(leaveRequests.agencyId, agencyId)));
      return lockedRequest;
    });

    await logAudit({ agencyId, userId: uid, action: 'update', resource: 'leave_request', resourceId: params.id, before: existing, after: body });
    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof ApiAuthError || err instanceof BusinessError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
