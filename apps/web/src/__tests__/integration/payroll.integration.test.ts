/**
 * Integration Tests — Payroll Run (Real DB)
 *
 * Payroll tables DO exist in the schema (src/lib/schema/hr.ts):
 *   - employees, payslips, salary_advances, eosb_accruals
 * so this file is active (NOT skipped).
 *
 * Tests run against a real local PostgreSQL database. They replicate the
 * server-side payroll-posting logic from:
 *   - src/app/api/employees/payslips/route.ts   (salary + GOSI journal)
 *   - src/app/api/employees/eosb/route.ts        (statutory EOSB estimate)
 * directly against Drizzle (no HTTP), and verify the GL invariants.
 *
 * Expected payroll journal (per payslip route):
 *   Dr 6100 Salary Expense          (gross)
 *      Cr 2310 Salaries Payable      (net)
 *      Cr 2400 GOSI Payable          (employeeGosi + employerGosi)
 *   Dr 6200 GOSI Expense - Employer  (employerGosi)
 *
 * Expected EOSB adjustment journal (per eosb route):
 *   Dr 6300 EOSB Expense / Cr 2500 EOSB Provision for increases.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { getTestDb, closeTestDb, sql , SKIP_IF_NO_DB } from './test-db';
import {
  agencies, employees, payslips, eosbAccruals,
  journalEntries, journalLines,
} from '@/lib/schema';
import { getNextJournalNumber } from '@/lib/invoice-counter';
import { GL } from '@/lib/gl-accounts';
import { buildPayrollJournal } from '@/lib/payroll-journal';

const AGENCY_ID  = 'integ-test-payroll-01';
const EMPLOYEE_ID = `${AGENCY_ID}-emp-1`;
const USER_ID    = 'user-payroll';

/**
 * Replicates employees/payslips POST GL posting. Builds the salary journal the
 * same way the route does, via the shared production journal builder.
 */
async function runPayroll(opts: {
  month: string;                  // YYYY-MM
  baseSalaryHalalas: number;
  housingAllowanceHalalas?: number;
  deductionsHalalas?: number;
  advanceDeductionHalalas?: number;
}) {
  const db = getTestDb();
  const base      = opts.baseSalaryHalalas;
  const housing   = opts.housingAllowanceHalalas ?? 0;
  const gross     = base + housing;
  const deduct    = opts.deductionsHalalas ?? 0;
  const advanceDeduction = opts.advanceDeductionHalalas ?? 0;
  const gosiBase     = base + housing;
  const gosiEmployee = Math.round(gosiBase * 0.10);     // 10% Saudi employee share
  const gosiEmployer = Math.round(gosiBase * 0.12);     // 12% Saudi employer share
  const totalGosi    = gosiEmployer + gosiEmployee;
  const payrollJournal = buildPayrollJournal({
    grossHalalas: gross,
    employeeGosiHalalas: gosiEmployee,
    employerGosiHalalas: gosiEmployer,
    manualDeductionsHalalas: deduct,
    advanceDeductionHalalas: advanceDeduction,
  });
  const netPayable = payrollJournal.netHalalas;

  return db.transaction(async (tx) => {
    const year  = Number(opts.month.slice(0, 4));
    const today = `${opts.month}-01`;
    const id    = crypto.randomUUID();
    const jeId  = crypto.randomUUID();

    await tx.insert(payslips).values({
      id, agencyId: AGENCY_ID, employeeId: EMPLOYEE_ID, month: opts.month,
      baseSalaryHalalas: base, housingAllowanceHalalas: housing,
      grossHalalas: gross, deductionsHalalas: deduct,
      advanceDeductionHalalas: advanceDeduction,
      gosiEmployeeHalalas: gosiEmployee, gosiEmployerHalalas: gosiEmployer,
      netHalalas: netPayable,
    });

    const jeNumber = await getNextJournalNumber(AGENCY_ID, year, tx as never);
    await tx.insert(journalEntries).values({
      id: jeId, agencyId: AGENCY_ID, entryNumber: jeNumber, date: today,
      descriptionAr: `راتب ${opts.month}`, source: 'salary', sourceId: id, isPosted: true,
      totalDebitHalalas:  payrollJournal.totalDebitHalalas,
      totalCreditHalalas: payrollJournal.totalCreditHalalas,
      createdBy: USER_ID,
    });
    for (let i = 0; i < payrollJournal.lines.length; i++) {
      const l = payrollJournal.lines[i]!;
      await tx.insert(journalLines).values({
        id: crypto.randomUUID(), entryId: jeId, agencyId: AGENCY_ID,
        accountCode: l.account.code, accountNameAr: l.account.ar, accountNameEn: l.account.en,
        debitHalalas: l.debitHalalas, creditHalalas: l.creditHalalas, sortOrder: i + 1,
      });
    }
    return { id, jeId, gross, netPayable, gosiEmployer, gosiEmployee, totalGosi };
  });
}

/** Replicates employees/eosb POST GL posting: Dr 6300 / Cr 2500. */
async function accrueEosb(opts: { month: string; amountHalalas: number; employeeCount: number }) {
  const db = getTestDb();
  return db.transaction(async (tx) => {
    const year  = Number(opts.month.slice(0, 4));
    const today = `${opts.month}-01`;
    const accrualId = crypto.randomUUID();
    const jeId = crypto.randomUUID();
    const jeNumber = await getNextJournalNumber(AGENCY_ID, year, tx as never);

    await tx.insert(journalEntries).values({
      id: jeId, agencyId: AGENCY_ID, entryNumber: jeNumber, date: today,
      descriptionAr: `مخصص مكافأة نهاية الخدمة ${opts.month}`, source: 'salary', sourceId: accrualId,
      isPosted: true, totalDebitHalalas: opts.amountHalalas, totalCreditHalalas: opts.amountHalalas, createdBy: USER_ID,
    });
    await tx.insert(journalLines).values([
      { id: crypto.randomUUID(), entryId: jeId, agencyId: AGENCY_ID, accountCode: GL.eosbExpense.code,   accountNameAr: GL.eosbExpense.ar,   accountNameEn: GL.eosbExpense.en,   debitHalalas: opts.amountHalalas, creditHalalas: 0,                 sortOrder: 1 },
      { id: crypto.randomUUID(), entryId: jeId, agencyId: AGENCY_ID, accountCode: GL.eosbProvision.code, accountNameAr: GL.eosbProvision.ar, accountNameEn: GL.eosbProvision.en, debitHalalas: 0,                 creditHalalas: opts.amountHalalas, sortOrder: 2 },
    ]);
    await tx.insert(eosbAccruals).values({
      id: accrualId, agencyId: AGENCY_ID, month: opts.month,
      amountHalalas: opts.amountHalalas, employeeCount: opts.employeeCount, journalEntryId: jeId, createdBy: USER_ID,
    });
    return { accrualId, jeId };
  });
}

async function lines(jeId: string) {
  const db = getTestDb();
  return db.select().from(journalLines).where(eq(journalLines.entryId, jeId));
}

// ─── Setup / Teardown ─────────────────────────────────────────────────────────

beforeAll(async () => {
  if (SKIP_IF_NO_DB) return;
  const db = getTestDb();
  await db.insert(agencies).values({
    id: AGENCY_ID, nameAr: 'وكالة اختبار الرواتب',
    nameEn: 'Payroll Test Agency', subscriptionStatus: 'active', isVatRegistered: false,
  }).onConflictDoNothing();
  await db.insert(employees).values({
    id: EMPLOYEE_ID, agencyId: AGENCY_ID, employeeNumber: 'EMP-001',
    nameAr: 'موظف اختبار', salaryHalalas: 10_000_00, hireDate: '2020-01-01', isActive: true,
  }).onConflictDoNothing();
});

beforeEach(async () => {
  if (SKIP_IF_NO_DB) return;
  await sql(`DELETE FROM journal_lines   WHERE agency_id = '${AGENCY_ID}'`);
  await sql(`DELETE FROM journal_entries WHERE agency_id = '${AGENCY_ID}'`);
  await sql(`DELETE FROM eosb_accruals   WHERE agency_id = '${AGENCY_ID}'`);
  await sql(`DELETE FROM payslips        WHERE agency_id = '${AGENCY_ID}'`);
});

afterAll(async () => {
  if (SKIP_IF_NO_DB) return;
  await sql(`DELETE FROM journal_lines   WHERE agency_id = '${AGENCY_ID}'`);
  await sql(`DELETE FROM journal_entries WHERE agency_id = '${AGENCY_ID}'`);
  await sql(`DELETE FROM eosb_accruals   WHERE agency_id = '${AGENCY_ID}'`);
  await sql(`DELETE FROM payslips        WHERE agency_id = '${AGENCY_ID}'`);
  await sql(`DELETE FROM employees       WHERE agency_id = '${AGENCY_ID}'`);
  await sql(`DELETE FROM agency_counters WHERE agency_id = '${AGENCY_ID}'`);
  await sql(`DELETE FROM agencies        WHERE id        = '${AGENCY_ID}'`);
  await closeTestDb();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe.skipIf(SKIP_IF_NO_DB)('payroll — قيد الراتب', () => {

  it('قيد الراتب متوازن (DR = CR)', async () => {
    const r = await runPayroll({ month: '2025-01', baseSalaryHalalas: 8_000_00, housingAllowanceHalalas: 2_000_00 });
    const db = getTestDb();
    const [entry] = await db.select().from(journalEntries).where(eq(journalEntries.id, r.jeId));
    expect(entry!.totalDebitHalalas).toBe(entry!.totalCreditHalalas);

    const ls = await lines(r.jeId);
    const dr = ls.reduce((s, l) => s + l.debitHalalas,  0);
    const cr = ls.reduce((s, l) => s + l.creditHalalas, 0);
    expect(dr).toBe(cr);
  });

  it('مصروف الرواتب (6100) يُحمَّل مديناً بإجمالي الراتب', async () => {
    const r = await runPayroll({ month: '2025-02', baseSalaryHalalas: 8_000_00, housingAllowanceHalalas: 2_000_00 });
    const ls = await lines(r.jeId);
    const salaryExp = ls.find(l => l.accountCode === '6100')!;
    expect(salaryExp.debitHalalas).toBe(r.gross);         // 10,000.00
    expect(salaryExp.creditHalalas).toBe(0);
  });

  it('الرواتب المستحقة (2310) تُجعل دائنة بالصافي', async () => {
    const r = await runPayroll({ month: '2025-03', baseSalaryHalalas: 8_000_00, housingAllowanceHalalas: 2_000_00 });
    const ls = await lines(r.jeId);
    const payable = ls.find(l => l.accountCode === '2310')!;
    expect(payable.creditHalalas).toBe(r.netPayable);     // gross - employeeGosi = 9,000.00
    expect(r.netPayable).toBe(r.gross - r.gosiEmployee);
  });

  it('GOSI المستحقة (2400) تُجعل دائنة بحصة الموظف + حصة صاحب العمل', async () => {
    const r = await runPayroll({ month: '2025-04', baseSalaryHalalas: 8_000_00, housingAllowanceHalalas: 2_000_00 });
    const ls = await lines(r.jeId);
    const gosiPayable = ls.find(l => l.accountCode === '2400')!;
    expect(gosiPayable.creditHalalas).toBe(r.totalGosi);
    expect(r.totalGosi).toBe(r.gosiEmployee + r.gosiEmployer);
  });

  it('مصروف GOSI لصاحب العمل (6200) يُحمَّل مديناً بحصة صاحب العمل (12%)', async () => {
    const r = await runPayroll({ month: '2025-05', baseSalaryHalalas: 8_000_00, housingAllowanceHalalas: 2_000_00 });
    const ls = await lines(r.jeId);
    const gosiExp = ls.find(l => l.accountCode === '6200')!;
    expect(gosiExp.debitHalalas).toBe(r.gosiEmployer);
    expect(r.gosiEmployer).toBe(Math.round(10_000_00 * 0.12));  // 1,200.00
  });

  it('خصم السلفة والاستقطاعات يغلقان حسابيهما ولا يبقيان داخل الرواتب المستحقة', async () => {
    const r = await runPayroll({
      month: '2025-07', baseSalaryHalalas: 10_000_00,
      deductionsHalalas: 250_00, advanceDeductionHalalas: 750_00,
    });
    const ls = await lines(r.jeId);
    expect(ls.find(l => l.accountCode === '1140')?.creditHalalas).toBe(750_00);
    expect(ls.find(l => l.accountCode === '2390')?.creditHalalas).toBe(250_00);
    expect(ls.find(l => l.accountCode === '2310')?.creditHalalas).toBe(r.netPayable);
  });

});

describe.skipIf(SKIP_IF_NO_DB)('payroll — تقدير مخصص مكافأة نهاية الخدمة', () => {

  it('قيد مخصص EOSB متوازن: Dr 6300 / Cr 2500', async () => {
    const amount = 333_00;
    const r = await accrueEosb({ month: '2025-06', amountHalalas: amount, employeeCount: 1 });

    const ls = await lines(r.jeId);
    const dr = ls.reduce((s, l) => s + l.debitHalalas,  0);
    const cr = ls.reduce((s, l) => s + l.creditHalalas, 0);
    expect(dr).toBe(cr);
    expect(dr).toBe(amount);

    const exp  = ls.find(l => l.accountCode === '6300')!;   // EOSB Expense
    const prov = ls.find(l => l.accountCode === '2500')!;   // EOSB Provision
    expect(exp.debitHalalas).toBe(amount);
    expect(prov.creditHalalas).toBe(amount);

    const db = getTestDb();
    const [accrual] = await db.select().from(eosbAccruals).where(eq(eosbAccruals.id, r.accrualId));
    expect(accrual!.amountHalalas).toBe(amount);
    expect(accrual!.month).toBe('2025-06');
  });

});
