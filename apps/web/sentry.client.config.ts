/**
 * Sentry — Browser / Client-Side configuration
 * Loaded by Next.js when NEXT_PUBLIC_SENTRY_DSN is set.
 */
import * as Sentry from '@sentry/nextjs';

const SENTRY_DSN = process.env['NEXT_PUBLIC_SENTRY_DSN'];

if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: process.env['NODE_ENV'],

    // Capture 10 % of transactions in production to stay within quota
    tracesSampleRate: process.env['NODE_ENV'] === 'production' ? 0.1 : 1.0,

    // Session replays — only on errors (1 % of all sessions)
    replaysSessionSampleRate: 0.01,
    replaysOnErrorSampleRate: 1.0,

    // Never send agency/user PII to Sentry
    beforeSend(event) {
      // Strip request bodies — may contain booking / financial data
      if (event.request?.data) delete event.request.data;
      return event;
    },

    integrations: [
      Sentry.replayIntegration({
        // Mask all text and block all media — GDPR + financial data safety
        maskAllText: true,
        blockAllMedia: true,
      }),
    ],
  });
}
