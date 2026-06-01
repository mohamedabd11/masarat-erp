import { NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { employees, eosbAccruals, journalEntries, journalLines } from '@/lib/schema';
import { verifyAuth, assertRole, ApiAuthError, BusinessError, ROLES_MANAGER_UP } from '@/lib/api-auth';
import { requireFeature } from '@/lib/feature-access';
import { logAudit } from '@/lib/audit';
import { getNextJournalNumber } from '@/lib/invoice-counter';
import { calculateEosb, monthlyEosbAccrual } from '@/lib/eosb';
import { GL } from '@/lib/gl-accounts';

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

    const result = rows.map((e) => ({
      ...e,
      // `salaryHalalas` is treated as the basic salary used for EOSB (the schema
      // has no separate basic-salary column on employees).
      eosbAmount:          e.hireDate ? calculateEosb(e.salaryHalalas, e.hireDate) : 0,
      monthlyAccrual:      e.hireDate ? monthlyEosbAccrual(e.salaryHalalas, e.hireDate) : 0,
    }));

    return NextResponse.json({ employees: result });
  } catch (err) {
    if (err instanceof ApiAuthError || err instanceof BusinessError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}

// ── POST { action: 'accrue', month: 'YYYY-MM' } ───────────────────────────────
// Posts the monthly EOSB provision for all active employees:
//   Dr 6300 EOSB Expense    (monthly accrual total)
//      Cr 2500 EOSB Provision (monthly accrual total)
export async function POST(request: Request) {
  try {
    const { uid, agencyId, role } = await verifyAuth(request);
    assertRole(role, [...ROLES_MANAGER_UP]);
    await requireFeature(agencyId, 'payroll', db);

    const body = await request.json() as { action?: string; month?: string };
    if (body.action !== 'accrue') {
      return NextResponse.json({ error: "action غير مدعوم. استخدم 'accrue'" }, { status: 400 });
    }
    if (!body.month || !/^\d{4}-\d{2}$/.test(body.month)) {
      return NextResponse.json({ error: 'صيغة الشهر يجب أن تكون YYYY-MM' }, { status: 400 });
    }
    const month = body.month;

    // Guard against accruing the same month twice
    const [existing] = await db.select({ id: eosbAccruals.id }).from(eosbAccruals)
      .where(and(eq(eosbAccruals.agencyId, agencyId), eq(eosbAccruals.month, month)))
      .limit(1);
    if (existing) {
      return NextResponse.json({ error: `مخصص نهاية الخدمة لشهر ${month} تم احتسابه مسبقاً` }, { status: 409 });
    }

    const active = await db.select({
      id:            employees.id,
      hireDate:      employees.hireDate,
      salaryHalalas: employees.salaryHalalas,
    })
      .from(employees)
      .where(and(eq(employees.agencyId, agencyId), eq(employees.isActive, true)));

    let totalAccrual  = 0;
    let employeeCount = 0;
    for (const e of active) {
      if (!e.hireDate) continue;
      const accrual = monthlyEosbAccrual(e.salaryHalalas, e.hireDate);
      if (accrual > 0) {
        totalAccrual += accrual;
        employeeCount += 1;
      }
    }

    if (totalAccrual === 0) {
      return NextResponse.json({ error: 'لا يوجد موظفون مؤهلون لاحتساب مخصص نهاية الخدمة لهذا الشهر' }, { status: 400 });
    }

    const accrualId = crypto.randomUUID();
    const jeId      = crypto.randomUUID();
    const year      = Number(month.slice(0, 4));
    const date      = `${month}-01`;

    await db.transaction(async (tx) => {
      const jeNumber = await getNextJournalNumber(agencyId, year, tx);

      await tx.insert(journalEntries).values({
        id:                 jeId,
        agencyId,
        entryNumber:        jeNumber,
        date,
        descriptionAr:      `مخصص مكافأة نهاية الخدمة - ${month}`,
        descriptionEn:      `EOSB provision - ${month}`,
        source:             'salary',
        sourceId:           accrualId,
        isPosted:           true,
        totalDebitHalalas:  totalAccrual,
        totalCreditHalalas: totalAccrual,
        createdBy:          uid,
      });

      const lines = [
        { ac: GL.eosbExpense,   dr: totalAccrual, cr: 0 },
        { ac: GL.eosbProvision, dr: 0,            cr: totalAccrual },
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

      await tx.insert(eosbAccruals).values({
        id:             accrualId,
        agencyId,
        month,
        amountHalalas:  totalAccrual,
        employeeCount,
        journalEntryId: jeId,
        createdBy:      uid,
      });
    });

    await logAudit({ agencyId, userId: uid, action: 'create', resource: 'eosb_accrual', resourceId: accrualId, after: { month, amountHalalas: totalAccrual, employeeCount, journalEntryId: jeId } });
    return NextResponse.json({ success: true, id: accrualId, journalEntryId: jeId, amountHalalas: totalAccrual, employeeCount });
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
