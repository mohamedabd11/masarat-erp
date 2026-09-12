import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { closeTestDb, getTestDb, SKIP_IF_NO_DB, sql } from './test-db';
import {
  agencies,
  departments,
  employeeContracts,
  employeeTerminations,
  employees,
  journalLines,
  payslips,
  salaryAdvanceInstallments,
  salaryAdvances,
} from '@/lib/schema';

const { authState, databaseState, ApiAuthError, BusinessError } = vi.hoisted(() => {
  class MockApiAuthError extends Error { constructor(message: string, public readonly status: number) { super(message); } }
  class MockBusinessError extends Error { constructor(message: string, public readonly status = 400) { super(message); } }
  return {
    authState: { agencyId: 'integ-hr-v2-a1' }, databaseState: { current: null as unknown },
    ApiAuthError: MockApiAuthError, BusinessError: MockBusinessError,
  };
});

vi.mock('@/lib/api-auth', () => ({
  verifyAuth: vi.fn(async () => ({ uid: 'integ-hr-v2-user', agencyId: authState.agencyId, role: 'admin', permissions: null })),
  assertRole: vi.fn(), ApiAuthError, BusinessError,
  ROLES_ADMIN_ONLY: ['owner', 'admin'], ROLES_MANAGER_UP: ['owner', 'admin', 'manager'],
}));
vi.mock('@/lib/db', () => ({ db: new Proxy({}, {
  get(_target, property) {
    const current = databaseState.current as Record<PropertyKey, unknown> | null;
    if (!current) throw new Error('Integration database is not initialized');
    const value = current[property];
    return typeof value === 'function' ? value.bind(current) : value;
  },
}) }));
vi.mock('@/lib/feature-access', () => ({ requireFeature: vi.fn(async () => undefined) }));
vi.mock('@/lib/period-lock', () => ({ assertPeriodOpen: vi.fn(async () => undefined) }));
vi.mock('@/lib/audit', () => ({ logAudit: vi.fn(async () => undefined) }));

import { GET as getDepartments, POST as createDepartment } from '@/app/api/departments/route';
import { PATCH as updateDepartment, DELETE as deleteDepartment } from '@/app/api/departments/[id]/route';
import { POST as createEmployee } from '@/app/api/employees/route';
import { POST as createContract } from '@/app/api/employees/contracts/route';
import { PATCH as updateContract } from '@/app/api/employees/contracts/[id]/route';
import { POST as createAdvance } from '@/app/api/employees/advances/route';
import { PATCH as updateAdvance } from '@/app/api/employees/advances/[id]/route';
import { POST as createPayslip } from '@/app/api/employees/payslips/route';
import { POST as accrueEosb } from '@/app/api/employees/eosb/route';
import { POST as createTermination } from '@/app/api/employees/terminations/route';
import { PATCH as updateTermination } from '@/app/api/employees/terminations/[id]/route';

const AGENCY_ID = 'integ-hr-v2-a1';
const OTHER_AGENCY_ID = 'integ-hr-v2-a2';
let departmentId = '';
let newEmployeeId = '';
let expatEmployeeId = '';

function request(path: string, body?: unknown): Request {
  return new Request(`http://localhost${path}`, body === undefined ? undefined : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
}

async function cleanup() {
  const ids = `'${AGENCY_ID}','${OTHER_AGENCY_ID}'`;
  await sql(`DELETE FROM journal_lines WHERE agency_id IN (${ids})`);
  await sql(`DELETE FROM journal_entries WHERE agency_id IN (${ids})`);
  await sql(`DELETE FROM employee_terminations WHERE agency_id IN (${ids})`);
  await sql(`DELETE FROM eosb_employee_provisions WHERE agency_id IN (${ids})`);
  await sql(`DELETE FROM eosb_accruals WHERE agency_id IN (${ids})`);
  await sql(`DELETE FROM salary_advance_installments WHERE agency_id IN (${ids})`);
  await sql(`DELETE FROM salary_advances WHERE agency_id IN (${ids})`);
  await sql(`DELETE FROM salary_payments WHERE agency_id IN (${ids})`);
  await sql(`DELETE FROM payslips WHERE agency_id IN (${ids})`);
  await sql(`DELETE FROM employee_contracts WHERE agency_id IN (${ids})`);
  await sql(`DELETE FROM employees WHERE agency_id IN (${ids})`);
  await sql(`DELETE FROM departments WHERE agency_id IN (${ids})`);
  await sql(`DELETE FROM agency_counters WHERE agency_id IN (${ids})`);
  await sql(`DELETE FROM agencies WHERE id IN (${ids})`);
}

beforeAll(async () => {
  if (SKIP_IF_NO_DB) return;
  const db = getTestDb(); databaseState.current = db;
  await cleanup();
  await db.insert(agencies).values([
    { id: AGENCY_ID, nameAr: 'وكالة موارد بشرية متقدمة', subscriptionStatus: 'active', isVatRegistered: false },
    { id: OTHER_AGENCY_ID, nameAr: 'وكالة معزولة', subscriptionStatus: 'active', isVatRegistered: false },
  ]);
});

afterAll(async () => {
  if (SKIP_IF_NO_DB) return;
  await cleanup(); await closeTestDb(); databaseState.current = null;
});

describe.skipIf(SKIP_IF_NO_DB)('persistent HR lifecycle on a real local database', () => {
  it('persists departments, links employees, and isolates agencies', async () => {
    const createdDepartment = await createDepartment(request('/api/departments', { code: 'audit', nameAr: 'التدقيق الداخلي', nameEn: 'Internal Audit' }));
    expect(createdDepartment.status).toBe(201);
    departmentId = (await createdDepartment.json() as { id: string }).id;
    expect((await updateDepartment(request(`/api/departments/${departmentId}`, { nameAr: 'التدقيق والمخاطر' }), { params: { id: departmentId } })).status).toBe(200);

    const createdEmployee = await createEmployee(request('/api/employees', {
      nameAr: 'موظف النظام الجديد', employeeNumber: 'V2-NEW', nationalityType: 'saudi',
      hireDate: '2024-07-03', salaryHalalas: 1_000_000, departmentId,
      gosiScheme: 'new', gosiEnrollmentDate: '2024-07-03', sanedApplicable: true,
    }));
    expect(createdEmployee.status).toBe(200);
    newEmployeeId = (await createdEmployee.json() as { id: string }).id;
    const [storedEmployee] = await getTestDb().select().from(employees).where(eq(employees.id, newEmployeeId));
    expect(storedEmployee).toMatchObject({ departmentId, gosiScheme: 'new', gosiEnrollmentDate: '2024-07-03' });
    expect((await deleteDepartment(request(`/api/departments/${departmentId}`), { params: { id: departmentId } })).status).toBe(422);

    authState.agencyId = OTHER_AGENCY_ID;
    const isolated = await getDepartments(request('/api/departments'));
    expect((await isolated.json() as { departments: unknown[] }).departments).toHaveLength(0);
    authState.agencyId = AGENCY_ID;
    const [storedDepartment] = await getTestDb().select().from(departments).where(eq(departments.id, departmentId));
    expect(storedDepartment?.nameAr).toBe('التدقيق والمخاطر');
  });

  it('selects the correct dated GOSI rate for new entrants and expatriates', async () => {
    const june = await createPayslip(request('/api/employees/payslips', { employeeId: newEmployeeId, month: '2026-06', baseSalaryHalalas: 1_000_000 }));
    expect(june.status).toBe(200);
    expect(await june.json()).toMatchObject({ gosiEmployee: 102_500, gosiEmployer: 122_500, gosiEmployeeRateBps: 1025, gosiEmployerRateBps: 1225 });
    const july = await createPayslip(request('/api/employees/payslips', { employeeId: newEmployeeId, month: '2026-07', baseSalaryHalalas: 1_000_000 }));
    expect(july.status).toBe(200);
    expect(await july.json()).toMatchObject({ gosiEmployee: 107_500, gosiEmployer: 127_500, gosiEmployeeRateBps: 1075, gosiEmployerRateBps: 1275 });

    const expat = await createEmployee(request('/api/employees', {
      nameAr: 'موظف وافد', employeeNumber: 'V2-EXPAT', nationalityType: 'expat',
      hireDate: '2025-01-01', salaryHalalas: 800_000, gosiEnrollmentDate: '2025-01-01',
    }));
    expatEmployeeId = (await expat.json() as { id: string }).id;
    const expatSlip = await createPayslip(request('/api/employees/payslips', { employeeId: expatEmployeeId, month: '2026-07', baseSalaryHalalas: 800_000 }));
    expect(await expatSlip.json()).toMatchObject({ gosiEmployee: 0, gosiEmployer: 16_000 });
  });

  it('prevents overlapping contracts and allows a controlled contract renewal', async () => {
    const first = await createContract(request('/api/employees/contracts', {
      employeeId: expatEmployeeId, contractNumber: 'V2-EXPAT-01', type: 'full_time',
      startDate: '2025-01-01', baseSalaryHalalas: 800_000, workingDaysPerWeek: 5,
    }));
    expect(first.status).toBe(200);
    const firstId = (await first.json() as { id: string }).id;

    const overlapping = await createContract(request('/api/employees/contracts', {
      employeeId: expatEmployeeId, contractNumber: 'V2-EXPAT-OVERLAP', type: 'full_time',
      startDate: '2026-01-01', baseSalaryHalalas: 850_000,
    }));
    expect(overlapping.status).toBe(409);

    const zeroBase = await updateContract(request(`/api/employees/contracts/${firstId}`, {
      baseSalaryHalalas: 0,
    }), { params: { id: firstId } });
    const excessiveLeave = await updateContract(request(`/api/employees/contracts/${firstId}`, {
      annualLeaveDays: 366,
    }), { params: { id: firstId } });
    const blankNumber = await updateContract(request(`/api/employees/contracts/${firstId}`, {
      contractNumber: '   ',
    }), { params: { id: firstId } });
    await getTestDb().update(employeeContracts).set({
      contractNumber: 'V2-EXPAT-01', baseSalaryHalalas: 800_000, annualLeaveDays: 21,
    }).where(eq(employeeContracts.id, firstId));
    expect(zeroBase.status).toBe(400);
    expect(excessiveLeave.status).toBe(400);
    expect(blankNumber.status).toBe(400);

    const closed = await updateContract(request(`/api/employees/contracts/${firstId}`, {
      endDate: '2026-12-31', status: 'expired',
    }), { params: { id: firstId } });
    expect(closed.status).toBe(200);

    const renewed = await createContract(request('/api/employees/contracts', {
      employeeId: expatEmployeeId, contractNumber: 'V2-EXPAT-02', type: 'full_time',
      startDate: '2027-01-01', baseSalaryHalalas: 850_000,
    }));
    expect(renewed.status).toBe(200);
    const [storedFirst] = await getTestDb().select().from(employeeContracts).where(eq(employeeContracts.id, firstId));
    expect(storedFirst).toMatchObject({ endDate: '2026-12-31', status: 'expired' });
  });

  it('creates capped installments, rejects an unsafe schedule, defers, and settles early', async () => {
    const unsafe = await createAdvance(request('/api/employees/advances', {
      employeeId: newEmployeeId, amountHalalas: 250_000, deductFrom: '2026-09', installmentCount: 2,
    }));
    expect(unsafe.status).toBe(422);
    const created = await createAdvance(request('/api/employees/advances', {
      employeeId: newEmployeeId, amountHalalas: 250_000, deductFrom: '2026-09', paymentMethod: 'bank_transfer',
    }));
    expect(created.status).toBe(201);
    const advanceId = (await created.json() as { id: string }).id;
    const installments = await getTestDb().select().from(salaryAdvanceInstallments)
      .where(eq(salaryAdvanceInstallments.advanceId, advanceId)).orderBy(salaryAdvanceInstallments.installmentNumber);
    expect(installments.map(row => row.amountHalalas)).toEqual([83_334, 83_333, 83_333]);
    expect(installments.reduce((sum, row) => sum + row.amountHalalas, 0)).toBe(250_000);

    expect((await updateAdvance(request(`/api/employees/advances/${advanceId}`, {
      action: 'defer', installmentId: installments[1]!.id, dueMonth: '2027-01',
    }), { params: { id: advanceId } })).status).toBe(200);
    const [deferred] = await getTestDb().select().from(salaryAdvanceInstallments).where(eq(salaryAdvanceInstallments.id, installments[1]!.id));
    expect(deferred).toMatchObject({ dueMonth: '2027-01', deferralCount: 1 });

    const septemberSlip = await createPayslip(request('/api/employees/payslips', { employeeId: newEmployeeId, month: '2026-09', baseSalaryHalalas: 1_000_000 }));
    expect((await septemberSlip.json() as { advanceDeduction: number }).advanceDeduction).toBe(83_334);
    const [partiallyPaid] = await getTestDb().select().from(salaryAdvances).where(eq(salaryAdvances.id, advanceId));
    expect(partiallyPaid?.remainingHalalas).toBe(166_666);

    const repaid = await updateAdvance(request(`/api/employees/advances/${advanceId}`, { action: 'repay', paymentMethod: 'cash', paymentDate: '2026-09-30' }), { params: { id: advanceId } });
    expect(repaid.status).toBe(200);
    const [closed] = await getTestDb().select().from(salaryAdvances).where(eq(salaryAdvances.id, advanceId));
    expect(closed).toMatchObject({ status: 'repaid', remainingHalalas: 0 });
  });

  it('accrues an employee provision, approves settlement, pays it, and clears the liability', async () => {
    const accrual = await accrueEosb(request('/api/employees/eosb', { action: 'accrue', month: '2026-09' }));
    expect(accrual.status).toBe(200);
    const termination = await createTermination(request('/api/employees/terminations', {
      employeeId: newEmployeeId, terminationDate: '2026-09-30', terminationType: 'contract_end', reason: 'انتهاء المدة',
    }));
    expect(termination.status).toBe(201);
    const terminationId = (await termination.json() as { id: string }).id;
    const approved = await updateTermination(request(`/api/employees/terminations/${terminationId}`, { action: 'approve' }), { params: { id: terminationId } });
    expect(approved.status).toBe(200);
    const paid = await updateTermination(request(`/api/employees/terminations/${terminationId}`, { action: 'pay', paymentMethod: 'bank_transfer', paymentDate: '2026-10-01' }), { params: { id: terminationId } });
    expect(paid.status).toBe(200);
    const [stored] = await getTestDb().select().from(employeeTerminations).where(eq(employeeTerminations.id, terminationId));
    expect(stored?.status).toBe('paid');
    const [employee] = await getTestDb().select().from(employees).where(eq(employees.id, newEmployeeId));
    expect(employee).toMatchObject({ isActive: false, endDate: '2026-09-30' });
    const terminationLines = await getTestDb().select().from(journalLines).where(and(
      eq(journalLines.agencyId, AGENCY_ID), eq(journalLines.accountCode, '2510'),
    ));
    expect(terminationLines.some(line => line.creditHalalas > 0)).toBe(true);
    expect(terminationLines.some(line => line.debitHalalas > 0)).toBe(true);
    const [snapshot] = await getTestDb().select().from(payslips).where(and(eq(payslips.employeeId, newEmployeeId), eq(payslips.month, '2026-09')));
    expect(snapshot).toMatchObject({ gosiScheme: 'new', gosiEmployeeRateBps: 1075, gosiEmployerRateBps: 1275 });
  });
});
