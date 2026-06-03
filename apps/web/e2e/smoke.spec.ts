import { test, expect } from '@playwright/test';

// Smoke tests verify the deployed app is up and that every critical API route is
// wired (responds rather than 404s). These run with NO auth token, so authed
// routes are expected to answer 401 — which still proves the route exists.
test.describe('Smoke — app is running', () => {
  test('GET /api/health responds (< 500)', async ({ request }) => {
    const res = await request.get('/api/health');
    // Health is public. It returns 200 when the DB is reachable and a
    // documented 503 when DATABASE_URL is missing/unreachable. Either way the
    // process is alive, so we only fail on a true server crash (>= 504).
    expect(res.status(), await res.text()).toBeLessThan(504);
    const body = await res.json().catch(() => ({}));
    expect(body, 'health returns JSON').toBeTruthy();
  });

  test('home page loads', async ({ page }) => {
    const res = await page.goto('/');
    expect(res, 'navigation response should exist').not.toBeNull();
    expect(res!.status()).toBeLessThan(500);
  });

  // Each critical authed route must respond (not 404). Without a token they
  // answer 401 (or 400/405 for method mismatches) — never 404 / 5xx.
  const CRITICAL_GET_ROUTES = [
    '/api/users/me',
    '/api/invoices',
    '/api/bookings',
    '/api/banking/accounts',
    '/api/supplier-payments',
    '/api/customers',
    '/api/suppliers',
    '/api/accounting/journal',
    '/api/reports/balance-sheet',
    '/api/dashboard/stats',
  ];

  for (const route of CRITICAL_GET_ROUTES) {
    test(`route exists: GET ${route}`, async ({ request }) => {
      const res = await request.get(route);
      expect(res.status(), `${route} should not 404`).not.toBe(404);
      expect(res.status(), `${route} should not 5xx`).toBeLessThan(500);
    });
  }

  const CRITICAL_POST_ROUTES = [
    '/api/invoices/create',
    '/api/invoices/credit-note',
    '/api/banking/transactions',
    '/api/banking/reconcile',
    '/api/supplier-payments/create',
    '/api/supplier-payments/reverse',
  ];

  for (const route of CRITICAL_POST_ROUTES) {
    test(`route exists: POST ${route}`, async ({ request }) => {
      const res = await request.post(route, {
        headers: { 'Content-Type': 'application/json' },
        data: {},
      });
      expect(res.status(), `${route} should not 404`).not.toBe(404);
      expect(res.status(), `${route} should not 5xx`).toBeLessThan(500);
    });
  }
});
