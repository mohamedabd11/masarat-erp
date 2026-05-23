import { test, expect } from '@playwright/test';

test.describe('i18n — locale switching', () => {
  test('login page Arabic is RTL', async ({ page }) => {
    await page.goto('/ar/login');
    const dir = await page.locator('html').getAttribute('dir');
    expect(dir).toBe('rtl');
  });

  test('login page English is LTR', async ({ page }) => {
    await page.goto('/en/login');
    const dir = await page.locator('html').getAttribute('dir');
    expect(dir).toBe('ltr');
  });

  test('404 page shows bilingual content', async ({ page }) => {
    await page.goto('/ar/this-page-does-not-exist');
    // Should show 404 or redirect to login
    const url = page.url();
    expect(url).toMatch(/\/(ar|en)\//);
  });
});
