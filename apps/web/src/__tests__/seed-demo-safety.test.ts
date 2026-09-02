import { describe, expect, it } from 'vitest';
import { assertDemoSeedTarget, readDemoSeedConfig } from '../../scripts/seed-demo-safety';

const validEnv = {
  DEMO_DATABASE_URL: 'postgresql://demo:secret@preview.example.test/demo?sslmode=require',
  DEMO_SEED_EMAIL: 'demo@example.com',
  DEMO_SEED_AGENCY_ID: 'agency-demo',
  DEMO_SEED_TARGET: 'isolated-preview',
  DEMO_SEED_CONFIRM: 'SEED:agency-demo:demo@example.com',
};

describe('demo seed safety', () => {
  it('يطلب رابطاً مستقلاً وبريداً ومعرف وكالة وتأكيداً مطابقاً', () => {
    expect(() => readDemoSeedConfig({})).toThrow(/DEMO_DATABASE_URL/);
    expect(() => readDemoSeedConfig({ ...validEnv, DEMO_SEED_TARGET: 'production' })).toThrow(/isolated-preview/);
    expect(() => readDemoSeedConfig({ ...validEnv, VERCEL_ENV: 'production' })).toThrow(/الإنتاج/);
    expect(() => readDemoSeedConfig({ ...validEnv, DEMO_SEED_CONFIRM: 'YES' })).toThrow(/SEED:agency-demo/);
    expect(() => readDemoSeedConfig({ ...validEnv, DEMO_DATABASE_URL: 'https://example.com' })).toThrow(/postgres/);
  });

  it('يعتمد اسم حساب تجريبي دون تخزين كلمة مرور', () => {
    expect(readDemoSeedConfig(validEnv)).toMatchObject({
      email: 'demo@example.com',
      agencyId: 'agency-demo',
      accountNameAr: 'حساب تجريبي',
      accountNameEn: 'Demo Account',
    });
  });

  it('يرفض أي عدم تطابق بين البريد ومعرف الوكالة', () => {
    const config = readDemoSeedConfig(validEnv);
    const agency = { id: 'agency-demo', isActive: true };
    expect(() => assertDemoSeedTarget(config, undefined, agency)).toThrow(/لا يوجد مستخدم/);
    expect(() => assertDemoSeedTarget(config, {
      email: 'demo@example.com', agencyId: 'another-agency', isActive: true,
    }, agency)).toThrow(/غير مرتبط/);
    expect(() => assertDemoSeedTarget(config, {
      email: 'demo@example.com', agencyId: 'agency-demo', isActive: true,
    }, { id: 'agency-demo', isActive: false })).toThrow(/غير نشطة/);
  });

  it('يقبل الهدف فقط عند تطابق القيم كلها', () => {
    const config = readDemoSeedConfig(validEnv);
    expect(() => assertDemoSeedTarget(config, {
      email: 'DEMO@example.com', agencyId: 'agency-demo', isActive: true,
    }, { id: 'agency-demo', isActive: true })).not.toThrow();
  });
});
