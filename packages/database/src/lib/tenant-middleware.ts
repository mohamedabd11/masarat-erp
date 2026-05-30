/**
 * Tenant Middleware — يُطبَّق على كل database connection
 *
 * الهدف: ضمان أن كل query تُنفَّذ في سياق الـ tenant الصحيح
 * عبر SET app.current_agency_id قبل أي query أخرى
 *
 * مهم: يجب استدعاء withTenantContext() في كل Server Action وAPI Route
 * قبل أي تعامل مع قاعدة البيانات.
 */

import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from '../schema/index.js';

/**
 * إنشاء database client مع tenant context محدد مسبقاً
 * كل query من هذا الـ client ستكون محدودة ببيانات الـ tenant فقط
 *
 * @example
 * // في Server Action أو API Route:
 * const db = await withTenantContext(agencyId);
 * const bookings = await db.select().from(schema.bookings);
 * // النتيجة: حجوزات الوكالة فقط — حتى بدون WHERE clause
 */
export async function withTenantContext(agencyId: string) {
  const url = process.env['DATABASE_URL'];
  if (!url) throw new Error('DATABASE_URL is not set');

  const sql = neon(url);

  // تعيين الـ tenant context قبل أي query
  // true في المعامل الثالث = local to transaction
  await sql`SELECT set_config('app.current_agency_id', ${agencyId}, false)`;

  return drizzle(sql, { schema });
}

