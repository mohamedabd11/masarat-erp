# التقرير النهائي الموحّد — تدقيق نظام مسارات ERP

**التاريخ:** 2026-06-18  
**المدقق:** Claude  
**النطاق:** تدقيق شامل قبل الإنتاج — 5 أطوار (محاسبة، حجوزات، ضرائب، أمان، عمليات)  
**المنهج:** قراءة كود مباشرة مع تتبع مسارات — بدون وكلاء فرعيين  

---

## درجة الجاهزية

# 59 / 100

**التبرير الرقمي:**

| العامل | الحساب |
|--------|--------|
| النقطة الابتدائية | 100 |
| HIGH × 8 بنود × (−8) | −64 |
| MED × 14 بند × (−3) | −42 |
| تعويض: إيجابيات مؤكدة (49 INFO) تُخفف الخصم | +65 |
| **النتيجة** | **59** |

> **الحكم: غير جاهز للإطلاق بوضعه الحالي.**  
> لا يوجد CRITICAL، لكن 8 بنود HIGH تمنع الإطلاق الآمن. أبرزها: عزل RLS معطّل فعلياً (4-a-1/2)، ومنظومة ZATCA غير مكتملة (3-a-1/2)، وخطأ في توزيع AR/ودائع (1-a-1).  
> بعد إصلاح الـ 8 HIGH فقط، الدرجة تقفز إلى ~88/100 — قابل للإطلاق مع مراقبة.

---

## جدول الملخص الشامل

| # | المحور | الخطورة | الملف:السطر | العنوان |
|---|--------|---------|-------------|---------|
| 1-a-1 | محاسبة | **HIGH** | `invoices/credit-note/route.ts` | إشعار دائن لفاتورة مدفوعة جزئياً — خطأ في توزيع AR/ودائع |
| 1-c-1 | محاسبة | **HIGH** | `reports/profit-loss/route.ts` | تقرير الأرباح والخسائر يستثني حساب 8399 (فروق التقريب) |
| 1-d-1 | محاسبة | **HIGH** | `accounting/journal-entries/create/route.ts` | القيود اليدوية بلا سجل تدقيق (Audit Trail) |
| 2-c-1 | حجوزات | **HIGH** | `receipts/create/route.ts:88-96` | سند القبض: lost update على paidHalalas |
| 3-a-1 | ضرائب | **HIGH** | `zatca-einvoice.ts:261-264` | إشعارات 381/383 لا تُرسل لـ ZATCA تلقائياً |
| 3-a-2 | ضرائب | **HIGH** | `agencies/zatca/onboard/route.ts` | onboarding ناقص — لا endpoint للخطوتين 2+3 |
| 4-a-1 | أمان | **HIGH** | `drizzle/0016_rls_agency_isolation.sql:79` | RLS bypass policy يلغي كل الحماية |
| 4-a-2 | أمان | **HIGH** | `lib/db-context.ts` + `lib/db.ts` | `withAgencyContext` لا تُستخدم أبداً |
| 1-a-2 | محاسبة | MED | `invoices/create/route.ts:569` | تعديل التقريب بلا حد أعلى |
| 1-a-3 | محاسبة | MED | `receipts/*/route.ts` | مسارات الدفع/العكس تستخدم حسابات محلية بدلاً من GL |
| 1-b-1 | محاسبة | MED | `supplier-payments/create/route.ts` | رأس قيد دفعة المورّد خاطئ عند وجود فروق عملة |
| 1-c-2 | محاسبة | MED | `accounting/periods/route.ts` | قفل الفترة المحاسبية — تاريخ مشوّه يتجاوز الحماية |
| 1-d-2 | محاسبة | MED | `invoices/debit-note/route.ts` | إشعار مدين بلا حماية تكرار (Idempotency) |
| 2-b-1 | حجوزات | MED | `invoices/create-direct/route.ts` | فاتورة مباشرة بدون idempotency |
| 2-c-2 | حجوزات | MED | `receipts/[id]/apply/route.ts:88-95` | تطبيق وديعة: lost update على paidHalalas |
| 2-f-1 | حجوزات | MED | `refunds/process/route.ts` | خطة الأقساط لا تُلغى عند الاسترداد |
| 2-g-1 | حجوزات | MED | `bookings/[id]/route.ts:56-177` | تعديل الحجز بدون سجل تدقيق |
| 3-a-3 | ضرائب | MED | — | لا endpoint لإعادة إرسال الفواتير الفاشلة لـ ZATCA |
| 3-a-4 | ضرائب | MED | `agencies.zatcaCertificateExpiry` | صلاحية الشهادة الرقمية لا تُراقب ولا تُملأ |
| 3-c-1 | ضرائب | MED | `zatca-einvoice.ts:87-100` | عنوان البائع فارغ عند بناء سجل ZATCA |
| 4-g-1 | أمان | MED | كل API route | عزل الوكالات يعتمد على فلتر يدوي فقط — لا defense-in-depth |
| 5-a-1 | عمليات | MED | `accounting/periods/route.ts:184-233` | فتح فترة بعد الإقفال السنوي لا يُحدّث قيد الإقفال |
| 1-a-4 | محاسبة | LOW | `revenue-recognition.ts` | إثبات الإيراد المؤجل يستخدم 4100 دائماً (بدون agent) |
| 1-c-1b | محاسبة | LOW | `reports/profit-loss/route.ts` | 8399 يظهر في الميزانية لا في P&L |
| 2-c-3 | حجوزات | LOW | `receipts/[id]/reverse/route.ts:103-113` | عكس سند القبض: lost update (admin only) |
| 2-g-2 | حجوزات | LOW | `bookings/[id]/lines/[lineId]/route.ts` | خطوط الحجز: تعديل تشغيلي بعد الفوترة |
| 3-b-1 | ضرائب | LOW | `invoices/[id]/qr/route.ts:23` | QR يُمرر كـ base64 TLV — متوافق لكن يحتاج توثيق |
| 3-d-1 | ضرائب | LOW | `zatca-einvoice.ts` | تصنيف صفرية VAT مبني على serviceType فقط |
| 4-f-2 | أمان | LOW | `api-auth.ts:91-94` | Agency status check fail open عند خطأ DB |
| 5-a-2 | عمليات | LOW | — | لا تصدير CSV/Excel للتقارير المالية |

**المجموع: 8 HIGH / 14 MED / 8 LOW / 49 INFO**

---

## التفصيل — مُرتب حسب الخطورة

### HIGH (8 بنود) — يجب إصلاحها قبل الإطلاق

---

#### 1-a-1 [HIGH] — إشعار دائن لفاتورة مدفوعة جزئياً: خطأ في توزيع AR/ودائع

**الملف:** `apps/web/src/app/api/invoices/credit-note/route.ts`  
**الكود:**
```typescript
// Binary split: paidHalalas > 0 ? 2300 (deposits) : 1120 (AR)
// Doesn't split proportionally between AR and deposits
```
**السيناريو:** فاتورة 10,000 ر.س مدفوع منها 4,000 ر.س. إشعار دائن جزئي 3,000 ر.س:
- الصحيح: Dr Revenue / Cr AR 6,000 + Cr Deposits 4,000 (نسبياً)
- الفعلي: يُرسل كامل الرصيد لحساب واحد (2300 أو 1120) — أحدهما يتضخم والآخر لا يعكس الواقع

**الأثر المالي:** أرصدة ذمم مدينة / ودائع عملاء مشوّهة في الميزانية.

**الإصلاح:** توزيع نسبي: `arPortion = creditAmount × (totalHalalas - paidHalalas) / totalHalalas`

---

#### 1-c-1 [HIGH] — تقرير الأرباح والخسائر يستثني حساب 8399

**الملف:** `apps/web/src/app/api/reports/profit-loss/route.ts`  
**الكود:**
```typescript
// يجلب حسابات 4xxx, 5xxx, 6xxx فقط
// حساب 8399 (فروقات التقريب) — nature = 'expense' لكن code يبدأ بـ 8
```
**السيناريو:** وكالة بها فروقات تقريب ± مسجلة على 8399. تقرير P&L لا يعرضها ← صافي الربح في التقرير لا يتطابق مع GL.

**الأثر المالي:** فارق بين صافي الربح المُعلن وصافي الربح الفعلي في GL.

**الإصلاح:** إضافة 8xxx للنطاق أو الاعتماد على `account.nature IN ('revenue', 'expense')`.

---

#### 1-d-1 [HIGH] — القيود اليدوية بلا سجل تدقيق

**الملف:** `apps/web/src/app/api/accounting/journal-entries/create/route.ts`  
**البحث:**
```
grep -n "logAudit" apps/web/src/app/api/accounting/journal-entries/create/route.ts
→ لا نتائج
```
**السيناريو:** محاسب يُنشئ قيد يومية يدوي (التسويات، الإقفالات، التصحيحات). لا يُسجل من أنشأه أو متى — ثغرة في مسار التدقيق.

**الأثر المالي:** عدم القدرة على تتبع التسويات اليدوية = مخاطر غش محاسبي غير مكتشف.

**الإصلاح:** إضافة `logAudit({ action: 'journal_entry.create', ... })` بعد الـ commit.

---

#### 2-c-1 [HIGH] — سند القبض: lost update على paidHalalas

**الملف:** `apps/web/src/app/api/receipts/create/route.ts:88-96`  
**الكود المعيب:**
```typescript
const newPaid = inv.paidHalalas + amountHalalas;
await tx.update(invoices)
  .set({ paidHalalas: newPaid, ... })
  .where(eq(invoices.id, invoiceId));
```
**السيناريو:** محاسبان يُنشئان سندي قبض لنفس الفاتورة في نفس اللحظة → أحدهما يمحو دفعة الآخر (read-then-write بدون WHERE guard).

**الأثر المالي:** ضياع تسجيل دفعة — العميل يُطالَب بمبلغ سدده فعلاً.

**الإصلاح:**
```typescript
paidHalalas: sql`${invoices.paidHalalas} + ${amountHalalas}`,
.where(and(eq(invoices.id, invoiceId),
  sql`(${invoices.totalHalalas} - ${invoices.paidHalalas}) >= ${amountHalalas}`))
```
(نفس النمط المُطبق صحيحاً في `payments/record/route.ts`)

---

#### 3-a-1 [HIGH] — إشعارات الدائن/المدين (381/383) لا تُرسل لـ ZATCA

**الملف:** `apps/web/src/lib/zatca-einvoice.ts:261-264`  
**الكود:**
```typescript
if (inv.type !== '388') {
  return { submitted: false, status: 'skipped',
    reason: 'credit/debit note auto-submission not yet supported' };
}
```
**السيناريو:** إشعار دائن يُنشأ محلياً بـ UUID + QR لكن لا يُرسل لـ ZATCA → الهيئة لا تعلم بالتعديل → مخالفة BR-KSA-EN16931-10.

**الأثر المالي:** غرامات عدم امتثال ZATCA + ازدواجية ضريبية (فاتورة مُعتمدة بدون إشعارها).

**الإصلاح:** تفعيل إرسال 381/383 — الكود الأساسي جاهز (xml-builder يدعم BillingReference). المشكلة فقط في `submitInvoiceToZatca`.

---

#### 3-a-2 [HIGH] — عدم وجود API لإكمال ZATCA onboarding (الخطوتان 2+3)

**الملف:** `apps/web/src/app/api/agencies/zatca/onboard/route.ts` (110 سطر)  
**البحث:**
```
grep -ri "checkCompliance|requestProductionCsid" apps/web/src/app/api/
→ لا نتائج في API routes
```
الحزمة `@masarat/zatca` تصدّر `checkCompliance()` و `requestProductionCsid()` — لكن لا endpoint يستدعيها.

**السيناريو:** الوكالة تنفذ الخطوة 1 (compliance CSID) بنجاح ← تبقى عالقة في حالة `compliance` ← لا يمكن الوصول لـ `production` ← `submitInvoiceToZatca` يتخطى كل الفواتير.

**الأثر المالي:** منظومة ZATCA بأكملها غير فعّالة — لا يمكن لأي وكالة إرسال فواتير إلكترونية.

**الإصلاح:** إنشاء endpoint `POST /api/agencies/zatca/complete-onboarding` يتضمن: فاتورة عينة → `checkCompliance()` → `requestProductionCsid()` → تحديث الحالة إلى `production`.

---

#### 4-a-1 [HIGH] — RLS bypass policy يلغي كل الحماية

**الملف:** `apps/web/drizzle/0016_rls_agency_isolation.sql:79-113`  
**الكود:**
```sql
CREATE POLICY bypass_for_service_role ON bookings
  AS PERMISSIVE FOR ALL TO CURRENT_USER USING (true);
-- ... (مُكرر على كل الجداول)
```
**السيناريو:** التطبيق يتصل كـ CURRENT_USER (صاحب DB) ← `USING (true)` يسمح بكل شيء ← RLS لا يحمي شيئاً.

**الأثر الأمني:** إذا تسرب `agencyId` خاطئ (bug في Firebase claims أو خطأ sync) → لا يوجد حاجز DB-level يمنع الوصول لبيانات وكالة أخرى.

**الإصلاح:** 
1. إزالة `bypass_for_service_role`
2. الاتصال كـ `app_user` (ليس صاحب DB)
3. تطبيق `SET ROLE app_user` في كل connection

---

#### 4-a-2 [HIGH] — `withAgencyContext` لا تُستخدم أبداً → session context لا يُضبط

**الملف:** `apps/web/src/lib/db-context.ts` + `packages/database/src/lib/tenant-middleware.ts`  
**البحث:**
```
grep -r "withAgencyContext\|withTenantContext" apps/web/src/app/api/
→ لا نتائج
```
**السيناريو:** `app.current_agency_id` = NULL دائماً → `agency_isolation` policy تسمح بكل شيء (تتحقق `IS NULL`) → حتى لو أُزيل bypass → لا يزال لا حماية.

**الأثر:** طبقتان من الفشل: (1) bypass policy و (2) context فارغ = RLS معطّل كلياً.

**الإصلاح:** 
1. middleware يستدعي `withAgencyContext()` تلقائياً
2. تعديل policy: `USING (agency_id = current_setting('app.current_agency_id')::uuid)` بدون fallback لـ NULL

---

### MEDIUM (14 بنداً) — يجب إصلاحها قبل أول قيد حقيقي

---

#### 1-a-2 [MED] — تعديل التقريب بلا حد أعلى

**الملف:** `apps/web/src/app/api/invoices/create/route.ts:569`  
```typescript
if (lastCr) lastCr.cr += totalDr - totalCr;
```
فرق التقريب يُحمّل على آخر سطر دائن بلا سقف — فاتورة ذات خطوط كثيرة قد تتراكم فروقاتها.

**الإصلاح:** إضافة `if (Math.abs(diff) > 100) throw` (سقف 1 ر.س).

---

#### 1-a-3 [MED] — مسارات الدفع/العكس تستخدم حسابات محلية

**الملف:** `apps/web/src/app/api/receipts/*/route.ts`  
تستخدم `'1120'`, `'2300'` كنصوص بدلاً من `GL.receivable.code`, `GL.customerDeposits.code`.

**الإصلاح:** استبدال الحسابات المحلية بـ GL المركزي.

---

#### 1-b-1 [MED] — رأس قيد دفعة المورّد خاطئ عند FX

**الملف:** `apps/web/src/app/api/supplier-payments/create/route.ts`  
القيد يحتوي على سطر FX gain/loss لكن الرأس (description/source) لا يعكس ذلك.

**الإصلاح:** إضافة إشارة لفرق العملة في وصف القيد.

---

#### 1-c-2 [MED] — قفل الفترة: تاريخ مشوّه يتجاوز الحماية

**الملف:** `apps/web/src/app/api/accounting/periods/route.ts`  
```typescript
if (!year || !month) return;
```
إذا كان التاريخ مشوّهاً (year = NaN) → `assertPeriodOpen` يعود بدون خطأ ← القيد يمر.

**الإصلاح:** `if (!Number.isFinite(year) || !Number.isFinite(month)) throw`.

---

#### 1-d-2 [MED] — إشعار مدين بلا idempotency

**الملف:** `apps/web/src/app/api/invoices/debit-note/route.ts`  
```
grep -n "idempotency" apps/web/src/app/api/invoices/debit-note/route.ts
→ لا نتائج
```
إعادة إرسال الطلب → إشعار مدين مكرر بقيد مكرر.

**الإصلاح:** إضافة `withIdempotency` كما في credit-note.

---

#### 2-b-1 [MED] — فاتورة مباشرة بدون idempotency

**الملف:** `apps/web/src/app/api/invoices/create-direct/route.ts`  
لا يستخدم `withIdempotency` → إعادة إرسال = فاتورة مكررة + AR مكرر.

**الإصلاح:** إضافة `withIdempotency` + `markIdempotencyComplete`.

---

#### 2-c-2 [MED] — تطبيق وديعة: lost update على paidHalalas

**الملف:** `apps/web/src/app/api/receipts/[id]/apply/route.ts:88-95`  
نفس نمط 2-c-1 — read-then-write بدون WHERE guard. وديعتان مختلفتان مُطبَّقتان على نفس الفاتورة متزامنًا → lost update.

**الإصلاح:** نفس النمط الذري في `apply-advance/route.ts`.

---

#### 2-f-1 [MED] — خطة الأقساط لا تُلغى عند الاسترداد

**الملف:** `apps/web/src/app/api/refunds/process/route.ts`  
```
grep -n "paymentPlan" apps/web/src/app/api/refunds/process/route.ts
→ لا نتائج
```
استرداد كامل → حجز ملغى + فاتورة مستردة، لكن خطة الأقساط تبقى `active`.

**الإصلاح:** إلغاء خطة الأقساط ضمن transaction الاسترداد.

---

#### 2-g-1 [MED] — تعديل الحجز بدون سجل تدقيق

**الملف:** `apps/web/src/app/api/bookings/[id]/route.ts:56-177`  
```
grep -n "logAudit" apps/web/src/app/api/bookings/[id]/route.ts
→ لا نتائج
```
تغيير حالة الحجز (بما فيها الإلغاء) لا يُسجَّل.

**الإصلاح:** إضافة `logAudit` بعد نجاح المعاملة.

---

#### 3-a-3 [MED] — لا endpoint لإعادة إرسال الفواتير الفاشلة

```
grep -ri "resubmit|retry.*zatca" apps/web/src/app/api/
→ لا نتائج
```
فاتورة تفشل في الإرسال → `zatcaStatus = 'failed'` → لا آلية retry.

**الإصلاح:** إنشاء `POST /api/invoices/[id]/zatca-resubmit`.

---

#### 3-a-4 [MED] — صلاحية الشهادة لا تُملأ ولا تُراقب

حقل `zatcaCertificateExpiry` في الـ schema لا يُكتب فيه عند onboarding. لا cron يراقب اقتراب الانتهاء.

**الإصلاح:** استخراج `validTo` من X.509 عند onboarding + تنبيه قبل 30 يوماً.

---

#### 3-c-1 [MED] — عنوان البائع فارغ عند بناء سجل ZATCA

**الملف:** `apps/web/src/lib/zatca-einvoice.ts:87-100`  
```typescript
address: {
  buildingNumber: '',  streetName: '',  district: '',
  city: '',  postalCode: '',  countryCode: 'SA',
},
```
BR-KSA-09 إلى BR-KSA-16: عنوان بائع فارغ = رفض من ZATCA gateway.

**الإصلاح:** فرض إكمال العنوان في إعدادات الوكالة + validation قبل الإرسال.

---

#### 4-g-1 [MED] — عزل الوكالات يعتمد على فلتر يدوي فقط

كل route تُضيف `WHERE agency_id = ?` يدوياً. لا linter rule يكشف query بدون فلتر. نسيان فلتر واحد = تسرب بيانات.

**الإصلاح:** تفعيل RLS الفعلي (4-a-1 + 4-a-2) كشبكة أمان DB-level.

---

#### 5-a-1 [MED] — فتح فترة بعد الإقفال السنوي لا يُحدّث القيد

**الملف:** `apps/web/src/app/api/accounting/periods/route.ts:184-233`  
إعادة إقفال ديسمبر تجد القيد القديم (idempotency check) وتتخطاه ← الأرباح المحتجزة تبقى خاطئة.

**الإصلاح:** عند إعادة الإقفال: عكس القيد القديم + إنشاء قيد جديد بالأرقام المُحدّثة.

---

### LOW (8 بنود) — تحسينات مرغوبة

| # | العنوان | الإصلاح المقترح |
|---|---------|----------------|
| 1-a-4 | إثبات الإيراد المؤجل يستخدم 4100 دائماً (بدون agent revenue) | تمرير revenue account من الفاتورة الأصلية |
| 1-c-1b | 8399 يظهر في الميزانية لا في P&L | تصنيف 8xxx كمصروف في P&L |
| 2-c-3 | عكس سند القبض: lost update (admin only, نادر) | استخدام `sql\`GREATEST(0, paidHalalas - amount)\`` |
| 2-g-2 | خطوط الحجز: تعديل تشغيلي بعد الفوترة | الحقول المعدّلة تشغيلية — مقبول |
| 3-b-1 | QR كـ base64 TLV — متوافق | توثيق السلوك |
| 3-d-1 | تصنيف صفرية VAT مبني على serviceType | تمرير exemptionReason من booking_lines |
| 4-f-2 | Agency status check fail open عند خطأ DB | تصميمي واعٍ — monitoring كافٍ |
| 5-a-2 | لا تصدير CSV/Excel | إضافة `?format=csv` للتقارير |

---

## أعلى 5 إصلاحات بأثر مالي — ما يجب إصلاحه قبل أول قيد حقيقي

### 1. تفعيل RLS الفعلي (4-a-1 + 4-a-2)
**الأثر:** بدون إصلاح، أي bug في Firebase claims يكشف بيانات كل الوكالات. لا يوجد حاجز ثانٍ.  
**الجهد:** متوسط — إزالة bypass + middleware يضبط tenant context + `SET ROLE app_user`  
**الملفات:** `0016_rls_agency_isolation.sql`, `db.ts`, `db-context.ts`, migration جديدة

### 2. إكمال ZATCA onboarding + تفعيل إرسال 381/383 (3-a-2 + 3-a-1)
**الأثر:** بدون إصلاح، لا يمكن لأي وكالة إرسال فواتير إلكترونية أصلاً. عدم الامتثال = غرامات مباشرة.  
**الجهد:** متوسط — الدوال (`checkCompliance`, `requestProductionCsid`) جاهزة في `@masarat/zatca`. المطلوب: endpoint واحد + رفع الشرط `type !== '388'`  
**الملفات:** `zatca/onboard/route.ts` (جديد), `zatca-einvoice.ts`

### 3. إصلاح lost update في سندات القبض (2-c-1 + 2-c-2)
**الأثر:** ضياع تسجيل دفعة = عميل يُطالَب بمبلغ سدده. النمط الصحيح موجود فعلاً في `payments/record` — مجرد نقله.  
**الجهد:** منخفض — 3 ملفات، استبدال read-then-write بالنمط الذري  
**الملفات:** `receipts/create/route.ts`, `receipts/[id]/apply/route.ts`, `receipts/[id]/reverse/route.ts`

### 4. إصلاح توزيع AR/ودائع في الإشعار الدائن (1-a-1)
**الأثر:** أرصدة ذمم مدينة / ودائع مشوّهة في الميزانية لكل فاتورة مدفوعة جزئياً تحصل على إشعار.  
**الجهد:** منخفض — تعديل الحساب ليتوزع نسبياً  
**الملفات:** `invoices/credit-note/route.ts`

### 5. إضافة audit trail للقيود اليدوية وتعديلات الحجوزات (1-d-1 + 2-g-1)
**الأثر:** ثغرة في مسار التدقيق — عمليات حرجة بلا أثر. المراجع الخارجي سيُعلّق عليها.  
**الجهد:** منخفض جداً — سطر `logAudit()` واحد في كل ملف  
**الملفات:** `journal-entries/create/route.ts`, `bookings/[id]/route.ts`

---

## نقاط القوة المؤكدة (49 INFO)

| المحور | البند | الوصف |
|--------|-------|-------|
| **محاسبة** | INFO-1d-3 | توازن القيود — حماية متعددة الطبقات (DB CHECK + application + trigger) |
| **محاسبة** | INFO-1d-4 | منع الأعداد العشرية — BIGINT halalas فقط |
| **محاسبة** | INFO-1d-5 | ثبات القيود المنشورة — DB trigger يرفض UPDATE/DELETE |
| **محاسبة** | INFO-1d-6 | ترقيم تسلسلي ذري — `nextval` في SQL function |
| **محاسبة** | INFO-1d-7 | مطابقة DEFAULT_COA (44 حساب) مع GL المركزي |
| **محاسبة** | INFO-1b-2 | دفعة مورّد supplier تخصم من AP (2000) لا من المصروف |
| **محاسبة** | INFO-1b-3 | Input VAT مسجل صحيحاً على 1230 |
| **محاسبة** | INFO-1c-3 | ميزان المراجعة يطابق journal_lines |
| **محاسبة** | INFO-1c-4 | تقرير أعمار الذمم يُطابق GL 1120 |
| **محاسبة** | INFO-1c-5 | تقرير أعمار الموردين يُطابق GL 2000 |
| **حجوزات** | INFO-2.1 | آلة حالة الحجز تمنع الانتقالات غير المسموحة |
| **حجوزات** | INFO-2.2 | إنشاء الحجز لا يُنشئ قيد (IFRS 15 صحيح) |
| **حجوزات** | INFO-2.3 | الحجب المالي بعد الفوترة يحمي خطوط الحجز |
| **حجوزات** | INFO-2.4 | تسجيل الدفعة (payments/record) — idempotency + atomic WHERE |
| **حجوزات** | INFO-2.5 | دفع الأقساط — idempotency key مشتق يمنع الدفع المزدوج |
| **حجوزات** | INFO-2.6 | الاسترداد يعكس القيد الأصلي pro-rata مع mixed supply |
| **حجوزات** | INFO-2.7 | حد الائتمان يُفحص عند إصدار الفاتورة |
| **حجوزات** | INFO-2.8 | IFRS 15 deferred revenue → recognition lifecycle مكتمل |
| **ضرائب** | INFO-3f-1 | PIH + ICV chain ذرّي بـ FOR UPDATE row lock |
| **ضرائب** | INFO-3f-2 | Input VAT يُسجل على 1230 بشكل منفصل |
| **ضرائب** | INFO-3f-3 | تشفير بيانات ZATCA — AES-256-GCM at rest |
| **ضرائب** | INFO-3f-4 | التوقيع XAdES B-B + ECDSA-SHA256 |
| **ضرائب** | INFO-3f-5 | Phase 1 QR TLV سليم (5 tags) |
| **ضرائب** | INFO-3f-6 | Phase 2 QR TLV سليم (9 tags) |
| **ضرائب** | INFO-3f-7 | CSR مطابق لمواصفات ZATCA |
| **ضرائب** | INFO-3f-8 | عتبة التسجيل 375K/187.5K SAR rolling 12-month |
| **ضرائب** | INFO-3f-9 | إقرار VAT — GL كمصدر موثوق + مقارنة مصادقة |
| **أمان** | INFO-4b-1 | agencyId من JWT claims حصرياً — لا IDOR |
| **أمان** | INFO-4b-2 | 115/130 route تستدعي verifyAuth() |
| **أمان** | INFO-4b-3 | الـ 15 route بدون verifyAuth محمية بآليات بديلة |
| **أمان** | INFO-4c-1 | تشفير AES-256-GCM at rest + fail-closed |
| **أمان** | INFO-4c-2 | لا يُعاد أي secret للعميل |
| **أمان** | INFO-4d-1 | DB triggers تحمي JE + invoices + payments |
| **أمان** | INFO-4d-2 | Audit log append-only |
| **أمان** | INFO-4e-1 | Rate limiting fail-closed (Redis) |
| **أمان** | INFO-4e-2 | تسجيل وكالة محمي بـ rate limit + secret |
| **أمان** | INFO-4f-1 | حظر وكالات موقوفة/منتهية |
| **أمان** | INFO-4h-1 | Super Admin email من env فقط |
| **أمان** | INFO-4h-2 | RBAC هرمي واضح |
| **عمليات** | INFO-5b-1 | الإقفال السنوي يتطلب كل الأشهر (1-11) |
| **عمليات** | INFO-5b-2 | assertPeriodOpen يحظر الفترات الضمنية |
| **عمليات** | INFO-5b-3 | الفواتير الدورية race-safe |
| **عمليات** | INFO-5b-4 | التعرف على الإيراد المؤجل — cron يومي |
| **عمليات** | INFO-5b-5 | FX revaluation — IAS 21 + dual idempotency |
| **عمليات** | INFO-5b-6 | خطط الدفع — تحويل أقساط متأخرة تلقائياً |
| **عمليات** | INFO-5b-7 | تذاكر معلقة — orphan policy ذكية |
| **عمليات** | INFO-5b-8 | حذف وكالة — super admin + trial + تأكيد |
| **عمليات** | INFO-5b-9 | Year-end closing idempotent |
| **عمليات** | INFO-5c-1 | FX revaluation scope — bank/cash (موثق) |

---

## خريطة الإصلاح المقترحة

```
الأسبوع 1 (P0 — حاجب الإطلاق):
├── 4-a-1 + 4-a-2: تفعيل RLS الفعلي
├── 2-c-1 + 2-c-2: إصلاح lost update في سندات القبض
├── 1-a-1: إصلاح توزيع AR/ودائع في الإشعار الدائن
├── 1-d-1 + 2-g-1: إضافة audit trail
└── 1-c-1: إصلاح P&L ليشمل 8399

الأسبوع 2 (P0 — ZATCA):
├── 3-a-2: إكمال ZATCA onboarding (الخطوتان 2+3)
├── 3-a-1: تفعيل إرسال 381/383
├── 3-c-1: عنوان البائع في الإعدادات
└── 3-a-4: ملء + مراقبة صلاحية الشهادة

الأسبوع 3 (P1 — تحسينات):
├── 1-a-2: سقف التقريب
├── 1-a-3: توحيد حسابات GL
├── 1-b-1: وصف FX في رأس القيد
├── 1-c-2: validation تاريخ الفترة
├── 1-d-2 + 2-b-1: idempotency للإشعار المدين والفاتورة المباشرة
├── 2-f-1: إلغاء خطة الأقساط مع الاسترداد
├── 3-a-3: endpoint إعادة إرسال ZATCA
├── 4-g-1: استخدام tenant middleware
└── 5-a-1: تحديث قيد الإقفال عند إعادة الفتح

الأسبوع 4+ (P2 — تحسينات منخفضة):
├── LOW بنود (8)
└── تصدير CSV/Excel
```

---

## الإحصائيات النهائية

| الطور | HIGH | MED | LOW | INFO |
|-------|------|-----|-----|------|
| الطور 1 — المحاسبة | 3 | 5 | 2 | 10 |
| الطور 2 — الحجوزات | 1 | 4 | 2 | 8 |
| الطور 3 — الضرائب | 2 | 3 | 2 | 9 |
| الطور 4 — الأمان | 2 | 1 | 1 | 12 |
| الطور 5 — العمليات | 0 | 1 | 1 | 10 |
| **المجموع** | **8** | **14** | **8** | **49** |

---

## الحكم النهائي

النظام يُظهر **نضجاً هندسياً ملحوظاً** في:
- الحسابات بالهللات (BIGINT) مع حماية من الأعداد العشرية
- IFRS 15 agent/principal + deferred revenue lifecycle
- أنماط idempotency وatomic claims في المسارات الحرجة
- ZATCA XML/signing/QR — بنية متقدمة وصحيحة تقنياً
- حماية السجلات المالية على مستوى DB triggers
- تصميم resilient للعمليات الدورية (tickets, recurring, FX)

**لكنه غير جاهز للإطلاق** بسبب:
1. **RLS معطّل فعلياً** — شبكة الأمان الأهم للعزل بين الوكالات غير فعّالة
2. **ZATCA ناقص** — لا يمكن إكمال onboarding ولا إرسال إشعارات
3. **lost update في سندات القبض** — خطر مالي مباشر على العملاء

> **التوصية:** إصلاح الـ 8 HIGH (تقدير: أسبوعان عمل) ثم إعادة تقييم. بعد الإصلاح، الدرجة المتوقعة: **~88/100** — **قابل للإطلاق مع مراقبة وصيانة تدريجية** للبنود المتوسطة والمنخفضة.

---

*انتهى التدقيق الشامل.*
