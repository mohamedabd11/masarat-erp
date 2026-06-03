import { test, expect } from '@playwright/test';
import { apiGet, getAuthToken, getAuthHeaders } from './helpers/auth';

// API-level auth checks. (Browser-UI login behaviour lives in auth.spec.ts.)
// These run against a deployed app via PLAYWRIGHT_BASE_URL.
test.describe('API authentication', () => {
  test('unauthenticated home page shows login or redirects', async ({ page }) => {
    const res = await page.goto('/');
    // App is reachable and does not 5xx for an anonymous visitor.
    expect(res, 'navigation response should exist').not.toBeNull();
    expect(res!.status()).toBeLessThan(500);
    // Anonymous users end up on a login route (any locale) — never on a
    // protected dashboard.
    await expect(page).toHaveURL(/\/(login|en\/login|ar\/login|$)|\/(ar|en)\/?$/);
  });

  test('protected API call without a token returns 401', async ({ request }) => {
    // No Authorization header at all.
    const res = await request.get('/api/users/me');
    expect(res.status()).toBe(401);
  });

  test('protected API call with a garbage token returns 401', async ({ request }) => {
    const res = await request.get('/api/users/me', {
      headers: { Authorization: 'Bearer not-a-real-token' },
    });
    expect(res.status()).toBe(401);
  });

  test('financial API write without a token returns 401', async ({ request }) => {
    const res = await request.post('/api/invoices/create', {
      headers: { 'Content-Type': 'application/json' },
      data: { bookingId: '00000000-0000-0000-0000-000000000000' },
    });
    expect(res.status()).toBe(401);
  });

  test('valid token authenticates (returns 200)', async ({ page }) => {
    test.skip(!getAuthToken(), 'requires auth token (E2E_FIREBASE_TOKEN)');
    const res = await apiGet(page, '/api/users/me');
    expect(res.status(), await res.text()).toBe(200);
    // Sanity check the auth header helper produced a Bearer token.
    expect(getAuthHeaders()['Authorization']).toMatch(/^Bearer .+/);
  });
});
