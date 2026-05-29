/**
 * Payments & Financial Operations — المدفوعات والعمليات المالية
 */
import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  bigint,
  jsonb,
  date,
  index,
  check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { paymentMethodEnum, chequeStatusEnum } from './enums.js';
import { agencies } from './agencies.js';
import { users } from './users.js';
import { bookings } from './bookings.js';
import { invoices } from './accounting.js';

/**
 * المدفوعات — Payments
 * APPEND-ONLY: لا تُحذف. الاسترداد يُنشئ سجل جديد بمبلغ سالب
 */
export const payments = pgTable(
  'payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agencyId: uuid('agency_id')
      .notNull()
      .references(() => agencies.id, { onDelete: 'restrict' }),

    bookingId: uuid('booking_id')
      .notNull()
      .references(() => bookings.id, { onDelete: 'restrict' }),
    invoiceId: uuid('invoice_id').references(() => invoices.id, {
      onDelete: 'set null',
    }),

    // رقم الإيصال
    receiptNumber: varchar('receipt_number', { length: 30 }).notNull(),

    // المبلغ (بالهللات) — موجب للدفع، سالب للاسترداد
    amountHalalas: bigint('amount_halalas', { mode: 'bigint' }).notNull(),
    currency: varchar('currency', { length: 3 }).notNull().default('SAR'),

    // طريقة الدفع
    method: paymentMethodEnum('method').notNull(),
    methodDetails: jsonb('method_details').$type<{
      bankName?: string;
      transferRef?: string;
      cardLast4?: string;
      chequeNumber?: string;
      chequeBank?: string;
      chequeDueDate?: string;
      terminalId?: string;
      transactionId?: string;
    }>(),

    // الحساب الذي استُلم فيه الدفع
    receivingAccountCode: varchar('receiving_account_code', { length: 20 }).notNull(),
    receivingAccountName: varchar('receiving_account_name', { length: 200 }),

    // القيد المحاسبي
    journalEntryId: uuid('journal_entry_id'),

    // مَن استلم الدفع
    receivedBy: uuid('received_by').references(() => users.id, {
      onDelete: 'set null',
    }),

    notes: text('notes'),

    // الاسترداد
    isRefund: boolean('is_refund').notNull().default(false),
    refundOfPaymentId: uuid('refund_of_payment_id'), // self-reference

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdBy: uuid('created_by').references(() => users.id, {
      onDelete: 'set null',
    }),
  },
  (t) => ({
    paymentsAgencyIdIdx: index('payments_agency_id_idx').on(t.agencyId),
    paymentsBookingIdIdx: index('payments_booking_id_idx').on(t.bookingId),
    paymentsInvoiceIdIdx: index('payments_invoice_id_idx').on(t.invoiceId),
    paymentsMethodIdx: index('payments_method_idx').on(t.agencyId, t.method),
    paymentsCreatedAtIdx: index('payments_created_at_idx').on(t.agencyId, t.createdAt),
  })
);

/**
 * مدفوعات الموردين — Supplier Payments
 * APPEND-ONLY تماماً: تمثل التسويات مع الموردين
 */
export const supplierPayments = pgTable(
  'supplier_payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agencyId: uuid('agency_id')
      .notNull()
      .references(() => agencies.id, { onDelete: 'restrict' }),

    supplierId: uuid('supplier_id').notNull(), // references suppliers.id
    supplierName: varchar('supplier_name', { length: 200 }).notNull(),

    bookingId: uuid('booking_id').references(() => bookings.id, {
      onDelete: 'set null',
    }),

    amountHalalas: bigint('amount_halalas', { mode: 'bigint' }).notNull(),
    currency: varchar('currency', { length: 3 }).notNull().default('SAR'),

    method: paymentMethodEnum('method').notNull(),
    referenceNumber: varchar('reference_number', { length: 100 }),

    // الحساب الذي دُفع منه
    paymentAccountCode: varchar('payment_account_code', { length: 20 }).notNull(),
    supplierPayableAccountCode: varchar('supplier_payable_account_code', {
      length: 20,
    }).notNull(),

    journalEntryId: uuid('journal_entry_id'),

    paidBy: uuid('paid_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    paymentDate: date('payment_date').notNull(),
    notes: text('notes'),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdBy: uuid('created_by').references(() => users.id, {
      onDelete: 'set null',
    }),
  },
  (t) => ({
    spAgencyIdIdx: index('sp_agency_id_idx').on(t.agencyId),
    spSupplierIdIdx: index('sp_supplier_id_idx').on(t.supplierId),
    spBookingIdIdx: index('sp_booking_id_idx').on(t.bookingId),
    spPaymentDateIdx: index('sp_payment_date_idx').on(t.agencyId, t.paymentDate),
  })
);

/**
 * الشيكات — Cheques
 */
export const cheques = pgTable(
  'cheques',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agencyId: uuid('agency_id')
      .notNull()
      .references(() => agencies.id, { onDelete: 'restrict' }),

    chequeNumber: varchar('cheque_number', { length: 30 }).notNull(),
    bankName: varchar('bank_name', { length: 200 }).notNull(),
    accountNumber: varchar('account_number', { length: 30 }),

    amountHalalas: bigint('amount_halalas', { mode: 'bigint' }).notNull(),
    currency: varchar('currency', { length: 3 }).notNull().default('SAR'),

    status: chequeStatusEnum('status').notNull().default('pending'),
    dueDate: date('due_date').notNull(),
    depositedAt: timestamp('deposited_at', { withTimezone: true }),
    clearedAt: timestamp('cleared_at', { withTimezone: true }),

    // من؟ (دافع أو مستلم)
    payee: varchar('payee', { length: 200 }),
    isIncoming: boolean('is_incoming').notNull().default(true),

    paymentId: uuid('payment_id').references(() => payments.id, {
      onDelete: 'set null',
    }),
    notes: text('notes'),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdBy: uuid('created_by').references(() => users.id, {
      onDelete: 'set null',
    }),
  },
  (t) => ({
    chequesAgencyIdIdx: index('cheques_agency_id_idx').on(t.agencyId),
    chequesStatusIdx: index('cheques_status_idx').on(t.agencyId, t.status),
    chequesDueDateIdx: index('cheques_due_date_idx').on(t.agencyId, t.dueDate),
    chequesAmountPositive: check('cheques_amount_positive', sql`amount_halalas > 0`),
  })
);

/**
 * حركات البنك — Bank Transactions
 * مستوردة من كشف الحساب البنكي
 */
export const bankTransactions = pgTable(
  'bank_transactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agencyId: uuid('agency_id')
      .notNull()
      .references(() => agencies.id, { onDelete: 'restrict' }),

    bankAccountId: uuid('bank_account_id').notNull(), // references bank_accounts.id
    transactionDate: date('transaction_date').notNull(),

    description: varchar('description', { length: 500 }).notNull(),
    referenceNumber: varchar('reference_number', { length: 100 }),

    // + للإيداع، - للسحب
    amountHalalas: bigint('amount_halalas', { mode: 'bigint' }).notNull(),
    runningBalanceHalalas: bigint('running_balance_halalas', {
      mode: 'bigint',
    }),

    // هل تمت مطابقته مع قيد محاسبي؟
    isReconciled: boolean('is_reconciled').notNull().default(false),
    reconciledPaymentId: uuid('reconciled_payment_id'),
    reconciledAt: timestamp('reconciled_at', { withTimezone: true }),

    // بيانات إضافية من ملف CSV/OFX
    rawData: jsonb('raw_data'),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    btAgencyIdIdx: index('bt_agency_id_idx').on(t.agencyId),
    btBankAccountIdIdx: index('bt_bank_account_id_idx').on(t.bankAccountId),
    btTransactionDateIdx: index('bt_transaction_date_idx').on(t.agencyId, t.transactionDate),
    btIsReconciledIdx: index('bt_is_reconciled_idx').on(t.agencyId, t.isReconciled),
  })
);
