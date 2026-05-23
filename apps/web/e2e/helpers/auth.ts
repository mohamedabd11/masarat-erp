import { Page } from '@playwright/test';

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
