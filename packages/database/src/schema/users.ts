/**
 * Users — جدول المستخدمين مع RBAC
 * Firebase Auth يبقى للمصادقة فقط، PostgreSQL للبيانات والصلاحيات
 */
import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  jsonb,
  index,
  unique,
} from 'drizzle-orm/pg-core';
import { userRoleEnum } from './enums.js';
import { agencies } from './agencies.js';

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agencyId: uuid('agency_id')
      .notNull()
      .references(() => agencies.id, { onDelete: 'cascade' }),

    // Firebase Auth UID — يُستخدم لربط JWT بالمستخدم
    firebaseUid: varchar('firebase_uid', { length: 128 }).unique(),

    // البيانات الأساسية
    email: varchar('email', { length: 255 }).notNull(),
    nameAr: varchar('name_ar', { length: 100 }).notNull(),
    nameEn: varchar('name_en', { length: 100 }).notNull(),
    mobile: varchar('mobile', { length: 20 }),

    // RBAC
    role: userRoleEnum('role').notNull().default('agent'),

    // صلاحيات تفصيلية (تتجاوز الـ role الأساسي)
    permissions: jsonb('permissions').$type<{
      perm_payment_refund?: boolean;
      perm_invoice_cancel?: boolean;
      perm_booking_approve?: boolean;
      perm_report_financial?: boolean;
      perm_supplier_payment?: boolean;
      [key: string]: boolean | undefined;
    }>().default({}),

    // الإعدادات الشخصية
    preferences: jsonb('preferences').$type<{
      language: 'ar' | 'en';
      theme: 'light' | 'dark' | 'system';
    }>().default({ language: 'ar', theme: 'system' }),

    isActive: boolean('is_active').notNull().default(true),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdBy: uuid('created_by'), // self-reference — nullable for first admin
  },
  (t) => ({
    usersEmailAgencyUnique: // email unique per agency (not globally)
    unique('users_email_agency_unique').on(t.email, t.agencyId),
    usersAgencyIdIdx: index('users_agency_id_idx').on(t.agencyId),
    usersFirebaseUidIdx: index('users_firebase_uid_idx').on(t.firebaseUid),
    usersRoleAgencyIdx: index('users_role_agency_idx').on(t.agencyId, t.role),
  })
);

/**
 * جدول Sessions — لتتبع جلسات المستخدمين وإلغائها
 * مهم لـ security: يسمح بـ force logout وتتبع الأجهزة
 */
export const userSessions = pgTable(
  'user_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    agencyId: uuid('agency_id')
      .notNull()
      .references(() => agencies.id, { onDelete: 'cascade' }),

    // معلومات الجلسة
    firebaseSessionId: varchar('firebase_session_id', { length: 256 }),
    userAgent: text('user_agent'),
    ipAddress: varchar('ip_address', { length: 45 }), // IPv6 compatible
    deviceInfo: jsonb('device_info').$type<{
      type?: string;
      os?: string;
      browser?: string;
    }>(),

    isActive: boolean('is_active').notNull().default(true),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    lastActivityAt: timestamp('last_activity_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    sessionsUserIdIdx: index('sessions_user_id_idx').on(t.userId),
    sessionsAgencyIdIdx: index('sessions_agency_id_idx').on(t.agencyId),
    sessionsExpiresAtIdx: index('sessions_expires_at_idx').on(t.expiresAt),
  })
);

/**
 * Audit Log — سجل لا يُمسح لجميع العمليات الحساسة
 * مطلب ZATCA + امتثال مالي
 */
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    agencyId: uuid('agency_id')
      .references(() => agencies.id, { onDelete: 'set null' }),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'set null' }),

    // ما الذي حدث
    action: varchar('action', { length: 100 }).notNull(),
    resourceType: varchar('resource_type', { length: 50 }).notNull(),
    resourceId: uuid('resource_id'),

    // التغييرات
    oldValues: jsonb('old_values'),
    newValues: jsonb('new_values'),

    // السياق
    ipAddress: varchar('ip_address', { length: 45 }),
    userAgent: text('user_agent'),
    requestId: uuid('request_id'),

    // metadata إضافية
    metadata: jsonb('metadata'),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    auditLogsAgencyIdIdx: index('audit_logs_agency_id_idx').on(t.agencyId),
    auditLogsUserIdIdx: index('audit_logs_user_id_idx').on(t.userId),
    auditLogsResourceIdx: index('audit_logs_resource_idx').on(t.resourceType, t.resourceId),
    auditLogsCreatedAtIdx: index('audit_logs_created_at_idx').on(t.createdAt),
  })
);
