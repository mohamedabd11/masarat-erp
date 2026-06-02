import { pgTable, text, integer, bigint, boolean, timestamp, jsonb, uniqueIndex, unique } from 'drizzle-orm/pg-core';
import { agencies } from './agencies';

export const employees = pgTable('employees', {
  id:               text('id').primaryKey(),
  agencyId:         text('agency_id').notNull().references(() => agencies.id, { onDelete: 'cascade' }),
  employeeNumber:   text('employee_number').notNull(),
  nameAr:           text('name_ar').notNull(),
  nameEn:           text('name_en'),
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
  isActive:         boolean('is_active').notNull().default(true),
  glAccountId:      text('gl_account_id'),
  createdAt:        timestamp('created_at').notNull().defaultNow(),
  updatedAt:        timestamp('updated_at').notNull().defaultNow(),
});

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
  empMonthUq: uniqueIndex('salary_payments_emp_month_uq').on(t.agencyId, t.employeeId, t.month),
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
  gosi_employee_halalas:    bigint('gosi_employee_halalas', { mode: 'number' }).notNull().default(0),
  gosiEmployerHalalas:      bigint('gosi_employer_halalas', { mode: 'number' }).notNull().default(0),
  netHalalas:               bigint('net_halalas', { mode: 'number' }).notNull().default(0),
  components:               jsonb('components'),                  // [{label, amountHalalas, type: addition|deduction}]
  paymentDate:              text('payment_date'),
  paymentMethod:            text('payment_method'),
  createdAt:                timestamp('created_at').notNull().defaultNow(),
});

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
  status:              text('status').notNull().default('pending'), // pending|approved|paid|deducted|rejected
  reason:              text('reason'),
  approvedBy:          text('approved_by'),
  journalEntryId:      text('journal_entry_id'),
  createdBy:           text('created_by'),
  createdAt:           timestamp('created_at').notNull().defaultNow(),
  updatedAt:           timestamp('updated_at').notNull().defaultNow(),
});

export type SalaryAdvance    = typeof salaryAdvances.$inferSelect;
export type NewSalaryAdvance = typeof salaryAdvances.$inferInsert;

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
