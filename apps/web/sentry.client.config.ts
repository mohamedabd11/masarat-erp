import * as Sentry from '@sentry/nextjs';
if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    tracesSampleRate: 0.1,
    sendDefaultPii: false,
    // Financial and HR screens can contain sensitive business data. Keep
    // session replay disabled while retaining error and performance telemetry.
    replaysOnErrorSampleRate: 0,
    replaysSessionSampleRate: 0,
  });
}
