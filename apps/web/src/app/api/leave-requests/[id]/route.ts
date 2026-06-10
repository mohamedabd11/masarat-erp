import { NextResponse } from 'next/server';
import { eq, and, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { leaveRequests, leaveBalances, employeeContracts } from '@/lib/schema';
import { verifyAuth, assertRole, ApiAuthError, BusinessError, ROLES_MANAGER_UP } from '@/lib/api-auth';

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const { agencyId, role } = await verifyAuth(request);
    assertRole(role, [...ROLES_MANAGER_UP]);
    const body = await request.json() as { status?: string; notes?: string };

    const [existing] = await db
      .select()
      .from(leaveRequests)
      .where(and(eq(leaveRequests.id, params.id), eq(leaveRequests.agencyId, agencyId)));
    if (!existing) return NextResponse.json({ error: 'طلب الإجازة غير موجود' }, { status: 404 });

    // Prevent modifying an already-decided request
    if (existing.status !== 'pending' && body.status && body.status !== existing.status) {
      return NextResponse.json(
        { error: `لا يمكن تعديل طلب بحالة "${existing.status}"` },
        { status: 422 },
      );
    }

    if (body.status && !['pending', 'approved', 'rejected'].includes(body.status)) {
      return NextResponse.json({ error: 'حالة غير صالحة' }, { status: 400 });
    }

    const patch: Record<string, unknown> = {};
    if (body.status !== undefined) patch['status'] = body.status;
    if (body.notes  !== undefined) patch['notes']  = body.notes;

    const isApproving = body.status === 'approved' && existing.status === 'pending';
    const isRejecting = body.status === 'rejected' && existing.status === 'approved';

    // The status change and the balance adjustment must be atomic: if the balance
    // guard rejects an over-allocation we must not leave the request flipped to
    // "approved". Wrap both in one transaction.
    await db.transaction(async (tx) => {
      if (isApproving) {
        const year      = parseInt(existing.startDate.slice(0, 4), 10);
        const days      = existing.days ?? 1;
        const leaveType = existing.type; // annual | sick | unpaid

        // Ensure a balance row exists for this employee/year. onConflictDoNothing
        // makes this race-safe: two concurrent approvals can't both fail on the
        // unique (employeeId, year) constraint — the loser simply no-ops, then we
        // re-read the row that now definitely exists.
        const [contract] = await tx
          .select({ annualLeaveDays: employeeContracts.annualLeaveDays })
          .from(employeeContracts)
          .where(and(
            eq(employeeContracts.employeeId, existing.employeeId),
            eq(employeeContracts.agencyId, agencyId),
            eq(employeeContracts.status, 'active'),
          ))
          .limit(1);

        await tx.insert(leaveBalances)
          .values({
            id:             crypto.randomUUID(),
            agencyId,
            employeeId:     existing.employeeId,
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
            eq(leaveBalances.employeeId, existing.employeeId),
            eq(leaveBalances.year, year),
            eq(leaveBalances.agencyId, agencyId),
          ))
          .limit(1);

        // Guard against over-allocation: approval must not push usage past the
        // entitlement, otherwise balances report negative remaining days.
        if (bal && leaveType === 'annual' && (bal.annualUsed + days) > bal.annualEntitled) {
          throw new BusinessError(
            `رصيد الإجازة السنوية غير كافٍ — المتبقي ${bal.annualEntitled - bal.annualUsed} يوم والمطلوب ${days} يوم`,
            422,
          );
        }
        if (bal && leaveType === 'sick' && (bal.sickUsed + days) > bal.sickEntitled) {
          throw new BusinessError(
            `رصيد الإجازة المرضية غير كافٍ — المتبقي ${bal.sickEntitled - bal.sickUsed} يوم والمطلوب ${days} يوم`,
            422,
          );
        }

        if (bal && leaveType === 'annual') {
          await tx.update(leaveBalances)
            .set({ annualUsed: sql`${leaveBalances.annualUsed} + ${days}`, updatedAt: new Date() })
            .where(eq(leaveBalances.id, bal.id));
        } else if (bal && leaveType === 'sick') {
          await tx.update(leaveBalances)
            .set({ sickUsed: sql`${leaveBalances.sickUsed} + ${days}`, updatedAt: new Date() })
            .where(eq(leaveBalances.id, bal.id));
        }
      }

      if (isRejecting) {
        const year      = parseInt(existing.startDate.slice(0, 4), 10);
        const days      = existing.days ?? 1;
        const leaveType = existing.type;

        const [bal] = await tx
          .select()
          .from(leaveBalances)
          .where(and(
            eq(leaveBalances.employeeId, existing.employeeId),
            eq(leaveBalances.year, year),
            eq(leaveBalances.agencyId, agencyId),
          ))
          .limit(1);

        if (bal) {
          if (leaveType === 'annual') {
            await tx.update(leaveBalances)
              .set({ annualUsed: sql`GREATEST(0, ${leaveBalances.annualUsed} - ${days})`, updatedAt: new Date() })
              .where(eq(leaveBalances.id, bal.id));
          } else if (leaveType === 'sick') {
            await tx.update(leaveBalances)
              .set({ sickUsed: sql`GREATEST(0, ${leaveBalances.sickUsed} - ${days})`, updatedAt: new Date() })
              .where(eq(leaveBalances.id, bal.id));
          }
        }
      }

      // Apply the request status/notes change last, inside the same transaction,
      // so a balance-guard rejection rolls the whole thing back.
      await tx
        .update(leaveRequests)
        .set(patch as Partial<typeof leaveRequests.$inferInsert>)
        .where(and(eq(leaveRequests.id, params.id), eq(leaveRequests.agencyId, agencyId)));
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof ApiAuthError || err instanceof BusinessError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
