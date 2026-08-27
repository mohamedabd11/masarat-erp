const REQUIRED_IN_PRODUCTION = [
  'DATABASE_URL',
  'FIREBASE_SERVICE_ACCOUNT_JSON',
  'ENCRYPTION_KEY',
  'SUPER_ADMIN_EMAIL',
] as const;

export function validateEnv() {
  // Next.js uses NODE_ENV=production for optimized Vercel previews too.
  // Keep previews DB-less while preserving strict validation for real
  // production deployments and local `next start` runs.
  const isVercelPreview =
    process.env.VERCEL_ENV === 'preview' ||
    process.env.VERCEL_ENV === 'development';

  if (process.env.NODE_ENV !== 'production' || isVercelPreview) return;

  const missing = REQUIRED_IN_PRODUCTION.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}\n` +
      'Set these in your Vercel project settings before deploying to production.'
    );
  }
}
