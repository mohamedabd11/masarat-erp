/**
 * Next.js Instrumentation hook — runs once per server boot.
 * Required to load Sentry on the Node.js runtime before any request is handled.
 */
export async function register() {
  if (process.env['NEXT_RUNTIME'] === 'nodejs') {
    await import('../sentry.server.config');
  }

  if (process.env['NEXT_RUNTIME'] === 'edge') {
    await import('../sentry.edge.config');
  }
}
