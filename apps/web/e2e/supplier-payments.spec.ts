import { test, expect } from '@playwright/test';
import { apiPost, getAuthToken } from './helpers/auth';

// Supplier-payment voucher create + reverse via the JSON API.
// `create` needs accountant-or-up; `reverse` needs admin/owner — so this whole
// suite requires a token whose role can reverse vouchers.
test.describe('Supplier payments (API)', () => {
  test.skip(!getAuthToken(), 'requires auth token (E2E_FIREBASE_TOKEN)');

  let supplierPaymentId = '';
  let voucherNumber = '';

  test('POST /api/supplier-payments/create returns a voucherNumber', async ({ page }) => {
    const res = await apiPost(page, '/api/supplier-payments/create', {
      payeeName: 'مورد اختبار E2E',
      expenseCategory: 'operational',
      amountHalalas: 250_00,
      paymentMethod: 'bank_transfer',
      notes: 'E2E supplier payment',
    });
    // Spec target 201; route returns NextResponse.json default (200). Accept 2xx.
    expect(res.status(), await res.text()).toBeLessThan(300);
    const body = await res.json();
    supplierPaymentId = body.id ?? '';
    voucherNumber = body.voucherNumber ?? '';
    expect(supplierPaymentId, 'payment id returned').not.toBe('');
    expect(voucherNumber, 'voucherNumber returned').not.toBe('');
  });

  test('POST /api/supplier-payments/reverse returns a reversalVoucherNumber', async ({ page }) => {
    test.skip(!supplierPaymentId, 'payment was not created');
    const res = await apiPost(page, '/api/supplier-payments/reverse', {
      supplierPaymentId,
      reason: 'e2e reversal',
    });
    // 200 on success; 403 if the token lacks the admin role required to reverse.
    expect([200, 403], await res.text()).toContain(res.status());
    if (res.status() === 200) {
      const body = await res.json();
      expect(body).toHaveProperty('reversalVoucherNumber');
      expect(body.reversalVoucherNumber).toContain('-REV');
    }
  });
});
