/**
 * @masarat/database — Main Entry Point
 *
 * الاستخدام في Next.js Server Actions:
 * ```typescript
 * import { withTenantContext } from '@masarat/database';
 * import * as schema from '@masarat/database/schema';
 *
 * export async function getBookings(agencyId: string) {
 *   const db = await withTenantContext(agencyId);
 *   return db.select().from(schema.bookings).orderBy(desc(schema.bookings.createdAt));
 * }
 * ```
 */

// Database client
export { createDbClient, db } from './lib/client.js';
export type { Database } from './lib/client.js';

// Tenant middleware
export { withTenantContext } from './lib/tenant-middleware.js';

// Schema (re-exported for convenience)
export * from './schema/index.js';
