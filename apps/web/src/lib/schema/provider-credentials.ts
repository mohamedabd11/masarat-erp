import { pgTable, text, jsonb, boolean, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { agencies } from './agencies';

export const providerCredentials = pgTable('provider_credentials', {
  id:           text('id').primaryKey(),
  agencyId:     text('agency_id').notNull().references(() => agencies.id, { onDelete: 'cascade' }),
  providerCode: text('provider_code').notNull(),  // amadeus|sabre|galileo|worldspan
  label:        text('label'),                    // human-readable name e.g. "Amadeus Production"
  credentials:  jsonb('credentials'),             // provider-specific config (keys, endpoints, etc.)
  isActive:     boolean('is_active').notNull().default(true),
  createdAt:    timestamp('created_at').notNull().defaultNow(),
  updatedAt:    timestamp('updated_at').notNull().defaultNow(),
}, (t) => ({
  agencyProviderUq: uniqueIndex('provider_creds_agency_provider_uq').on(t.agencyId, t.providerCode),
}));

export type ProviderCredential    = typeof providerCredentials.$inferSelect;
export type NewProviderCredential = typeof providerCredentials.$inferInsert;
