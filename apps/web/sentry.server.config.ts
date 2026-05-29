/**
 * Sentry — Server-Side / Node.js configuration
 * Loaded by Next.js instrumentation hook (instrumentation.ts).
 */
import * as Sentry from '@sentry/nextjs';

const SENTRY_DSN = process.env['SENTRY_DSN'];

if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: process.env['NODE_ENV'],

    // 100 % of errors, 5 % of traces
    tracesSampleRate: process.env['NODE_ENV'] === 'production' ? 0.05 : 1.0,

    // Strip sensitive data before it leaves the server
    beforeSend(event) {
      // Remove request bodies — may contain ZATCA XML / invoices
      if (event.request?.data) {
        event.request.data = '[REDACTED]';
      }
      return event;
    },
  });
}
