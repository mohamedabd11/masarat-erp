import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [['html', { open: 'never' }], ['list']],
  use: {
    // PLAYWRIGHT_BASE_URL is the canonical env var; E2E_BASE_URL is kept as a
    // fallback so the pre-existing browser-UI specs keep resolving a baseURL.
    baseURL:
      process.env.PLAYWRIGHT_BASE_URL ||
      process.env.E2E_BASE_URL ||
      'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    locale: 'ar-SA',
    timezoneId: 'Asia/Riyadh',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  // Do NOT auto-start dev server — requires real env vars. Tests run against a
  // deployed/running app via PLAYWRIGHT_BASE_URL.
});
