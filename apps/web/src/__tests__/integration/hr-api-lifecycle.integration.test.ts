import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { getTestDb, closeTestDb, sql, SKIP_IF_NO_DB } from './test-db';
import {
  agencies,
  attendanceRecords,
  employeeContracts,
  employees,
  journalLines,
  leaveBalances,
  salaryPayments,
  shifts,
} from '@/lib/schema';

const { authState, databaseState, ApiAuthError, BusinessError } = vi.hoisted(() => {
  class MockApiAuthError extends Error {
    constructor(message: string, public readonly status: number) { super(message); }
  }
  class MockBusinessError extends Error {
    constructor(message: string, public readonly status = 400) { super(message); }
  }
  return {
    authState: { agencyId: 'integ-hr-api-a1' },
    databaseState: { current: null as unknown },
    ApiAuthError: MockApiAuthError,
    BusinessError: MockBusinessError,
  };
});

vi.mock('@/lib/api-auth', () => ({
  verifyAuth: vi.fn(async () => ({ uid: 'integ-hr-user', agencyId: authState.agencyId, role: 'admin', permissions: null })),
  assertRole: vi.fn(),
  ApiAuthError,
  BusinessError,
  ROLES_ADMIN_ONLY: ['owner', 'admin'],
  ROLES_MANAGER_UP: ['owner', 'admin', 'manager'],
  ROLES_STAFF_UP: ['owner', 'admin', 'manager', 'accountant', 'staff'],
  ROLES_AGENT_UP: ['owner', 'admin', 'manager', 'accountant', 'staff', 'agent'],
}));

vi.mock('@/lib/db', () => ({
  db: new Proxy({}, {
    get(_target, property) {
      const current = databaseState.current as Record<PropertyKey, unknown> | null;
      if (!current) throw new Error('Integration database is not initialized');
      const value = current[property];
      return typeof value === 'function' ? value.bind(current) : value;
    },
  }),
}));

vi.mock('@/lib/feature-access', () => ({ requireFeature: vi.fn(async () => undefined) }));
vi.mock('@/lib/period-lock', () => ({ assertPeriodOpen: vi.fn(async () => undefined) }));
vi.mock('@/lib/audit', () => ({ logAudit: vi.fn(async () => undefined) }));

import { GET as getEmployees, POST as createEmployee } from '@/app/api/employees/route';
import { PATCH as updateEmployee } from '@/app/api/employees/[id]/route';
import { POST as createContract } from '@/app/api/employees/contracts/route';
import { POST as createShift } from '@/app/api/employees/shifts/route';
import { POST as createAttendance } from '@/app/api/employees/attendance/route';
import { PATCH as updateAttendance } from '@/app/api/employees/attendance/[id]/route';
import { POST as createLeave } from '@/app/api/leave-requests/route';
import { PATCH as updateLeave } from '@/app/api/leave-requests/[id]/route';
import { POST as createAdvance } from '@/app/api/employees/advances/route';
import { POST as createPayslip } from '@/app/api/employees/payslips/route';
import { POST as paySalary } from '@/app/api/salary-payments/route';
import { POST as accrueEosb } from '@/app/api/employees/eosb/route';

const AGENCY_ID = 'integ-hr-api-a1';
const OTHER_AGENCY_ID = 'integ-hr-api-a2';
const EMPLOYEE_ID = 'integ-hr-api-employee-main';

function request(path: string, body?: unknown): Request {
  return new Request(`http://localhost${path}`, body === undefined ? undefined : {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function cleanup() {
  const ids = `'${AGENCY_ID}','${OTHER_AGENCY_ID}'`;
  await sql(`DELETE FROM journal_lines WHERE agency_id IN (${ids})`);
  await sql(`DELETE FROM journal_entries WHERE agency_id IN (${ids})`);
  await sql(`DELETE FROM employee_terminations WHERE agency_id IN (${ids})`);
  await sql(`DELETE FROM eosb_employee_provisions WHERE agency_id IN (${ids})`);
  await sql(`DELETE FROM eosb_accruals WHERE agency_id IN (${ids})`);
  await sql(`DELETE FROM salary_payments WHERE agency_id IN (${ids})`);
  await sql(`DELETE FROM salary_advance_installments WHERE agency_id IN (${ids})`);
  await sql(`DELETE FROM payslips WHERE agency_id IN (${ids})`);
  await sql(`DELETE FROM salary_advances WHERE agency_id IN (${ids})`);
  await sql(`DELETE FROM attendance_records WHERE agency_id IN (${ids})`);
  await sql(`DELETE FROM shifts WHERE agency_id IN (${ids})`);
  await sql(`DELETE FROM leave_balances WHERE agency_id IN (${ids})`);
  await sql(`DELETE FROM leave_requests WHERE agency_id IN (${ids})`);
  await sql(`DELETE FROM employee_contracts WHERE agency_id IN (${ids})`);
  await sql(`DELETE FROM employees WHERE agency_id IN (${ids})`);
  await sql(`DELETE FROM agency_counters WHERE agency_id IN (${ids})`);
  await sql(`DELETE FROM agencies WHERE id IN (${ids})`);
}

beforeAll(async () => {
  if (SKIP_IF_NO_DB) return;
  const db = getTestDb();
  databaseState.current = db;
  await cleanup();
  await db.insert(agencies).values([
    { id: AGENCY_ID, nameAr: 'وكالة اختبار الموارد البشرية', subscriptionStatus: 'active', isVatRegistered: false },
    { id: OTHER_AGENCY_ID, nameAr: 'وكالة أخرى', subscriptionStatus: 'active', isVatRegistered: false },
  ]);
});

afterAll(async () => {
  if (SKIP_IF_NO_DB) return;
  await cleanup();
  await closeTestDb();
  databaseState.current = null;
});

describe.skipIf(SKIP_IF_NO_DB)('HR API lifecycle with a real local database', () => {
  it('validates employee input, persists fields, isolates tenants, and paginates beyond 200 rows', async () => {
    const invalid = await createEmployee(request('/api/employees', {
      nameAr: 'موظف غير صالح', nationalityType: 'saudi', hireDate: '2026-02-30',
    }));
    expect(invalid.status).toBe(400);

    const created = await createEmployee(request('/api/employees', {
      nameAr: 'الموظف الرئيسي', employeeNumber: 'EMP-MAIN', nationalityType: 'saudi',
      hireDate: '2020-01-01', salaryHalalas: 1_000_000, department: 'accounting', position: 'accountant',
    }));
    expect(created.status).toBe(200);
    const createdBody = await created.json() as { id: string };
    expect(createdBody.id).toBeTruthy();
    await getTestDb().update(employees).set({ id: EMPLOYEE_ID }).where(eq(employees.id, createdBody.id));

    const bulk = Array.from({ length: 204 }, (_, index) => ({
      id: `integ-hr-bulk-${index}`,
      agencyId: AGENCY_ID,
      employeeNumber: `BULK-${String(index).padStart(3, '0')}`,
      nameAr: `موظف ${index}`,
      nationalityType: 'expat',
    }));
    await getTestDb().insert(employees).values(bulk);
    await getTestDb().insert(employees).values({
      id: 'integ-hr-other-employee', agencyId: OTHER_AGENCY_ID,
      employeeNumber: 'OTHER-001', nameAr: 'موظف وكالة أخرى', nationalityType: 'saudi',
    });

    const pageTwo = await getEmployees(request('/api/employees?page=2&limit=200'));
    const pageData = await pageTwo.json() as { employees: Array<{ agencyId: string }>; pagination: { total: number; totalPages: number } };
    expect(pageData.pagination).toMatchObject({ total: 205, totalPages: 2 });
    expect(pageData.employees).toHaveLength(5);
    expect(pageData.employees.every((row) => row.agencyId === AGENCY_ID)).toBe(true);

    const badPatch = await updateEmployee(request(`/api/employees/${EMPLOYEE_ID}`, { terminatedAt: Date.now() }), { params: { id: EMPLOYEE_ID } });
    expect(badPatch.status).toBe(400);
    const terminate = await updateEmployee(request(`/api/employees/${EMPLOYEE_ID}`, { endDate: '2026-09-08' }), { params: { id: EMPLOYEE_ID } });
    expect(terminate.status).toBe(200);
    const [terminated] = await getTestDb().select().from(employees).where(eq(employees.id, EMPLOYEE_ID));
    expect(terminated).toMatchObject({ endDate: '2026-09-08', isActive: false, position: 'accountant', hireDate: '2020-01-01' });
    await updateEmployee(request(`/api/employees/${EMPLOYEE_ID}`, { isActive: true }), { params: { id: EMPLOYEE_ID } });
  });

  it('prevents overlapping contracts and keeps only one default shift', async () => {
    const contract = await createContract(request('/api/employees/contracts', {
      employeeId: EMPLOYEE_ID, contractNumber: 'CT-MAIN-1', type: 'full_time',
      startDate: '2026-01-01', endDate: '2026-12-31', baseSalaryHalalas: 1_000_000,
    }));
    expect(contract.status).toBe(200);
    const overlap = await createContract(request('/api/employees/contracts', {
      employeeId: EMPLOYEE_ID, contractNumber: 'CT-MAIN-2', type: 'full_time',
      startDate: '2026-06-01', baseSalaryHalalas: 1_000_000,
    }));
    expect(overlap.status).toBe(409);

    expect((await createShift(request('/api/employees/shifts', {
      nameAr: 'صباحية', startTime: '08:00', endTime: '16:00', daysOfWeek: [0, 1, 2, 3, 4], isDefault: true,
    }))).status).toBe(200);
    expect((await createShift(request('/api/employees/shifts', {
      nameAr: 'مسائية', startTime: '16:00', endTime: '23:00', daysOfWeek: [0, 1, 2, 3, 4], isDefault: true,
    }))).status).toBe(200);
    const defaults = await getTestDb().select().from(shifts)
      .where(and(eq(shifts.agencyId, AGENCY_ID), eq(shifts.isDefault, true)));
    expect(defaults).toHaveLength(1);
    expect(defaults[0]?.nameAr).toBe('مسائية');
  });

  it('validates attendance and records overnight work precisely', async () => {
    const invalid = await createAttendance(request('/api/employees/attendance', {
      employeeId: EMPLOYEE_ID, date: '2026-09-31', status: 'present',
    }));
    expect(invalid.status).toBe(400);

    const valid = await createAttendance(request('/api/employees/attendance', {
      employeeId: EMPLOYEE_ID, date: '2026-09-08', status: 'present',
      checkIn: '2026-09-08T20:00:00.000Z', checkOut: '2026-09-09T04:00:00.000Z',
    }));
    expect(valid.status).toBe(200);
    const [record] = await getTestDb().select().from(attendanceRecords)
      .where(and(eq(attendanceRecords.agencyId, AGENCY_ID), eq(attendanceRecords.employeeId, EMPLOYEE_ID)));
    expect(record?.workMinutes).toBe(480);

    const markedAbsent = await updateAttendance(
      request(`/api/employees/attendance/${record!.id}`, { status: 'absent' }),
      { params: { id: record!.id } },
    );
    expect(markedAbsent.status).toBe(200);
    const [absentRecord] = await getTestDb().select().from(attendanceRecords).where(eq(attendanceRecords.id, record!.id));
    expect(absentRecord).toMatchObject({ status: 'absent', checkIn: null, checkOut: null, workMinutes: 0, overtimeMinutes: 0 });
  });

  it('rejects worked minutes on an absent attendance record', async () => {
    const response = await createAttendance(request('/api/employees/attendance', {
      employeeId: EMPLOYEE_ID, date: '2026-09-07', status: 'absent', workMinutes: 60,
    }));
    expect(response.status).toBe(400);
  });

  it('blocks overlapping leave and reverses the balance when an approval is reopened', async () => {
    const leave = await createLeave(request('/api/leave-requests', {
      employeeId: EMPLOYEE_ID, type: 'annual', startDate: '2026-10-01', endDate: '2026-10-03',
    }));
    expect(leave.status).toBe(200);
    const leaveId = (await leave.json() as { id: string }).id;
    const overlap = await createLeave(request('/api/leave-requests', {
      employeeId: EMPLOYEE_ID, type: 'sick', startDate: '2026-10-03', endDate: '2026-10-05',
    }));
    expect(overlap.status).toBe(409);

    expect((await updateLeave(request(`/api/leave-requests/${leaveId}`, { status: 'approved' }), { params: { id: leaveId } })).status).toBe(200);
    let [balance] = await getTestDb().select().from(leaveBalances)
      .where(and(eq(leaveBalances.agencyId, AGENCY_ID), eq(leaveBalances.employeeId, EMPLOYEE_ID)));
    expect(balance?.annualUsed).toBe(3);

    expect((await updateLeave(request(`/api/leave-requests/${leaveId}`, { status: 'pending' }), { params: { id: leaveId } })).status).toBe(200);
    [balance] = await getTestDb().select().from(leaveBalances)
      .where(and(eq(leaveBalances.agencyId, AGENCY_ID), eq(leaveBalances.employeeId, EMPLOYEE_ID)));
    expect(balance?.annualUsed).toBe(0);
  });

  it('rechecks overlap before a rejected leave is approved again', async () => {
    const first = await createLeave(request('/api/leave-requests', {
      employeeId: EMPLOYEE_ID, type: 'annual', startDate: '2026-11-01', endDate: '2026-11-02',
    }));
    expect(first.status).toBe(200);
    const firstId = (await first.json() as { id: string }).id;
    expect((await updateLeave(request(`/api/leave-requests/${firstId}`, { status: 'rejected' }), { params: { id: firstId } })).status).toBe(200);

    const replacement = await createLeave(request('/api/leave-requests', {
      employeeId: EMPLOYEE_ID, type: 'sick', startDate: '2026-11-02', endDate: '2026-11-04',
    }));
    expect(replacement.status).toBe(200);
    const replacementId = (await replacement.json() as { id: string }).id;
    expect((await updateLeave(request(`/api/leave-requests/${replacementId}`, { status: 'approved' }), { params: { id: replacementId } })).status).toBe(200);

    const conflictingApproval = await updateLeave(
      request(`/api/leave-requests/${firstId}`, { status: 'approved' }),
      { params: { id: firstId } },
    );
    expect(conflictingApproval.status).toBe(409);
    expect(await conflictingApproval.json()).toMatchObject({ error: expect.stringMatching(/متداخلة/) });
  });

  it('does not create payroll for an inactive employee', async () => {
    await getTestDb().update(employees).set({ isActive: false }).where(eq(employees.id, EMPLOYEE_ID));
    try {
      const response = await createPayslip(request('/api/employees/payslips', {
        employeeId: EMPLOYEE_ID, month: '2026-08', baseSalaryHalalas: 1_000_000,
      }));
      expect(response.status).toBe(422);
      expect(await response.json()).toMatchObject({ error: expect.stringMatching(/غير نشط/) });
    } finally {
      await getTestDb().update(employees).set({ isActive: true }).where(eq(employees.id, EMPLOYEE_ID));
    }
  });

  it('reconciles advance, deductions, payslip, payment, and EOSB journals end to end', async () => {
    expect((await createAdvance(request('/api/employees/advances', {
      employeeId: EMPLOYEE_ID, amountHalalas: 75_000, deductFrom: '2026-09', paymentMethod: 'bank_transfer',
    }))).status).toBe(201);

    const slip = await createPayslip(request('/api/employees/payslips', {
      employeeId: EMPLOYEE_ID, month: '2026-09', baseSalaryHalalas: 1_000_000, deductionsHalalas: 25_000,
    }));
    expect(slip.status).toBe(200);
    const slipData = await slip.json() as { netHalalas: number; journalEntryId: string };
    expect(slipData.netHalalas).toBe(802_500);
    const payrollLines = await getTestDb().select().from(journalLines).where(eq(journalLines.entryId, slipData.journalEntryId));
    expect(payrollLines.find((line) => line.accountCode === '1140')?.creditHalalas).toBe(75_000);
    expect(payrollLines.find((line) => line.accountCode === '2390')?.creditHalalas).toBe(25_000);
    expect(payrollLines.find((line) => line.accountCode === '2310')?.creditHalalas).toBe(802_500);

    const noSlip = await paySalary(request('/api/salary-payments', {
      employeeId: 'integ-hr-bulk-0', month: '2026-09', amountHalalas: 1,
    }));
    expect(noSlip.status).toBe(422);
    const payment = await paySalary(request('/api/salary-payments', {
      employeeId: EMPLOYEE_ID, month: '2026-09', amountHalalas: slipData.netHalalas,
    }));
    expect(payment.status).toBe(200);
    const [savedPayment] = await getTestDb().select().from(salaryPayments)
      .where(and(eq(salaryPayments.agencyId, AGENCY_ID), eq(salaryPayments.employeeId, EMPLOYEE_ID)));
    expect(savedPayment?.amountHalalas).toBe(802_500);

    const eosb = await accrueEosb(request('/api/employees/eosb', { action: 'accrue', month: '2026-09' }));
    expect(eosb.status).toBe(200);
    const eosbData = await eosb.json() as { amountHalalas: number; targetLiabilityHalalas: number; employeeCount: number };
    expect(eosbData.amountHalalas).toBe(eosbData.targetLiabilityHalalas);
    expect(eosbData.targetLiabilityHalalas).toBeGreaterThan(0);
    expect(eosbData.employeeCount).toBe(1);
  });
});
