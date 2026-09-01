export interface DemoSeedConfig {
  databaseUrl: string;
  email: string;
  agencyId: string;
  accountNameAr: string;
  accountNameEn: string;
}

type Env = Record<string, string | undefined>;

function required(env: Env, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} مطلوب لتشغيل بيانات العرض`);
  return value;
}

export function readDemoSeedConfig(env: Env = process.env): DemoSeedConfig {
  const databaseUrl = required(env, 'DEMO_DATABASE_URL');
  const email = required(env, 'DEMO_SEED_EMAIL').toLowerCase();
  const agencyId = required(env, 'DEMO_SEED_AGENCY_ID');
  if (required(env, 'DEMO_SEED_TARGET') !== 'isolated-preview') {
    throw new Error('DEMO_SEED_TARGET يجب أن يساوي isolated-preview');
  }
  if (env['VERCEL_ENV'] === 'production') {
    throw new Error('يُمنع تشغيل بيانات العرض في بيئة الإنتاج');
  }
  const expectedConfirmation = `SEED:${agencyId}:${email}`;
  if (env['DEMO_SEED_CONFIRM'] !== expectedConfirmation) {
    throw new Error(`DEMO_SEED_CONFIRM يجب أن يساوي ${expectedConfirmation}`);
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(databaseUrl);
  } catch {
    throw new Error('DEMO_DATABASE_URL ليس رابط PostgreSQL صالحاً');
  }
  if (!['postgres:', 'postgresql:'].includes(parsedUrl.protocol)) {
    throw new Error('DEMO_DATABASE_URL يجب أن يبدأ بـ postgres:// أو postgresql://');
  }

  const accountNameAr = env['DEMO_ACCOUNT_NAME_AR']?.trim() || 'حساب تجريبي';
  const accountNameEn = env['DEMO_ACCOUNT_NAME_EN']?.trim() || 'Demo Account';
  if (accountNameAr.length > 100 || accountNameEn.length > 100) {
    throw new Error('اسم الحساب التجريبي يجب ألا يتجاوز 100 حرف');
  }

  return { databaseUrl, email, agencyId, accountNameAr, accountNameEn };
}

export function assertDemoSeedTarget(
  config: DemoSeedConfig,
  user: { email: string; agencyId: string; isActive: boolean } | undefined,
  agency: { id: string; isActive: boolean } | undefined,
): void {
  if (!user) throw new Error(`لا يوجد مستخدم بالبريد ${config.email}`);
  if (!user.isActive) throw new Error('المستخدم التجريبي غير نشط');
  if (user.email.trim().toLowerCase() !== config.email) throw new Error('بريد المستخدم لا يطابق الهدف المعتمد');
  if (user.agencyId !== config.agencyId) throw new Error('البريد التجريبي غير مرتبط بمعرف الوكالة المعتمد');
  if (!agency || agency.id !== config.agencyId) throw new Error('معرف الوكالة التجريبية غير موجود');
  if (!agency.isActive) throw new Error('الوكالة التجريبية غير نشطة');
}
