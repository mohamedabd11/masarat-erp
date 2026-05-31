import { NextResponse } from 'next/server';
import { eq, and, desc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { payslips, employees, salaryAdvances, employeeContracts } from '@/lib/schema';
import { verifyAuth, assertRole, ApiAuthError, BusinessError, ROLES_ADMIN_ONLY } from '@/lib/api-auth';
import { requireFeature } from '@/lib/feature-access';
import { logAudit } from '@/lib/audit';

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

    const base      = body.baseSalaryHalalas;
    const housing   = body.housingAllowanceHalalas   ?? 0;
    const transport = body.transportAllowanceHalalas ?? 0;
    const other     = body.otherAllowancesHalalas    ?? 0;
    const gross     = base + housing + transport + other;
    const deduct    = body.deductionsHalalas ?? 0;
    const gosi      = body.gosiEmployeeHalalas ?? 0;
    const net       = gross - deduct - advanceDeduction - gosi;

    const id = crypto.randomUUID();
    await db.insert(payslips).values({
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
      gosi_employee_halalas:    gosi,
      netHalalas:               Math.max(0, net),
      components:               (body.components ?? null) as never,
      paymentDate:              body.paymentDate  ?? null,
      paymentMethod:            body.paymentMethod ?? null,
    });

    // Mark advances as deducted
    for (const adv of pendingAdvances) {
      await db.update(salaryAdvances).set({ status: 'deducted', updatedAt: new Date() })
        .where(eq(salaryAdvances.id, adv.id));
    }

    await logAudit({ agencyId, userId: uid, action: 'create', resource: 'payslip', resourceId: id, after: { employeeId: body.employeeId, month: body.month, netHalalas: net } });
    return NextResponse.json({ success: true, id, netHalalas: Math.max(0, net), advanceDeduction });
  } catch (err) {
    if (err instanceof ApiAuthError || err instanceof BusinessError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(JSON.stringify({ event: 'payslip_create_failed', error: (err as Error).message }));
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
