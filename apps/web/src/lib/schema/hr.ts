import { pgTable, text, integer, boolean, timestamp } from 'drizzle-orm/pg-core';
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
  salaryHalalas:    integer('salary_halalas').notNull().default(0),
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
  amountHalalas:  integer('amount_halalas').notNull(),
  month:          text('month').notNull(),                   // YYYY-MM
  paymentMethod:  text('payment_method'),
  notes:          text('notes'),
  journalEntryId: text('journal_entry_id'),
  createdAt:      timestamp('created_at').notNull().defaultNow(),
});

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
