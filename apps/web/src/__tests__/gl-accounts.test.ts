/**
 * Tests for GL account constants from @/lib/gl-accounts
 *
 * Verifies that the single source-of-truth GL object has the correct codes,
 * Arabic/English labels, and follows the accounting number range conventions.
 */
import { describe, it, expect } from 'vitest';
import { GL } from '@/lib/gl-accounts';
import type { GLAccount } from '@/lib/gl-accounts';

// ─── Asset accounts (1xxx) ────────────────────────────────────────────────────

describe('GL asset accounts (1xxx)', () => {

  it('GL.cash.code === "1100"', () => {
    expect(GL.cash.code).toBe('1100');
  });

  it('GL.bank.code === "1110"', () => {
    expect(GL.bank.code).toBe('1110');
  });

  it('GL.posCard.code === "1115"', () => {
    expect(GL.posCard.code).toBe('1115');
  });

  it('GL.receivable.code === "1120" (حسابات القبض - عملاء)', () => {
    expect(GL.receivable.code).toBe('1120');
  });

  it('GL.chequesReceivable.code === "1125"', () => {
    expect(GL.chequesReceivable.code).toBe('1125');
  });

  it('GL.prepaidExpenses.code === "1130"', () => {
    expect(GL.prepaidExpenses.code).toBe('1130');
  });

  it('GL.inputVat.code === "1230"', () => {
    expect(GL.inputVat.code).toBe('1230');
  });

  it('GL.bspClearing.code === "1350"', () => {
    expect(GL.bspClearing.code).toBe('1350');
  });
});

// ─── Liability accounts (2xxx) ────────────────────────────────────────────────

describe('GL liability accounts (2xxx)', () => {

  it('GL.vatPayable.code === "2200"', () => {
    expect(GL.vatPayable.code).toBe('2200');
  });

  it('GL.payableSupplier.code === "2000"', () => {
    expect(GL.payableSupplier.code).toBe('2000');
  });

  it('GL.payableSupplier.code starts with "2" (liability range)', () => {
    expect(GL.payableSupplier.code.startsWith('2')).toBe(true);
  });

  it('GL.payableAirlines.code === "2100"', () => {
    expect(GL.payableAirlines.code).toBe('2100');
  });

  it('GL.payableHotels.code === "2110"', () => {
    expect(GL.payableHotels.code).toBe('2110');
  });

  it('GL.bspPayable.code === "2150"', () => {
    expect(GL.bspPayable.code).toBe('2150');
  });

  it('GL.customerDeposits.code === "2300"', () => {
    expect(GL.customerDeposits.code).toBe('2300');
  });

  it('GL.salariesPayable.code === "2310"', () => {
    expect(GL.salariesPayable.code).toBe('2310');
  });

  it('GL.salariesPayable.code starts with "2"', () => {
    expect(GL.salariesPayable.code.startsWith('2')).toBe(true);
  });

  it('GL.gosiPayable.code === "2400"', () => {
    expect(GL.gosiPayable.code).toBe('2400');
  });

  it('GL.eosbProvision.code === "2500"', () => {
    expect(GL.eosbProvision.code).toBe('2500');
  });
});

// ─── Equity accounts (3xxx) ───────────────────────────────────────────────────

describe('GL equity accounts (3xxx)', () => {

  it('GL.ownerCapital.code === "3100"', () => {
    expect(GL.ownerCapital.code).toBe('3100');
  });

  it('GL.retainedEarnings.code === "3200"', () => {
    expect(GL.retainedEarnings.code).toBe('3200');
  });

  it('GL.deferredRevenue.code === "3201"', () => {
    expect(GL.deferredRevenue.code).toBe('3201');
  });
});

// ─── Revenue accounts (4xxx) ──────────────────────────────────────────────────

describe('GL revenue accounts (4xxx)', () => {

  it('GL.revenueAgent.code === "4000"', () => {
    expect(GL.revenueAgent.code).toBe('4000');
  });

  it('GL.revenuePrincipal.code === "4100"', () => {
    expect(GL.revenuePrincipal.code).toBe('4100');
  });

  it('GL.admRecovery.code === "4420"', () => {
    expect(GL.admRecovery.code).toBe('4420');
  });

  it('GL.fxGain.code === "4900"', () => {
    expect(GL.fxGain.code).toBe('4900');
  });

  it('GL.reconcileIncome.code === "4510"', () => {
    expect(GL.reconcileIncome.code).toBe('4510');
  });
});

// ─── Expense accounts (5xxx / 6xxx) ──────────────────────────────────────────

describe('GL expense accounts (5xxx / 6xxx)', () => {

  it('GL.costOfServices.code === "5000"', () => {
    expect(GL.costOfServices.code).toBe('5000');
  });

  it('GL.admExpense.code === "5420"', () => {
    expect(GL.admExpense.code).toBe('5420');
  });

  it('GL.fxLoss.code === "5900"', () => {
    expect(GL.fxLoss.code).toBe('5900');
  });

  it('GL.reconcileExpense.code === "5510"', () => {
    expect(GL.reconcileExpense.code).toBe('5510');
  });

  it('GL.salaryExpense.code === "6100"', () => {
    expect(GL.salaryExpense.code).toBe('6100');
  });

  it('GL.salaryExpense.code starts with "6"', () => {
    expect(GL.salaryExpense.code.startsWith('6')).toBe(true);
  });

  it('GL.gosiExpense.code === "6200"', () => {
    expect(GL.gosiExpense.code).toBe('6200');
  });

  it('GL.eosbExpense.code === "6300"', () => {
    expect(GL.eosbExpense.code).toBe('6300');
  });
});

// ─── Structural integrity ─────────────────────────────────────────────────────

describe('GL accounts structural integrity', () => {

  it('كل حساب GL يحتوي على خصائص .code و .ar و .en', () => {
    const accounts = Object.values(GL) as GLAccount[];
    for (const account of accounts) {
      expect(account).toHaveProperty('code');
      expect(account).toHaveProperty('ar');
      expect(account).toHaveProperty('en');
    }
  });

  it('جميع رموز الحسابات هي سلاسل غير فارغة', () => {
    const accounts = Object.values(GL) as GLAccount[];
    for (const account of accounts) {
      expect(typeof account.code).toBe('string');
      expect(account.code.length).toBeGreaterThan(0);
    }
  });

  it('جميع الأسماء العربية غير فارغة', () => {
    const accounts = Object.values(GL) as GLAccount[];
    for (const account of accounts) {
      expect(typeof account.ar).toBe('string');
      expect(account.ar.length).toBeGreaterThan(0);
    }
  });

  it('جميع الأسماء الإنجليزية غير فارغة', () => {
    const accounts = Object.values(GL) as GLAccount[];
    for (const account of accounts) {
      expect(typeof account.en).toBe('string');
      expect(account.en.length).toBeGreaterThan(0);
    }
  });

  it('لا توجد رموز حسابات مكررة (كل رمز فريد)', () => {
    const codes = (Object.values(GL) as GLAccount[]).map(a => a.code);
    const uniqueCodes = new Set(codes);
    expect(uniqueCodes.size).toBe(codes.length);
  });

  it('حسابات الأصول تبدأ بـ 1', () => {
    // Spot check key asset accounts
    expect(GL.cash.code.startsWith('1')).toBe(true);
    expect(GL.bank.code.startsWith('1')).toBe(true);
    expect(GL.receivable.code.startsWith('1')).toBe(true);
  });

  it('حسابات الخصوم تبدأ بـ 2', () => {
    expect(GL.vatPayable.code.startsWith('2')).toBe(true);
    expect(GL.payableSupplier.code.startsWith('2')).toBe(true);
    expect(GL.salariesPayable.code.startsWith('2')).toBe(true);
  });

  it('حسابات الإيرادات تبدأ بـ 4', () => {
    expect(GL.revenueAgent.code.startsWith('4')).toBe(true);
    expect(GL.revenuePrincipal.code.startsWith('4')).toBe(true);
    expect(GL.fxGain.code.startsWith('4')).toBe(true);
  });

  it('حسابات المصاريف تبدأ بـ 5 أو 6', () => {
    expect(GL.fxLoss.code.startsWith('5')).toBe(true);
    expect(GL.costOfServices.code.startsWith('5')).toBe(true);
    expect(GL.salaryExpense.code.startsWith('6')).toBe(true);
  });

  it('رمز حساب FX Gain مختلف عن FX Loss', () => {
    expect(GL.fxGain.code).not.toBe(GL.fxLoss.code);
  });

  it('يتضمن GL حساب مطابقة للإيرادات والمصاريف', () => {
    expect(GL.reconcileIncome).toBeDefined();
    expect(GL.reconcileExpense).toBeDefined();
    expect(GL.reconcileIncome.code).not.toBe(GL.reconcileExpense.code);
  });
});
