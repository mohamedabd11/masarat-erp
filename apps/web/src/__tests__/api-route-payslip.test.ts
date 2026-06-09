/**
 * Unit tests for POST /api/employees/payslips
 *
 * Covers the server-side GOSI computation (Saudi 2024 reform) and the
 * negative-net guard introduced after the payroll wiring audit:
 *   - Saudi employee: employer 12% + employee 10% of (base + housing)
 *   - Expat employee: employer 2%, employee 0%
 *   - net < 0 (deductions + GOSI exceed gross) is rejected (422)
 *   - missing/invalid base salary is rejected (400)
 *
 * Every external dependency is mocked so the handler runs in pure JS — no DB,
 * no Firebase, no Next.js runtime.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── next/server mock ────────────────────────────────────────────────────────

vi.mock('next/server', () => ({
  NextResponse: {
    json: (data: unknown, init?: { status?: number }) => ({
      _data: data,
      status: init?.status ?? 200,
      json: async () => data,
    }),
  },
}));

// ─── Hoisted shared definitions ──────────────────────────────────────────────

const {
  ApiAuthError, BusinessError,
  mockVerifyAuth, mockAssertRole, mockRequireFeature, mockAssertPeriodOpen,
} = vi.hoisted(() => {
  class ApiAuthError extends Error {
    status: number;
    constructor(message: string, status: number) { super(message); this.status = status; }
  }
  class BusinessError extends Error {
    status: number;
    constructor(message: string, status = 400) { super(message); this.status = status; }
  }
  return {
    ApiAuthError, BusinessError,
    mockVerifyAuth:       vi.fn(),
    mockAssertRole:       vi.fn(),
    mockRequireFeature:   vi.fn(),
    mockAssertPeriodOpen: vi.fn(),
  };
});

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('@/lib/api-auth', () => ({
  verifyAuth:        mockVerifyAuth,
  assertRole:        mockAssertRole,
  ApiAuthError,
  BusinessError,
  ROLES_ADMIN_ONLY:  ['owner', 'admin'],
}));

vi.mock('@/lib/feature-access', () => ({ requireFeature: mockRequireFeature }));
vi.mock('@/lib/period-lock',   () => ({ assertPeriodOpen: mockAssertPeriodOpen }));
vi.mock('@/lib/invoice-counter', () => ({ getNextJournalNumber: vi.fn().mockResolvedValue('JE-2024-000001') }));
vi.mock('@/lib/audit', () => ({ logAudit: vi.fn().mockResolvedValue(undefined) }));

vi.mock('@/lib/gl-accounts', () => ({
  GL: {
    salaryExpense:   { code: '6100', ar: 'رواتب',        en: 'Salary' },
    gosiExpense:     { code: '6200', ar: 'تأمينات',      en: 'GOSI Employer' },
    salariesPayable: { code: '2310', ar: 'رواتب مستحقة', en: 'Salaries Payable' },
    gosiPayable:     { code: '2400', ar: 'تأمينات مستحقة', en: 'GOSI Payable' },
  },
}));

vi.mock('drizzle-orm', () => ({
  eq:   vi.fn(() => ({})),
  and:  vi.fn((...a: unknown[]) => ({ a })),
  desc: vi.fn(() => ({})),
}));

vi.mock('@/lib/schema', () => ({
  payslips:       { id: 'id', agencyId: 'agencyId', employeeId: 'employeeId', month: 'month' },
  employees:      { id: 'id', agencyId: 'agencyId', nameAr: 'nameAr', nationalityType: 'nationalityType' },
  salaryAdvances: { id: 'id', agencyId: 'agencyId', employeeId: 'employeeId', deductFrom: 'deductFrom', status: 'status', amountHalalas: 'amountHalalas' },
  agencies:       { id: 'id', gosiEmployerRateSaudi: 'x', gosiEmployeeRateSaudi: 'y', gosiEmployerRateExpat: 'z' },
  journalEntries: {},
  journalLines:   {},
}));

// ─── Mock db with a configurable select queue ─────────────────────────────────

const { mockTxSelect, mockDb } = vi.hoisted(() => {
  const selectResults: unknown[][] = [];
  const makeSelectChain = (rows: unknown[]) => {
    const p = Promise.resolve(rows);
    const chain: Record<string, unknown> = {};
    for (const m of ['from', 'where', 'limit', 'orderBy']) chain[m] = vi.fn().mockReturnValue(chain);
    chain['then']    = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => p.then(res, rej);
    chain['catch']   = (rej: (e: unknown) => unknown) => p.catch(rej);
    chain['finally'] = (fin: () => void) => p.finally(fin);
    return chain;
  };
  const insertChain = { values: vi.fn().mockResolvedValue(undefined) };
  const updateChain = { set: vi.fn().mockReturnThis(), where: vi.fn().mockResolvedValue(undefined) };
  const tx = {
    insert: vi.fn(() => insertChain),
    update: vi.fn(() => updateChain),
  };
  const db = {
    select: vi.fn(() => makeSelectChain((selectResults.shift() ?? []) as unknown[])),
    transaction: vi.fn((fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  };
  return {
    mockTxSelect: { results: selectResults, next: (r: unknown[]) => selectResults.push(r) },
    mockDb: db,
  };
});

vi.mock('@/lib/db', () => ({ db: mockDb }));

// ─── Import route under test ──────────────────────────────────────────────────

import { POST } from '@/app/api/employees/payslips/route';

function makeRequest(body: unknown): Request {
  return new Request('http://localhost/api/employees/payslips', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
}

const ADMIN = { uid: 'u1', agencyId: 'a1', role: 'admin' };
const AGENCY_RATES = { gosiEmployerRateSaudi: 1200, gosiEmployeeRateSaudi: 1000, gosiEmployerRateExpat: 200 };

// Seed the four reads the route performs before the transaction, in order:
//   1. duplicate-payslip check  2. pending advances  3. employee  4. agency rates
function seedReads(employee: Record<string, unknown>, advances: unknown[] = []) {
  mockTxSelect.next([]);          // no duplicate payslip
  mockTxSelect.next(advances);    // pending advances
  mockTxSelect.next([employee]);  // employee
  mockTxSelect.next([AGENCY_RATES]); // agency GOSI rates
}

describe('POST /api/employees/payslips — server-side GOSI + negative-net guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockTxSelect.results.length = 0;
    mockVerifyAuth.mockResolvedValue(ADMIN);
    mockAssertRole.mockReturnValue(undefined);
    mockRequireFeature.mockResolvedValue(undefined);
    mockAssertPeriodOpen.mockResolvedValue(undefined);
  });

  it('200 — موظف سعودي: تأمينات صاحب العمل 12% والموظف 10% من الأساس', async () => {
    // base = 10,000.00 SAR = 1,000,000 halalas
    seedReads({ id: 'e1', nameAr: 'أحمد', nationalityType: 'saudi' });
    const res = await POST(makeRequest({ employeeId: 'e1', month: '2025-01', baseSalaryHalalas: 1_000_000 }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.gosiEmployer).toBe(120_000);      // 12% of 1,000,000
    expect(data.netHalalas).toBe(900_000);        // gross − employee GOSI (10% = 100,000)
  });

  it('200 — موظف وافد: تأمينات صاحب العمل 2% فقط والموظف 0%', async () => {
    seedReads({ id: 'e2', nameAr: 'راج', nationalityType: 'expat' });
    const res = await POST(makeRequest({ employeeId: 'e2', month: '2025-01', baseSalaryHalalas: 1_000_000 }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.gosiEmployer).toBe(20_000);       // 2% of 1,000,000
    expect(data.netHalalas).toBe(1_000_000);      // no employee GOSI for expats
  });

  it('200 — يحتسب التأمينات على الأساس + السكن معاً', async () => {
    // base 8,000.00 + housing 2,000.00 = gosiBase 10,000.00 (1,000,000 halalas)
    seedReads({ id: 'e3', nameAr: 'سارة', nationalityType: 'saudi' });
    const res = await POST(makeRequest({
      employeeId: 'e3', month: '2025-02', baseSalaryHalalas: 800_000, housingAllowanceHalalas: 200_000,
    }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.gosiEmployer).toBe(120_000);      // 12% of (800,000 + 200,000)
    expect(data.netHalalas).toBe(900_000);        // 1,000,000 gross − 100,000 employee GOSI
  });

  it('422 — يرفض صافي راتب سالب (الخصومات + التأمينات تتجاوز الإجمالي)', async () => {
    // base 1,000.00, deductions 3,000.00 → net negative
    seedReads({ id: 'e4', nameAr: 'خالد', nationalityType: 'saudi' });
    const res = await POST(makeRequest({
      employeeId: 'e4', month: '2025-03', baseSalaryHalalas: 100_000, deductionsHalalas: 300_000,
    }));
    expect(res.status).toBe(422);
    const data = await res.json();
    expect(data.error).toMatch(/سالب/);
  });

  it('400 — يرفض راتباً أساسياً غير موجب', async () => {
    const res = await POST(makeRequest({ employeeId: 'e5', month: '2025-03', baseSalaryHalalas: 0 }));
    expect(res.status).toBe(400);
  });

  it('400 — يرفض خصماً سالباً', async () => {
    const res = await POST(makeRequest({
      employeeId: 'e6', month: '2025-03', baseSalaryHalalas: 500_000, deductionsHalalas: -100,
    }));
    expect(res.status).toBe(400);
  });
});
