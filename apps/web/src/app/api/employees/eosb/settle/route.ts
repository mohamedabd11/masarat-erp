/**
 * POST /api/employees/eosb/settle
 *
 * Settles (pays out) an employee's accrued End-of-Service Benefit on departure.
 * Clears the 2500 EOSB Provision liability against the chosen cash/bank account:
 *
 *   Dr 2500 EOSB Provision   (amount)
 *      Cr 1100 Cash / 1110 Bank   (amount)
 *
 * Body: { employeeId, amountHalalas, paymentMethod?, notes? }
 */
import { NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { employees, journalEntries, journalLines } from '@/lib/schema';
import { verifyAuth, assertRole, ApiAuthError, BusinessError, ROLES_ADMIN_ONLY } from '@/lib/api-auth';
import { requireFeature } from '@/lib/feature-access';
import { logAudit } from '@/lib/audit';
import { getNextJournalNumber } from '@/lib/invoice-counter';
import { assertPeriodOpen } from '@/lib/period-lock';
import { GL } from '@/lib/gl-accounts';

const METHOD_ACCOUNT: Record<string, { code: string; ar: string; en: string }> = {
  cash:          GL.cash,
  bank_transfer: GL.bank,
  card:          GL.posCard,
};

export async function POST(request: Request) {
  try {
    const { uid, agencyId, role } = await verifyAuth(request);
    assertRole(role, [...ROLES_ADMIN_ONLY]);
    await requireFeature(agencyId, 'payroll', db);

    const body = await request.json() as {
      employeeId:    string;
      amountHalalas: number;
      paymentMethod?: string;
      notes?:        string;
    };

    if (!body.employeeId) {
      return NextResponse.json({ error: 'employeeId مطلوب' }, { status: 400 });
    }
    if (!Number.isInteger(body.amountHalalas) || body.amountHalalas <= 0) {
      return NextResponse.json({ error: 'مبلغ التسوية غير صالح' }, { status: 400 });
    }

    const amount        = body.amountHalalas;
    const paymentMethod = body.paymentMethod ?? 'bank_transfer';
    const cashAc        = METHOD_ACCOUNT[paymentMethod] ?? METHOD_ACCOUNT['bank_transfer']!;
    const today         = new Date().toISOString().split('T')[0]!;
    const year          = Number(today.slice(0, 4));
    const jeId          = crypto.randomUUID();

    const result = await db.transaction(async (tx) => {
      // Verify the employee belongs to this agency.
      const [employee] = await tx
        .select({ id: employees.id, nameAr: employees.nameAr })
        .from(employees)
        .where(and(eq(employees.id, body.employeeId), eq(employees.agencyId, agencyId)))
        .limit(1);
      if (!employee) throw new BusinessError('الموظف غير موجود', 404);

      // Block posting into a closed accounting period.
      await assertPeriodOpen(agencyId, today, tx);

      const jeNumber = await getNextJournalNumber(agencyId, year, tx);

      await tx.insert(journalEntries).values({
        id:                 jeId,
        agencyId,
        entryNumber:        jeNumber,
        date:               today,
        descriptionAr:      `تسوية مكافأة نهاية الخدمة - ${employee.nameAr}`,
        descriptionEn:      `EOSB settlement - ${employee.nameAr}`,
        source:             'salary',
        sourceId:           employee.id,
        isPosted:           true,
        totalDebitHalalas:  amount,
        totalCreditHalalas: amount,
        createdBy:          uid,
      });

      // Dr 2500 EOSB Provision / Cr cash|bank
      await tx.insert(journalLines).values([
        { id: crypto.randomUUID(), entryId: jeId, agencyId, accountCode: GL.eosbProvision.code, accountNameAr: GL.eosbProvision.ar, accountNameEn: GL.eosbProvision.en, debitHalalas: amount, creditHalalas: 0,      sortOrder: 1 },
        { id: crypto.randomUUID(), entryId: jeId, agencyId, accountCode: cashAc.code,            accountNameAr: cashAc.ar,            accountNameEn: cashAc.en,            debitHalalas: 0,      creditHalalas: amount, sortOrder: 2 },
      ]);

      return { journalEntryId: jeId, employeeName: employee.nameAr };
    });

    await logAudit({
      agencyId, userId: uid, action: 'create', resource: 'eosb_settlement',
      resourceId: jeId,
      after: { employeeId: body.employeeId, amountHalalas: amount, paymentMethod, notes: body.notes ?? null },
    });

    return NextResponse.json({ success: true, journalEntryId: result.journalEntryId });
  } catch (err) {
    if (err instanceof ApiAuthError || err instanceof BusinessError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error(JSON.stringify({ event: 'eosb_settle_failed', error: (err as Error).message }));
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
