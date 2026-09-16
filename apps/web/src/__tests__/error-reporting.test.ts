import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
}));

import * as Sentry from '@sentry/nextjs';
import { captureAppError } from '@/lib/error-reporting';

describe('client error reporting', () => {
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    consoleError.mockClear();
  });

  it('reports rendering errors to Sentry and emits a structured runtime log', () => {
    const error = Object.assign(new Error('render failed'), { digest: 'digest-123' });

    captureAppError(error);

    expect(Sentry.captureException).toHaveBeenCalledWith(error);
    expect(consoleError).toHaveBeenCalledOnce();
    expect(JSON.parse(String(consoleError.mock.calls[0]?.[0]))).toEqual({
      event: 'client_render_error',
      message: 'render failed',
      digest: 'digest-123',
    });
  });
});
