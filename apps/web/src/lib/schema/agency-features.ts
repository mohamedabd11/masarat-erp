import { pgTable, text, timestamp, unique } from 'drizzle-orm/pg-core';
import { agencies } from './agencies';

export const agencyFeatures = pgTable('agency_features', {
  id:           text('id').primaryKey(),
  agencyId:     text('agency_id').notNull().references(() => agencies.id, { onDelete: 'cascade' }),
  featureKey:   text('feature_key').notNull(),
  overrideType: text('override_type').notNull(),  // 'grant' | 'revoke'
  enabledBy:    text('enabled_by').notNull(),      // super admin email
  notes:        text('notes'),
  createdAt:    timestamp('created_at').notNull().defaultNow(),
  updatedAt:    timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  agencyFeatureUq: unique('agency_features_agency_key_uq').on(table.agencyId, table.featureKey),
}));

export type AgencyFeature    = typeof agencyFeatures.$inferSelect;
export type NewAgencyFeature = typeof agencyFeatures.$inferInsert;
