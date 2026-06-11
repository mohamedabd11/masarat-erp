import { pgTable, text, integer, bigint, boolean, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { agencies } from './agencies';

// ── Chart of Accounts ─────────────────────────────────────────────────────

export const chartOfAccounts = pgTable('chart_of_accounts', {
  id:                  text('id').primaryKey(),
  agencyId:            text('agency_id').notNull().references(() => agencies.id, { onDelete: 'cascade' }),
  code:                text('code').notNull(),
  nameAr:              text('name_ar').notNull(),
  nameEn:              text('name_en'),
  type:                text('type').notNull(),                // asset|liability|equity|revenue|expense
  subType:             text('sub_type'),
  parentId:            text('parent_id'),                    // self-reference (no FK to avoid cycle)
  level:               integer('level').notNull().default(1),
  isActive:            boolean('is_active').notNull().default(true),
  isSystem:            boolean('is_system').notNull().default(false),
  allowDirectEntry:    boolean('allow_direct_entry').notNull().default(true),
  openingBalanceHalalas: bigint('opening_balance_halalas', { mode: 'number' }).notNull().default(0),
  createdAt:           timestamp('created_at').notNull().defaultNow(),
  updatedAt:           timestamp('updated_at').notNull().defaultNow(),
}, (t) => [
  index('idx_coa_agency').on(t.agencyId),
  uniqueIndex('idx_coa_agency_code').on(t.agencyId, t.code),
]);

export type ChartAccount    = typeof chartOfAccounts.$inferSelect;
export type NewChartAccount = typeof chartOfAccounts.$inferInsert;

// ── Journal Entries ───────────────────────────────────────────────────────

export const journalEntries = pgTable('journal_entries', {
  id:            text('id').primaryKey(),
  agencyId:      text('agency_id').notNull().references(() => agencies.id, { onDelete: 'cascade' }),
  entryNumber:   text('entry_number').notNull(),
  date:          text('date').notNull(),                     // YYYY-MM-DD
  descriptionAr: text('description_ar'),
  descriptionEn: text('description_en'),
  reference:     text('reference'),
  source:        text('source').notNull().default('manual'), // manual|invoice|payment|receipt|salary
  sourceId:      text('source_id'),
  serviceType:   text('service_type'),                       // flight|hotel|package|umrah|hajj|visa|insurance|transport
  isPosted:      boolean('is_posted').notNull().default(true),
  totalDebitHalalas:  bigint('total_debit_halalas', { mode: 'number' }).notNull().default(0),
  totalCreditHalalas: bigint('total_credit_halalas', { mode: 'number' }).notNull().default(0),
  createdBy:     text('created_by'),
  createdAt:     timestamp('created_at').notNull().defaultNow(),
}, (t) => [
  index('idx_je_agency').on(t.agencyId),
  index('idx_je_agency_date').on(t.agencyId, t.date),
  index('idx_je_agency_source').on(t.agencyId, t.source),
  index('idx_je_source_id').on(t.agencyId, t.sourceId),
  uniqueIndex('journal_entries_agency_number_uq').on(t.agencyId, t.entryNumber),
]);

export type JournalEntry    = typeof journalEntries.$inferSelect;
export type NewJournalEntry = typeof journalEntries.$inferInsert;

// ── Journal Lines (double-entry) ──────────────────────────────────────────

export const journalLines = pgTable('journal_lines', {
  id:            text('id').primaryKey(),
  entryId:       text('entry_id').notNull().references(() => journalEntries.id, { onDelete: 'cascade' }),
  agencyId:      text('agency_id').notNull().references(() => agencies.id, { onDelete: 'cascade' }),
  accountCode:   text('account_code').notNull(),   // e.g. '1120', '4000'
  accountNameAr: text('account_name_ar'),
  accountNameEn: text('account_name_en'),
  debitHalalas:  bigint('debit_halalas', { mode: 'number' }).notNull().default(0),
  creditHalalas: bigint('credit_halalas', { mode: 'number' }).notNull().default(0),
  description:   text('description'),
  sortOrder:     integer('sort_order').notNull().default(0),
}, (t) => [
  index('idx_jl_agency').on(t.agencyId),
  index('idx_jl_agency_account').on(t.agencyId, t.accountCode),
  index('idx_jl_entry').on(t.entryId),
]);

export type JournalLine    = typeof journalLines.$inferSelect;
export type NewJournalLine = typeof journalLines.$inferInsert;

// ── Exchange Rates ────────────────────────────────────────────────────────

export const exchangeRates = pgTable('exchange_rates', {
  id:         text('id').primaryKey(),
  agencyId:   text('agency_id').notNull().references(() => agencies.id, { onDelete: 'cascade' }),
  fromCurrency: text('from_currency').notNull(),
  toCurrency:   text('to_currency').notNull().default('SAR'),
  rate:         integer('rate').notNull(),                   // stored as rate × 10000
  effectiveDate: text('effective_date').notNull(),
  createdAt:  timestamp('created_at').notNull().defaultNow(),
}, (t) => [
  index('idx_exchange_rates_agency').on(t.agencyId),
  index('idx_exchange_rates_lookup').on(t.agencyId, t.fromCurrency, t.toCurrency, t.effectiveDate),
]);

export type ExchangeRate    = typeof exchangeRates.$inferSelect;
export type NewExchangeRate = typeof exchangeRates.$inferInsert;

// ── Cost Centers ──────────────────────────────────────────────────────────────

export const costCenters = pgTable('cost_centers', {
  id:          text('id').primaryKey(),
  agencyId:    text('agency_id').notNull().references(() => agencies.id, { onDelete: 'cascade' }),
  code:        text('code').notNull(),
  nameAr:      text('name_ar').notNull(),
  nameEn:      text('name_en'),
  type:        text('type').notNull().default('department'), // department|project|branch|product
  parentId:    text('parent_id'),
  isActive:    boolean('is_active').notNull().default(true),
  notes:       text('notes'),
  createdAt:   timestamp('created_at').notNull().defaultNow(),
  updatedAt:   timestamp('updated_at').notNull().defaultNow(),
}, (t) => [
  index('idx_cost_centers_agency').on(t.agencyId),
  uniqueIndex('cost_centers_agency_code_uq').on(t.agencyId, t.code),
]);

export type CostCenter    = typeof costCenters.$inferSelect;
export type NewCostCenter = typeof costCenters.$inferInsert;

// ── Accounting Period Locks ────────────────────────────────────────────────

export const accountingPeriods = pgTable('accounting_periods', {
  id:          text('id').primaryKey(),
  agencyId:    text('agency_id').notNull().references(() => agencies.id, { onDelete: 'cascade' }),
  periodYear:  integer('period_year').notNull(),
  periodMonth: integer('period_month').notNull(),         // 1–12
  isLocked:    boolean('is_locked').notNull().default(false),
  lockedAt:    timestamp('locked_at'),
  lockedBy:    text('locked_by'),
  notes:       text('notes'),
  createdAt:   timestamp('created_at').notNull().defaultNow(),
  updatedAt:   timestamp('updated_at').notNull().defaultNow(),
}, (t) => [
  uniqueIndex('accounting_periods_agency_ym_uq').on(t.agencyId, t.periodYear, t.periodMonth),
]);

export type AccountingPeriod    = typeof accountingPeriods.$inferSelect;
export type NewAccountingPeriod = typeof accountingPeriods.$inferInsert;
