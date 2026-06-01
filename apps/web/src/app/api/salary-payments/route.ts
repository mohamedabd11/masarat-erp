import { NextResponse } from 'next/server';
import { eq, and, desc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { salaryPayments, employees, journalEntries, journalLines } from '@/lib/schema';
import { verifyAuth, assertRole, ApiAuthError, BusinessError, ROLES_ADMIN_ONLY } from '@/lib/api-auth';
import { requireFeature } from '@/lib/feature-access';
import { getNextJournalNumber } from '@/lib/invoice-counter';
import { assertPeriodOpen } from '@/lib/period-lock';
import { GL } from '@/lib/gl-accounts';

const METHOD_ACCOUNT: Record<string, { code: string; ar: string; en: string }> = {
  cash:          GL.cash,
  bank_transfer: GL.bank,
  card:          GL.posCard,
};

// Paying a salary settles the previously-accrued liability (2310 Salaries Payable),
// it does NOT recognise a new expense. The expense is booked once, at payslip time.
const AC_SALARIES_PAYABLE = GL.salariesPayable;

export async function GET(request: Request) {
  try {
    const { agencyId } = await verifyAuth(request);
    await requireFeature(agencyId, 'payroll', db);
    const url        = new URL(request.url);
    const employeeId = url.searchParams.get('employeeId') ?? undefined;

    const conditions = [eq(salaryPayments.agencyId, agencyId)];
    if (employeeId) conditions.push(eq(salaryPayments.employeeId, employeeId));

    const rows = await db
      .select()
      .from(salaryPayments)
      .where(and(...conditions))
      .orderBy(desc(salaryPayments.createdAt));
    return NextResponse.json({ salaryPayments: rows });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { uid, agencyId, role } = await verifyAuth(request);
    assertRole(role, [...ROLES_ADMIN_ONLY]);
    const body = await request.json() as {
      employeeId:    string;
      amountHalalas: number;
      month:         string;            // YYYY-MM
      paymentMethod?: string;
      notes?:        string;
    };

    const { employeeId, amountHalalas, month } = body;
    if (!employeeId || !month) {
      return NextResponse.json({ error: 'employeeId و month مطلوبان' }, { status: 400 });
    }
    if (!Number.isInteger(amountHalalas) || amountHalalas <= 0) {
      return NextResponse.json({ error: 'مبلغ الراتب غير صالح' }, { status: 400 });
    }
    if (!/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json({ error: 'صيغة الشهر يجب أن تكون YYYY-MM' }, { status: 400 });
    }

    const result = await db.transaction(async (tx) => {
      // Verify employee belongs to this agency
      const [employee] = await tx
        .select({ id: employees.id, nameAr: employees.nameAr, endDate: employees.endDate })
        .from(employees)
        .where(and(eq(employees.id, employeeId), eq(employees.agencyId, agencyId)));
      if (!employee) throw new BusinessError('الموظف غير موجود', 404);

      // Warn: terminated employee
      if (employee.endDate) {
        const termDate  = new Date(employee.endDate);
        const [yr, mo]  = month.split('-').map(Number) as [number, number];
        const monthDate = new Date(yr, mo - 1, 1);
        if (termDate < monthDate) {
          throw new BusinessError(`الموظف "${employee.nameAr}" أنهى خدمته في ${employee.endDate} — لا يمكن صرف راتب لهذا الشهر`, 400);
        }
      }

      // Prevent duplicate salary for same employee + month
      const [existing] = await tx
        .select({ id: salaryPayments.id })
        .from(salaryPayments)
        .where(and(eq(salaryPayments.employeeId, employeeId), eq(salaryPayments.month, month), eq(salaryPayments.agencyId, agencyId)))
        .limit(1);
      if (existing) throw new BusinessError(`تم صرف راتب ${month} للموظف "${employee.nameAr}" مسبقاً`, 409);

      const now    = new Date();
      const year   = now.getFullYear();
      const today  = now.toISOString().split('T')[0]!;

      await assertPeriodOpen(agencyId, today, tx);

      const jeId   = crypto.randomUUID();
      const jeNum  = await getNextJournalNumber(agencyId, year, tx);
      const payId  = crypto.randomUUID();
      const paymentMethod = body.paymentMethod ?? 'bank_transfer';
      const cashAc = METHOD_ACCOUNT[paymentMethod] ?? METHOD_ACCOUNT['bank_transfer']!;

      await tx.insert(salaryPayments).values({
        id:            payId,
        agencyId,
        employeeId,
        amountHalalas,
        month,
        paymentMethod,
        notes:         body.notes ?? null,
        journalEntryId: jeId,
      });

      await tx.insert(journalEntries).values({
        id:                  jeId,
        agencyId,
        entryNumber:         jeNum,
        date:                today,
        descriptionAr:       `راتب ${employee.nameAr} — ${month}`,
        descriptionEn:       `Salary ${employee.nameAr} — ${month}`,
        source:              'manual',
        sourceId:            payId,
        isPosted:            true,
        totalDebitHalalas:   amountHalalas,
        totalCreditHalalas:  amountHalalas,
        createdBy:           uid,
      });

      // Salary disbursement settles the accrued liability (no new expense here):
      //   Dr 2310 Salaries Payable   (clears the accrual booked by the payslip)
      //      Cr Bank / Cash          (cash outflow)
      await tx.insert(journalLines).values([
        { id: crypto.randomUUID(), entryId: jeId, agencyId, accountCode: AC_SALARIES_PAYABLE.code, accountNameAr: AC_SALARIES_PAYABLE.ar, accountNameEn: AC_SALARIES_PAYABLE.en, debitHalalas: amountHalalas, creditHalalas: 0,             sortOrder: 1 },
        { id: crypto.randomUUID(), entryId: jeId, agencyId, accountCode: cashAc.code,               accountNameAr: cashAc.ar,               accountNameEn: cashAc.en,               debitHalalas: 0,             creditHalalas: amountHalalas, sortOrder: 2 },
      ]);

      return { id: payId };
    });

    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    if (err instanceof ApiAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    if (err instanceof BusinessError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error(JSON.stringify({ event: 'salary_payment_failed', error: String(err) }));
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
