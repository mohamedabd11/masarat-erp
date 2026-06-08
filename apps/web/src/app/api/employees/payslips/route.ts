import { NextResponse } from 'next/server';
import { eq, and, desc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { payslips, employees, salaryAdvances, employeeContracts, journalEntries, journalLines } from '@/lib/schema';
import { verifyAuth, assertRole, ApiAuthError, BusinessError, ROLES_ADMIN_ONLY } from '@/lib/api-auth';
import { requireFeature } from '@/lib/feature-access';
import { logAudit } from '@/lib/audit';
import { getNextJournalNumber } from '@/lib/invoice-counter';
import { assertPeriodOpen } from '@/lib/period-lock';
import { GL } from '@/lib/gl-accounts';

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
      gosiEmployeeHalalas?:     number;
      components?:              unknown;
      paymentDate?:             string;
      paymentMethod?:           string;
    };

    if (!body.employeeId || !body.month) {
      return NextResponse.json({ error: 'employeeId و month مطلوبان' }, { status: 400 });
    }
    if (!/^\d{4}-\d{2}$/.test(body.month)) {
      return NextResponse.json({ error: 'صيغة الشهر يجب أن تكون YYYY-MM' }, { status: 400 });
    }

    // Check no duplicate
    const [existing] = await db.select({ id: payslips.id }).from(payslips)
      .where(and(eq(payslips.employeeId, body.employeeId), eq(payslips.month, body.month), eq(payslips.agencyId, agencyId)))
      .limit(1);
    if (existing) return NextResponse.json({ error: `قسيمة الراتب لشهر ${body.month} موجودة مسبقاً` }, { status: 409 });

    // Auto-include advance deductions for this month
    const pendingAdvances = await db.select({ id: salaryAdvances.id, amountHalalas: salaryAdvances.amountHalalas })
      .from(salaryAdvances)
      .where(and(
        eq(salaryAdvances.employeeId, body.employeeId),
        eq(salaryAdvances.deductFrom, body.month),
        eq(salaryAdvances.status, 'paid'),
        eq(salaryAdvances.agencyId, agencyId),
      ));
    const advanceDeduction = pendingAdvances.reduce((s, a) => s + a.amountHalalas, 0);

    // Fetch employee for the journal-entry description (and to validate it exists)
    const [employee] = await db.select({ id: employees.id, nameAr: employees.nameAr, nationalityType: employees.nationalityType })
      .from(employees)
      .where(and(eq(employees.id, body.employeeId), eq(employees.agencyId, agencyId)))
      .limit(1);
    if (!employee) return NextResponse.json({ error: 'الموظف غير موجود' }, { status: 404 });

    const base      = body.baseSalaryHalalas;
    const housing   = body.housingAllowanceHalalas   ?? 0;
    const transport = body.transportAllowanceHalalas ?? 0;
    const other     = body.otherAllowancesHalalas    ?? 0;
    const gross     = base + housing + transport + other;
    const deduct    = body.deductionsHalalas ?? 0;
    const gosiEmployee = body.gosiEmployeeHalalas ?? 0;
    // GOSI employer rates per Saudi social insurance regulations:
    //   Saudi nationals: 9% pension + 0.75% occupational hazard = 9.75%
    //   Expats: 2% occupational hazard only
    const GOSI_EMPLOYER_RATE = (employee.nationalityType ?? 'saudi') === 'expat' ? 0.02 : 0.0975;
    const gosiBase     = base + housing;
    const gosiEmployer = Math.round(gosiBase * GOSI_EMPLOYER_RATE);
    const net          = gross - deduct - advanceDeduction - gosiEmployee;

    const id    = crypto.randomUUID();
    const jeId  = crypto.randomUUID();
    const year  = Number(body.month.slice(0, 4));
    const mm    = body.month.slice(5, 7);
    const today = body.paymentDate ?? `${body.month}-01`;

    // ── GL journal entry (IAS 19) ───────────────────────────────────────────
    //  Dr 6100 Salary Expense         (gross)
    //  Dr 6200 GOSI Expense - Employer (employerGosi)        [only if > 0]
    //     Cr 2310 Salaries Payable     (net = gross - employeeGosi - deductions - advances)
    //     Cr 2400 GOSI Payable         (employerGosi + employeeGosi)   [only if any GOSI]
    //  Other deductions/advances reduce the cash settled to the employee, so they
    //  are netted into Salaries Payable here (the actual cash-out is recorded when
    //  the salary payment is made).
    const netPayable = Math.max(0, net);
    const totalGosi  = gosiEmployer + gosiEmployee;

    type JLine = { code: string; ar: string; en: string; dr: number; cr: number };
    const ln = (ac: { code: string; ar: string; en: string }, dr: number, cr: number): JLine =>
      ({ code: ac.code, ar: ac.ar, en: ac.en, dr, cr });

    const jLines: JLine[] = [ln(GL.salaryExpense, gross, 0)];
    if (gosiEmployer > 0) jLines.push(ln(GL.gosiExpense, gosiEmployer, 0));
    jLines.push(ln(GL.salariesPayable, 0, netPayable));
    if (totalGosi > 0)    jLines.push(ln(GL.gosiPayable, 0, totalGosi));
    // Balance any residual (other deductions / advances) into salaries payable so
    // the entry always balances: total debits === total credits.
    const totalDr = jLines.reduce((s, l) => s + l.dr, 0);
    const totalCr = jLines.reduce((s, l) => s + l.cr, 0);
    if (totalDr !== totalCr) {
      // residual deductions (advances + manual deductions) credited to salaries payable
      const payableLine = jLines.find((l) => l.code === GL.salariesPayable.code)!;
      payableLine.cr += (totalDr - totalCr);
    }

    await db.transaction(async (tx) => {
      // Block posting the payroll journal into a closed accounting period.
      await assertPeriodOpen(agencyId, today, tx);

      await tx.insert(payslips).values({
        id,
        agencyId,
        employeeId:               body.employeeId,
        month:                    body.month,
        salaryPaymentId:          body.salaryPaymentId ?? null,
        baseSalaryHalalas:        base,
        housingAllowanceHalalas:  housing,
        transportAllowanceHalalas: transport,
        otherAllowancesHalalas:   other,
        grossHalalas:             gross,
        deductionsHalalas:        deduct,
        advanceDeductionHalalas:  advanceDeduction,
        gosi_employee_halalas:    gosiEmployee,
        gosiEmployerHalalas:      gosiEmployer,
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
        totalDebitHalalas:  jLines.reduce((s, l) => s + l.dr, 0),
        totalCreditHalalas: jLines.reduce((s, l) => s + l.cr, 0),
        createdBy:          uid,
      });

      for (let i = 0; i < jLines.length; i++) {
        const l = jLines[i]!;
        await tx.insert(journalLines).values({
          id:            crypto.randomUUID(),
          entryId:       jeId,
          agencyId,
          accountCode:   l.code,
          accountNameAr: l.ar,
          accountNameEn: l.en,
          debitHalalas:  l.dr,
          creditHalalas: l.cr,
          sortOrder:     i + 1,
        });
      }

      // Mark advances as deducted
      for (const adv of pendingAdvances) {
        await tx.update(salaryAdvances).set({ status: 'deducted', updatedAt: new Date() })
          .where(eq(salaryAdvances.id, adv.id));
      }
    });

    await logAudit({ agencyId, userId: uid, action: 'create', resource: 'payslip', resourceId: id, after: { employeeId: body.employeeId, month: body.month, netHalalas: net, gosiEmployer, journalEntryId: jeId } });
    return NextResponse.json({ success: true, id, journalEntryId: jeId, netHalalas: netPayable, advanceDeduction, gosiEmployer });
  } catch (err) {
    if (err instanceof ApiAuthError || err instanceof BusinessError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(JSON.stringify({ event: 'payslip_create_failed', error: (err as Error).message }));
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
