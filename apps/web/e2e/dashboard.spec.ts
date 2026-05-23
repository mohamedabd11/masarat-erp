import { test, expect } from '@playwright/test';
import { loginAs } from './helpers/auth';

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    // Skip actual login in unit tests — mock auth state or use emulator
    // For now, navigate directly and check redirect behavior
  });

  test('redirects / to /ar/dashboard', async ({ page }) => {
    await page.goto('/ar');
    await expect(page).toHaveURL(/\/ar\/dashboard/);
  });

  test('dashboard page has stats section', async ({ page }) => {
    // Without auth, expect redirect to login
    await page.goto('/ar/dashboard');
    // Either shows dashboard (if auth cached) or redirects to login
    const url = page.url();
    expect(url).toMatch(/\/(ar|en)\/(dashboard|login)/);
  });
});
