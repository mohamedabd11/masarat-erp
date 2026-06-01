import { NextResponse } from 'next/server';
import { eq, and, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { leaveRequests, leaveBalances, employeeContracts } from '@/lib/schema';
import { verifyAuth, assertRole, ApiAuthError, ROLES_MANAGER_UP } from '@/lib/api-auth';

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

    await db
      .update(leaveRequests)
      .set(patch as Partial<typeof leaveRequests.$inferInsert>)
      .where(and(eq(leaveRequests.id, params.id), eq(leaveRequests.agencyId, agencyId)));

    // When approving, deduct days from leave balance for the year
    if (body.status === 'approved' && existing.status === 'pending') {
      const year = parseInt(existing.startDate.slice(0, 4), 10);
      const days = existing.days ?? 1;
      const leaveType = existing.type; // annual | sick | unpaid

      // Ensure a balance row exists for this employee/year
      const [bal] = await db
        .select()
        .from(leaveBalances)
        .where(and(
          eq(leaveBalances.employeeId, existing.employeeId),
          eq(leaveBalances.year, year),
          eq(leaveBalances.agencyId, agencyId),
        ))
        .limit(1);

      if (!bal) {
        // Initialize from active contract or default 21 annual / 30 sick
        const [contract] = await db
          .select({ annualLeaveDays: employeeContracts.annualLeaveDays })
          .from(employeeContracts)
          .where(and(
            eq(employeeContracts.employeeId, existing.employeeId),
            eq(employeeContracts.agencyId, agencyId),
            eq(employeeContracts.status, 'active'),
          ))
          .limit(1);

        await db.insert(leaveBalances).values({
          id:             crypto.randomUUID(),
          agencyId,
          employeeId:     existing.employeeId,
          year,
          annualEntitled: contract?.annualLeaveDays ?? 21,
          annualUsed:     leaveType === 'annual' ? days : 0,
          sickEntitled:   30,
          sickUsed:       leaveType === 'sick' ? days : 0,
        });
      } else if (leaveType === 'annual') {
        await db.update(leaveBalances)
          .set({ annualUsed: sql`${leaveBalances.annualUsed} + ${days}`, updatedAt: new Date() })
          .where(eq(leaveBalances.id, bal.id));
      } else if (leaveType === 'sick') {
        await db.update(leaveBalances)
          .set({ sickUsed: sql`${leaveBalances.sickUsed} + ${days}`, updatedAt: new Date() })
          .where(eq(leaveBalances.id, bal.id));
      }
    }

    // When rejecting a previously approved leave, restore balance
    if (body.status === 'rejected' && existing.status === 'approved') {
      const year = parseInt(existing.startDate.slice(0, 4), 10);
      const days = existing.days ?? 1;
      const leaveType = existing.type;

      const [bal] = await db
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
          await db.update(leaveBalances)
            .set({ annualUsed: sql`GREATEST(0, ${leaveBalances.annualUsed} - ${days})`, updatedAt: new Date() })
            .where(eq(leaveBalances.id, bal.id));
        } else if (leaveType === 'sick') {
          await db.update(leaveBalances)
            .set({ sickUsed: sql`GREATEST(0, ${leaveBalances.sickUsed} - ${days})`, updatedAt: new Date() })
            .where(eq(leaveBalances.id, bal.id));
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
