import { pgTable, text, jsonb, boolean, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { agencies } from './agencies';

/**
 * One credential per GDS provider per agency.
 * credentials JSONB is NEVER returned to the client — API routes project it out.
 *
 * Amadeus credentials shape:
 *   { clientId: string, clientSecret: string, hostname: string }
 *   hostname: "test.api.amadeus.com" | "api.amadeus.com"
 *
 * Unique constraint: (agencyId, providerCode)
 *   → one active credential per provider per agency (deactivate old, add new)
 */
export const providerCredentials = pgTable('provider_credentials', {
  id:           text('id').primaryKey(),
  agencyId:     text('agency_id').notNull().references(() => agencies.id, { onDelete: 'cascade' }),
  providerCode: text('provider_code').notNull(),  // amadeus|sabre|galileo|worldspan
  label:        text('label'),                    // e.g. "Amadeus Production"
  credentials:  jsonb('credentials'),             // API keys — NEVER returned to client
  isActive:     boolean('is_active').notNull().default(true),
  // Connection test results
  testedAt:     timestamp('tested_at',   { withTimezone: true }),
  testStatus:   text('test_status'),             // success|failed
  testError:    text('test_error'),              // last error message if failed
  createdAt:    timestamp('created_at').notNull().defaultNow(),
  updatedAt:    timestamp('updated_at').notNull().defaultNow(),
}, (t) => ({
  agencyProviderUq: uniqueIndex('provider_creds_agency_provider_uq').on(t.agencyId, t.providerCode),
}));

export type ProviderCredential    = typeof providerCredentials.$inferSelect;
export type NewProviderCredential = typeof providerCredentials.$inferInsert;
