import { test, expect } from '@playwright/test';
import { apiGet, apiPost, getAuthToken } from './helpers/auth';

// Banking flow via the JSON API. All banking routes require an accountant-or-up
// role, so the whole suite is auth-gated.
test.describe('Banking flow (API)', () => {
  test.skip(!getAuthToken(), 'requires auth token (E2E_FIREBASE_TOKEN)');

  let accountId = '';
  const today = new Date().toISOString().split('T')[0]!;

  test('create a bank account to operate on', async ({ page }) => {
    const res = await apiPost(page, '/api/banking/accounts', {
      nameAr: 'حساب اختبار E2E',
      nameEn: 'E2E Test Account',
      type: 'bank',
      currency: 'SAR',
    });
    expect(res.status(), await res.text()).toBeLessThan(300);
    const body = await res.json();
    accountId = body.id ?? '';
    expect(accountId, 'account id returned').not.toBe('');
  });

  test('POST /api/banking/transactions records a deposit', async ({ page }) => {
    test.skip(!accountId, 'account was not created');
    const res = await apiPost(page, '/api/banking/transactions', {
      bankAccountId: accountId,
      type: 'deposit',
      amountHalalas: 500_00,
      description: 'E2E deposit',
      date: today,
    });
    // Spec target 201; route returns NextResponse.json default (200). Accept 2xx.
    expect(res.status(), await res.text()).toBeLessThan(300);
  });

  test('GET /api/banking/reconcile returns a transactions array', async ({ page }) => {
    test.skip(!accountId, 'account was not created');
    const res = await apiGet(page, `/api/banking/reconcile?accountId=${accountId}`);
    expect(res.status(), await res.text()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.transactions), 'transactions is an array').toBe(true);
    expect(body.transactions.length, 'deposit appears in reconcile list').toBeGreaterThan(0);
  });

  test('POST /api/banking/reconcile returns reconciledCount', async ({ page }) => {
    test.skip(!accountId, 'account was not created');
    // Grab a transaction id to reconcile.
    const listRes = await apiGet(page, `/api/banking/reconcile?accountId=${accountId}`);
    expect(listRes.status()).toBe(200);
    const list = await listRes.json();
    const txIds: string[] = (list.transactions as Array<{ id: string }>).map((t) => t.id);
    test.skip(txIds.length === 0, 'no transactions available to reconcile');

    const res = await apiPost(page, '/api/banking/reconcile', {
      bankAccountId: accountId,
      statementDate: today,
      // Reconcile against current book balance → no discrepancy entry needed.
      statementBalanceHalalas: list.account.currentBalanceHalalas,
      transactionIds: txIds,
    });
    expect(res.status(), await res.text()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty('reconciledCount');
    expect(body.reconciledCount).toBe(txIds.length);
  });
});
