import { test, expect } from '@playwright/test';

test.describe('Bookings page', () => {
  test('redirects unauthenticated user', async ({ page }) => {
    await page.goto('/ar/bookings');
    await expect(page).toHaveURL(/\/ar\/login/);
  });

  test('redirects unauthenticated user (English)', async ({ page }) => {
    await page.goto('/en/bookings');
    await expect(page).toHaveURL(/\/en\/login/);
  });
});
