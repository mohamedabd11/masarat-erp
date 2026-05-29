/**
 * PostgreSQL enums — مركزية لجميع القيم الثابتة في النظام
 * نستخدم pgEnum بدلاً من text مع check constraints للأداء والوضوح
 */
import { pgEnum } from 'drizzle-orm/pg-core';

// ─── Auth & Users ─────────────────────────────────────────────────────────────

export const userRoleEnum = pgEnum('user_role', [
  'admin',
  'agent',
  'accountant',
  'viewer',
]);

export const subscriptionPlanEnum = pgEnum('subscription_plan', [
  'trial',
  'starter',
  'professional',
  'enterprise',
]);

export const subscriptionStatusEnum = pgEnum('subscription_status', [
  'active',
  'trial',
  'suspended',
  'cancelled',
  'past_due',
]);

// ─── Bookings ─────────────────────────────────────────────────────────────────

export const bookingTypeEnum = pgEnum('booking_type', [
  'flight',
  'hotel',
  'package',
  'umrah',
  'hajj',
  'insurance',
  'visa',
  'transport',
]);

export const bookingStatusEnum = pgEnum('booking_status', [
  'draft',
  'pending_approval',
  'confirmed',
  'ticketed',
  'completed',
  'cancelled',
  'refunded',
]);

export const paymentStatusEnum = pgEnum('payment_status', [
  'unpaid',
  'partial',
  'fully_paid',
  'refunded',
]);

export const revenueModelEnum = pgEnum('revenue_model', ['agent', 'principal']);

export const passengerTypeEnum = pgEnum('passenger_type', [
  'adult',
  'child',
  'infant',
]);

export const genderEnum = pgEnum('gender', ['male', 'female']);

export const bookingSourceEnum = pgEnum('booking_source', [
  'web',
  'mobile',
  'api',
]);

// ─── Customers ────────────────────────────────────────────────────────────────

export const customerTypeEnum = pgEnum('customer_type', [
  'individual',
  'company',
  'sub_agent',
]);

export const customerTierEnum = pgEnum('customer_tier', [
  'standard',
  'silver',
  'gold',
  'platinum',
]);

// ─── Invoices ─────────────────────────────────────────────────────────────────

export const invoiceTypeEnum = pgEnum('invoice_type', [
  'tax_invoice',
  'credit_note',
  'debit_note',
]);

export const invoiceStatusEnum = pgEnum('invoice_status', [
  'draft',
  'issued',
  'cancelled',
  'credited',
]);

// ZATCA invoice type codes
export const zatcaInvoiceTypeCodeEnum = pgEnum('zatca_invoice_type_code', [
  '388', // Tax invoice
  '381', // Debit note
  '383', // Credit note
]);

export const zatcaSubmissionStatusEnum = pgEnum('zatca_submission_status', [
  'not_submitted',
  'pending',
  'submitted',
  'reported',
  'cleared',
  'rejected',
  'failed',
]);

export const zatcaTransactionTypeEnum = pgEnum('zatca_transaction_type', [
  'B2B',
  'B2C',
]);

// ─── Accounting ───────────────────────────────────────────────────────────────

export const accountTypeEnum = pgEnum('account_type', [
  'asset',
  'liability',
  'equity',
  'revenue',
  'expense',
]);

export const accountSideEnum = pgEnum('account_side', ['debit', 'credit']);

export const journalEntryTypeEnum = pgEnum('journal_entry_type', [
  'payment_received',
  'ticket_issued',
  'package_revenue_recognized',
  'refund_payment',
  'manual_adjustment',
  'opening_balance',
  'bank_reconciliation',
]);

export const journalEntryStatusEnum = pgEnum('journal_entry_status', [
  'draft',
  'posted',
  'reversed',
]);

export const vatCategoryEnum = pgEnum('vat_category', ['S', 'Z', 'E', 'O']);

// ─── Payments ─────────────────────────────────────────────────────────────────

export const paymentMethodEnum = pgEnum('payment_method', [
  'cash',
  'bank_transfer',
  'credit_card',
  'mada',
  'apple_pay',
  'stc_pay',
  'tamara',
  'tabby',
  'cheque',
]);

// ─── Suppliers & Employees ────────────────────────────────────────────────────

export const chequeStatusEnum = pgEnum('cheque_status', [
  'pending',
  'deposited',
  'cleared',
  'bounced',
  'cancelled',
]);

export const employeeStatusEnum = pgEnum('employee_status', [
  'active',
  'inactive',
  'on_leave',
  'terminated',
]);

// ─── ZATCA Queue ──────────────────────────────────────────────────────────────

export const zatcaQueueStatusEnum = pgEnum('zatca_queue_status', [
  'pending',
  'processing',
  'completed',
  'failed',
  'dead_letter',
]);
