import * as Sentry from '@sentry/nextjs';

export function captureAppError(error: Error & { digest?: string }) {
  Sentry.captureException(error);
  console.error(JSON.stringify({
    event: 'client_render_error',
    message: error.message,
    digest: error.digest,
  }));
}
