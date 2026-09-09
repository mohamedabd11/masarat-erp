import { NextResponse } from 'next/server';
import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  employeeContracts,
  employees,
  employeeTerminations,
  eosbEmployeeProvisions,
  journalEntries,
  journalLines,
  payslips,
} from '@/lib/schema';
import { ApiAuthError, BusinessError, ROLES_ADMIN_ONLY, assertRole, verifyAuth } from '@/lib/api-auth';
import { requireFeature } from '@/lib/feature-access';
import { assertPeriodOpen } from '@/lib/period-lock';
import { getNextJournalNumber } from '@/lib/invoice-counter';
import { GL, type GLAccount } from '@/lib/gl-accounts';
import { isIsoDate } from '@/lib/hr-validation';
import { logAudit } from '@/lib/audit';

const PAYMENT_ACCOUNTS = { cash: GL.cash, bank_transfer: GL.bank } as const;

async function insertJournal(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  input: { agencyId: string; uid: string; date: string; sourceId: string; description: string; lines: Array<{ account: GLAccount; debit: number; credit: number }> },
): Promise<string | null> {
  const total = input.lines.reduce((sum, line) => sum + line.debit, 0);
  if (total === 0) return null;
  const credit = input.lines.reduce((sum, line) => sum + line.credit, 0);
  if (total !== credit) throw new Error('Unbalanced termination journal');
  const id = crypto.randomUUID();
  const entryNumber = await getNextJournalNumber(input.agencyId, Number(input.date.slice(0, 4)), tx);
  await tx.insert(journalEntries).values({
    id, agencyId: input.agencyId, entryNumber, date: input.date,
    descriptionAr: input.description, source: 'salary', sourceId: input.sourceId,
    isPosted: true, totalDebitHalalas: total, totalCreditHalalas: credit, createdBy: input.uid,
  });
  await tx.insert(journalLines).values(input.lines.filter((line) => line.debit || line.credit).map((line, index) => ({
    id: crypto.randomUUID(), entryId: id, agencyId: input.agencyId,
    accountCode: line.account.code, accountNameAr: line.account.ar, accountNameEn: line.account.en,
    debitHalalas: line.debit, creditHalalas: line.credit, sortOrder: index + 1,
  })));
  return id;
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const { uid, agencyId, role } = await verifyAuth(request);
    assertRole(role, [...ROLES_ADMIN_ONLY]);
    await requireFeature(agencyId, 'payroll', db);
    const body = await request.json() as { action?: 'approve' | 'pay' | 'cancel'; paymentMethod?: keyof typeof PAYMENT_ACCOUNTS; paymentDate?: string };
    if (!['approve', 'pay', 'cancel'].includes(body.action ?? '')) return NextResponse.json({ error: 'الإجراء غير مدعوم' }, { status: 400 });

    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`termination:${agencyId}:${params.id}`}))`);
      const [termination] = await tx.select().from(employeeTerminations).where(and(
        eq(employeeTerminations.id, params.id), eq(employeeTerminations.agencyId, agencyId),
      )).limit(1);
      if (!termination) throw new BusinessError('تسوية نهاية الخدمة غير موجودة', 404);

      if (body.action === 'cancel') {
        if (termination.status !== 'draft') throw new BusinessError('لا يمكن إلغاء تسوية معتمدة أو مدفوعة', 422);
        await tx.update(employeeTerminations).set({ status: 'cancelled', updatedAt: new Date() })
          .where(and(eq(employeeTerminations.id, termination.id), eq(employeeTerminations.agencyId, agencyId)));
        return { action: 'cancel', journalEntryId: null };
      }

      if (body.action === 'approve') {
        if (termination.status !== 'draft') throw new BusinessError('التسوية ليست في حالة مسودة', 409);
        await assertPeriodOpen(agencyId, termination.terminationDate, tx);
        const [laterPayslip] = await tx.select({ id: payslips.id }).from(payslips).where(and(
          eq(payslips.agencyId, agencyId), eq(payslips.employeeId, termination.employeeId),
          sql`${payslips.month} > ${termination.terminationDate.slice(0, 7)}`,
        )).limit(1);
        if (laterPayslip) throw new BusinessError('توجد قسيمة راتب بعد تاريخ نهاية الخدمة؛ يجب معالجتها أولاً', 422);
        const [latestProvision] = await tx.select({ target: eosbEmployeeProvisions.targetHalalas })
          .from(eosbEmployeeProvisions).where(and(
            eq(eosbEmployeeProvisions.agencyId, agencyId),
            eq(eosbEmployeeProvisions.employeeId, termination.employeeId),
            sql`${eosbEmployeeProvisions.month} <= ${termination.terminationDate.slice(0, 7)}`,
          )).orderBy(desc(eosbEmployeeProvisions.month)).limit(1);
        const provision = latestProvision?.target ?? 0;
        const settlement = termination.settlementHalalas;
        const applied = Math.min(provision, settlement);
        const reversed = Math.max(provision - settlement, 0);
        const topUp = Math.max(settlement - provision, 0);
        const journalEntryId = await insertJournal(tx, {
          agencyId, uid, date: termination.terminationDate, sourceId: termination.id,
          description: 'اعتماد تسوية مكافأة نهاية الخدمة',
          lines: [
            { account: GL.eosbProvision, debit: provision, credit: 0 },
            { account: GL.eosbExpense, debit: topUp, credit: reversed },
            { account: GL.eosbPayable, debit: 0, credit: settlement },
          ],
        });
        await tx.update(employeeTerminations).set({
          status: 'approved', provisionAppliedHalalas: applied, provisionReversedHalalas: reversed,
          settlementJournalEntryId: journalEntryId, approvedBy: uid, approvedAt: new Date(), updatedAt: new Date(),
        }).where(and(eq(employeeTerminations.id, termination.id), eq(employeeTerminations.agencyId, agencyId)));
        await tx.update(employees).set({ isActive: false, endDate: termination.terminationDate, updatedAt: new Date() })
          .where(and(eq(employees.id, termination.employeeId), eq(employees.agencyId, agencyId)));
        await tx.update(employeeContracts).set({ status: 'terminated', endDate: termination.terminationDate, updatedAt: new Date() })
          .where(and(
            eq(employeeContracts.employeeId, termination.employeeId), eq(employeeContracts.agencyId, agencyId),
            eq(employeeContracts.status, 'active'), sql`${employeeContracts.startDate} <= ${termination.terminationDate}`,
          ));
        await tx.update(employeeContracts).set({ status: 'terminated', updatedAt: new Date() })
          .where(and(
            eq(employeeContracts.employeeId, termination.employeeId), eq(employeeContracts.agencyId, agencyId),
            eq(employeeContracts.status, 'active'), sql`${employeeContracts.startDate} > ${termination.terminationDate}`,
          ));
        return { action: 'approve', journalEntryId, settlementHalalas: settlement, provisionHalalas: provision };
      }

      if (termination.status !== 'approved') throw new BusinessError('يجب اعتماد التسوية قبل دفعها', 409);
      const paymentMethod = body.paymentMethod ?? 'bank_transfer';
      if (!(paymentMethod in PAYMENT_ACCOUNTS)) throw new BusinessError('طريقة الدفع غير صالحة');
      const paymentDate = body.paymentDate ?? new Date().toISOString().slice(0, 10);
      if (!isIsoDate(paymentDate) || paymentDate < termination.terminationDate) throw new BusinessError('تاريخ الدفع غير صالح أو يسبق نهاية الخدمة');
      await assertPeriodOpen(agencyId, paymentDate, tx);
      const journalEntryId = termination.settlementHalalas === 0 ? null : await insertJournal(tx, {
        agencyId, uid, date: paymentDate, sourceId: termination.id,
        description: 'دفع مكافأة نهاية الخدمة',
        lines: [
          { account: GL.eosbPayable, debit: termination.settlementHalalas, credit: 0 },
          { account: PAYMENT_ACCOUNTS[paymentMethod], debit: 0, credit: termination.settlementHalalas },
        ],
      });
      await tx.update(employeeTerminations).set({
        status: 'paid', paymentMethod, paymentJournalEntryId: journalEntryId,
        paidBy: uid, paidAt: new Date(), updatedAt: new Date(),
      }).where(and(eq(employeeTerminations.id, termination.id), eq(employeeTerminations.agencyId, agencyId)));
      return { action: 'pay', journalEntryId, settlementHalalas: termination.settlementHalalas };
    });
    await logAudit({ agencyId, userId: uid, action: 'update', resource: 'employee_termination', resourceId: params.id, after: result });
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    if (err instanceof ApiAuthError || err instanceof BusinessError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error(JSON.stringify({ event: 'employee_termination_update_failed', error: String(err) }));
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
