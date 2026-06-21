import { pgTable, text, boolean, timestamp } from 'drizzle-orm/pg-core';
import { agencies } from './agencies';

export const users = pgTable('users', {
  id:        text('id').primaryKey(),                          // Firebase Auth UID
  agencyId:  text('agency_id').notNull().references(() => agencies.id, { onDelete: 'cascade' }),
  email:     text('email').notNull(),
  nameAr:    text('name_ar'),
  nameEn:    text('name_en'),
  role:      text('role').notNull().default('staff'),          // admin|staff
  // JSON array of feature keys this user may access (section-level permissions).
  // NULL = full access (legacy users + admins). Enforced server-side in verifyAuth.
  permissions: text('permissions'),
  isActive:  boolean('is_active').notNull().default(true),
  invitedBy: text('invited_by'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export type User    = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
