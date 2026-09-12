import { NextResponse } from 'next/server';
import { eq, and, desc, gte, isNull, lte, or, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { payslips, employees, salaryAdvances, salaryAdvanceInstallments, employeeContracts, journalEntries, journalLines, gosiRatePeriods } from '@/lib/schema';
import { verifyAuth, assertRole, ApiAuthError, BusinessError, ROLES_ADMIN_ONLY } from '@/lib/api-auth';
import { requireFeature } from '@/lib/feature-access';
import { logAudit } from '@/lib/audit';
import { getNextJournalNumber } from '@/lib/invoice-counter';
import { assertPeriodOpen } from '@/lib/period-lock';
import { GL } from '@/lib/gl-accounts';
import { dateInTimeZone, isIsoDate, isYearMonth, monthEnd, monthStart, payrollPostingDate } from '@/lib/hr-validation';
import { buildPayrollJournal } from '@/lib/payroll-journal';
import { calculateGosi, type GosiScheme } from '@/lib/gosi';

export async function GET(request: Request) {
  try {
    const { agencyId } = await verifyAuth(request);
    await requireFeature(agencyId, 'payroll', db);
    const url        = new URL(request.url);
    const employeeId = url.searchParams.get('employeeId') ?? undefined;
    const month      = url.searchParams.get('month')      ?? undefined;

    const conditions = [eq(payslips.agencyId, agencyId)];
    if (employeeId) conditions.push(eq(payslips.employeeId, employeeId));
    if (month)      conditions.push(eq(payslips.month, month));

    const rows = await db.select().from(payslips)
      .where(and(...conditions))
      .orderBy(desc(payslips.month), desc(payslips.createdAt));

    return NextResponse.json({ payslips: rows });
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
      employeeId:               string;
      month:                    string;          // YYYY-MM
      salaryPaymentId?:         string;
      baseSalaryHalalas:        number;
      housingAllowanceHalalas?: number;
      transportAllowanceHalalas?: number;
      otherAllowancesHalalas?:  number;
      deductionsHalalas?:       number;
      components?:              unknown;
      paymentDate?:             string;
      paymentMethod?:           string;
    };

    if (!body.employeeId || !body.month) {
      return NextResponse.json({ error: 'employeeId و month مطلوبان' }, { status: 400 });
    }
    if (!isYearMonth(body.month)) {
      return NextResponse.json({ error: 'صيغة الشهر يجب أن تكون YYYY-MM' }, { status: 400 });
    }
    if (body.paymentDate && !isIsoDate(body.paymentDate)) {
      return NextResponse.json({ error: 'تاريخ صرف الراتب غير صالح' }, { status: 400 });
    }
    const postingDate = payrollPostingDate(body.month, dateInTimeZone());
    if (!postingDate) {
      return NextResponse.json({ error: 'لا يمكن إنشاء قسيمة راتب لشهر مستقبلي' }, { status: 422 });
    }
    // Guard every monetary input: must be a non-negative integer (halalas).
    // baseSalaryHalalas must additionally be strictly positive.
    const moneyInputs: Array<[string, number | undefined]> = [
      ['baseSalaryHalalas',        body.baseSalaryHalalas],
      ['housingAllowanceHalalas',  body.housingAllowanceHalalas],
      ['transportAllowanceHalalas', body.transportAllowanceHalalas],
      ['otherAllowancesHalalas',   body.otherAllowancesHalalas],
      ['deductionsHalalas',        body.deductionsHalalas],
    ];
    for (const [name, val] of moneyInputs) {
      if (val !== undefined && (!Number.isInteger(val) || val < 0)) {
        return NextResponse.json({ error: `${name}: يجب أن يكون رقماً صحيحاً غير سالب` }, { status: 400 });
      }
    }
    if (!Number.isInteger(body.baseSalaryHalalas) || body.baseSalaryHalalas <= 0) {
      return NextResponse.json({ error: 'الراتب الأساسي يجب أن يكون رقماً صحيحاً موجباً' }, { status: 400 });
    }

    // Check no duplicate
    const [existing] = await db.select({ id: payslips.id }).from(payslips)
      .where(and(eq(payslips.employeeId, body.employeeId), eq(payslips.month, body.month), eq(payslips.agencyId, agencyId)))
      .limit(1);
    if (existing) return NextResponse.json({ error: `قسيمة الراتب لشهر ${body.month} موجودة مسبقاً` }, { status: 409 });

    // Auto-include only installments due in this month, never the full advance.
    const pendingInstallments = await db.select({
      id: salaryAdvanceInstallments.id,
      advanceId: salaryAdvanceInstallments.advanceId,
      amountHalalas: salaryAdvanceInstallments.amountHalalas,
    })
      .from(salaryAdvanceInstallments)
      .where(and(
        eq(salaryAdvanceInstallments.employeeId, body.employeeId),
        eq(salaryAdvanceInstallments.dueMonth, body.month),
        eq(salaryAdvanceInstallments.status, 'pending'),
        eq(salaryAdvanceInstallments.agencyId, agencyId),
      ));
    const advanceDeduction = pendingInstallments.reduce((s, row) => s + row.amountHalalas, 0);

    // Fetch employee, effective GOSI rate periods, and active contract in parallel.
    const periodStart = monthStart(body.month);
    const periodEnd = monthEnd(body.month);
    const [[employee], ratePeriods, [contract]] = await Promise.all([
      db.select({ id: employees.id, nameAr: employees.nameAr, nationalityType: employees.nationalityType,
        hireDate: employees.hireDate, endDate: employees.endDate, isActive: employees.isActive,
        gosiScheme: employees.gosiScheme, gosiEnrollmentDate: employees.gosiEnrollmentDate,
        sanedApplicable: employees.sanedApplicable })
        .from(employees)
        .where(and(eq(employees.id, body.employeeId), eq(employees.agencyId, agencyId)))
        .limit(1),
      db.select().from(gosiRatePeriods).where(lte(gosiRatePeriods.effectiveFrom, periodEnd)),
      db.select({
          baseSalaryHalalas: employeeContracts.baseSalaryHalalas,
          housingAllowanceHalalas: employeeContracts.housingAllowanceHalalas,
          transportAllowanceHalalas: employeeContracts.transportAllowanceHalalas,
          otherAllowancesHalalas: employeeContracts.otherAllowancesHalalas,
        })
        .from(employeeContracts)
        .where(and(
          eq(employeeContracts.agencyId, agencyId),
          eq(employeeContracts.employeeId, body.employeeId),
          eq(employeeContracts.status, 'active'),
          lte(employeeContracts.startDate, periodEnd),
          or(isNull(employeeContracts.endDate), gte(employeeContracts.endDate, periodStart)),
        ))
        .orderBy(desc(employeeContracts.startDate))
        .limit(1),
    ]);
    if (!employee) return NextResponse.json({ error: 'الموظف غير موجود' }, { status: 404 });
    if (employee.hireDate && employee.hireDate > periodEnd) {
      return NextResponse.json({ error: 'لا يمكن إنشاء راتب قبل تاريخ تعيين الموظف' }, { status: 422 });
    }
    if (employee.endDate && employee.endDate < periodStart) {
      return NextResponse.json({ error: 'لا يمكن إنشاء راتب بعد انتهاء خدمة الموظف' }, { status: 422 });
    }

    const base      = contract?.baseSalaryHalalas ?? body.baseSalaryHalalas;
    const housing   = contract?.housingAllowanceHalalas ?? body.housingAllowanceHalalas ?? 0;
    const transport = contract?.transportAllowanceHalalas ?? body.transportAllowanceHalalas ?? 0;
    const other     = (contract?.otherAllowancesHalalas ?? 0) + (body.otherAllowancesHalalas ?? 0);
    const gross     = base + housing + transport + other;
    const deduct    = body.deductionsHalalas ?? 0;

    const scheme = (employee.nationalityType === 'expat' ? 'expat' : employee.gosiScheme) as GosiScheme;
    const insuranceStart = employee.gosiEnrollmentDate ?? employee.hireDate;
    if (scheme !== 'exempt' && (!insuranceStart || insuranceStart > periodEnd)) {
      return NextResponse.json({ error: 'يجب تسجيل تاريخ بدء التأمينات للموظف قبل إنشاء قسيمة الراتب' }, { status: 422 });
    }
    let gosi;
    try {
      gosi = calculateGosi({
        contributoryWageHalalas: base + housing,
        scheme,
        asOfDate: periodEnd,
        sanedApplicable: employee.sanedApplicable,
        periods: ratePeriods,
      });
    } catch {
      return NextResponse.json({ error: 'لا توجد نسبة تأمينات نافذة لهذا الموظف في شهر الراتب' }, { status: 422 });
    }
    const gosiEmployee = gosi.employeeHalalas;
    const gosiEmployer = gosi.employerHalalas;
    const net              = gross - deduct - advanceDeduction - gosiEmployee;

    // Article 93 guard: ordinary total payroll deductions may not exceed half
    // the due wage. Court-authorised exceptions require a separate workflow.
    if (deduct + advanceDeduction + gosiEmployee > Math.floor(gross / 2)) {
      return NextResponse.json({ error: 'إجمالي الخصومات يتجاوز نصف الأجر المستحق لهذا الشهر' }, { status: 422 });
    }

    // Negative net is rejected outright. Allowing it would force netPayable to be
    // clamped to 0 while the residual-balancing block below still credits the full
    // shortfall to Salaries Payable (2310) — producing a phantom liability that no
    // disbursement can ever clear. Deductions + GOSI must never exceed gross.
    if (net < 0) {
      return NextResponse.json(
        { error: 'صافي الراتب سالب — مجموع الخصومات والتأمينات يتجاوز إجمالي الراتب' },
        { status: 422 },
      );
    }

    const id    = crypto.randomUUID();
    const jeId  = crypto.randomUUID();
    const year  = Number(body.month.slice(0, 4));
    const mm    = body.month.slice(5, 7);
    const today = postingDate;

    // ── Payroll accrual journal ──────────────────────────────────────────────
    //  Dr 6100 Salary Expense         (gross)
    //  Dr 6200 GOSI Expense - Employer (employerGosi)        [only if > 0]
    //     Cr 2310 Salaries Payable     (net = gross - employeeGosi - deductions - advances)
    //     Cr 2400 GOSI Payable         (employerGosi + employeeGosi)   [only if any GOSI]
    //  Other deductions/advances reduce the cash settled to the employee, so they
    //  are netted into Salaries Payable here (the actual cash-out is recorded when
    //  the salary payment is made).
    const payrollJournal = buildPayrollJournal({
      grossHalalas: gross,
      employeeGosiHalalas: gosiEmployee,
      employerGosiHalalas: gosiEmployer,
      manualDeductionsHalalas: deduct,
      advanceDeductionHalalas: advanceDeduction,
    });
    const netPayable = payrollJournal.netHalalas;

    await db.transaction(async (tx) => {
      // Block posting the payroll journal into a closed accounting period.
      await assertPeriodOpen(agencyId, today, tx);

      await tx.insert(payslips).values({
        id,
        agencyId,
        employeeId:               body.employeeId,
        month:                    body.month,
        salaryPaymentId:          null,
        baseSalaryHalalas:        base,
        housingAllowanceHalalas:  housing,
        transportAllowanceHalalas: transport,
        otherAllowancesHalalas:   other,
        grossHalalas:             gross,
        deductionsHalalas:        deduct,
        advanceDeductionHalalas:  advanceDeduction,
        gosiEmployeeHalalas:      gosiEmployee,
        gosiEmployerHalalas:      gosiEmployer,
        gosiContributoryWageHalalas: gosi.contributoryWageHalalas,
        gosiEmployeeRateBps:      gosi.employeeRateBps,
        gosiEmployerRateBps:      gosi.employerRateBps,
        gosiScheme:               gosi.scheme,
        netHalalas:               netPayable,
        components:               (body.components ?? null) as never,
        paymentDate:              body.paymentDate  ?? null,
        paymentMethod:            body.paymentMethod ?? null,
      });

      const jeNumber = await getNextJournalNumber(agencyId, year, tx);
      await tx.insert(journalEntries).values({
        id:                 jeId,
        agencyId,
        entryNumber:        jeNumber,
        date:               today,
        descriptionAr:      `راتب ${employee.nameAr} - ${mm}/${year}`,
        descriptionEn:      `Salary ${employee.nameAr} - ${mm}/${year}`,
        source:             'salary',
        sourceId:           id,
        isPosted:           true,
        totalDebitHalalas:  payrollJournal.totalDebitHalalas,
        totalCreditHalalas: payrollJournal.totalCreditHalalas,
        createdBy:          uid,
      });

      for (let i = 0; i < payrollJournal.lines.length; i++) {
        const l = payrollJournal.lines[i]!;
        await tx.insert(journalLines).values({
          id:            crypto.randomUUID(),
          entryId:       jeId,
          agencyId,
          accountCode:   l.account.code,
          accountNameAr: l.account.ar,
          accountNameEn: l.account.en,
          debitHalalas:  l.debitHalalas,
          creditHalalas: l.creditHalalas,
          sortOrder:     i + 1,
        });
      }

      // Close only the installments used in this payslip and reduce each
      // advance's outstanding balance by the exact deducted amount.
      const deductedByAdvance = new Map<string, number>();
      for (const installment of pendingInstallments) {
        const updated = await tx.update(salaryAdvanceInstallments).set({
          status: 'deducted', payslipId: id, deductedAt: new Date(), updatedAt: new Date(),
        }).where(and(
          eq(salaryAdvanceInstallments.id, installment.id),
          eq(salaryAdvanceInstallments.agencyId, agencyId),
          eq(salaryAdvanceInstallments.status, 'pending'),
        )).returning({ id: salaryAdvanceInstallments.id });
        if (updated.length === 0) throw new BusinessError('تغيرت حالة أحد أقساط السلفة؛ أعد إنشاء القسيمة', 409);
        deductedByAdvance.set(installment.advanceId, (deductedByAdvance.get(installment.advanceId) ?? 0) + installment.amountHalalas);
      }
      for (const [advanceId, amount] of deductedByAdvance) {
        await tx.update(salaryAdvances).set({
          remainingHalalas: sql`GREATEST(0, ${salaryAdvances.remainingHalalas} - ${amount})`,
          status: sql`CASE WHEN ${salaryAdvances.remainingHalalas} <= ${amount} THEN 'deducted' ELSE ${salaryAdvances.status} END`,
          settledAt: sql`CASE WHEN ${salaryAdvances.remainingHalalas} <= ${amount} THEN NOW() ELSE ${salaryAdvances.settledAt} END`,
          updatedAt: new Date(),
        }).where(and(eq(salaryAdvances.id, advanceId), eq(salaryAdvances.agencyId, agencyId)));
      }
    });

    await logAudit({ agencyId, userId: uid, action: 'create', resource: 'payslip', resourceId: id, after: { employeeId: body.employeeId, month: body.month, netHalalas: netPayable, gosiEmployee, gosiEmployer, journalEntryId: jeId } });
    return NextResponse.json({
      success: true, id, journalEntryId: jeId, netHalalas: netPayable,
      advanceDeduction, gosiEmployer, gosiEmployee,
      gosiEmployeeRateBps: gosi.employeeRateBps, gosiEmployerRateBps: gosi.employerRateBps,
    });
  } catch (err) {
    if (err instanceof ApiAuthError || err instanceof BusinessError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === '23505') {
      return NextResponse.json({ error: 'قسيمة الراتب لهذا الشهر موجودة مسبقاً' }, { status: 409 });
    }
    console.error(JSON.stringify({ event: 'payslip_create_failed', error: (err as Error).message }));
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
