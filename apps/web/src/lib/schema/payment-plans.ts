import { pgTable, text, integer, bigint, timestamp, index } from 'drizzle-orm/pg-core';

export const paymentPlans = pgTable('payment_plans', {
  id:                 text('id').primaryKey(),
  agencyId:           text('agency_id').notNull(),
  bookingId:          text('booking_id').notNull(),
  invoiceId:          text('invoice_id').notNull(),
  totalAmountHalalas: bigint('total_amount_halalas', { mode: 'number' }).notNull(),
  numInstallments:    integer('num_installments').notNull(),
  notes:              text('notes'),
  status:             text('status').notNull().default('active'),  // active|completed|cancelled
  createdBy:          text('created_by'),
  createdAt:          timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:          timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  agencyIdx:  index('idx_pp_agency').on(t.agencyId),
  bookingIdx: index('idx_pp_booking').on(t.agencyId, t.bookingId),
}));

export const paymentPlanInstallments = pgTable('payment_plan_installments', {
  id:                text('id').primaryKey(),
  agencyId:          text('agency_id').notNull(),
  planId:            text('plan_id').notNull(),
  bookingId:         text('booking_id').notNull(),
  invoiceId:         text('invoice_id').notNull(),
  installmentNumber: integer('installment_number').notNull(),
  dueDate:           text('due_date').notNull(),                    // YYYY-MM-DD
  amountHalalas:     bigint('amount_halalas', { mode: 'number' }).notNull(),
  status:            text('status').notNull().default('pending'),   // pending|paid|overdue
  paidAt:            timestamp('paid_at', { withTimezone: true }),
  paymentId:         text('payment_id'),
  notes:             text('notes'),
  createdAt:         timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt:         timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  planIdx:   index('idx_ppi_plan').on(t.planId),
  agencyIdx: index('idx_ppi_agency').on(t.agencyId, t.status),
  dueIdx:    index('idx_ppi_due').on(t.agencyId, t.dueDate),
}));

export type PaymentPlan = typeof paymentPlans.$inferSelect;
export type NewPaymentPlan = typeof paymentPlans.$inferInsert;
export type PaymentPlanInstallment = typeof paymentPlanInstallments.$inferSelect;
export type NewPaymentPlanInstallment = typeof paymentPlanInstallments.$inferInsert;
