/**
 * DDL and boot-time migrations must use a privileged connection that is kept
 * separate from the application's restricted runtime role.
 *
 * Local development may fall back to DATABASE_URL for convenience. Production
 * and Vercel Preview never fall back: silently running the whole app as the
 * owner/BYPASSRLS role would make database tenant isolation ineffective.
 */
export function getAdminDatabaseUrl(): string | undefined {
  const adminUrl = process.env.ADMIN_DATABASE_URL?.trim();
  if (adminUrl) return adminUrl;

  if (process.env.NODE_ENV !== 'production') {
    return process.env.DATABASE_URL?.trim() || undefined;
  }

  return undefined;
}
