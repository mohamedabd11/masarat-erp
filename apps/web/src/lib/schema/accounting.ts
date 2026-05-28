import { pgTable, text, integer, boolean, timestamp } from 'drizzle-orm/pg-core';
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
  openingBalanceHalalas: integer('opening_balance_halalas').notNull().default(0),
  createdAt:           timestamp('created_at').notNull().defaultNow(),
  updatedAt:           timestamp('updated_at').notNull().defaultNow(),
});

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
  isPosted:      boolean('is_posted').notNull().default(true),
  totalDebitHalalas:  integer('total_debit_halalas').notNull().default(0),
  totalCreditHalalas: integer('total_credit_halalas').notNull().default(0),
  createdBy:     text('created_by'),
  createdAt:     timestamp('created_at').notNull().defaultNow(),
});

export type JournalEntry    = typeof journalEntries.$inferSelect;
export type NewJournalEntry = typeof journalEntries.$inferInsert;

// ── Journal Lines (double-entry) ──────────────────────────────────────────

export const journalLines = pgTable('journal_lines', {
  id:            text('id').primaryKey(),
  entryId:       text('entry_id').notNull().references(() => journalEntries.id, { onDelete: 'cascade' }),
  agencyId:      text('agency_id').notNull(),
  accountCode:   text('account_code').notNull(),   // e.g. '1120', '4000'
  accountNameAr: text('account_name_ar'),
  accountNameEn: text('account_name_en'),
  debitHalalas:  integer('debit_halalas').notNull().default(0),
  creditHalalas: integer('credit_halalas').notNull().default(0),
  description:   text('description'),
  sortOrder:     integer('sort_order').notNull().default(0),
});

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
});

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
});

export type CostCenter    = typeof costCenters.$inferSelect;
export type NewCostCenter = typeof costCenters.$inferInsert;
