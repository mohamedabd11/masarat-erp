import { pgTable, text, bigint, integer, boolean, timestamp, index } from 'drizzle-orm/pg-core';
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
  openingBalanceHalalas: bigint('opening_balance_halalas', { mode: 'number' }).notNull().default(0),
  currentBalanceHalalas: bigint('current_balance_halalas', { mode: 'number' }).notNull().default(0),
  currency:            text('currency').notNull().default('SAR'),
  // IAS 21 — for foreign-currency accounts, the balance in the account's own
  // currency minor units (e.g. US cents). NULL = SAR / not FX-tracked. The SAR
  // carrying amount stays in currentBalanceHalalas; revaluation compares the two.
  fxBalanceMinor:      bigint('fx_balance_minor', { mode: 'number' }),
  glAccountId:         text('gl_account_id'),
  isActive:            boolean('is_active').notNull().default(true),
  isReconciled:           boolean('is_reconciled').notNull().default(false),
  reconciledAt:           timestamp('reconciled_at'),
  reconciledBalanceHalalas: bigint('reconciled_balance_halalas', { mode: 'number' }),
  createdAt:              timestamp('created_at').notNull().defaultNow(),
  updatedAt:              timestamp('updated_at').notNull().defaultNow(),
}, (t) => [
  index('idx_bank_accounts_agency').on(t.agencyId),
  index('idx_bank_accounts_agency_active').on(t.agencyId, t.isActive),
]);

export type BankAccount    = typeof bankAccounts.$inferSelect;
export type NewBankAccount = typeof bankAccounts.$inferInsert;

export const bankTransactions = pgTable('bank_transactions', {
  id:              text('id').primaryKey(),
  agencyId:        text('agency_id').notNull().references(() => agencies.id, { onDelete: 'cascade' }),
  bankAccountId:   text('bank_account_id').notNull().references(() => bankAccounts.id),
  type:            text('type').notNull(),                    // deposit|withdrawal|transfer
  amountHalalas:   bigint('amount_halalas', { mode: 'number' }).notNull(),  // always SAR equivalent
  balanceAfterHalalas: bigint('balance_after_halalas', { mode: 'number' }),
  // IAS 21 — foreign-currency capture (NULL for SAR transactions):
  currency:        text('currency'),                          // transaction currency (e.g. USD)
  fxAmountMinor:   bigint('fx_amount_minor', { mode: 'number' }),  // amount in `currency` minor units
  fxRate:          integer('fx_rate'),                        // exchange rate × 10000 at txn time
  description:     text('description'),
  reference:       text('reference'),
  sourceType:      text('source_type'),                      // payment|receipt|supplier_payment|manual
  sourceId:        text('source_id'),
  date:            text('date').notNull(),
  isReconciled:    boolean('is_reconciled').notNull().default(false),
  reconciledAt:    timestamp('reconciled_at'),
  reconciledBy:    text('reconciled_by'),
  createdAt:       timestamp('created_at').notNull().defaultNow(),
}, (t) => [
  index('bank_txn_account_date_idx').on(t.bankAccountId, t.date),
  index('bank_txn_reconciled_idx').on(t.bankAccountId, t.isReconciled),
  index('bank_txn_agency_idx').on(t.agencyId),
  index('bank_txn_agency_date_idx').on(t.agencyId, t.date),
  index('bank_txn_source_idx').on(t.sourceType, t.sourceId),
]);

export type BankTransaction    = typeof bankTransactions.$inferSelect;
export type NewBankTransaction = typeof bankTransactions.$inferInsert;

export const cheques = pgTable('cheques', {
  id:              text('id').primaryKey(),
  agencyId:        text('agency_id').notNull().references(() => agencies.id, { onDelete: 'cascade' }),
  chequeNumber:    text('cheque_number').notNull(),
  bankAccountId:   text('bank_account_id').references(() => bankAccounts.id),
  bankName:        text('bank_name'),
  amountHalalas:   bigint('amount_halalas', { mode: 'number' }).notNull(),
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
}, (t) => [
  index('idx_cheques_agency').on(t.agencyId),
  index('idx_cheques_bank_account').on(t.bankAccountId),
  index('idx_cheques_agency_status').on(t.agencyId, t.status),
  index('idx_cheques_agency_due').on(t.agencyId, t.dueDate),
]);

export type Cheque    = typeof cheques.$inferSelect;
export type NewCheque = typeof cheques.$inferInsert;
