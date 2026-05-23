import { test, expect } from '@playwright/test';

test.describe('Login page — Arabic', () => {
  test('shows login form', async ({ page }) => {
    await page.goto('/ar/login');
    await expect(page).toHaveTitle(/مسارات/i);
    await expect(page.getByRole('heading', { name: /تسجيل الدخول/i })).toBeVisible();
  });

  test('shows error on wrong password', async ({ page }) => {
    await page.goto('/ar/login');
    await page.getByLabel(/البريد الإلكتروني/i).fill('wrong@example.com');
    await page.getByLabel(/كلمة المرور/i).fill('wrongpassword');
    await page.getByRole('button', { name: /دخول/i }).click();
    // Should show an error — either generic or field-level
    await expect(page.locator('[role="alert"], .text-red-600, .text-red-700')).toBeVisible({ timeout: 8000 });
  });

  test('redirects unauthenticated user to login', async ({ page }) => {
    await page.goto('/ar/dashboard');
    await expect(page).toHaveURL(/\/ar\/login/);
  });
});

test.describe('Login page — English', () => {
  test('shows English login form', async ({ page }) => {
    await page.goto('/en/login');
    await expect(page.getByRole('heading', { name: /Sign in/i })).toBeVisible();
  });
});
