import { NextResponse } from 'next/server';
import { eq, and, desc, gte, isNotNull, isNull, lte, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { employees, employeeContracts, eosbAccruals, eosbEmployeeProvisions, journalEntries, journalLines } from '@/lib/schema';
import { verifyAuth, assertRole, ApiAuthError, BusinessError, ROLES_MANAGER_UP } from '@/lib/api-auth';
import { requireFeature } from '@/lib/feature-access';
import { logAudit } from '@/lib/audit';
import { getNextJournalNumber } from '@/lib/invoice-counter';
import { assertPeriodOpen } from '@/lib/period-lock';
import { calculateEosb, monthlyEosbAccrual } from '@/lib/eosb';
import { GL } from '@/lib/gl-accounts';
import { isYearMonth, monthEnd } from '@/lib/hr-validation';

// ── GET: EOSB liability per active employee (for display) ──────────────────────
export async function GET(request: Request) {
  try {
    const { agencyId, role } = await verifyAuth(request);
    assertRole(role, [...ROLES_MANAGER_UP]);
    await requireFeature(agencyId, 'payroll', db);

    const rows = await db.select({
      id:             employees.id,
      employeeNumber: employees.employeeNumber,
      nameAr:         employees.nameAr,
      nameEn:         employees.nameEn,
      hireDate:       employees.hireDate,
      salaryHalalas:  employees.salaryHalalas,
      isActive:       employees.isActive,
    })
      .from(employees)
      .where(eq(employees.agencyId, agencyId));
    const today = new Date().toISOString().slice(0, 10);
    const contracts = await db.select({
      employeeId: employeeContracts.employeeId,
      baseSalaryHalalas: employeeContracts.baseSalaryHalalas,
      housingAllowanceHalalas: employeeContracts.housingAllowanceHalalas,
      transportAllowanceHalalas: employeeContracts.transportAllowanceHalalas,
      otherAllowancesHalalas: employeeContracts.otherAllowancesHalalas,
    }).from(employeeContracts)
      .where(and(
        eq(employeeContracts.agencyId, agencyId),
        eq(employeeContracts.status, 'active'),
        lte(employeeContracts.startDate, today),
        or(isNull(employeeContracts.endDate), gte(employeeContracts.endDate, today)),
      ))
      .orderBy(desc(employeeContracts.startDate));
    const wageByEmployee = new Map<string, number>();
    for (const contract of contracts) {
      if (!wageByEmployee.has(contract.employeeId)) {
        wageByEmployee.set(contract.employeeId,
          contract.baseSalaryHalalas + contract.housingAllowanceHalalas
          + contract.transportAllowanceHalalas + contract.otherAllowancesHalalas);
      }
    }

    const result = rows.map((e) => {
      const lastWageHalalas = wageByEmployee.get(e.id) ?? e.salaryHalalas;
      return {
        ...e,
        lastWageHalalas,
        eosbAmount: e.hireDate ? calculateEosb(lastWageHalalas, e.hireDate, today) : 0,
        monthlyAccrual: e.hireDate ? monthlyEosbAccrual(lastWageHalalas, e.hireDate, today) : 0,
      };
    });

    return NextResponse.json({ employees: result });
  } catch (err) {
    if (err instanceof ApiAuthError || err instanceof BusinessError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}

// ── POST { action: 'accrue', month: 'YYYY-MM' } ───────────────────────────────
// Adjusts the booked EOSB provision to the statutory base-benefit estimate for
// all active employees at month end. This is a deterministic ERP estimate, not
// a substitute for an IAS 19 actuarial valuation where one is required.
export async function POST(request: Request) {
  try {
    const { uid, agencyId, role } = await verifyAuth(request);
    assertRole(role, [...ROLES_MANAGER_UP]);
    await requireFeature(agencyId, 'payroll', db);

    const body = await request.json() as { action?: string; month?: string };
    if (body.action !== 'accrue') {
      return NextResponse.json({ error: "action غير مدعوم. استخدم 'accrue'" }, { status: 400 });
    }
    if (!body.month || !isYearMonth(body.month)) {
      return NextResponse.json({ error: 'صيغة الشهر يجب أن تكون YYYY-MM' }, { status: 400 });
    }
    const month = body.month;
    const asOfDate = monthEnd(month);

    // Guard against accruing the same month twice
    const [existing] = await db.select({ id: eosbAccruals.id }).from(eosbAccruals)
      .where(and(eq(eosbAccruals.agencyId, agencyId), eq(eosbAccruals.month, month)))
      .limit(1);
    if (existing) {
      return NextResponse.json({ error: `مخصص نهاية الخدمة لشهر ${month} تم احتسابه مسبقاً` }, { status: 409 });
    }

    const priorAccruals = await db.select({ month: eosbAccruals.month, amountHalalas: eosbAccruals.amountHalalas })
      .from(eosbAccruals)
      .where(eq(eosbAccruals.agencyId, agencyId));
    if (priorAccruals.some((row) => row.month > month)) {
      return NextResponse.json({ error: 'يجب احتساب مخصص نهاية الخدمة بترتيب الشهور؛ توجد فترة لاحقة محتسبة مسبقاً' }, { status: 422 });
    }

    const active = await db.select({
      id:            employees.id,
      hireDate:      employees.hireDate,
      salaryHalalas: employees.salaryHalalas,
    })
      .from(employees)
      .where(and(
        eq(employees.agencyId, agencyId),
        isNotNull(employees.hireDate),
        lte(employees.hireDate, asOfDate),
        or(isNull(employees.endDate), gte(employees.endDate, asOfDate)),
      ));
    const activeContracts = await db.select({
      employeeId: employeeContracts.employeeId,
      baseSalaryHalalas: employeeContracts.baseSalaryHalalas,
      housingAllowanceHalalas: employeeContracts.housingAllowanceHalalas,
      transportAllowanceHalalas: employeeContracts.transportAllowanceHalalas,
      otherAllowancesHalalas: employeeContracts.otherAllowancesHalalas,
    }).from(employeeContracts)
      .where(and(
        eq(employeeContracts.agencyId, agencyId),
        eq(employeeContracts.status, 'active'),
        lte(employeeContracts.startDate, asOfDate),
        or(isNull(employeeContracts.endDate), gte(employeeContracts.endDate, asOfDate)),
      ))
      .orderBy(desc(employeeContracts.startDate));
    const wageByEmployee = new Map<string, number>();
    for (const contract of activeContracts) {
      if (!wageByEmployee.has(contract.employeeId)) {
        wageByEmployee.set(contract.employeeId,
          contract.baseSalaryHalalas + contract.housingAllowanceHalalas
          + contract.transportAllowanceHalalas + contract.otherAllowancesHalalas);
      }
    }

    const priorEmployeeRows = await db.select({
      employeeId: eosbEmployeeProvisions.employeeId,
      targetHalalas: eosbEmployeeProvisions.targetHalalas,
      month: eosbEmployeeProvisions.month,
    }).from(eosbEmployeeProvisions)
      .where(and(eq(eosbEmployeeProvisions.agencyId, agencyId), lte(eosbEmployeeProvisions.month, month)))
      .orderBy(desc(eosbEmployeeProvisions.month));
    const priorTargetByEmployee = new Map<string, number>();
    for (const row of priorEmployeeRows) {
      if (!priorTargetByEmployee.has(row.employeeId)) priorTargetByEmployee.set(row.employeeId, row.targetHalalas);
    }

    let targetLiability = 0;
    let employeeCount = 0;
    const employeeTargets: Array<{ employeeId: string; targetHalalas: number; changeHalalas: number; lastWageHalalas: number }> = [];
    for (const e of active) {
      if (!e.hireDate) continue;
      const lastWageHalalas = wageByEmployee.get(e.id) ?? e.salaryHalalas;
      const liability = calculateEosb(lastWageHalalas, e.hireDate, asOfDate);
      if (liability > 0) {
        targetLiability += liability;
        employeeCount += 1;
        employeeTargets.push({
          employeeId: e.id,
          targetHalalas: liability,
          changeHalalas: liability - (priorTargetByEmployee.get(e.id) ?? 0),
          lastWageHalalas,
        });
      }
    }
    const [provisionBalance] = await db.select({
      amount: sql<number>`COALESCE(SUM(${journalLines.creditHalalas} - ${journalLines.debitHalalas}), 0)`.mapWith(Number),
    }).from(journalLines)
      .innerJoin(journalEntries, and(eq(journalEntries.id, journalLines.entryId), eq(journalEntries.agencyId, agencyId)))
      .where(and(
        eq(journalLines.agencyId, agencyId),
        eq(journalLines.accountCode, GL.eosbProvision.code),
        eq(journalEntries.isPosted, true),
        lte(journalEntries.date, asOfDate),
      ));
    const bookedProvision = provisionBalance?.amount ?? 0;
    const totalAccrual = targetLiability - bookedProvision;

    const accrualId = crypto.randomUUID();
    const jeId      = crypto.randomUUID();
    const year      = Number(month.slice(0, 4));
    const date      = asOfDate;

    await db.transaction(async (tx) => {
      // Block posting the provision into a closed accounting period.
      await assertPeriodOpen(agencyId, date, tx);

      if (totalAccrual !== 0) {
        const jeNumber = await getNextJournalNumber(agencyId, year, tx);
        const journalAmount = Math.abs(totalAccrual);
        await tx.insert(journalEntries).values({
          id:                 jeId,
          agencyId,
          entryNumber:        jeNumber,
          date,
          descriptionAr:      `تسوية مخصص مكافأة نهاية الخدمة - ${month}`,
          descriptionEn:      `EOSB provision adjustment - ${month}`,
          source:             'salary',
          sourceId:           accrualId,
          isPosted:           true,
          totalDebitHalalas:  journalAmount,
          totalCreditHalalas: journalAmount,
          createdBy:          uid,
        });

        const lines = totalAccrual > 0
          ? [
              { ac: GL.eosbExpense, dr: journalAmount, cr: 0 },
              { ac: GL.eosbProvision, dr: 0, cr: journalAmount },
            ]
          : [
              { ac: GL.eosbProvision, dr: journalAmount, cr: 0 },
              { ac: GL.eosbExpense, dr: 0, cr: journalAmount },
            ];
        for (let i = 0; i < lines.length; i++) {
          const l = lines[i]!;
          await tx.insert(journalLines).values({
            id:            crypto.randomUUID(),
            entryId:       jeId,
            agencyId,
            accountCode:   l.ac.code,
            accountNameAr: l.ac.ar,
            accountNameEn: l.ac.en,
            debitHalalas:  l.dr,
            creditHalalas: l.cr,
            sortOrder:     i + 1,
          });
        }
      }

      await tx.insert(eosbAccruals).values({
        id:             accrualId,
        agencyId,
        month,
        amountHalalas:  totalAccrual,
        employeeCount,
        journalEntryId: totalAccrual === 0 ? null : jeId,
        createdBy:      uid,
      });
      if (employeeTargets.length > 0) {
        await tx.insert(eosbEmployeeProvisions).values(employeeTargets.map((row) => ({
          id: crypto.randomUUID(),
          agencyId,
          accrualId,
          employeeId: row.employeeId,
          month,
          targetHalalas: row.targetHalalas,
          changeHalalas: row.changeHalalas,
          lastWageHalalas: row.lastWageHalalas,
        })));
      }
    });

    const journalEntryId = totalAccrual === 0 ? null : jeId;
    await logAudit({ agencyId, userId: uid, action: 'create', resource: 'eosb_accrual', resourceId: accrualId, after: { month, amountHalalas: totalAccrual, targetLiability, employeeCount, journalEntryId } });
    return NextResponse.json({ success: true, id: accrualId, journalEntryId, amountHalalas: totalAccrual, targetLiabilityHalalas: targetLiability, employeeCount });
  } catch (err) {
    if (err instanceof ApiAuthError || err instanceof BusinessError) return NextResponse.json({ error: err.message }, { status: err.status });
    // unique_violation (23505) — concurrent duplicate accrual for the same month
    if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === '23505') {
      return NextResponse.json({ error: 'مخصص نهاية الخدمة لهذا الشهر تم احتسابه مسبقاً' }, { status: 409 });
    }
    console.error(JSON.stringify({ event: 'eosb_accrue_failed', error: (err as Error).message }));
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
