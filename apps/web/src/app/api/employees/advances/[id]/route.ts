import { NextResponse } from 'next/server';
import { and, desc, eq, gte, isNull, lte, ne, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  employeeContracts,
  employees,
  journalEntries,
  journalLines,
  payslips,
  salaryAdvanceInstallments,
  salaryAdvances,
} from '@/lib/schema';
import { ApiAuthError, BusinessError, ROLES_ADMIN_ONLY, assertRole, verifyAuth } from '@/lib/api-auth';
import { requireFeature } from '@/lib/feature-access';
import { isIsoDate, isYearMonth, monthEnd, monthStart } from '@/lib/hr-validation';
import { assertPeriodOpen } from '@/lib/period-lock';
import { getNextJournalNumber } from '@/lib/invoice-counter';
import { GL } from '@/lib/gl-accounts';
import { logAudit } from '@/lib/audit';

const PAYMENT_ACCOUNTS = { cash: GL.cash, bank_transfer: GL.bank } as const;

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const { uid, agencyId, role } = await verifyAuth(request);
    assertRole(role, [...ROLES_ADMIN_ONLY]);
    await requireFeature(agencyId, 'payroll', db);
    const body = await request.json() as {
      action?: 'defer' | 'repay';
      installmentId?: string;
      dueMonth?: string;
      paymentMethod?: keyof typeof PAYMENT_ACCOUNTS;
      paymentDate?: string;
    };
    if (!['defer', 'repay'].includes(body.action ?? '')) return NextResponse.json({ error: 'الإجراء غير مدعوم' }, { status: 400 });

    if (body.action === 'defer') {
      if (!body.installmentId || !body.dueMonth || !isYearMonth(body.dueMonth)) {
        return NextResponse.json({ error: 'القسط وشهر التأجيل الصحيح مطلوبان' }, { status: 400 });
      }
      const result = await db.transaction(async (tx) => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`salary-advance:${agencyId}:${params.id}`}))`);
        const [advance] = await tx.select({ employeeId: salaryAdvances.employeeId }).from(salaryAdvances)
          .where(and(eq(salaryAdvances.id, params.id), eq(salaryAdvances.agencyId, agencyId))).limit(1);
        if (!advance) throw new BusinessError('السلفة غير موجودة', 404);
        const [installment] = await tx.select().from(salaryAdvanceInstallments).where(and(
          eq(salaryAdvanceInstallments.id, body.installmentId!),
          eq(salaryAdvanceInstallments.advanceId, params.id),
          eq(salaryAdvanceInstallments.agencyId, agencyId),
        )).limit(1);
        if (!installment) throw new BusinessError('القسط غير موجود', 404);
        if (installment.status !== 'pending') throw new BusinessError('لا يمكن تأجيل قسط مخصوم أو مسدد', 422);
        if (body.dueMonth! <= installment.dueMonth) throw new BusinessError('شهر التأجيل يجب أن يكون بعد شهر الاستحقاق الحالي', 422);
        const [existingPayslip] = await tx.select({ id: payslips.id }).from(payslips).where(and(
          eq(payslips.agencyId, agencyId), eq(payslips.employeeId, advance.employeeId), eq(payslips.month, body.dueMonth!),
        )).limit(1);
        if (existingPayslip) throw new BusinessError('لا يمكن نقل القسط إلى شهر أُنشئت قسيمة راتبه مسبقاً', 422);

        const start = monthStart(body.dueMonth!);
        const end = monthEnd(body.dueMonth!);
        const [employee] = await tx.select({ salary: employees.salaryHalalas }).from(employees)
          .where(and(eq(employees.id, advance.employeeId), eq(employees.agencyId, agencyId))).limit(1);
        const [contract] = await tx.select({
            base: employeeContracts.baseSalaryHalalas, housing: employeeContracts.housingAllowanceHalalas,
            transport: employeeContracts.transportAllowanceHalalas, other: employeeContracts.otherAllowancesHalalas,
          }).from(employeeContracts).where(and(
            eq(employeeContracts.agencyId, agencyId), eq(employeeContracts.employeeId, advance.employeeId),
            eq(employeeContracts.status, 'active'), lte(employeeContracts.startDate, end),
            or(isNull(employeeContracts.endDate), gte(employeeContracts.endDate, start)),
          )).orderBy(desc(employeeContracts.startDate)).limit(1);
        const committed = await tx.select({ amount: salaryAdvanceInstallments.amountHalalas }).from(salaryAdvanceInstallments).where(and(
            eq(salaryAdvanceInstallments.agencyId, agencyId), eq(salaryAdvanceInstallments.employeeId, advance.employeeId),
            eq(salaryAdvanceInstallments.dueMonth, body.dueMonth!), eq(salaryAdvanceInstallments.status, 'pending'),
            ne(salaryAdvanceInstallments.id, installment.id),
          ));
        const wage = contract ? contract.base + contract.housing + contract.transport + contract.other : (employee?.salary ?? 0);
        const cap = Math.floor(wage * 0.10);
        const committedAmount = committed.reduce((sum, row) => sum + row.amount, 0);
        if (committedAmount + installment.amountHalalas > cap) throw new BusinessError('التأجيل يتجاوز حد 10% من الأجر في الشهر الجديد', 422);

        await tx.update(salaryAdvanceInstallments).set({
          dueMonth: body.dueMonth!,
          deferralCount: sql`${salaryAdvanceInstallments.deferralCount} + 1`,
          updatedAt: new Date(),
        }).where(and(eq(salaryAdvanceInstallments.id, installment.id), eq(salaryAdvanceInstallments.agencyId, agencyId)));
        return { installmentId: installment.id, dueMonth: body.dueMonth };
      });
      await logAudit({ agencyId, userId: uid, action: 'update', resource: 'salary_advance', resourceId: params.id, after: { action: 'defer', ...result } });
      return NextResponse.json({ success: true, ...result });
    }

    const paymentMethod = body.paymentMethod ?? 'cash';
    if (!(paymentMethod in PAYMENT_ACCOUNTS)) return NextResponse.json({ error: 'طريقة السداد غير صالحة' }, { status: 400 });
    const paymentDate = body.paymentDate ?? new Date().toISOString().slice(0, 10);
    if (!isIsoDate(paymentDate)) return NextResponse.json({ error: 'تاريخ السداد غير صالح' }, { status: 400 });
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`salary-advance:${agencyId}:${params.id}`}))`);
      const [advance] = await tx.select().from(salaryAdvances).where(and(
        eq(salaryAdvances.id, params.id), eq(salaryAdvances.agencyId, agencyId),
      )).limit(1);
      if (!advance) throw new BusinessError('السلفة غير موجودة', 404);
      if (advance.remainingHalalas <= 0 || advance.status === 'repaid' || advance.status === 'deducted') {
        throw new BusinessError('السلفة مسددة بالكامل', 409);
      }
      await assertPeriodOpen(agencyId, paymentDate, tx);
      const amount = advance.remainingHalalas;
      const jeId = crypto.randomUUID();
      const jeNumber = await getNextJournalNumber(agencyId, Number(paymentDate.slice(0, 4)), tx);
      const cashAccount = PAYMENT_ACCOUNTS[paymentMethod];
      await tx.insert(journalEntries).values({
        id: jeId, agencyId, entryNumber: jeNumber, date: paymentDate,
        descriptionAr: 'سداد مبكر لسلفة موظف', source: 'manual', sourceId: advance.id,
        isPosted: true, totalDebitHalalas: amount, totalCreditHalalas: amount, createdBy: uid,
      });
      await tx.insert(journalLines).values([
        { id: crypto.randomUUID(), entryId: jeId, agencyId, accountCode: cashAccount.code, accountNameAr: cashAccount.ar, accountNameEn: cashAccount.en, debitHalalas: amount, creditHalalas: 0, sortOrder: 1 },
        { id: crypto.randomUUID(), entryId: jeId, agencyId, accountCode: GL.employeeAdvances.code, accountNameAr: GL.employeeAdvances.ar, accountNameEn: GL.employeeAdvances.en, debitHalalas: 0, creditHalalas: amount, sortOrder: 2 },
      ]);
      await tx.update(salaryAdvanceInstallments).set({ status: 'repaid', repaidAt: new Date(), updatedAt: new Date() })
        .where(and(eq(salaryAdvanceInstallments.advanceId, advance.id), eq(salaryAdvanceInstallments.agencyId, agencyId), eq(salaryAdvanceInstallments.status, 'pending')));
      await tx.update(salaryAdvances).set({ status: 'repaid', remainingHalalas: 0, settledAt: new Date(), updatedAt: new Date() })
        .where(and(eq(salaryAdvances.id, advance.id), eq(salaryAdvances.agencyId, agencyId)));
      return { amountHalalas: amount, journalEntryId: jeId };
    });
    await logAudit({ agencyId, userId: uid, action: 'update', resource: 'salary_advance', resourceId: params.id, after: { action: 'repay', ...result } });
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    if (err instanceof ApiAuthError || err instanceof BusinessError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(JSON.stringify({ event: 'salary_advance_update_failed', error: String(err) }));
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
