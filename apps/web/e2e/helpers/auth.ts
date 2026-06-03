import { Page, APIResponse } from '@playwright/test';

// ─── API auth helpers ────────────────────────────────────────────────────────
// These drive the deployed app's JSON API directly (no browser UI). Auth is via
// a Firebase ID token supplied in the E2E_FIREBASE_TOKEN env var and sent as a
// Bearer token in the Authorization header — matching apps/web/src/lib/api-auth.ts.

/** Returns the test Firebase ID token from the environment, or `undefined`. */
export function getAuthToken(): string | undefined {
  return process.env.E2E_FIREBASE_TOKEN || undefined;
}

/**
 * Builds request headers including the Bearer auth header when a test token is
 * available. Always sets `Content-Type: application/json`. Extra headers can be
 * merged in via `extra`.
 */
export function getAuthHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...extra,
  };
  const token = getAuthToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

/** Authenticated GET against the deployed app's API. */
export function apiGet(page: Page, path: string): Promise<APIResponse> {
  return page.request.get(path, { headers: getAuthHeaders() });
}

/** Authenticated POST against the deployed app's API. */
export function apiPost(page: Page, path: string, body: unknown): Promise<APIResponse> {
  return page.request.post(path, { headers: getAuthHeaders(), data: body as object });
}

/** Authenticated PATCH against the deployed app's API. */
export function apiPatch(page: Page, path: string, body: unknown): Promise<APIResponse> {
  return page.request.patch(path, { headers: getAuthHeaders(), data: body as object });
}

// ─── Browser-UI login helpers (used by the pre-existing UI specs) ────────────

export async function loginAs(page: Page, email = 'test@masarat.sa', password = 'Test1234!') {
  await page.goto('/ar/login');
  await page.getByLabel(/البريد الإلكتروني|Email/i).fill(email);
  await page.getByLabel(/كلمة المرور|Password/i).fill(password);
  await page.getByRole('button', { name: /دخول|Sign in/i }).click();
  // wait for redirect to dashboard
  await page.waitForURL('**/dashboard', { timeout: 15_000 });
}

export async function loginAsEn(page: Page, email = 'test@masarat.sa', password = 'Test1234!') {
  await page.goto('/en/login');
  await page.getByLabel(/Email/i).fill(email);
  await page.getByLabel(/Password/i).fill(password);
  await page.getByRole('button', { name: /Sign in/i }).click();
  await page.waitForURL('**/dashboard', { timeout: 15_000 });
}
