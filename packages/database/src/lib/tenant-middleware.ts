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

/**
 * Wrapper للـ Server Actions: يستخرج agencyId من Firebase JWT
 * ويُنشئ db client محمي بـ RLS
 *
 * @example
 * export async function createBookingAction(data: BookingInput) {
 *   return withAuthenticatedTenant(async (db, agencyId, userId) => {
 *     await db.insert(bookings).values({ ...data, agencyId, createdBy: userId });
 *   });
 * }
 */
export async function withAuthenticatedTenant<T>(
  firebaseIdToken: string,
  callback: (
    db: Awaited<ReturnType<typeof withTenantContext>>,
    agencyId: string,
    userId: string
  ) => Promise<T>
): Promise<T> {
  // استخراج claims من Firebase token
  const { agencyId, userId } = await verifyFirebaseToken(firebaseIdToken);

  // إنشاء db client مع tenant context
  const db = await withTenantContext(agencyId);

  return callback(db, agencyId, userId);
}

/**
 * التحقق من Firebase ID Token واستخراج claims
 * يستدعي Firebase Admin SDK
 */
async function verifyFirebaseToken(idToken: string): Promise<{
  agencyId: string;
  userId: string;
  role: string;
  email: string;
}> {
  // dynamic import لتجنب تحميل firebase-admin في edge runtime
  const { getAuth } = await import('firebase-admin/auth');

  const decoded = await getAuth().verifyIdToken(idToken);

  const agencyId = decoded['agencyId'] as string | undefined;
  if (!agencyId) {
    throw new Error('Token missing agencyId claim. User is not properly registered.');
  }

  return {
    agencyId,
    userId: decoded.uid,
    role: (decoded['role'] as string) ?? 'viewer',
    email: decoded.email ?? '',
  };
}

/**
 * دالة مساعدة لـ Next.js API Routes
 * تستخدم cookie أو Authorization header
 */
export async function getDbForRequest(
  request: Request
): Promise<Awaited<ReturnType<typeof withTenantContext>>> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    throw new Error('Missing or invalid Authorization header');
  }

  const idToken = authHeader.slice(7);
  const { agencyId } = await verifyFirebaseToken(idToken);
  return withTenantContext(agencyId);
}
