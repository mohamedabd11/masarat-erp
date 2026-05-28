import { pgTable, text, integer, boolean, timestamp } from 'drizzle-orm/pg-core';
import { agencies } from './agencies';

export const bankAccounts = pgTable('bank_accounts', {
  id:                  text('id').primaryKey(),
  agencyId:            text('agency_id').notNull().references(() => agencies.id, { onDelete: 'cascade' }),
  nameAr:              text('name_ar').notNull(),
  nameEn:              text('name_en'),
  type:                text('type').notNull(),                // bank|cash|petty_cash
  accountNumber:       text('account_number'),
  bankName:            text('bank_name'),
  iban:                text('iban'),
  openingBalanceHalalas: integer('opening_balance_halalas').notNull().default(0),
  currentBalanceHalalas: integer('current_balance_halalas').notNull().default(0),
  currency:            text('currency').notNull().default('SAR'),
  glAccountId:         text('gl_account_id'),
  isActive:            boolean('is_active').notNull().default(true),
  isReconciled:        boolean('is_reconciled').notNull().default(false),
  createdAt:           timestamp('created_at').notNull().defaultNow(),
  updatedAt:           timestamp('updated_at').notNull().defaultNow(),
});

export type BankAccount    = typeof bankAccounts.$inferSelect;
export type NewBankAccount = typeof bankAccounts.$inferInsert;

export const bankTransactions = pgTable('bank_transactions', {
  id:              text('id').primaryKey(),
  agencyId:        text('agency_id').notNull().references(() => agencies.id, { onDelete: 'cascade' }),
  bankAccountId:   text('bank_account_id').notNull().references(() => bankAccounts.id),
  type:            text('type').notNull(),                    // deposit|withdrawal|transfer
  amountHalalas:   integer('amount_halalas').notNull(),
  balanceAfterHalalas: integer('balance_after_halalas'),
  description:     text('description'),
  reference:       text('reference'),
  sourceType:      text('source_type'),                      // payment|receipt|supplier_payment|manual
  sourceId:        text('source_id'),
  date:            text('date').notNull(),
  createdAt:       timestamp('created_at').notNull().defaultNow(),
});

export type BankTransaction    = typeof bankTransactions.$inferSelect;
export type NewBankTransaction = typeof bankTransactions.$inferInsert;

export const cheques = pgTable('cheques', {
  id:              text('id').primaryKey(),
  agencyId:        text('agency_id').notNull().references(() => agencies.id, { onDelete: 'cascade' }),
  chequeNumber:    text('cheque_number').notNull(),
  bankAccountId:   text('bank_account_id').references(() => bankAccounts.id),
  bankName:        text('bank_name'),
  amountHalalas:   integer('amount_halalas').notNull(),
  type:            text('type').notNull(),                    // incoming|outgoing
  status:          text('status').notNull().default('pending'), // pending|cleared|bounced|cancelled
  issueDate:       text('issue_date'),
  dueDate:         text('due_date'),
  payerName:       text('payer_name'),
  payeeName:       text('payee_name'),
  relatedId:       text('related_id'),
  notes:           text('notes'),
  createdAt:       timestamp('created_at').notNull().defaultNow(),
  updatedAt:       timestamp('updated_at').notNull().defaultNow(),
});

export type Cheque    = typeof cheques.$inferSelect;
export type NewCheque = typeof cheques.$inferInsert;
