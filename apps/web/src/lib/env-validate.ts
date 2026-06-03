const REQUIRED_IN_PRODUCTION = [
  'DATABASE_URL',
  'FIREBASE_PROJECT_ID',
  'FIREBASE_CLIENT_EMAIL',
  'FIREBASE_PRIVATE_KEY',
  'ENCRYPTION_KEY',
  'SUPER_ADMIN_EMAIL',
] as const;

export function validateEnv() {
  if (process.env.NODE_ENV !== 'production') return;
  const missing = REQUIRED_IN_PRODUCTION.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}\n` +
      'Set these in your Vercel project settings before deploying to production.'
    );
  }
}
