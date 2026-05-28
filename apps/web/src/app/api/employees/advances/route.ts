import { NextResponse } from 'next/server';
import { eq, and, desc } from 'drizzle-orm';
import { db } from '@/lib/db';
import { salaryAdvances, employees, journalEntries, journalLines } from '@/lib/schema';
import { verifyAuth, assertRole, ApiAuthError, ROLES_ADMIN_ONLY, ROLES_MANAGER_UP } from '@/lib/api-auth';
import { logAudit } from '@/lib/audit';
import { getNextJournalNumber } from '@/lib/invoice-counter';

const AC_ADVANCE   = { code: '1130', ar: 'سلف الموظفين',      en: 'Employee Advances' };
const AC_CASH      = { code: '1100', ar: 'الصندوق النقدي',     en: 'Cash' };
const AC_BANK      = { code: '1110', ar: 'البنك',              en: 'Bank' };

export async function GET(request: Request) {
  try {
    const { agencyId } = await verifyAuth(request);
    const url        = new URL(request.url);
    const employeeId = url.searchParams.get('employeeId') ?? undefined;
    const status     = url.searchParams.get('status')     ?? undefined;

    const conditions = [eq(salaryAdvances.agencyId, agencyId)];
    if (employeeId) conditions.push(eq(salaryAdvances.employeeId, employeeId));
    if (status)     conditions.push(eq(salaryAdvances.status, status));

    const rows = await db
      .select()
      .from(salaryAdvances)
      .where(and(...conditions))
      .orderBy(desc(salaryAdvances.createdAt));

    return NextResponse.json({ advances: rows });
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
      deductFrom:    string;   // YYYY-MM
      paymentMethod?: string;  // cash|bank_transfer
      reason?:       string;
    };

    if (!body.employeeId || !body.deductFrom) {
      return NextResponse.json({ error: 'employeeId و deductFrom مطلوبان' }, { status: 400 });
    }
    if (!Number.isInteger(body.amountHalalas) || body.amountHalalas <= 0) {
      return NextResponse.json({ error: 'المبلغ غير صالح' }, { status: 400 });
    }
    if (!/^\d{4}-\d{2}$/.test(body.deductFrom)) {
      return NextResponse.json({ error: 'صيغة deductFrom يجب أن تكون YYYY-MM' }, { status: 400 });
    }

    const [emp] = await db.select({ id: employees.id, nameAr: employees.nameAr })
      .from(employees)
      .where(and(eq(employees.id, body.employeeId), eq(employees.agencyId, agencyId)));
    if (!emp) return NextResponse.json({ error: 'الموظف غير موجود' }, { status: 404 });

    const result = await db.transaction(async (tx) => {
      const today  = new Date().toISOString().split('T')[0]!;
      const year   = new Date().getFullYear();
      const jeNum  = await getNextJournalNumber(agencyId, year, tx);
      const id     = crypto.randomUUID();
      const jeId   = crypto.randomUUID();
      const payAc  = body.paymentMethod === 'bank_transfer' ? AC_BANK : AC_CASH;

      await tx.insert(salaryAdvances).values({
        id,
        agencyId,
        employeeId:    body.employeeId,
        amountHalalas: body.amountHalalas,
        requestDate:   today,
        deductFrom:    body.deductFrom,
        status:        'paid',
        reason:        body.reason   ?? null,
        approvedBy:    uid,
        journalEntryId: jeId,
        createdBy:     uid,
      });

      // GL: Dr Employee Advances / Cr Cash or Bank
      await tx.insert(journalEntries).values({
        id: jeId, agencyId,
        entryNumber:        jeNum,
        date:               today,
        descriptionAr:      `سلفة للموظف ${emp.nameAr} — خصم من ${body.deductFrom}`,
        source:             'manual',
        sourceId:           id,
        isPosted:           true,
        totalDebitHalalas:  body.amountHalalas,
        totalCreditHalalas: body.amountHalalas,
        createdBy:          uid,
      });

      await tx.insert(journalLines).values([
        { id: crypto.randomUUID(), entryId: jeId, agencyId, accountCode: AC_ADVANCE.code, accountNameAr: AC_ADVANCE.ar, accountNameEn: AC_ADVANCE.en, debitHalalas: body.amountHalalas, creditHalalas: 0, sortOrder: 1 },
        { id: crypto.randomUUID(), entryId: jeId, agencyId, accountCode: payAc.code, accountNameAr: payAc.ar, accountNameEn: payAc.en, debitHalalas: 0, creditHalalas: body.amountHalalas, sortOrder: 2 },
      ]);

      return { id };
    });

    await logAudit({ agencyId, userId: uid, action: 'create', resource: 'salary_advance', resourceId: result.id, after: { employeeId: body.employeeId, amountHalalas: body.amountHalalas } });
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    if (err instanceof ApiAuthError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(JSON.stringify({ event: 'salary_advance_failed', error: (err as Error).message }));
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
