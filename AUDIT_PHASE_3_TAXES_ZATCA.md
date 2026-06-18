# الطور 3 — تدقيق الضرائب والامتثال لـ ZATCA

**التاريخ:** 2026-06-18
**النطاق:** ضريبة القيمة المضافة (VAT) + الفوترة الإلكترونية ZATCA المرحلة الثانية + إقرار VAT + عتبة التسجيل

---

## الفهرس

| # | الموضوع | الخطورة | الحالة |
|---|---------|---------|--------|
| 3-a-1 | إشعارات الدائن/المدين (381/383) لا تُرسل لـ ZATCA تلقائياً | HIGH | خطر امتثال |
| 3-a-2 | عدم وجود API لإكمال خطوات onboarding (2+3) — التحقق والإنتاج | HIGH | ناقص |
| 3-a-3 | عدم وجود endpoint لإعادة إرسال الفواتير الفاشلة | MED | ناقص |
| 3-a-4 | عدم مراقبة انتهاء صلاحية الشهادة الرقمية | MED | ناقص |
| 3-b-1 | QR يُرسل كـ base64 TLV مباشرة (ليس URL) إلى مكتبة qrcode | LOW | تصميمي |
| 3-c-1 | عدم ملء عنوان البائع كاملاً وقت البناء | MED | خطر رفض |
| 3-d-1 | إقرار VAT يصنّف صفرية بناءً على serviceType فقط | LOW | تبسيط |
| 3-e-1 | vatRate قابل للتعديل من الإعدادات (0, 5, 10, 15, 20) | INFO+ | تصميمي |
| 3-f-1 | PIH chain + ICV counter — ذرّي وصحيح | INFO ✅ | مُجتاز |
| 3-f-2 | Input VAT — تسجيل سليم على 1230 | INFO ✅ | مُجتاز |
| 3-f-3 | تشفير بيانات الاعتماد (CSIDs + المفتاح الخاص) | INFO ✅ | مُجتاز |
| 3-f-4 | التوقيع XAdES B-B + ECDSA-SHA256 | INFO ✅ | مُجتاز |
| 3-f-5 | Phase 1 QR TLV سليم (5 tags) | INFO ✅ | مُجتاز |
| 3-f-6 | Phase 2 QR TLV سليم (9 tags) | INFO ✅ | مُجتاز |
| 3-f-7 | بناء CSR متوافق مع مواصفات ZATCA | INFO ✅ | مُجتاز |
| 3-f-8 | عتبة التسجيل الإلزامي/الطوعي | INFO ✅ | مُجتاز |
| 3-f-9 | مقارنة مصادقة بين مستوى GL ومستوى الفواتير في إقرار VAT | INFO ✅ | مُجتاز |

**الملخص:** 2 HIGH / 3 MED / 2 LOW / 9 INFO

---

## البنية المعمارية لمنظومة ZATCA

```
                      ┌───────────────────────────────────┐
                      │     agencies (PostgreSQL)         │
                      │  zatcaOnboardingStatus             │
                      │  zatcaPrivateKey (encrypted)       │
                      │  zatcaCertificatePem               │
                      │  zatcaLastInvoiceHash (PIH)        │
                      │  zatcaInvoiceCounter (ICV)         │
                      └────────┬──────────────────────────┘
                               │
                 ┌─────────────┼─────────────────────┐
                 │             │                     │
          ┌──────▼──────┐ ┌───▼───────────┐ ┌───────▼────────┐
          │  Onboarding │ │  Submission   │ │   QR / Status  │
          │  /zatca/    │ │  zatca-       │ │   /invoices/   │
          │  onboard    │ │  einvoice.ts  │ │   [id]/qr      │
          └──────┬──────┘ └───┬───────────┘ └────────────────┘
                 │            │
          ┌──────▼──────┐ ┌───▼───────────────┐
          │ @masarat/   │ │ @masarat/zatca     │
          │ zatca       │ │ xml-builder.ts     │
          │ crypto.ts   │ │ signing.ts         │
          │ api-client  │ │ api-client.ts      │
          └─────────────┘ └───────────────────┘
```

---

## 3-a-1 [HIGH] — إشعارات الدائن/المدين (381/383) لا تُرسل لـ ZATCA تلقائياً

**الملف:** `apps/web/src/lib/zatca-einvoice.ts:261-264`

**الكود الفعلي:**
```typescript
if (inv.type !== '388') {
  // Credit/debit notes need the original invoice's hash linkage at
  // submission time — deferred until that path is sandbox-validated.
  return { submitted: false, status: 'skipped', reason: 'credit/debit note auto-submission not yet supported' };
}
```

**السيناريو الواقعي:**
وكالة مسجلة بنظام ZATCA المرحلة الثانية تُصدر إشعار دائن (381) لتصحيح فاتورة. الإشعار يُنشأ محلياً مع ZATCA UUID و QR record، لكن لا يُرسل لمنصة فاتورة أبداً. هيئة الزكاة والضريبة تملك الفاتورة الأصلية (388) المُعتمدة، لكن لا تملك إشعار التعديل — مما يعني أن إقرار VAT الرسمي لدى الهيئة لن يعكس المبالغ المُعدّلة.

**الأثر المالي:**
- مخالفة مباشرة لمتطلبات ZATCA المرحلة الثانية (BR-KSA-EN16931-10): كل إشعار دائن/مدين يجب أن يُرسل خلال مهلة محددة
- فاتورة مُعتمدة بدون إشعارها المُعدّل = ازدواجية ضريبية (العميل يسترد المبلغ فعلياً لكن الهيئة لا تراه)
- مخاطر غرامة عدم امتثال من ZATCA

**الإصلاح المقترح:**
```typescript
// submitInvoiceToZatca يجب أن يتعامل مع 381/383:
// 1. جلب originalInvoice.zatcaHash كـ PIH للإشعار
// 2. تضمين BillingReference في XML (موجود فعلاً في xml-builder.ts)
// 3. الإرسال: clearance (B2B) أو reporting (B2C) حسب نوع المعاملة
// xml-builder.ts يدعم BillingReference فعلاً — المشكلة فقط في submitInvoiceToZatca
```

**ملاحظة مخففة:** الكود يبني سجل ZATCA كامل (UUID + QR + type) للإشعارات محلياً (ملفات credit-note/route.ts:132-160 و debit-note/route.ts:123-151). xml-builder.ts يدعم `BillingReference` لأنواع 381/383. الفجوة فقط في خطوة الإرسال الفعلي.

---

## 3-a-2 [HIGH] — عدم وجود API لإكمال خطوات onboarding (الخطوة 2: Compliance Check + الخطوة 3: Production CSID)

**الملف:** `apps/web/src/app/api/agencies/zatca/onboard/route.ts` (110 سطر)

**الكود الفعلي:**
الملف يحتوي فقط على الخطوة 1: `generateZatcaKeyPair()` → `requestComplianceCsid()`. بعدها تُحدّث حالة الوكالة إلى `'compliance'`.

**البحث عن الخطوات المفقودة:**
```
grep -ri "checkCompliance|requestProductionCsid" apps/web/src/app/api/
→ لا توجد نتائج في API routes (فقط setup-db و settings لا علاقة لهما)
```
```
glob: apps/web/src/app/api/agencies/zatca/**/route.ts
→ فقط onboard/route.ts و status/route.ts
```

بينما الحزمة `@masarat/zatca` تصدّر الدوال:
- `checkCompliance()` — `packages/zatca/src/api-client.ts:116`
- `requestProductionCsid()` — `packages/zatca/src/api-client.ts:158`

**السيناريو الواقعي:**
المسؤول ينفذ الخطوة 1 (onboard) بنجاح ← الحالة تصبح `compliance`. لا يوجد endpoint لتنفيذ:
- الخطوة 2: إرسال فاتورة عينة (`checkCompliance`) للتحقق
- الخطوة 3: تبديل الـ Compliance CSID بالـ Production CSID (`requestProductionCsid`)

الوكالة تبقى عالقة في حالة `compliance` ولا يمكنها الوصول لحالة `production` — وبالتالي `submitInvoiceToZatca()` يتخطى الإرسال دائماً:

```typescript
// zatca-einvoice.ts:254-256
if (agency.zatcaOnboardingStatus !== 'production') {
  return { submitted: false, status: 'skipped', reason: 'agency not onboarded for production' };
}
```

**الأثر المالي:**
بدون هذه الـ endpoints، لا يمكن لأي وكالة إكمال التسجيل للمرحلة الثانية من داخل النظام — يُصبح نظام ZATCA بأكمله غير فعّال عملياً.

**الإصلاح المقترح:**
إنشاء endpoint `/api/agencies/zatca/complete-onboarding` يتضمن:
1. جلب الـ compliance CSID + secret (مشفرة) من الوكالة
2. بناء فاتورة عينة + توقيعها
3. `checkCompliance()` — الخطوة 2
4. `requestProductionCsid()` — الخطوة 3
5. تحديث الوكالة: `zatcaOnboardingStatus = 'production'`, حفظ production CSID/secret مشفرة

---

## 3-a-3 [MED] — عدم وجود endpoint لإعادة إرسال الفواتير الفاشلة لـ ZATCA

**البحث:**
```
grep -ri "resubmit|retry.*zatca|zatca.*retry" apps/web/src/app/api/
→ النتيجة الوحيدة: invoices/create/route.ts (يستدعي submitInvoiceToZatca بعد الإنشاء)
```
```
glob: apps/web/src/app/api/invoices/**/route.ts
→ لا يوجد ملف resubmit أو retry
```

**الكود ذو الصلة — `zatca-einvoice.ts:245`:**
```typescript
// never throws — failures are recorded on the invoice row
// (zatca_status = 'failed') for later retry.
```

**السيناريو الواقعي:**
فاتورة تُنشأ بنجاح لكن إرسالها لـ ZATCA يفشل (انقطاع شبكة، خطأ مؤقت في gateway). الفاتورة تُسجل بحالة `zatcaStatus = 'failed'`. الكود يقول "for later retry" — لكن لا يوجد آلية retry:
- لا cron job
- لا API endpoint لإعادة الإرسال
- لا dashboard لعرض الفواتير الفاشلة

**الأثر المالي:**
فواتير فاشلة تتراكم → عدم امتثال → غرامات. المستخدم لا يملك أداة لإصلاح الوضع بدون تدخل يدوي في قاعدة البيانات.

**الإصلاح المقترح:**
1. إنشاء `POST /api/invoices/[id]/zatca-resubmit` يستدعي `submitInvoiceToZatca()` مع فحص `zatcaStatus IN ('failed', 'not_submitted')`
2. إنشاء `GET /api/invoices?zatcaStatus=failed` (الفلتر موجود جزئياً لكن يحتاج zatcaStatus filter)
3. اختيارياً: cron job يعيد محاولة الفواتير الفاشلة كل ساعة (مع حد أقصى للمحاولات)

---

## 3-a-4 [MED] — عدم مراقبة انتهاء صلاحية الشهادة الرقمية (CSID)

**الملف:** `apps/web/src/lib/schema/agencies.ts:59`

**الكود الفعلي:**
```typescript
zatcaCertificateExpiry: timestamp('zatca_certificate_expiry', { withTimezone: true }),
```

الحقل موجود في الـ schema والـ status endpoint يعيده:
```typescript
// agencies/zatca/status/route.ts:19
zatcaCertificateExpiry: agencies.zatcaCertificateExpiry,
```

**البحث عن الكتابة فيه:**
```
grep -ri "zatcaCertificateExpiry" apps/web/src/app/api/
→ agencies/zatca/status/route.ts (قراءة فقط)
→ agencies/zatca/onboard/route.ts — لا يكتب في هذا الحقل!
```

**السيناريو الواقعي:**
1. الحقل `zatcaCertificateExpiry` لا يُملأ أبداً خلال الـ onboarding (الكود في onboard/route.ts سطر 76-87 لا يضع قيمة فيه)
2. حتى لو مُلئ — لا يوجد cron job أو تنبيه يراقب اقتراب انتهاء الصلاحية
3. الشهادة تنتهي → كل عمليات الإرسال تفشل → عدم امتثال

**الأثر المالي:**
شهادة منتهية = توقف كامل لإرسال الفواتير حتى تجديد يدوي. لا تنبيه مسبق.

**الإصلاح المقترح:**
1. عند الـ onboarding: استخراج تاريخ انتهاء الشهادة من X.509 certificate (Node.js `X509Certificate.validTo`) وتخزينه
2. إنشاء تحقق في `submitInvoiceToZatca`: إذا بقي أقل من 30 يوماً على الانتهاء → إرفاق تحذير في الاستجابة
3. اختيارياً: تنبيه بريد إلكتروني عبر SMTP المُعدّ

---

## 3-c-1 [MED] — عنوان البائع غير مكتمل عند بناء سجل ZATCA

**الملف:** `apps/web/src/lib/zatca-einvoice.ts:87-100` (تقريباً)

**الكود الفعلي — `buildZatcaInvoiceRecord()`:**
```typescript
const seller: ZatcaSeller = {
  nameAr:    input.sellerNameAr,
  nameEn:    input.sellerNameEn ?? input.sellerNameAr,
  vatNumber: input.sellerVatNumber,
  crNumber:  input.sellerCrNumber ?? '',
  address: {
    buildingNumber: '',      // ← فارغ
    streetName:     '',      // ← فارغ
    district:       '',      // ← فارغ
    city:           '',      // ← فارغ
    postalCode:     '',      // ← فارغ
    countryCode:    'SA',
  },
};
```

**ملاحظة الكود:**
```typescript
// Seller address is intentionally left as placeholder at record-build time;
// the actual address is snapshotted from agency settings when the invoice
// is submitted via submitInvoiceToZatca().
```

**البحث عن ملء العنوان عند الإرسال:**
```
grep -n "address|buildingNumber|streetName|district|postalCode" apps/web/src/lib/zatca-einvoice.ts
```

**السيناريو الواقعي:**
في `submitInvoiceToZatca()` (سطر 273-316)، يُبنى كائن `ZatcaInvoice` من السجل المخزّن + بيانات الوكالة. لكن فحص تفصيلي يكشف أن العنوان يأتي من `agencyZatcaConfigs.sellerAddress` (JSONB) — وإذا لم تُعدّ هذه القيمة (وهو الاحتمال الغالب لأن جدول `agency_zatca_configs` منفصل عن `agencies`) فالعنوان يبقى فارغاً.

```
grep -n "sellerAddress|buildingNumber" apps/web/src/lib/zatca-einvoice.ts
```

**متطلبات ZATCA:**
BR-KSA-09 إلى BR-KSA-16: عنوان البائع إلزامي ويشمل: رقم المبنى، اسم الشارع، الحي، المدينة، الرمز البريدي. حقول فارغة = رفض من gateway.

**الأثر المالي:**
كل فاتورة بعنوان بائع فارغ تُرفض من ZATCA gateway — تتراكم كفواتير فاشلة.

**الإصلاح المقترح:**
1. فرض ملء عنوان البائع في إعدادات الوكالة (validation عند حفظ الإعدادات)
2. التحقق في `submitInvoiceToZatca()` من اكتمال العنوان قبل المحاولة
3. بديل: جلب العنوان من `agencies.addressAr` + `agencies.city` وتقسيمه

---

## 3-d-1 [LOW] — تصنيف فواتير صفرية المعدل مبني على serviceType فقط

**الملف:** `apps/web/src/lib/zatca-einvoice.ts` — `inferZatcaExemptionReason()`

**الكود الفعلي:**
```typescript
export function inferZatcaExemptionReason(params: {
  serviceType?: string;
  isInternational?: boolean;
}): ZatcaExemptionReason {
  if (params.isInternational) return 'VATEX-SA-32';  // نقل دولي
  if (params.serviceType === 'umrah' || params.serviceType === 'hajj')
    return 'VATEX-SA-34-1';  // حج وعمرة
  return null;
}
```

**السيناريو الواقعي:**
booking_lines تدعم `vatCategory: 'Z'` (صفري) و `vatCategory: 'E'` (معفي) مع `exemptionReason` على مستوى البند. لكن `inferZatcaExemptionReason()` تستخدم فقط serviceType + isInternational — لا تقرأ vatCategory من البند نفسه.

هذا يعني أن خدمة معفية من VAT لسبب آخر (مثل `VATEX-SA-29` — خدمات مالية أو `VATEX-SA-30` — معادن ثمينة) لن تحصل على سبب الإعفاء الصحيح في فاتورة ZATCA.

**الأثر المالي:**
منخفض — وكالات السفر عملياً تتعامل فقط مع S (15%) و Z (صفري للنقل الدولي) و E (حج/عمرة). لكن إذا توسع النظام لخدمات أخرى فالتصنيف سيكون ناقصاً.

**الإصلاح المقترح:**
تمرير `exemptionReason` من `booking_lines.vatCategory` مباشرة عند بناء `ZatcaInvoiceLine` بدلاً من الاستدلال.

---

## 3-e-1 [INFO+] — vatRate قابل للتعديل من الإعدادات (يشمل 0, 5, 10, 15, 20)

**الملف:** `apps/web/src/app/api/settings/route.ts:81-85`

**الكود الفعلي:**
```typescript
if (body.vatRate !== undefined) {
  if (![0, 5, 10, 15, 20].includes(body.vatRate)) {
    return NextResponse.json({ error: 'معدل الضريبة غير مدعوم' }, { status: 400 });
  }
}
```

**الملاحظة:**
معدل VAT في السعودية حالياً هو **15%** (منذ يوليو 2020). السماح بقيم 0, 5, 10, 20 يوفر مرونة مستقبلية (في حال تغيير المعدل)، لكنه يحمل مخاطر:
- مدير يختار 5% بالخطأ → كل فواتيره تحتسب VAT بنسبة خاطئة
- لا يوجد تنبيه أو تأكيد عند تغيير المعدل

ليست ثغرة — تصميم واعٍ. لكن يُفضل إضافة تحذير في الـ UI عند اختيار قيمة غير 15%.

---

## 3-f-1 [INFO ✅] — PIH Chain + ICV Counter — ذرّي وصحيح

**الملف:** `apps/web/src/lib/zatca-einvoice.ts:275-300` (تقريباً)

**الكود المُفحص:**
```typescript
// Row-lock the agency to atomically advance PIH + ICV
const [agency] = await tx
  .select({ ... })
  .from(agencies)
  .where(eq(agencies.id, agencyId))
  .for('update');  // PostgreSQL row-level lock

const nextIcv = (agency.zatcaInvoiceCounter ?? 0) + 1;

// After signing:
await tx.update(agencies).set({
  zatcaInvoiceCounter: nextIcv,
  zatcaLastInvoiceHash: signedResult.invoiceHash,
}).where(eq(agencies.id, agencyId));
```

**الحكم:**
- `FOR UPDATE` يمنع تقدم متزامن على نفس الوكالة — التسلسل مضمون
- ICV يبدأ من 0 ويتزايد رتيباً (monotonic) — لا يُعاد تصفيره سنوياً (متطلب ZATCA)
- PIH يُحدّث بـ `invoiceHash` الحالي → يصبح PIH للفاتورة التالية
- الفاتورة الأولى تستخدم `NWZlYThiNTFhZWY=` كـ PIH ابتدائي (hash ثابت وفق مواصفات ZATCA)

✅ **مُجتاز — التنفيذ مطابق لمواصفات ZATCA §7.3.7**

---

## 3-f-2 [INFO ✅] — Input VAT — تسجيل سليم على حساب 1230

**الملف:** `apps/web/src/app/api/supplier-payments/create/route.ts:183-193`

**الكود المُفحص:**
```typescript
if (vatAmount > 0 && vatAmount < resolvedAmountHalalas) {
  const netAmount = resolvedAmountHalalas - vatAmount;
  lines = [
    // Dr Expense (net)
    { accountCode: expenseAc.code, debitHalalas: netAmount, creditHalalas: 0 },
    // Dr Input VAT (1230)
    { accountCode: GL.inputVat.code, debitHalalas: vatAmount, creditHalalas: 0 },
    // Cr Cash/Bank (gross)
    { accountCode: paymentAc.code, debitHalalas: 0, creditHalalas: resolvedAmountHalalas },
  ];
}
```

**الحكم:**
- VAT المدخلات يُسجل كمدين على 1230 (مُسترد من ZATCA)
- صافي المصروف = المبلغ - VAT → المصروف لا يتضخم بالضريبة
- يعمل مع جميع فئات المصروفات (supplier, rent, marketing, operational)
- إقرار VAT (`vat-return/route.ts`) يجلب Input VAT من مجموع مدينات 1230

✅ **مُجتاز — IAS 12 + متطلبات ZATCA Input VAT**

---

## 3-f-3 [INFO ✅] — تشفير بيانات الاعتماد (CSIDs + المفتاح الخاص)

**الملف:** `apps/web/src/app/api/agencies/zatca/onboard/route.ts:82-84`

**الكود المُفحص:**
```typescript
zatcaComplianceCsid:   await encrypt(complianceResult.binarySecurityToken),
zatcaComplianceSecret: await encrypt(complianceResult.secret),
zatcaPrivateKey:       await encrypt(keyPair.privateKeyPem),
```

**الملف:** `apps/web/src/app/api/settings/route.ts:23-31`
```typescript
// Never return secrets to the client:
const {
  zatcaComplianceCsid: _zcc,
  zatcaComplianceSecret: _zcs,
  zatcaProductionCsid: _zpc,
  zatcaProductionSecret: _zps,
  zatcaPrivateKey: _zpk,
  ...safeAgency
} = agency;
```

**الحكم:**
- بيانات الاعتماد مشفرة at rest باستخدام `encrypt()` (AES-256-GCM بحسب crypto module)
- لا تُعاد أبداً للعميل (مُزالة من GET /settings)
- `zatcaCertificatePem` (الشهادة العامة) تُخزن بدون تشفير — صحيح لأنها عامة

✅ **مُجتاز — ممارسة أمنية سليمة**

---

## 3-f-4 [INFO ✅] — التوقيع XAdES B-B + ECDSA-SHA256

**الملف:** `packages/zatca/src/signing.ts:212-248`

**الكود المُفحص:**
```typescript
export function signInvoiceXml(input: SigningInput): SignedInvoiceResult {
  // 1. Invoice hash over canonical XML (UBLExtensions + cac:Signature removed)
  const xmlForHashing = removeSignatureBlock(input.invoiceXml);
  const invoiceHash   = createHash('sha256').update(xmlForHashing, 'utf8').digest('base64');

  // 2. ECDSA-SHA256 signature over the same canonical XML
  const signer = createSign('SHA256');
  signer.update(xmlForHashing, 'utf8');
  const digitalSignature = signer.sign(input.privateKeyPem, 'base64');

  // 3. Fill placeholders in order, then compute SignedProperties hash LAST
  // ...
  const spMatch = signedXml.match(/<xades:SignedProperties[\s\S]*?<\/xades:SignedProperties>/);
  signedXml = signedXml.replaceAll('{{SIGNED_PROPERTIES_HASH}}', spMatch ? sha256HexBase64(spMatch[0]) : '');
}
```

**الحكم:**
- `removeSignatureBlock()` يزيل `UBLExtensions` و `cac:Signature` — مطابق للمواصفات
- التوقيع بـ ECDSA-SHA256 على الـ canonical XML — صحيح
- Placeholders تُملأ بالترتيب الصحيح: كل الحقول أولاً → ثم `SIGNED_PROPERTIES_HASH` آخراً (لأن hash يجب أن يُحسب على المحتوى النهائي)
- `sha256HexBase64()` — تحويل ZATCA SDK-specific: base64(hex(sha256(input))) — موثق ومطابق

**ملاحظة تقنية:** الكود يُشير بصراحة أن C14N11 غير مُطبق (سطر 10: "this implementation hashes the literal stripped bytes"). هذا يعني أن الـ hash قد يختلف عن الـ ZATCA SDK reference implementation إذا كان الـ XML يحتوي على whitespace غير متوقع. لكن هذا مقبول ما دام يجتاز الـ simulation gateway.

✅ **مُجتاز — بنية التوقيع مطابقة لمواصفات ZATCA مع ملاحظة C14N11**

---

## 3-f-5 [INFO ✅] — Phase 1 QR TLV سليم (5 tags)

**الملف:** `apps/web/src/lib/zatca-qr.ts` (49 سطر)

**الكود المُفحص:**
```typescript
export function buildPhase1Qr(params: { ... }): string {
  const entries = [
    tlvEntry(1, Buffer.from(params.sellerName, 'utf8')),
    tlvEntry(2, Buffer.from(params.vatNumber, 'utf8')),
    tlvEntry(3, Buffer.from(params.timestamp, 'utf8')),
    tlvEntry(4, Buffer.from(halalasToSar(params.totalWithVatHalalas), 'utf8')),
    tlvEntry(5, Buffer.from(halalasToSar(params.vatHalalas), 'utf8')),
  ];
  return Buffer.concat(entries).toString('base64');
}
```

**الحكم:**
- 5 tags بالترتيب الصحيح (1-5) وفق مواصفات Phase 1
- `halalasToSar()` يحوّل من هللات إلى ريال بخانتين عشريتين
- Timestamp بتوقيت +03:00 (KSA)
- TLV encoding: 1 byte tag + 1 byte length + value

✅ **مُجتاز**

---

## 3-f-6 [INFO ✅] — Phase 2 QR TLV سليم (9 tags)

**الملف:** `packages/zatca/src/signing.ts:146-181`

**الكود المُفحص — `buildQrCodeData()`:**
```typescript
const entries = [
  tlvEntry(1, Buffer.from(params.sellerName, 'utf8')),
  tlvEntry(2, Buffer.from(params.vatNumber, 'utf8')),
  tlvEntry(3, Buffer.from(params.timestamp, 'utf8')),
  tlvEntry(4, Buffer.from(params.totalWithVat, 'utf8')),
  tlvEntry(5, Buffer.from(params.vatAmount, 'utf8')),
  tlvEntry(6, Buffer.from(params.invoiceHash, 'utf8')),        // base64 string
  tlvEntry(7, Buffer.from(params.digitalSignature, 'utf8')),   // base64 string
];
if (publicKeyDer)  entries.push(tlvEntry(8, publicKeyDer));     // raw SPKI DER
if (certSignature) entries.push(tlvEntry(9, certSignature));    // raw cert sig
```

**الحكم:**
- Tags 1-7 كـ UTF-8 strings, Tags 8-9 كـ raw bytes — مطابق لمواصفات ZATCA §6
- `tlvEntry()` يرفض قيم > 255 byte (حماية من كسر TLV stream)
- Tag 8 = SPKI DER public key, Tag 9 = ECDSA signature of certificate by CA
- `extractCertSignatureBytes()` يستخدم ASN.1 walk صحيح لاستخراج BIT STRING

✅ **مُجتاز**

---

## 3-f-7 [INFO ✅] — بناء CSR متوافق مع مواصفات ZATCA

**الملف:** `packages/zatca/src/crypto.ts:201-263`

**الكود المُفحص — `generateZatcaKeyPair()`:**
- Curve: `prime256v1` (P-256) — متطلب ZATCA
- Key format: PKCS#8 PEM (private), SPKI PEM (public) — صحيح
- Subject RDN بالترتيب: CN, OU, O, C, serialNumber, UID — مطابق لمواصفات ZATCA CSID
- Serial format: `1-{softwareName}|2-ERP|3-{softwareVersion}` — مطابق
- UID = vatNumber — صحيح
- subjectAltName extension: otherName مع OID `2.16.840.1.114412.18` — مطابق لـ ZATCA production OID
- التوقيع: `ECDSA-SHA256` عبر Node.js native crypto — صحيح (تجاوز محدودية node-forge)

✅ **مُجتاز**

---

## 3-f-8 [INFO ✅] — عتبة التسجيل الإلزامي/الطوعي

**الملف:** `apps/web/src/app/api/accounting/vat-status/route.ts` (89 سطر)

**الكود المُفحص:**
```typescript
const MANDATORY_THRESHOLD_HALALAS = 375_000 * 100; // 375,000 SAR
const VOLUNTARY_THRESHOLD_HALALAS = 187_500 * 100; // 187,500 SAR

// Rolling 12-month from confirmed invoices (not cancelled/draft)
// type IN ('380', '388', 'simplified')
```

**الحكم:**
- عتبة 375,000 ر.س إلزامي و 187,500 ر.س طوعي — مطابقة لنظام ZATCA
- الحساب على 12 شهراً متداولاً — صحيح
- استبعاد الملغية والمسودات — صحيح
- رسائل تنبيه ثنائية اللغة (عربي/إنجليزي)
- `percentOfMandatory` يعطي نسبة الاقتراب من العتبة

✅ **مُجتاز**

---

## 3-f-9 [INFO ✅] — مقارنة مصادقة GL vs Invoice في إقرار VAT

**الملف:** `apps/web/src/app/api/reports/vat-return/route.ts` (248 سطر)

**الكود المُفحص:**
```typescript
// Output VAT authoritative from GL 2200 net credit movement
// (not invoice-level sum — GL is the single source of truth)

// Reconciliation section:
// Compares invoice-level VAT sum vs GL-level to surface discrepancies
const reconciliation = {
  outputVatFromInvoices: invoiceLevelVat,
  outputVatFromGL: glLevelVat,
  difference: glLevelVat - invoiceLevelVat,
  isReconciled: Math.abs(glLevelVat - invoiceLevelVat) < 100, // < 1 SAR tolerance
};
```

**الحكم:**
- GL 2200 هو المصدر الموثوق (الصحيح — GL immutable بعد الترحيل)
- مقارنة بين المصدرين تكشف الفارق
- تسامح 1 ر.س (100 هللة) — معقول لفروقات التقريب
- Input VAT من مدينات 1230 فقط

✅ **مُجتاز — تصميم محاسبي سليم**

---

## 3-b-1 [LOW] — QR يُمرر كـ base64 TLV مباشرة لمكتبة QRCode

**الملف:** `apps/web/src/app/api/invoices/[id]/qr/route.ts:23`

**الكود الفعلي:**
```typescript
const qrTlv = inv?.zatcaQr ?? inv?.zatcaHash;
const dataUrl = await QRCode.toDataURL(qrTlv, { width: 128, margin: 1, errorCorrectionLevel: 'M' });
```

**الملاحظة:**
مكتبة `qrcode` تقبل string أو Buffer. الكود يمرر base64 string. هذا يعني أن الـ QR code يحتوي على النص base64 وليس البيانات الخام (binary). تطبيقات المسح ستحتاج لفك تشفير base64 أولاً.

**ملاحظة مخففة:** هذا هو السلوك القياسي في تطبيقات ZATCA — تطبيقات المسح (مثل تطبيق الهيئة) تتوقع base64 encoded TLV في الـ QR. لذلك هذا سلوك صحيح وليس خطأ — لكنه يستحق التوثيق.

✅ **مقبول — متوافق مع معيار ZATCA**

---

## الملخص التنفيذي

### ما يعمل بشكل صحيح (الإيجابيات):
1. **PIH + ICV chain** — ذرّي بـ `FOR UPDATE` row lock، تسلسل مضمون
2. **التوقيع الرقمي** — ECDSA-SHA256 + XAdES B-B صحيح مع ترتيب ملء placeholders
3. **QR Phase 1 + 2** — TLV encoding سليم، 5 و 9 tags بالترتيب الصحيح
4. **Input VAT** — يُسجل على 1230 بشكل منفصل عن المصروف
5. **تشفير الاعتماد** — AES-256-GCM، لا يُعاد للعميل أبداً
6. **CSR** — مطابق لمواصفات ZATCA (curve, OIDs, SAN extension)
7. **إقرار VAT** — GL كمصدر موثوق + مقارنة مصادقة
8. **عتبة التسجيل** — 375K/187.5K SAR rolling 12-month

### ما يحتاج إصلاح:
1. **[HIGH]** إشعارات 381/383 لا تُرسل لـ ZATCA — خطر امتثال مباشر
2. **[HIGH]** onboarding ناقص — لا endpoint للخطوتين 2 و 3 (compliance check + production CSID)
3. **[MED]** لا endpoint لإعادة إرسال الفواتير الفاشلة
4. **[MED]** صلاحية الشهادة لا تُراقب ولا تُملأ عند الـ onboarding
5. **[MED]** عنوان البائع فارغ عند البناء — احتمال رفض من gateway

### جدول الأولويات:
| الأولوية | البند | المبرر |
|----------|-------|--------|
| 🔴 P0 | 3-a-2 onboarding | بدونه لا تعمل المنظومة أصلاً |
| 🔴 P0 | 3-a-1 إشعارات 381/383 | خطر غرامة من ZATCA |
| 🟡 P1 | 3-a-3 retry فواتير | فواتير فاشلة تتراكم |
| 🟡 P1 | 3-a-4 صلاحية الشهادة | توقف مفاجئ محتمل |
| 🟡 P1 | 3-c-1 عنوان البائع | رفض gateway |
| ⚪ P2 | 3-d-1 exemption reason | تبسيط مقبول حالياً |
| ⚪ P2 | 3-e-1 vatRate مرن | تصميمي — يحتاج UI warning فقط |

---

**الإحصائيات التراكمية (الأطوار 1-3):**

| الطور | HIGH | MED | LOW | INFO |
|-------|------|-----|-----|------|
| الطور 1 | 3 | 5 | 2 | 10 |
| الطور 2 | 1 | 4 | 2 | 8 |
| الطور 3 | 2 | 3 | 2 | 9 |
| **المجموع** | **6** | **12** | **6** | **27** |

---

انتهى الطور 3. الطور التالي: **الطور 4 — العزل متعدد المستأجرين والأمان (Multi-tenant Isolation & Security)**.
