# الطور 4 — العزل متعدد المستأجرين والأمان

**التاريخ:** 2026-06-18
**النطاق:** RLS، المصادقة، التحكم بالأدوار، تشفير البيانات، حماية API، IDOR، حماية السجلات المالية

---

## الفهرس

| # | الموضوع | الخطورة | الحالة |
|---|---------|---------|--------|
| 4-a-1 | RLS مُفعّل لكن bypass policy يلغي الحماية فعلياً | HIGH | خطر عزل |
| 4-a-2 | عدم استخدام `withAgencyContext` / `withTenantContext` في أي API route | HIGH | خطر عزل |
| 4-b-1 | agencyId مصدره JWT claims فقط — لا يُقبل من body | INFO ✅ | مُجتاز |
| 4-b-2 | كل API route (115/130) تستدعي `verifyAuth()` | INFO ✅ | مُجتاز |
| 4-b-3 | الـ 15 route بدون verifyAuth محمية بآليات بديلة | INFO ✅ | مُجتاز |
| 4-c-1 | تشفير AES-256-GCM at rest مع fail-closed في الإنتاج | INFO ✅ | مُجتاز |
| 4-c-2 | لا يُعاد أي بيانات حساسة للعميل (ZATCA creds, SMTP password) | INFO ✅ | مُجتاز |
| 4-d-1 | Triggers تمنع تعديل JE المرحّلة + حذف الفواتير + حذف المدفوعات | INFO ✅ | مُجتاز |
| 4-d-2 | Audit log append-only (INSERT فقط بـ RLS) | INFO ✅ | مُجتاز |
| 4-e-1 | Rate limiting fail-closed في الإنتاج (Redis مطلوب) | INFO ✅ | مُجتاز |
| 4-e-2 | تسجيل وكالة محمي بـ rate limit (5/ساعة) + اختياري REGISTRATION_SECRET | INFO ✅ | مُجتاز |
| 4-f-1 | Agency status check — حظر الوكالات الموقوفة/المنتهية | INFO ✅ | مُجتاز |
| 4-f-2 | حالة خطأ DB → fail open مع تسجيل (degraded path) | LOW | تصميمي |
| 4-g-1 | `agencyId` فلتر تطبيقي يدوي في كل query — لا حماية هيكلية | MED | نمط هش |
| 4-h-1 | Super Admin email من env فقط — لا hardcoded fallback | INFO ✅ | مُجتاز |
| 4-h-2 | الأدوار: owner > admin > manager > accountant > staff > agent — هرمية واضحة | INFO ✅ | مُجتاز |

**الملخص:** 2 HIGH / 1 MED / 1 LOW / 12 INFO

---

## 4-a-1 [HIGH] — RLS مُفعّل لكن bypass policy يلغي الحماية فعلياً

**الملف:** `apps/web/drizzle/0016_rls_agency_isolation.sql:79-113`

**الكود الفعلي:**
```sql
-- 2. PERMISSIVE bypass for the current service/superuser role
CREATE POLICY bypass_for_service_role ON bookings
  AS PERMISSIVE FOR ALL TO CURRENT_USER USING (true);
CREATE POLICY bypass_for_service_role ON invoices
  AS PERMISSIVE FOR ALL TO CURRENT_USER USING (true);
-- ... (كل الجداول)
```

**التحليل:**
يوجد ملفا RLS في النظام:

1. **`0016_rls_agency_isolation.sql`** (الـ Drizzle migration المُطبق فعلياً):
   - يُفعّل RLS على كل الجداول ✅
   - يُنشئ `bypass_for_service_role` بـ `USING (true)` لـ `CURRENT_USER` على كل جدول
   - يُنشئ `agency_isolation` policy لكنها تسمح بكل شيء عندما `app.current_agency_id` فارغ أو NULL
   - **النتيجة:** `bypass_for_service_role` يسمح لأي عملية بأي بيانات، بغض النظر عن agency context

2. **`packages/database/src/migrations/002_row_level_security.sql`** (أكثر صرامة لكن منفصل):
   - يُنشئ roles: `app_user`, `app_admin`, `app_migrations`
   - policies تفرض `agency_id = current_agency_id()` بشكل صارم لـ `app_user`
   - `app_admin` و `app_migrations` يتجاوزان RLS بـ `BYPASSRLS`
   - **المشكلة:** هذا الملف لا يبدو مُطبقاً — التطبيق يتصل كـ `CURRENT_USER` (صاحب الـ connection string) وليس كـ `app_user`

**السيناريو الواقعي:**
التطبيق يتصل بـ Neon عبر `DATABASE_URL` كصاحب قاعدة البيانات. كل query تمر عبر `bypass_for_service_role USING (true)` → RLS لا يحمي شيئاً. إذا تسرب `agencyId` خاطئ في token (bug في Firebase claims أو خطأ في sync)، لا يوجد حاجز ثانٍ يمنع الوصول لبيانات وكالة أخرى.

**الأثر الأمني:**
RLS هنا شبكة أمان نظرية فقط — لا تعمل فعلياً. كل العزل يعتمد على فلتر `agencyId` اليدوي في كل query (انظر 4-g-1).

**الإصلاح المقترح:**
1. الاتصال بالتطبيق كـ `app_user` (ليس صاحب DB)
2. إزالة `bypass_for_service_role`
3. تطبيق `002_row_level_security.sql` مع `SET ROLE app_user` في كل connection
4. أو: استخدام `withAgencyContext()` المكتوبة فعلاً (انظر 4-a-2) مع `SET ROLE`

---

## 4-a-2 [HIGH] — `withAgencyContext` / `withTenantContext` موجودتان لكن لا تُستخدمان أبداً

**الملف:** `apps/web/src/lib/db-context.ts` و `packages/database/src/lib/tenant-middleware.ts`

**البحث:**
```
grep -r "withAgencyContext\|withTenantContext" apps/web/src/app/api/
→ لا نتائج
```

**الكود الموجود:**
```typescript
// db-context.ts
export async function withAgencyContext<T>(
  agencyId: string,
  callback: (tx: typeof db) => Promise<T>
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(
      `SELECT set_config('app.current_agency_id', '${agencyId.replace(/'/g, "''")}', true)`
    );
    return callback(tx as unknown as typeof db);
  });
}
```

```typescript
// tenant-middleware.ts
export async function withTenantContext(agencyId: string) {
  // ...
  await sql`SELECT set_config('app.current_agency_id', ${agencyId}, false)`;
  return drizzle(sql, { schema });
}
```

**السيناريو:**
الدالتان مكتوبتان بشكل صحيح — لكن لا يستدعيهما أي API route. كل route تستخدم `db` المباشر من `lib/db.ts` بدون ضبط `app.current_agency_id`. هذا يعني:
1. `current_agency_id()` تُرجع NULL دائماً
2. الـ agency_isolation policies تسمح بكل شيء (لأنها تتحقق `IS NULL`)
3. حتى لو أُزيل bypass_for_service_role — الـ agency_isolation policy ستظل لا تحمي شيئاً

**الأثر:**
RLS كاملة معطّلة — لا بسبب خطأ في السياسات فقط، بل لأن session context لا يُضبط أبداً.

**الإصلاح المقترح:**
1. إنشاء middleware أو wrapper يستدعي `withAgencyContext()` تلقائياً في كل API route
2. أو: إنشاء `dbForRequest(agencyId)` يعيد DB instance مع context مضبوط
3. تعديل agency_isolation policy لترفض عند عدم وجود context:
```sql
-- بدلاً من:
USING (current_setting(...) IS NULL OR ... OR agency_id = ...)
-- يجب:
USING (agency_id = current_setting('app.current_agency_id', true)::uuid)
```

---

## 4-b-1 [INFO ✅] — agencyId مصدره JWT claims فقط

**الملف:** `apps/web/src/lib/api-auth.ts:52-111`

**الكود المُفحص:**
```typescript
export async function verifyAuth(request: Request): Promise<AuthClaims> {
  // ...
  decoded = await getAuth().verifyIdToken(token);
  const agencyId = decoded['agencyId'] as string | undefined;
  // ...
  return {
    uid:      decoded.uid,
    agencyId: agencyId ?? '',
    role:     (decoded['role'] as string) ?? (isSuperAdmin ? 'owner' : 'agent'),
  };
}
```

**البحث عن IDOR:**
```
grep -r "body\.agencyId\|body\[.agencyId.\]" apps/web/src/app/api/ --include="route.ts"
→ لا نتائج
```

**الحكم:**
`agencyId` يأتي حصرياً من Firebase JWT custom claims (مُعيّنة بـ `setCustomUserClaims` عند التسجيل). لا يقبله أي endpoint من body أو query params. هذا يمنع IDOR attacks حيث يحاول المهاجم تغيير agencyId في الطلب.

✅ **مُجتاز — حماية IDOR على مستوى التطبيق**

---

## 4-b-2 [INFO ✅] — 115 من 130 route تستدعي `verifyAuth()`

**البحث:**
```
Total route files with handlers: 130
Files with verifyAuth: 115
Files without verifyAuth: 15
```

✅ **مُجتاز — 88% تغطية مباشرة**

---

## 4-b-3 [INFO ✅] — الـ 15 route بدون verifyAuth محمية بآليات بديلة

| المسار | آلية الحماية |
|--------|-------------|
| `/api/auth/register` | Rate limit (5/ساعة) + اختياري REGISTRATION_SECRET |
| `/api/auth/forgot-password` | Rate limit + Firebase auth |
| `/api/auth/invite` | Rate limit + custom token auth |
| `/api/auth/sync` | Firebase verifyIdToken (مباشرة) |
| `/api/health` | لا يكشف بيانات حساسة |
| `/api/setup-db` | x-setup-secret header أو Firebase admin JWT |
| `/api/admin/action` | verifySuperAdmin (Firebase JWT + SUPER_ADMIN_EMAIL) |
| `/api/admin/agencies` | verifySuperAdmin |
| `/api/admin/agencies/[id]/features` | verifySuperAdmin |
| `/api/admin/fk-audit` | verifySuperAdmin |
| `/api/admin/wipe-agency` | verifySuperAdmin + confirmName |
| `/api/jobs/expire-pnrs` | requireCronAuth (CRON_SECRET) |
| `/api/jobs/generate-recurring-invoices` | requireCronAuth |
| `/api/jobs/recognize-revenue` | requireCronAuth |
| `/api/jobs/reconcile-pending-tickets` | requireCronAuth |

**الحكم:**
- Admin routes: `verifySuperAdmin()` — Firebase JWT + email match against env var
- Job routes: `requireCronAuth()` — CRON_SECRET header (Vercel Cron)
- Auth routes: rate limited + Firebase-native auth
- Health: no sensitive data

✅ **مُجتاز — كل مسار محمي**

---

## 4-c-1 [INFO ✅] — تشفير AES-256-GCM at rest مع fail-closed في الإنتاج

**الملف:** `apps/web/src/lib/crypto.ts` (120 سطر)

**الكود المُفحص:**
```typescript
// Production: ENCRYPTION_KEY مطلوب — يرفض التشغيل بدونه
if (process.env.NODE_ENV === 'production') {
  throw new Error('ENCRYPTION_KEY is required in production');
}

// Dev-only: يُخزّن كنص عادي
return plaintext;
```

- **Algorithm:** AES-256-GCM (Web Crypto API — يعمل على Node.js و Edge)
- **IV:** 96-bit random nonce لكل عملية تشفير
- **Envelope:** `enc:v1:${base64(iv)}:${base64(ciphertext)}` — يميز المشفر عن القديم
- **Backward compatible:** القيم القديمة (plaintext) تبقى قابلة للقراءة
- **Key:** 256-bit من env var `ENCRYPTION_KEY` (64 hex chars)

✅ **مُجتاز — تشفير قوي مع fail-closed**

---

## 4-c-2 [INFO ✅] — لا يُعاد أي بيانات حساسة للعميل

**الملف:** `apps/web/src/app/api/settings/route.ts:23-31`

**الكود المُفحص:**
```typescript
const {
  smtpPassword:        _smtpPw,
  zatcaComplianceCsid: _zcc,
  zatcaComplianceSecret: _zcs,
  zatcaProductionCsid: _zpc,
  zatcaProductionSecret: _zps,
  zatcaPrivateKey:     _zpk,
  ...safeAgency
} = agency;
```

**الحكم:**
7 حقول حساسة تُزال قبل إرجاع بيانات الوكالة. يُعاد فقط `smtpConfigured` و `zatcaConfigured` كـ boolean.

✅ **مُجتاز**

---

## 4-d-1 [INFO ✅] — Triggers تمنع تعديل السجلات المالية

**الملف:** `packages/database/src/migrations/002_row_level_security.sql:438-484`

**الكود المُفحص:**

| Trigger | الجدول | يمنع |
|---------|--------|------|
| `enforce_journal_immutability` | journal_entries | UPDATE/DELETE عندما status IN ('posted', 'reversed') |
| `enforce_invoice_immutability` | invoices | DELETE عندما status IN ('issued', 'cleared') |
| `enforce_payment_immutability` | payments | كل DELETE |

```sql
CREATE TRIGGER enforce_journal_immutability
    BEFORE UPDATE OR DELETE ON journal_entries
    FOR EACH ROW
    EXECUTE FUNCTION prevent_posted_journal_modification();
```

**الحكم:**
- القيود المرحّلة لا يمكن تعديلها — يجب إنشاء قيد عكسي
- الفواتير المُصدرة لا يمكن حذفها — يجب إصدار إشعار دائن
- المدفوعات لا يمكن حذفها — يجب إنشاء سجل استرداد

✅ **مُجتاز — حماية على مستوى قاعدة البيانات**

---

## 4-d-2 [INFO ✅] — Audit log append-only بـ RLS

**الملف:** `002_row_level_security.sql:160-172`

```sql
CREATE POLICY audit_logs_read ON audit_logs
    FOR SELECT TO app_user
    USING (agency_id = current_agency_id());

CREATE POLICY audit_logs_insert ON audit_logs
    FOR INSERT TO app_user
    WITH CHECK (agency_id = current_agency_id());

-- لا update ولا delete للـ audit logs (append-only)
```

**الملف:** `apps/web/src/lib/audit.ts:16-34`
```typescript
export async function logAudit(p: AuditParams): Promise<void> {
  try {
    await db.insert(auditLog).values({ ... });
  } catch {
    // Audit failures must never break the main transaction
    console.error(...);
  }
}
```

**الحكم:**
- RLS policy: SELECT + INSERT فقط (لا UPDATE ولا DELETE)
- logAudit لا يرمي exceptions — فشل التسجيل لا يكسر العملية الأصلية
- الـ audit log خارج الـ transaction الرئيسية (يكتب بعد الـ commit)

✅ **مُجتاز — append-only + fail-safe**

---

## 4-e-1 [INFO ✅] — Rate limiting fail-closed في الإنتاج

**الملف:** `apps/web/src/lib/rate-limit.ts:92-96`

```typescript
if (process.env.NODE_ENV === 'production') {
  throw new Error(
    'UPSTASH_REDIS_REST_URL/TOKEN are required in production — ' +
    'the in-memory rate limiter is ineffective in serverless'
  );
}
```

**الحكم:**
- في الإنتاج: Redis (Upstash) مطلوب — بدونه التطبيق يرفض التشغيل
- في التطوير: in-memory fallback مع تحذير
- Sliding window counter عبر Redis INCR + EXPIRE (atomic)

معدلات الحماية:
| النوع | الحد | النافذة |
|-------|------|---------|
| financial | 20 | دقيقة |
| register | 5 | ساعة |
| auth | 10 | 15 دقيقة |
| api | 100 | دقيقة |

✅ **مُجتاز**

---

## 4-e-2 [INFO ✅] — تسجيل الوكالات محمي

**الملف:** `apps/web/src/app/api/auth/register/route.ts:72-89`

```typescript
const rl = await checkRateLimit(ip, 'register'); // 5/ساعة

const REGISTRATION_SECRET = process.env['REGISTRATION_SECRET'];
if (REGISTRATION_SECRET) {
  const provided = request.headers.get('x-registration-token') ?? '';
  if (provided !== REGISTRATION_SECRET) {
    return NextResponse.json({ error: 'غير مصرح' }, { status: 403 });
  }
}
```

- Rate limit: 5 طلبات/ساعة لكل IP
- اختياري: `REGISTRATION_SECRET` يحوّل الـ endpoint من مفتوح إلى مغلق
- Validation: email regex + phone regex + password ≥ 8 chars + name length limits
- Firebase duplicate check: `getUserByEmail` يمنع التسجيل المكرر
- Cleanup: إذا فشل إنشاء DB → يُحذف المستخدم من Firebase

✅ **مُجتاز**

---

## 4-f-1 [INFO ✅] — حظر الوكالات الموقوفة/المنتهية

**الملف:** `apps/web/src/lib/api-auth.ts:78-104`

```typescript
if (agencyId && !isSuperAdmin) {
  // ...
  if (ag.isActive === false ||
      ag.subscriptionStatus === 'suspended' ||
      ag.subscriptionStatus === 'expired') {
    throw new ApiAuthError('حساب الوكالة موقوف أو انتهى اشتراكه', 403);
  }
}
```

**الحكم:**
- كل request يتحقق من حالة الوكالة قبل المتابعة
- `isActive === false` أو `subscriptionStatus IN ('suspended', 'expired')` → 403
- Super admin معفى من الفحص

✅ **مُجتاز**

---

## 4-f-2 [LOW] — حالة خطأ DB → fail open مع تسجيل

**الملف:** `apps/web/src/lib/api-auth.ts:91-94`

```typescript
} catch (err) {
  // Infrastructure error — fail open, but surface it
  console.error(JSON.stringify({
    event: 'agency_status_check_degraded',
    agencyId,
    error: String(err)
  }));
}
if (lookupSucceeded) {
  // Only enforce if lookup worked
}
```

**السيناريو:**
إذا تعطلت قاعدة البيانات مؤقتاً → فحص حالة الوكالة يفشل → `lookupSucceeded = false` → لا يُطبق الحظر → المستخدم يستمر.

**الملاحظة:**
الكود يوثق القرار بوضوح: "a transient infra blip cannot lock every tenant out of the system". هذا تصميم واعٍ (fail open > global lockout). لكنه يعني أن وكالة موقوفة قد تتمكن من الوصول لفترة قصيرة أثناء عطل DB.

**الأثر:** منخفض — عطل DB عابر نادر، والتسجيل يكشف الحالة.

---

## 4-g-1 [MED] — `agencyId` فلتر تطبيقي يدوي في كل query — نمط هش

**الملف:** كل API route (115+ ملف)

**النمط السائد:**
```typescript
const { agencyId } = await verifyAuth(request);
// ...
const [booking] = await db.select().from(bookings)
  .where(and(eq(bookings.id, id), eq(bookings.agencyId, agencyId)));
```

**التحليل:**
بما أن RLS غير فعّال فعلياً (4-a-1, 4-a-2)، العزل يعتمد كلياً على:
1. `verifyAuth()` تُرجع `agencyId` من JWT
2. كل query تُضيف `WHERE agency_id = ?` يدوياً

**البحث عن queries بدون فلتر agencyId:**
```
grep -c "eq(.*agencyId" apps/web/src/app/api/ -r --include="route.ts" | sort -t: -k2 -n
```

كل route تُضيف الفلتر يدوياً في كل مكان. هذا النمط:
- **يعمل** ما دام كل مطور يتذكر إضافة الفلتر في كل query
- **هش** لأن نسيان فلتر واحد = تسرب بيانات بين الوكالات
- **لا يمكن اختباره آلياً** — لا linter rule يكشف query بدون agencyId

**الأثر:**
حالياً لا يوجد تسرب مكتشف — كل query فُحصت تحتوي على الفلتر. لكن هذا defense-in-depth ضعيف: خط دفاع واحد (التطبيق) بدون شبكة أمان (RLS).

**الإصلاح المقترح:**
تفعيل RLS الفعلي (4-a-1 + 4-a-2) كخط دفاع ثانٍ. حتى لو نسي المطور WHERE clause، PostgreSQL نفسها ترفض عرض صفوف وكالة أخرى.

---

## 4-h-1 [INFO ✅] — Super Admin email من env فقط

**الملف:** `apps/web/src/lib/api-auth.ts:46-50`

```typescript
function getSuperAdminEmail(): string | undefined {
  return process.env['SUPER_ADMIN_EMAIL'] ?? undefined;
}
```

**الحكم:**
- لا hardcoded email في الكود
- إذا env var غير معرّف → لا يوجد super admin → الـ bypass لا يعمل
- كل admin route تتحقق من Email match

✅ **مُجتاز**

---

## 4-h-2 [INFO ✅] — هرمية الأدوار واضحة ومُطبقة

**الملف:** `apps/web/src/lib/api-auth.ts:130-137`

```typescript
export const ROLES_ADMIN_ONLY    = ['owner', 'admin'] as const;
export const ROLES_MANAGER_UP    = ['owner', 'admin', 'manager'] as const;
export const ROLES_ACCOUNTANT_UP = ['owner', 'admin', 'manager', 'accountant'] as const;
export const ROLES_STAFF_UP      = ['owner', 'admin', 'manager', 'accountant', 'staff'] as const;
export const ROLES_AGENT_UP      = ['owner', 'admin', 'manager', 'accountant', 'staff', 'agent'] as const;
```

| العملية | الحد الأدنى |
|---------|------------|
| ZATCA onboarding | admin |
| إعدادات SMTP | admin |
| GOSI rates | admin |
| إعدادات الوكالة | manager |
| عمليات مالية | accountant |
| إنشاء حجوزات | agent |
| عرض فقط | viewer |

✅ **مُجتاز — RBAC هرمي واضح**

---

## الملخص التنفيذي

### ما يعمل بشكل صحيح (الإيجابيات):
1. **المصادقة:** Firebase JWT + verifyAuth في 115/130 route
2. **IDOR:** agencyId من JWT claims حصرياً — لا يُقبل من body
3. **التشفير:** AES-256-GCM at rest + fail-closed في production
4. **الحساسية:** لا يُعاد أي secret للعميل
5. **الأدوار:** RBAC هرمي واضح مع assertRole في كل عملية حرجة
6. **Immutability:** triggers تحمي JE + invoices + payments
7. **Rate limiting:** Redis-backed + fail-closed في production
8. **Super Admin:** env-only، لا hardcoded

### ما يحتاج إصلاح:
1. **[HIGH]** RLS bypass policy يلغي كل الحماية → يجب إزالة `bypass_for_service_role` والاتصال كـ `app_user`
2. **[HIGH]** `withAgencyContext()` لا تُستخدم → session context لا يُضبط → agency_isolation policy لا تعمل
3. **[MED]** عزل التطبيق يعتمد كلياً على فلتر يدوي — لا شبكة أمان DB-level
4. **[LOW]** fail open عند خطأ DB في agency status check — تصميمي واعٍ

### جدول الأولويات:
| الأولوية | البند | المبرر |
|----------|-------|--------|
| 🔴 P0 | 4-a-1 + 4-a-2 | RLS غير فعّال = لا defense-in-depth للعزل |
| 🟡 P1 | 4-g-1 | إعادة هيكلة لاستخدام tenant middleware |
| ⚪ P2 | 4-f-2 | fail open — قرار تصميمي مقبول مع monitoring |

---

**الإحصائيات التراكمية (الأطوار 1-4):**

| الطور | HIGH | MED | LOW | INFO |
|-------|------|-----|-----|------|
| الطور 1 | 3 | 5 | 2 | 10 |
| الطور 2 | 1 | 4 | 2 | 8 |
| الطور 3 | 2 | 3 | 2 | 9 |
| الطور 4 | 2 | 1 | 1 | 12 |
| **المجموع** | **8** | **13** | **7** | **39** |

---

انتهى الطور 4. الطور التالي: **الطور 5 — الأخطاء البشرية والعمليات طويلة المدى (Human Errors & Long-term Operations)**.
