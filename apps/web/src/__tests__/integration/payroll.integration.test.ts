/**
 * Integration Tests — Payroll Run (Real DB)
 *
 * Payroll tables DO exist in the schema (src/lib/schema/hr.ts):
 *   - employees, payslips, salary_advances, eosb_accruals
 * so this file is active (NOT skipped).
 *
 * Tests run against a real local PostgreSQL database. They replicate the
 * server-side payroll-posting logic from:
 *   - src/app/api/employees/payslips/route.ts   (salary + GOSI journal, IAS 19)
 *   - src/app/api/employees/eosb/route.ts        (EOSB provision accrual, IAS 19)
 * directly against Drizzle (no HTTP), and verify the GL invariants.
 *
 * Expected payroll journal (per payslip route):
 *   Dr 6100 Salary Expense          (gross)
 *      Cr 2310 Salaries Payable      (net)
 *      Cr 2400 GOSI Payable          (employeeGosi + employerGosi)
 *   Dr 6200 GOSI Expense - Employer  (employerGosi)
 *
 * Expected EOSB accrual journal (per eosb route):
 *   Dr 6300 EOSB Expense    (monthly accrual)
 *      Cr 2500 EOSB Provision (monthly accrual)
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

const AGENCY_ID  = 'integ-test-payroll-01';
const EMPLOYEE_ID = `${AGENCY_ID}-emp-1`;
const USER_ID    = 'user-payroll';

/**
 * Replicates employees/payslips POST GL posting. Builds the salary journal the
 * same way the route does (gross debit, net + GOSI credits, employer GOSI debit)
 * and balances any residual into Salaries Payable.
 */
async function runPayroll(opts: {
  month: string;                  // YYYY-MM
  baseSalaryHalalas: number;
  housingAllowanceHalalas?: number;
  gosiEmployeeHalalas?: number;
  deductionsHalalas?: number;
}) {
  const db = getTestDb();
  const base      = opts.baseSalaryHalalas;
  const housing   = opts.housingAllowanceHalalas ?? 0;
  const gross     = base + housing;
  const deduct    = opts.deductionsHalalas ?? 0;
  const gosiEmployee = opts.gosiEmployeeHalalas ?? 0;
  const gosiBase     = base + housing;
  const gosiEmployer = Math.round(gosiBase * 0.0975);   // 9.75% employer share
  const net          = gross - deduct - gosiEmployee;
  const netPayable   = Math.max(0, net);
  const totalGosi    = gosiEmployer + gosiEmployee;

  type JLine = { code: string; ar: string; en: string; dr: number; cr: number };
  const ln = (ac: { code: string; ar: string; en: string }, dr: number, cr: number): JLine => ({ code: ac.code, ar: ac.ar, en: ac.en, dr, cr });

  const jLines: JLine[] = [ln(GL.salaryExpense, gross, 0)];
  if (gosiEmployer > 0) jLines.push(ln(GL.gosiExpense, gosiEmployer, 0));
  jLines.push(ln(GL.salariesPayable, 0, netPayable));
  if (totalGosi > 0)    jLines.push(ln(GL.gosiPayable, 0, totalGosi));
  const dr0 = jLines.reduce((s, l) => s + l.dr, 0);
  const cr0 = jLines.reduce((s, l) => s + l.cr, 0);
  if (dr0 !== cr0) jLines.find(l => l.code === GL.salariesPayable.code)!.cr += (dr0 - cr0);

  return db.transaction(async (tx) => {
    const year  = Number(opts.month.slice(0, 4));
    const today = `${opts.month}-01`;
    const id    = crypto.randomUUID();
    const jeId  = crypto.randomUUID();

    await tx.insert(payslips).values({
      id, agencyId: AGENCY_ID, employeeId: EMPLOYEE_ID, month: opts.month,
      baseSalaryHalalas: base, housingAllowanceHalalas: housing,
      grossHalalas: gross, deductionsHalalas: deduct,
      gosi_employee_halalas: gosiEmployee, gosiEmployerHalalas: gosiEmployer,
      netHalalas: netPayable,
    });

    const jeNumber = await getNextJournalNumber(AGENCY_ID, year, tx as never);
    await tx.insert(journalEntries).values({
      id: jeId, agencyId: AGENCY_ID, entryNumber: jeNumber, date: today,
      descriptionAr: `راتب ${opts.month}`, source: 'salary', sourceId: id, isPosted: true,
      totalDebitHalalas:  jLines.reduce((s, l) => s + l.dr, 0),
      totalCreditHalalas: jLines.reduce((s, l) => s + l.cr, 0),
      createdBy: USER_ID,
    });
    for (let i = 0; i < jLines.length; i++) {
      const l = jLines[i]!;
      await tx.insert(journalLines).values({
        id: crypto.randomUUID(), entryId: jeId, agencyId: AGENCY_ID,
        accountCode: l.code, accountNameAr: l.ar, accountNameEn: l.en,
        debitHalalas: l.dr, creditHalalas: l.cr, sortOrder: i + 1,
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

describe.skipIf(SKIP_IF_NO_DB)('payroll — قيد الراتب (IAS 19)', () => {

  it('قيد الراتب متوازن (DR = CR)', async () => {
    const r = await runPayroll({ month: '2025-01', baseSalaryHalalas: 8_000_00, housingAllowanceHalalas: 2_000_00, gosiEmployeeHalalas: 975_00 });
    const db = getTestDb();
    const [entry] = await db.select().from(journalEntries).where(eq(journalEntries.id, r.jeId));
    expect(entry!.totalDebitHalalas).toBe(entry!.totalCreditHalalas);

    const ls = await lines(r.jeId);
    const dr = ls.reduce((s, l) => s + l.debitHalalas,  0);
    const cr = ls.reduce((s, l) => s + l.creditHalalas, 0);
    expect(dr).toBe(cr);
  });

  it('مصروف الرواتب (6100) يُحمَّل مديناً بإجمالي الراتب', async () => {
    const r = await runPayroll({ month: '2025-02', baseSalaryHalalas: 8_000_00, housingAllowanceHalalas: 2_000_00, gosiEmployeeHalalas: 975_00 });
    const ls = await lines(r.jeId);
    const salaryExp = ls.find(l => l.accountCode === '6100')!;
    expect(salaryExp.debitHalalas).toBe(r.gross);         // 10,000.00
    expect(salaryExp.creditHalalas).toBe(0);
  });

  it('الرواتب المستحقة (2310) تُجعل دائنة بالصافي', async () => {
    const r = await runPayroll({ month: '2025-03', baseSalaryHalalas: 8_000_00, housingAllowanceHalalas: 2_000_00, gosiEmployeeHalalas: 975_00 });
    const ls = await lines(r.jeId);
    const payable = ls.find(l => l.accountCode === '2310')!;
    expect(payable.creditHalalas).toBe(r.netPayable);     // gross - employeeGosi = 9,025.00
    expect(r.netPayable).toBe(r.gross - r.gosiEmployee);
  });

  it('GOSI المستحقة (2400) تُجعل دائنة بحصة الموظف + حصة صاحب العمل', async () => {
    const r = await runPayroll({ month: '2025-04', baseSalaryHalalas: 8_000_00, housingAllowanceHalalas: 2_000_00, gosiEmployeeHalalas: 975_00 });
    const ls = await lines(r.jeId);
    const gosiPayable = ls.find(l => l.accountCode === '2400')!;
    expect(gosiPayable.creditHalalas).toBe(r.totalGosi);
    expect(r.totalGosi).toBe(r.gosiEmployee + r.gosiEmployer);
  });

  it('مصروف GOSI لصاحب العمل (6200) يُحمَّل مديناً بحصة صاحب العمل (9.75%)', async () => {
    const r = await runPayroll({ month: '2025-05', baseSalaryHalalas: 8_000_00, housingAllowanceHalalas: 2_000_00, gosiEmployeeHalalas: 975_00 });
    const ls = await lines(r.jeId);
    const gosiExp = ls.find(l => l.accountCode === '6200')!;
    expect(gosiExp.debitHalalas).toBe(r.gosiEmployer);
    expect(r.gosiEmployer).toBe(Math.round(10_000_00 * 0.0975));  // 975.00
  });

});

describe.skipIf(SKIP_IF_NO_DB)('payroll — مخصص مكافأة نهاية الخدمة (EOSB, IAS 19)', () => {

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
