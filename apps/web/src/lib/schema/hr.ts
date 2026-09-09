import { pgTable, text, integer, bigint, boolean, timestamp, jsonb, uniqueIndex, unique, index } from 'drizzle-orm/pg-core';
import { agencies } from './agencies';

// ── Departments ──────────────────────────────────────────────────────────────

export const departments = pgTable('departments', {
  id:        text('id').primaryKey(),
  agencyId:  text('agency_id').notNull().references(() => agencies.id, { onDelete: 'cascade' }),
  code:      text('code').notNull(),
  nameAr:    text('name_ar').notNull(),
  nameEn:    text('name_en'),
  isActive:  boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => [
  uniqueIndex('departments_agency_code_uq').on(t.agencyId, t.code),
  uniqueIndex('departments_agency_name_ar_uq').on(t.agencyId, t.nameAr),
]);

export type Department    = typeof departments.$inferSelect;
export type NewDepartment = typeof departments.$inferInsert;

// Effective-dated statutory rates. Payroll stores the resolved rates on every
// payslip, so a later legal-rate change never rewrites historical payroll.
export const gosiRatePeriods = pgTable('gosi_rate_periods', {
  id:                            text('id').primaryKey(),
  scheme:                        text('scheme').notNull(), // legacy|new|expat
  effectiveFrom:                 text('effective_from').notNull(),
  pensionEmployeeRateBps:        integer('pension_employee_rate_bps').notNull().default(0),
  pensionEmployerRateBps:        integer('pension_employer_rate_bps').notNull().default(0),
  sanedEmployeeRateBps:          integer('saned_employee_rate_bps').notNull().default(0),
  sanedEmployerRateBps:          integer('saned_employer_rate_bps').notNull().default(0),
  occupationalEmployerRateBps:  integer('occupational_employer_rate_bps').notNull().default(200),
  createdAt:                     timestamp('created_at').notNull().defaultNow(),
}, (t) => [
  uniqueIndex('gosi_rate_periods_scheme_date_uq').on(t.scheme, t.effectiveFrom),
]);

export type GosiRatePeriod    = typeof gosiRatePeriods.$inferSelect;
export type NewGosiRatePeriod = typeof gosiRatePeriods.$inferInsert;

export const employees = pgTable('employees', {
  id:               text('id').primaryKey(),
  agencyId:         text('agency_id').notNull().references(() => agencies.id, { onDelete: 'cascade' }),
  employeeNumber:   text('employee_number').notNull(),
  nameAr:           text('name_ar').notNull(),
  nameEn:           text('name_en'),
  departmentId:     text('department_id').references(() => departments.id, { onDelete: 'set null' }),
  department:       text('department'),
  position:         text('position'),
  hireDate:         text('hire_date'),
  endDate:          text('end_date'),
  salaryHalalas:    bigint('salary_halalas', { mode: 'number' }).notNull().default(0),
  phone:            text('phone'),
  email:            text('email'),
  nationalId:       text('national_id'),
  iqamaNumber:      text('iqama_number'),
  bankAccountNumber: text('bank_account_number'),
  bankName:         text('bank_name'),
  nationalityType:  text('nationality_type').notNull().default('saudi'), // 'saudi' | 'expat'
  gosiScheme:       text('gosi_scheme').notNull().default('legacy'), // legacy|new|expat|exempt
  gosiEnrollmentDate: text('gosi_enrollment_date'),
  sanedApplicable:  boolean('saned_applicable').notNull().default(true),
  isActive:         boolean('is_active').notNull().default(true),
  glAccountId:      text('gl_account_id'),
  createdAt:        timestamp('created_at').notNull().defaultNow(),
  updatedAt:        timestamp('updated_at').notNull().defaultNow(),
}, (t) => ({
  agencyEmployeeNumberUq: uniqueIndex('employees_agency_number_uq').on(t.agencyId, t.employeeNumber),
  agencyDepartmentIdx: index('employees_agency_department_idx').on(t.agencyId, t.departmentId),
}));

export type Employee    = typeof employees.$inferSelect;
export type NewEmployee = typeof employees.$inferInsert;

export const salaryPayments = pgTable('salary_payments', {
  id:             text('id').primaryKey(),
  agencyId:       text('agency_id').notNull().references(() => agencies.id, { onDelete: 'cascade' }),
  employeeId:     text('employee_id').notNull().references(() => employees.id),
  amountHalalas:  bigint('amount_halalas', { mode: 'number' }).notNull(),
  month:          text('month').notNull(),                   // YYYY-MM
  paymentMethod:  text('payment_method'),
  notes:          text('notes'),
  journalEntryId: text('journal_entry_id'),
  createdAt:      timestamp('created_at').notNull().defaultNow(),
}, (t) => ({
  // One salary disbursement per employee per month (prevents double-payment race).
  agencyEmpMonthUq: unique('salary_payments_agency_emp_month_uq').on(t.agencyId, t.employeeId, t.month),
}));

export type SalaryPayment    = typeof salaryPayments.$inferSelect;
export type NewSalaryPayment = typeof salaryPayments.$inferInsert;

export const leaveRequests = pgTable('leave_requests', {
  id:          text('id').primaryKey(),
  agencyId:    text('agency_id').notNull().references(() => agencies.id, { onDelete: 'cascade' }),
  employeeId:  text('employee_id').notNull().references(() => employees.id),
  type:        text('type').notNull(),                       // annual|sick|unpaid
  startDate:   text('start_date').notNull(),
  endDate:     text('end_date').notNull(),
  days:        integer('days').notNull().default(1),
  status:      text('status').notNull().default('pending'), // pending|approved|rejected
  notes:       text('notes'),
  createdAt:   timestamp('created_at').notNull().defaultNow(),
});

export type LeaveRequest    = typeof leaveRequests.$inferSelect;
export type NewLeaveRequest = typeof leaveRequests.$inferInsert;

// ── Employee Contracts ────────────────────────────────────────────────────────

export const employeeContracts = pgTable('employee_contracts', {
  id:                  text('id').primaryKey(),
  agencyId:            text('agency_id').notNull().references(() => agencies.id, { onDelete: 'cascade' }),
  employeeId:          text('employee_id').notNull().references(() => employees.id),
  contractNumber:      text('contract_number').notNull(),
  type:                text('type').notNull().default('full_time'), // full_time|part_time|contract|intern
  startDate:           text('start_date').notNull(),
  endDate:             text('end_date'),                           // null = open-ended
  baseSalaryHalalas:   bigint('base_salary_halalas', { mode: 'number' }).notNull().default(0),
  housingAllowanceHalalas: bigint('housing_allowance_halalas', { mode: 'number' }).notNull().default(0),
  transportAllowanceHalalas: bigint('transport_allowance_halalas', { mode: 'number' }).notNull().default(0),
  otherAllowancesHalalas: bigint('other_allowances_halalas', { mode: 'number' }).notNull().default(0),
  salaryComponents:    jsonb('salary_components'),                 // [{name, amountHalalas, type}]
  workingDaysPerWeek:  integer('working_days_per_week').notNull().default(5),
  workingHoursPerDay:  integer('working_hours_per_day').notNull().default(8),
  annualLeaveDays:     integer('annual_leave_days').notNull().default(21),
  status:              text('status').notNull().default('active'), // active|expired|terminated
  notes:               text('notes'),
  createdBy:           text('created_by'),
  createdAt:           timestamp('created_at').notNull().defaultNow(),
  updatedAt:           timestamp('updated_at').notNull().defaultNow(),
});

export type EmployeeContract    = typeof employeeContracts.$inferSelect;
export type NewEmployeeContract = typeof employeeContracts.$inferInsert;

// ── Payslips ──────────────────────────────────────────────────────────────────

export const payslips = pgTable('payslips', {
  id:                       text('id').primaryKey(),
  agencyId:                 text('agency_id').notNull().references(() => agencies.id, { onDelete: 'cascade' }),
  employeeId:               text('employee_id').notNull().references(() => employees.id),
  salaryPaymentId:          text('salary_payment_id'),
  month:                    text('month').notNull(),              // YYYY-MM
  baseSalaryHalalas:        bigint('base_salary_halalas', { mode: 'number' }).notNull().default(0),
  housingAllowanceHalalas:  bigint('housing_allowance_halalas', { mode: 'number' }).notNull().default(0),
  transportAllowanceHalalas:bigint('transport_allowance_halalas', { mode: 'number' }).notNull().default(0),
  otherAllowancesHalalas:   bigint('other_allowances_halalas', { mode: 'number' }).notNull().default(0),
  grossHalalas:             bigint('gross_halalas', { mode: 'number' }).notNull().default(0),
  deductionsHalalas:        bigint('deductions_halalas', { mode: 'number' }).notNull().default(0),
  advanceDeductionHalalas:  bigint('advance_deduction_halalas', { mode: 'number' }).notNull().default(0),
  gosiEmployeeHalalas:      bigint('gosi_employee_halalas', { mode: 'number' }).notNull().default(0),
  gosiEmployerHalalas:      bigint('gosi_employer_halalas', { mode: 'number' }).notNull().default(0),
  gosiContributoryWageHalalas: bigint('gosi_contributory_wage_halalas', { mode: 'number' }).notNull().default(0),
  gosiEmployeeRateBps:      integer('gosi_employee_rate_bps').notNull().default(0),
  gosiEmployerRateBps:      integer('gosi_employer_rate_bps').notNull().default(0),
  gosiScheme:               text('gosi_scheme'),
  netHalalas:               bigint('net_halalas', { mode: 'number' }).notNull().default(0),
  components:               jsonb('components'),                  // [{label, amountHalalas, type: addition|deduction}]
  paymentDate:              text('payment_date'),
  paymentMethod:            text('payment_method'),
  createdAt:                timestamp('created_at').notNull().defaultNow(),
}, (t) => ({
  // One payslip per employee per month (prevents double-expense / double-accrual race).
  agencyEmpMonthUq: unique('payslips_agency_emp_month_uq').on(t.agencyId, t.employeeId, t.month),
}));

export type Payslip    = typeof payslips.$inferSelect;
export type NewPayslip = typeof payslips.$inferInsert;

// ── Salary Advances ───────────────────────────────────────────────────────────

export const salaryAdvances = pgTable('salary_advances', {
  id:                  text('id').primaryKey(),
  agencyId:            text('agency_id').notNull().references(() => agencies.id, { onDelete: 'cascade' }),
  employeeId:          text('employee_id').notNull().references(() => employees.id),
  amountHalalas:       bigint('amount_halalas', { mode: 'number' }).notNull(),
  requestDate:         text('request_date').notNull(),            // YYYY-MM-DD
  deductFrom:          text('deduct_from').notNull(),             // YYYY-MM (which month to deduct)
  status:              text('status').notNull().default('pending'), // pending|approved|paid|deducted|repaid|rejected
  reason:              text('reason'),
  approvedBy:          text('approved_by'),
  journalEntryId:      text('journal_entry_id'),
  installmentCount:    integer('installment_count').notNull().default(1),
  remainingHalalas:    bigint('remaining_halalas', { mode: 'number' }).notNull().default(0),
  paymentMethod:       text('payment_method'),
  settledAt:           timestamp('settled_at'),
  createdBy:           text('created_by'),
  createdAt:           timestamp('created_at').notNull().defaultNow(),
  updatedAt:           timestamp('updated_at').notNull().defaultNow(),
});

export type SalaryAdvance    = typeof salaryAdvances.$inferSelect;
export type NewSalaryAdvance = typeof salaryAdvances.$inferInsert;

export const salaryAdvanceInstallments = pgTable('salary_advance_installments', {
  id:                text('id').primaryKey(),
  agencyId:          text('agency_id').notNull().references(() => agencies.id, { onDelete: 'cascade' }),
  advanceId:         text('advance_id').notNull().references(() => salaryAdvances.id, { onDelete: 'cascade' }),
  employeeId:        text('employee_id').notNull().references(() => employees.id),
  installmentNumber: integer('installment_number').notNull(),
  dueMonth:          text('due_month').notNull(),
  amountHalalas:     bigint('amount_halalas', { mode: 'number' }).notNull(),
  status:            text('status').notNull().default('pending'), // pending|deducted|repaid|cancelled
  payslipId:         text('payslip_id').references(() => payslips.id),
  originalDueMonth:  text('original_due_month').notNull(),
  deferralCount:     integer('deferral_count').notNull().default(0),
  deductedAt:        timestamp('deducted_at'),
  repaidAt:          timestamp('repaid_at'),
  createdAt:         timestamp('created_at').notNull().defaultNow(),
  updatedAt:         timestamp('updated_at').notNull().defaultNow(),
}, (t) => [
  uniqueIndex('salary_advance_installments_number_uq').on(t.advanceId, t.installmentNumber),
  index('salary_advance_installments_due_idx').on(t.agencyId, t.employeeId, t.dueMonth, t.status),
]);

export type SalaryAdvanceInstallment    = typeof salaryAdvanceInstallments.$inferSelect;
export type NewSalaryAdvanceInstallment = typeof salaryAdvanceInstallments.$inferInsert;

// ── Shifts ────────────────────────────────────────────────────────────────────

export const shifts = pgTable('shifts', {
  id:          text('id').primaryKey(),
  agencyId:    text('agency_id').notNull().references(() => agencies.id, { onDelete: 'cascade' }),
  nameAr:      text('name_ar').notNull(),
  nameEn:      text('name_en'),
  startTime:   text('start_time').notNull(),  // HH:MM 24h
  endTime:     text('end_time').notNull(),    // HH:MM 24h
  daysOfWeek:  jsonb('days_of_week'),         // [0..6] where 0=Sun
  isDefault:   boolean('is_default').notNull().default(false),
  isActive:    boolean('is_active').notNull().default(true),
  createdAt:   timestamp('created_at').notNull().defaultNow(),
  updatedAt:   timestamp('updated_at').notNull().defaultNow(),
});

export type Shift    = typeof shifts.$inferSelect;
export type NewShift = typeof shifts.$inferInsert;

// ── Attendance Records ────────────────────────────────────────────────────────

export const attendanceRecords = pgTable('attendance_records', {
  id:               text('id').primaryKey(),
  agencyId:         text('agency_id').notNull().references(() => agencies.id, { onDelete: 'cascade' }),
  employeeId:       text('employee_id').notNull().references(() => employees.id),
  shiftId:          text('shift_id'),
  date:             text('date').notNull(),              // YYYY-MM-DD
  checkIn:          timestamp('check_in'),
  checkOut:         timestamp('check_out'),
  status:           text('status').notNull().default('present'), // present|absent|late|half_day|on_leave
  workMinutes:      integer('work_minutes').default(0),
  overtimeMinutes:  integer('overtime_minutes').default(0),
  notes:            text('notes'),
  createdBy:        text('created_by'),
  createdAt:        timestamp('created_at').notNull().defaultNow(),
  updatedAt:        timestamp('updated_at').notNull().defaultNow(),
}, (t) => ({
  employeeDateUq: uniqueIndex('attendance_employee_date_uq').on(t.employeeId, t.date),
}));

export type AttendanceRecord    = typeof attendanceRecords.$inferSelect;
export type NewAttendanceRecord = typeof attendanceRecords.$inferInsert;

// ── Leave Balances ────────────────────────────────────────────────────────────
// Tracks annual and sick leave entitlement vs used per employee per year.
// Initialized from contract.annualLeaveDays when first leave is approved.

export const leaveBalances = pgTable('leave_balances', {
  id:              text('id').primaryKey(),
  agencyId:        text('agency_id').notNull().references(() => agencies.id, { onDelete: 'cascade' }),
  employeeId:      text('employee_id').notNull().references(() => employees.id),
  year:            integer('year').notNull(),
  annualEntitled:  integer('annual_entitled').notNull().default(21),
  annualUsed:      integer('annual_used').notNull().default(0),
  sickEntitled:    integer('sick_entitled').notNull().default(30),
  sickUsed:        integer('sick_used').notNull().default(0),
  updatedAt:       timestamp('updated_at').notNull().defaultNow(),
}, (t) => ({
  empYearUq: unique('leave_balance_emp_year_uq').on(t.employeeId, t.year),
}));

export type LeaveBalance    = typeof leaveBalances.$inferSelect;
export type NewLeaveBalance = typeof leaveBalances.$inferInsert;

// ── EOSB Accruals ───────────────────────────────────────────────────────────
// Tracks the monthly end-of-service-benefit provision (IAS 19 / Saudi Labor Law
// art. 84). One row per agency+month guards against duplicate accruals.

export const eosbAccruals = pgTable('eosb_accruals', {
  id:             text('id').primaryKey(),
  agencyId:       text('agency_id').notNull().references(() => agencies.id, { onDelete: 'cascade' }),
  month:          text('month').notNull(),               // YYYY-MM
  amountHalalas:  bigint('amount_halalas', { mode: 'number' }).notNull().default(0),
  employeeCount:  integer('employee_count').notNull().default(0),
  journalEntryId: text('journal_entry_id'),
  createdBy:      text('created_by'),
  createdAt:      timestamp('created_at').notNull().defaultNow(),
}, (t) => ({
  agencyMonthUq: unique('eosb_accruals_agency_month_uq').on(t.agencyId, t.month),
}));

export type EosbAccrual    = typeof eosbAccruals.$inferSelect;
export type NewEosbAccrual = typeof eosbAccruals.$inferInsert;

// Employee-level provision snapshots let termination settlement release exactly
// that employee's provision without disturbing other employees' balances.
export const eosbEmployeeProvisions = pgTable('eosb_employee_provisions', {
  id:              text('id').primaryKey(),
  agencyId:        text('agency_id').notNull().references(() => agencies.id, { onDelete: 'cascade' }),
  accrualId:       text('accrual_id').notNull().references(() => eosbAccruals.id, { onDelete: 'cascade' }),
  employeeId:      text('employee_id').notNull().references(() => employees.id),
  month:           text('month').notNull(),
  targetHalalas:   bigint('target_halalas', { mode: 'number' }).notNull().default(0),
  changeHalalas:   bigint('change_halalas', { mode: 'number' }).notNull().default(0),
  lastWageHalalas: bigint('last_wage_halalas', { mode: 'number' }).notNull().default(0),
  createdAt:       timestamp('created_at').notNull().defaultNow(),
}, (t) => [
  uniqueIndex('eosb_employee_provisions_month_uq').on(t.agencyId, t.employeeId, t.month),
  index('eosb_employee_provisions_latest_idx').on(t.agencyId, t.employeeId, t.month),
]);

export type EosbEmployeeProvision    = typeof eosbEmployeeProvisions.$inferSelect;
export type NewEosbEmployeeProvision = typeof eosbEmployeeProvisions.$inferInsert;

export const employeeTerminations = pgTable('employee_terminations', {
  id:                        text('id').primaryKey(),
  agencyId:                  text('agency_id').notNull().references(() => agencies.id, { onDelete: 'cascade' }),
  employeeId:                text('employee_id').notNull().references(() => employees.id),
  terminationDate:           text('termination_date').notNull(),
  terminationType:           text('termination_type').notNull(), // contract_end|employer|resignation|article_80|force_majeure|other
  reason:                    text('reason'),
  status:                    text('status').notNull().default('draft'), // draft|approved|paid|cancelled
  lastWageHalalas:           bigint('last_wage_halalas', { mode: 'number' }).notNull(),
  baseBenefitHalalas:        bigint('base_benefit_halalas', { mode: 'number' }).notNull(),
  entitlementRateBps:        integer('entitlement_rate_bps').notNull().default(10000),
  settlementHalalas:         bigint('settlement_halalas', { mode: 'number' }).notNull(),
  provisionAppliedHalalas:   bigint('provision_applied_halalas', { mode: 'number' }).notNull().default(0),
  provisionReversedHalalas:  bigint('provision_reversed_halalas', { mode: 'number' }).notNull().default(0),
  settlementJournalEntryId:  text('settlement_journal_entry_id'),
  paymentJournalEntryId:     text('payment_journal_entry_id'),
  paymentMethod:             text('payment_method'),
  createdBy:                 text('created_by'),
  approvedBy:                text('approved_by'),
  paidBy:                    text('paid_by'),
  approvedAt:                timestamp('approved_at'),
  paidAt:                    timestamp('paid_at'),
  createdAt:                 timestamp('created_at').notNull().defaultNow(),
  updatedAt:                 timestamp('updated_at').notNull().defaultNow(),
}, (t) => [
  index('employee_terminations_employee_idx').on(t.agencyId, t.employeeId, t.createdAt),
]);

export type EmployeeTermination    = typeof employeeTerminations.$inferSelect;
export type NewEmployeeTermination = typeof employeeTerminations.$inferInsert;
