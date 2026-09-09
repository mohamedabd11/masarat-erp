import { NextResponse } from 'next/server';
import { and, desc, eq, gte, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  employeeContracts,
  employees,
  journalEntries,
  journalLines,
  salaryAdvanceInstallments,
  salaryAdvances,
} from '@/lib/schema';
import { ApiAuthError, BusinessError, ROLES_ADMIN_ONLY, assertRole, verifyAuth } from '@/lib/api-auth';
import { logAudit } from '@/lib/audit';
import { getNextJournalNumber } from '@/lib/invoice-counter';
import { assertPeriodOpen } from '@/lib/period-lock';
import { requireFeature } from '@/lib/feature-access';
import { isYearMonth, monthEnd, monthStart } from '@/lib/hr-validation';
import { GL } from '@/lib/gl-accounts';
import { buildAdvanceInstallments } from '@/lib/salary-advance';

const PAYMENT_ACCOUNTS = { cash: GL.cash, bank_transfer: GL.bank } as const;

export async function GET(request: Request) {
  try {
    const { agencyId } = await verifyAuth(request);
    await requireFeature(agencyId, 'payroll', db);
    const url = new URL(request.url);
    const employeeId = url.searchParams.get('employeeId') ?? undefined;
    const status = url.searchParams.get('status') ?? undefined;
    const conditions = [eq(salaryAdvances.agencyId, agencyId)];
    if (employeeId) conditions.push(eq(salaryAdvances.employeeId, employeeId));
    if (status) conditions.push(eq(salaryAdvances.status, status));

    const rows = await db.select().from(salaryAdvances)
      .where(and(...conditions)).orderBy(desc(salaryAdvances.createdAt));
    const ids = rows.map((row) => row.id);
    const installments = ids.length === 0 ? [] : await db.select().from(salaryAdvanceInstallments)
      .where(and(eq(salaryAdvanceInstallments.agencyId, agencyId), inArray(salaryAdvanceInstallments.advanceId, ids)))
      .orderBy(salaryAdvanceInstallments.dueMonth, salaryAdvanceInstallments.installmentNumber);
    const byAdvance = new Map<string, typeof installments>();
    for (const installment of installments) {
      const current = byAdvance.get(installment.advanceId) ?? [];
      current.push(installment);
      byAdvance.set(installment.advanceId, current);
    }
    return NextResponse.json({ advances: rows.map((row) => ({ ...row, installments: byAdvance.get(row.id) ?? [] })) });
  } catch (err) {
    if (err instanceof ApiAuthError || err instanceof BusinessError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { uid, agencyId, role } = await verifyAuth(request);
    assertRole(role, [...ROLES_ADMIN_ONLY]);
    await requireFeature(agencyId, 'payroll', db);
    const body = await request.json() as {
      employeeId: string;
      amountHalalas: number;
      deductFrom: string;
      installmentCount?: number;
      paymentMethod?: keyof typeof PAYMENT_ACCOUNTS;
      reason?: string;
    };
    if (!body.employeeId || !body.deductFrom) return NextResponse.json({ error: 'الموظف وشهر بدء الخصم مطلوبان' }, { status: 400 });
    if (!Number.isSafeInteger(body.amountHalalas) || body.amountHalalas <= 0) return NextResponse.json({ error: 'المبلغ غير صالح' }, { status: 400 });
    if (!isYearMonth(body.deductFrom)) return NextResponse.json({ error: 'شهر بدء الخصم يجب أن يكون YYYY-MM' }, { status: 400 });
    if (body.installmentCount !== undefined && (!Number.isSafeInteger(body.installmentCount) || body.installmentCount <= 0 || body.installmentCount > 120)) {
      return NextResponse.json({ error: 'عدد الأقساط يجب أن يكون بين 1 و120' }, { status: 400 });
    }
    const paymentMethod = body.paymentMethod ?? 'cash';
    if (!(paymentMethod in PAYMENT_ACCOUNTS)) return NextResponse.json({ error: 'طريقة صرف السلفة غير صالحة' }, { status: 400 });

    const periodStart = monthStart(body.deductFrom);
    const periodEnd = monthEnd(body.deductFrom);
    const [[employee], [contract]] = await Promise.all([
      db.select({ id: employees.id, nameAr: employees.nameAr, isActive: employees.isActive, salaryHalalas: employees.salaryHalalas })
        .from(employees).where(and(eq(employees.id, body.employeeId), eq(employees.agencyId, agencyId))).limit(1),
      db.select({
        base: employeeContracts.baseSalaryHalalas,
        housing: employeeContracts.housingAllowanceHalalas,
        transport: employeeContracts.transportAllowanceHalalas,
        other: employeeContracts.otherAllowancesHalalas,
      }).from(employeeContracts).where(and(
        eq(employeeContracts.agencyId, agencyId),
        eq(employeeContracts.employeeId, body.employeeId),
        eq(employeeContracts.status, 'active'),
        lte(employeeContracts.startDate, periodEnd),
        or(isNull(employeeContracts.endDate), gte(employeeContracts.endDate, periodStart)),
      )).orderBy(desc(employeeContracts.startDate)).limit(1),
    ]);
    if (!employee) return NextResponse.json({ error: 'الموظف غير موجود' }, { status: 404 });
    if (!employee.isActive) return NextResponse.json({ error: 'لا يمكن صرف سلفة لموظف غير نشط' }, { status: 422 });
    const wage = contract ? contract.base + contract.housing + contract.transport + contract.other : employee.salaryHalalas;
    const monthlyCap = Math.floor(wage * 0.10);
    if (monthlyCap <= 0) return NextResponse.json({ error: 'يجب تسجيل أجر الموظف قبل جدولة السلفة' }, { status: 422 });

    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`salary-advance:${agencyId}:${body.employeeId}`}))`);
      let provisional;
      try {
        provisional = buildAdvanceInstallments({
          amountHalalas: body.amountHalalas,
          firstMonth: body.deductFrom,
          monthlyCapHalalas: monthlyCap,
          installmentCount: body.installmentCount,
        });
      } catch (err) {
        throw new BusinessError((err as Error).message.includes('count')
          ? `عدد الأقساط قليل؛ الحد الأقصى للخصم الشهري ${(monthlyCap / 100).toFixed(2)} ريال`
          : 'تعذر إنشاء جدول أقساط صالح', 422);
      }
      const months = provisional.map((row) => row.dueMonth);
      const committedRows = await tx.select({ dueMonth: salaryAdvanceInstallments.dueMonth, amount: salaryAdvanceInstallments.amountHalalas })
        .from(salaryAdvanceInstallments).where(and(
          eq(salaryAdvanceInstallments.agencyId, agencyId),
          eq(salaryAdvanceInstallments.employeeId, body.employeeId),
          eq(salaryAdvanceInstallments.status, 'pending'),
          inArray(salaryAdvanceInstallments.dueMonth, months),
        ));
      const committedByMonth = new Map<string, number>();
      for (const row of committedRows) committedByMonth.set(row.dueMonth, (committedByMonth.get(row.dueMonth) ?? 0) + row.amount);
      let schedule;
      try {
        schedule = buildAdvanceInstallments({
          amountHalalas: body.amountHalalas,
          firstMonth: body.deductFrom,
          monthlyCapHalalas: monthlyCap,
          installmentCount: body.installmentCount,
          committedByMonth,
        });
      } catch (err) {
        throw new BusinessError((err as Error).message.includes('count')
          ? `عدد الأقساط قليل؛ الحد الأقصى للخصم الشهري ${(monthlyCap / 100).toFixed(2)} ريال`
          : 'يتجاوز القسط حد 10% من الأجر بسبب خصومات سلف أخرى في الشهر نفسه', 422);
      }

      const today = new Date().toISOString().slice(0, 10);
      await assertPeriodOpen(agencyId, today, tx);
      const id = crypto.randomUUID();
      const jeId = crypto.randomUUID();
      const jeNum = await getNextJournalNumber(agencyId, Number(today.slice(0, 4)), tx);
      const payAc = PAYMENT_ACCOUNTS[paymentMethod];
      await tx.insert(salaryAdvances).values({
        id, agencyId, employeeId: body.employeeId, amountHalalas: body.amountHalalas,
        requestDate: today, deductFrom: body.deductFrom, status: 'paid', reason: body.reason?.trim() || null,
        approvedBy: uid, journalEntryId: jeId, installmentCount: schedule.length,
        remainingHalalas: body.amountHalalas, paymentMethod, createdBy: uid,
      });
      await tx.insert(salaryAdvanceInstallments).values(schedule.map((row) => ({
        id: crypto.randomUUID(), agencyId, advanceId: id, employeeId: body.employeeId,
        installmentNumber: row.installmentNumber, dueMonth: row.dueMonth,
        amountHalalas: row.amountHalalas, originalDueMonth: row.dueMonth,
      })));
      await tx.insert(journalEntries).values({
        id: jeId, agencyId, entryNumber: jeNum, date: today,
        descriptionAr: `سلفة للموظف ${employee.nameAr} — ${schedule.length} قسط`,
        source: 'manual', sourceId: id, isPosted: true,
        totalDebitHalalas: body.amountHalalas, totalCreditHalalas: body.amountHalalas, createdBy: uid,
      });
      await tx.insert(journalLines).values([
        { id: crypto.randomUUID(), entryId: jeId, agencyId, accountCode: GL.employeeAdvances.code, accountNameAr: GL.employeeAdvances.ar, accountNameEn: GL.employeeAdvances.en, debitHalalas: body.amountHalalas, creditHalalas: 0, sortOrder: 1 },
        { id: crypto.randomUUID(), entryId: jeId, agencyId, accountCode: payAc.code, accountNameAr: payAc.ar, accountNameEn: payAc.en, debitHalalas: 0, creditHalalas: body.amountHalalas, sortOrder: 2 },
      ]);
      return { id, schedule, monthlyCapHalalas: monthlyCap };
    });
    await logAudit({ agencyId, userId: uid, action: 'create', resource: 'salary_advance', resourceId: result.id, after: { employeeId: body.employeeId, amountHalalas: body.amountHalalas, installments: result.schedule.length } });
    return NextResponse.json({ success: true, ...result }, { status: 201 });
  } catch (err) {
    if (err instanceof ApiAuthError || err instanceof BusinessError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(JSON.stringify({ event: 'salary_advance_failed', error: String(err) }));
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
