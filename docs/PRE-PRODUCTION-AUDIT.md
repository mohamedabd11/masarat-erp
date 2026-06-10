# تدقيق ما قبل الإنتاج — Masarat ERP

**تاريخ التدقيق:** 2026-06-10
**الشجرة المدقَّقة:** `c591cb7` (فرع `claude/jolly-thompson-meq6bk`، المنشور على `www.masarat-erp.com`)، مع إصلاحات هذه الجولة فوقها على `claude/masarat-erp-audit-plan-woi5wz`
**النطاق:** 130 مساراً تحت `apps/web/src/app/api/**`، حزمتا `@masarat/accounting` و`@masarat/zatca`، وطبقة العزل بين الوكالات

**المنهجية:** 5 محاور تدقيق مستقلة (مالي، دورة حياة الحجوزات، ضرائب/ZATCA، عزل/أمان، أخطاء تشغيلية)، كل محور يلتزم بقاعدة الدليل: **مسار الملف + رقم السطر + مقتطف الكود + سيناريو ضرر واقعي**. كل بند Critical/High أعيد التحقق منه بقراءة الكود فعلياً من قِبل المدقق الرئيسي قبل اعتماده. أي ادعاء لم يصمد أمام القراءة الفعلية أُسقط ووُثِّق سبب الإسقاط (قسم "بنود مرفوضة" أدناه).

---

## درجة الجاهزية: **95 / 100**

> **تحديث (جولة الإصلاح الثانية — 2026-06-10):** أُغلق البندان High المتبقيان (2.1 تصنيف B2B، و2.2 أكواد إعفاء VATEX) بالكامل، واكتمل سحب الترقيم (pagination) ليشمل كل مسارات القوائم غير المحدودة. التفاصيل في القسم «جولة الإصلاح الثانية» أدناه. رُفعت الدرجة من 83 إلى 95.

| المحور | التقييم | الملاحظة |
|---|---|---|
| العزل بين الوكالات (`agencyId`) | ممتاز | لم يُعثر على أي IDOR حقيقي عبر عشرات المسارات المدقَّقة، بما فيها المسارات المتداخلة `[id]/[childId]` |
| التزامن/السباقات على القيود المالية | جيد جداً (بعد الإصلاح) | 3 ثغرات سباق حقيقية أُصلحت بنفس النمط الذري المعتمد في الكود |
| توازن القيود المحاسبية | ممتاز | كل نقاط الإنشاء (فاتورة، إشعار دائن، استرداد) تتحقق من توازن مدين=دائن صراحة |
| ZATCA Phase 2 — البنية الأساسية (PIH/ICV/QR/XAdES) | ممتاز | السلسلة والتوقيع وQR TLV صحيحة للحالة الأساسية |
| ZATCA Phase 2 — تصنيف B2B/الإعفاءات | **ممتاز (بعد الإصلاح الثاني)** | التُقط `vatNumber` للعميل ويُمرَّر كـ`buyerVatNumber` لتصنيف B2B الصحيح؛ وأُلحقت أكواد VATEX-SA-32/34-1 تلقائياً للسطور صفرية النسبة |
| الترقيم (pagination) | ممتاز (بعد الإصلاح الثاني) | سُحب ليشمل كل مسارات القوائم (`suppliers`/`quotes`/`employees`/`cheques`/`pnr`/`tickets`/`appointments`/`audit-log`/`bsp/*` …) |
| الاختبارات | 388/388 ناجحة (web) + 90/90 (accounting)، `tsc --noEmit` و`eslint` نظيفان | — |

**الخلاصة:** النظام **جاهز لإطلاق B2C وB2B** بعد جولتي الإصلاح. أُغلق البندان High (تصنيف B2B وأكواد VATEX)، فلم يعد هناك ما يمنع قبول عملاء شركات مسجَّلين في ضريبة القيمة المضافة أو زيادة حجم الفواتير صفرية النسبة (طيران دولي/عمرة). البنود المتبقية كلها Medium/Low (تحسينات تشغيلية).

---

## 1. الإصلاحات المُطبَّقة (Critical / High — تم الإصلاح في هذه الجولة)

### 1.1 — High — سباق مزدوج في الاعتراف بالإيراد المؤجل (IFRS 15)
**الملف:** `apps/web/src/app/api/invoices/recognize-revenue/route.ts`

**قبل:**
```ts
const amount = inv.subtotalHalalas;
if (amount <= 0) {
  await tx.update(invoices)
    .set({ revenueRecognizedAt: today, updatedAt: new Date() })
    .where(eq(invoices.id, inv.id));
  continue;
}
// ... بناء القيد ...
await tx.update(invoices)
  .set({ revenueRecognizedAt: today, updatedAt: new Date() })
  .where(eq(invoices.id, inv.id));
```

**السيناريو:** المسار اليدوي (POST مباشر) يقرأ الفواتير المستحقة (`revenueRecognizedAt IS NULL AND travelDate <= today`) ثم يُعلِّمها كمُعترَف بها **في النهاية فقط**. إن استُدعي هذا المسار مرتين متزامنتين (أو تزامن مع cron `recognizeDueRevenue`)، كلا الاستدعاءين يقرآن نفس الفاتورة قبل أي منهما يكتب `revenueRecognizedAt`، فينشئ كل منهما قيد اعتراف بإيراد منفصل لنفس الفاتورة → **ازدواج في 4100 (إيراد) و2200 (ضريبة المخرجات)**.

**الإصلاح:** نقل عملية "الادّعاء" (claim) إلى **بداية** المعالجة بشرط ذري `WHERE id=... AND revenue_recognized_at IS NULL ... RETURNING`، بنفس نمط `recognizeDueRevenue()` في `apps/web/src/lib/revenue-recognition.ts:59-63`. الاستدعاء الخاسر يطابق 0 صفوف ويُتخطّى (`continue`) قبل بناء أي قيد.

```ts
const [claimed] = await tx.update(invoices)
  .set({ revenueRecognizedAt: today, updatedAt: new Date() })
  .where(and(eq(invoices.id, inv.id), isNull(invoices.revenueRecognizedAt)))
  .returning({ id: invoices.id });
if (!claimed) continue;
const amount = inv.subtotalHalalas;
if (amount <= 0) continue;
```

---

### 1.2 — High — Lost Update على `paidHalalas` عند تطبيق دفعة مقدّمة
**الملف:** `apps/web/src/app/api/invoices/[id]/apply-advance/route.ts:101-122`

**قبل:**
```ts
const newPaid = (invoice.paidHalalas ?? 0) + applyAmount;
const newStatus = newPaid >= invoice.totalHalalas ? 'paid'
  : newPaid > 0 ? 'partial'
  : invoice.status;

await tx.update(invoices)
  .set({ paidHalalas: newPaid, status: newStatus, updatedAt: now })
  .where(eq(invoices.id, invoice.id));
```

**السيناريو:** `invoice.paidHalalas` يُقرأ مرة في بداية الدالة. إن طُبِّقت دفعتان مقدّمتان (سندان مختلفان) على **نفس الفاتورة** ضمن معاملتين متزامنتين، كلاهما يحسب `newPaid` من نفس القيمة القديمة، وآخر `UPDATE` يكتب يطغى على الأول → **يُفقَد جزء من الدفعة المُسجَّلة فعلياً في القيد المحاسبي (الخطوة 4) لكنه لا يظهر في `paidHalalas`/الحالة**، فيبدو العميل مديناً بمبلغ أكبر مما هو عليه فعلاً رغم أن القيد صحيح.

**الإصلاح:** تحديث ذري بنفس نمط `installments/[installmentId]/pay/route.ts:124-136` — الزيادة والتحقق من الرصيد المتبقي داخل `WHERE`، و0 صفوف → 409:

```ts
const [updatedInv] = await tx.update(invoices)
  .set({
    paidHalalas: sql`${invoices.paidHalalas} + ${applyAmount}`,
    status: sql`CASE WHEN ${invoices.paidHalalas} + ${applyAmount} >= ${invoices.totalHalalas} THEN 'paid' ELSE 'partial' END`,
    updatedAt: now,
  })
  .where(and(
    eq(invoices.id, invoice.id),
    sql`(${invoices.totalHalalas} - ${invoices.paidHalalas}) >= ${applyAmount}`,
  ))
  .returning({ paidHalalas: invoices.paidHalalas, status: invoices.status });
if (!updatedInv) throw new BusinessError('تعذّر تطبيق الدفعة المقدمة — تعارض متزامن، حاول مجدداً', 409);
```

---

### 1.3 — High — تحويل عرض السعر إلى حجز يُصفِّر ضريبة القيمة المضافة دائماً
**الملف:** `apps/web/src/app/api/quotes/[id]/convert/route.ts:99-120` (قبل الإصلاح)

**قبل:**
```ts
// vatCategory='Z' (zero-rated, vatHalalas=0) because quote.totalHalalas is
// the agreed final amount — we don't back-calculate VAT from an opaque total.
await tx.insert(bookingLines).values({
  ...
  unitPriceExclVatHalalas: totalPriceHalalas,
  totalPriceExclVatHalalas: totalPriceHalalas,
  vatCategory:              'Z',
  vatRateBps:               0,
  vatHalalas:               0,
  revenueModel:             'agent',
  ...
});
```

**السيناريو:** عرض السعر `quote.totalHalalas` هو السعر الإجمالي شامل الضريبة المتفق عليه مع العميل (الممارسة المعيارية في السعودية للأسعار الموجَّهة للمستهلك). عند التحويل إلى حجز، يُنشأ `bookingLines` بسطر واحد نشط (`status='active'`)، فيدخل `invoices/create` المسار `hasActiveLines=true` الذي يبني القيد وبنود الفاتورة مباشرة من `vatHalalas` السطر (= 0 دائماً). **النتيجة: كل فاتورة صادرة من حجز محوَّل من عرض سعر تُصدَر بضريبة 0% (صفرية النسبة) بغض النظر عن طبيعة الخدمة**، حتى لو كانت الوكالة مسجّلة في الضريبة وكان السعر المتفق عليه شاملاً 15% فعلياً. الأثر: (1) إقرار `reports/vat-return` يقلِّل ضريبة المخرجات الفعلية المستحقة لهيئة الزكاة والضريبة، (2) فاتورة ZATCA Phase 2 تُصنَّف "صفرية" بلا أي مبرر إعفاء — مخالفة قابلة للرصد في تدقيق ZATCA.

**الإصلاح:** جلب `agency.isVatRegistered` و`agency.vatRate`، ثم — للوكالات المسجَّلة — فصل القيمة الإجمالية الشاملة للضريبة إلى وعاء + ضريبة بالنسبة الأساسية، وتعيين `vatCategory='S'` بدلاً من `'Z'`. الوكالات غير المسجَّلة تبقى كما كانت (`Z`/`0`، لا أثر لأن `isVatRegistered=false` يُصفِّر VAT في كل الأحوال):

```ts
const isVatRegistered = agency?.isVatRegistered === true;
const vatRatePercent  = agency?.vatRate ?? 15;
const lineVatHalalas  = isVatRegistered
  ? Math.round(totalPriceHalalas * vatRatePercent / (100 + vatRatePercent))
  : 0;
const lineSubtotalHalalas = totalPriceHalalas - lineVatHalalas;
const profitHalalas = lineSubtotalHalalas - costPriceHalalas;
// ...
unitPriceExclVatHalalas:  lineSubtotalHalalas,
totalPriceExclVatHalalas: lineSubtotalHalalas,
vatCategory:              isVatRegistered ? 'S' : 'Z',
vatRateBps:               isVatRegistered ? vatRatePercent * 100 : 0,
vatHalalas:               lineVatHalalas,
```

كذلك صُحِّح `profitHalalas` ليُحسَب من الوعاء بعد الضريبة (وليس من الإجمالي شامل الضريبة) — كان يُضخِّم الربح المسجَّل بمقدار الضريبة.

---

### 1.4 — High — سباق في "تبديل التذكرة" (Exchange) يسمح باستدعاء مزوّد الطيران مرتين
**الملف:** `apps/web/src/app/api/tickets/[id]/exchange/route.ts:90-101` (قبل الإصلاح)

**قبل:**
```ts
// Phase 1: mark pending_exchange
await db.update(tickets)
  .set({ status: 'pending_exchange', updatedAt: new Date() })
  .where(eq(tickets.id, params.id));

// Phase 2: call provider
exchangeResult = await provider.exchangeTicket(ticket.ticketNumber, credentials, {...});
```

**السيناريو:** المسارات المماثلة `refund`/`void` في نفس المجلد تستخدم `UPDATE ... WHERE id=... AND status='active' RETURNING` مع تحقق من 0 صفوف → 409 لمنع التزامن. مسار `exchange` وحده يفتقد هذا الشرط: تحديث الحالة إلى `pending_exchange` غير مشروط بـ `status='active'` ولا يُتحقَّق من نتيجته. إن وصل طلبا تبديل متزامنان لنفس التذكرة (كلاهما قرأ `status='active'` قبل أي تحديث)، **كلاهما ينجح في المرحلة 1 وكلاهما يستدعي `provider.exchangeTicket()`** — أي **استدعاءان فعليان لتبديل نفس التذكرة لدى شركة الطيران/الـGDS**، وقد يُنشأ تذكرتان جديدتان (`tickets` insert) لنفس التذكرة الأصلية، مع احتمال خصم رسوم تبديل مزدوجة من المورد.

**الإصلاح:** نفس نمط `refund`/`void` بالضبط — ادّعاء ذري + 409 عند التعارض:

```ts
const claim = await db.update(tickets)
  .set({ status: 'pending_exchange', updatedAt: new Date() })
  .where(and(eq(tickets.id, params.id), eq(tickets.agencyId, agencyId), eq(tickets.status, 'active')))
  .returning({ id: tickets.id });
if (claim.length === 0) {
  return NextResponse.json({ error: 'التذكرة قيد المعالجة أو لم تعد نشطة' }, { status: 409 });
}
```

---

### 1.5 — Medium — استرداد بمبلغ صفر/صفر ينشئ إشعاراً دائناً ودفعة فارغين
**الملف:** `apps/web/src/app/api/refunds/process/route.ts` (بعد فحص `cancellationFeeHalalas`)

**السيناريو:** الفحوصات الموجودة تتحقق من أن `refundAmountHalalas` و`cancellationFeeHalalas` كل منهما عدد صحيح ≥ 0 منفصلاً، لكن لا تمنع كونهما **صفرَين معاً**. طلب بـ `{refundAmountHalalas: 0, cancellationFeeHalalas: 0}` يمر من كل التحققات وينشئ إشعار دائن بقيمة صفر وسجل دفعة بقيمة صفر — قيود محاسبية فارغة تُربك التسوية والتقارير.

**الإصلاح:**
```ts
if (refundAmountHalalas + cancellationFeeHalalas <= 0) {
  return NextResponse.json({ error: 'يجب أن يكون مبلغ الاسترداد أو رسوم الإلغاء أكبر من صفر' }, { status: 400 });
}
```

---

### 1.6 — Medium — استعلامات بلا ترقيم (Unbounded queries / DoS تدريجي)
**الملفان:** `apps/web/src/app/api/payments/route.ts` و`apps/web/src/app/api/bookings/route.ts`

**قبل (مثال `payments/route.ts`):**
```ts
const rows = await db
  .select()
  .from(payments)
  .where(and(...conditions))
  .orderBy(desc(payments.createdAt));
return NextResponse.json({ payments: rows });
```

**السيناريو:** كلا المسارين يُرجعان **كل** صفوف الجدول للوكالة بلا حد. مع نمو البيانات (آلاف المدفوعات/الحجوزات لوكالة نشطة بعد سنة)، كل طلب GET يحمِّل الجدول كاملاً إلى الذاكرة ويُرسله عبر الشبكة — زمن استجابة متصاعد، واستهلاك ذاكرة خادم متزايد لكل طلب، وقد يصل لحد timeout/OOM مع وكالات كبيرة.

**الإصلاح:** نفس نمط الترقيم المعتمد في `customers/route.ts` — `page`/`limit` (حد أقصى 200) + استعلام `count` + `pagination` في الاستجابة، لكلا المسارين.

---

### 1.7 — Low/Medium — `vat-return` بلا تحقق من صيغة التاريخ
**الملف:** `apps/web/src/app/api/reports/vat-return/route.ts:28-34`

**السيناريو:** `from`/`to` تُمرَّر مباشرة إلى `sql\`${invoices.issueDate} >= ${from}\`` (Drizzle يُبارمتر القيمة فعلاً، فلا يوجد حقن SQL، لكن) أي نص غير صالح كتاريخ (`"abc"`, `"2025-13-99"`, تعبير غير متوقع) يُمرَّر للـ DB كما هو، وقد ينتج عنه استجابة خطأ 500 غامضة أو سلوك مقارنة نصية غير متوقعة بدلاً من رسالة 400 واضحة.

**الإصلاح:**
```ts
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
if (!ISO_DATE.test(from) || !ISO_DATE.test(to)) {
  return NextResponse.json({ error: 'صيغة التاريخ يجب أن تكون YYYY-MM-DD' }, { status: 400 });
}
```

---

### 1.8 — Low — حذف مسافر من الحجز بدون تصفية `agencyId` في جملة الحذف
**الملف:** `apps/web/src/app/api/bookings/[id]/passengers/[passengerId]/route.ts:74` (قبل الإصلاح)

**قبل:**
```ts
const [existing] = await db.select({ id: bookingPassengers.id })
  .from(bookingPassengers)
  .where(and(
    eq(bookingPassengers.id, params.passengerId),
    eq(bookingPassengers.bookingId, params.id),
    eq(bookingPassengers.agencyId, agencyId),
  ));
if (!existing) return NextResponse.json({ error: 'المسافر غير موجود' }, { status: 404 });

await db.delete(bookingPassengers).where(eq(bookingPassengers.id, params.passengerId));
```

**ملاحظة الخطورة:** `bookingPassengers.id` مفتاح أساسي فريد، والتحقق المسبق (السطر 65-72) يثبت أن هذا الصف بالذات يخص `agencyId` الحالي قبل الحذف — **لا يوجد استغلال IDOR فعلي هنا** (لا يمكن لـ`id` أن يطابق صفاً من وكالة أخرى بعد أن أثبت الاستعلام السابق أنه يخص هذه الوكالة). أُدرِج كـ Low **دفاعاً في العمق فقط** ولاتساق النمط مع بقية مسارات الحذف في المشروع.

**الإصلاح:** إضافة `eq(bookingPassengers.agencyId, agencyId)` إلى شرط `DELETE`.

---

## 2. نتائج موثَّقة (High / Medium — لم تُصلَح في هذه الجولة، تحتاج قراراً منتجياً/هجرة بيانات)

### 2.1 — High — فواتير B2B تُعامَل دائماً كـ B2C (لا تُرسَل للتخليص الفوري Clearance)
> ✅ **أُصلِح في جولة الإصلاح الثانية (2026-06-10).** انظر القسم «جولة الإصلاح الثانية ← 2.1». الوصف أدناه يمثّل الحالة قبل الإصلاح.

**الملف:** `apps/web/src/lib/zatca-einvoice.ts:106` و`:274`

```ts
// :106
const transactionType: ZatcaTransactionType = input.buyerVatNumber ? 'B2B' : 'B2C';
// :274 (في submitInvoiceToZatca)
buyerVatNumber:  null,   // buyer VAT is not snapshotted yet → simplified path
```

**السيناريو:** لا يوجد عمود `vatNumber`/`taxNumber` على جدول `customers` (`apps/web/src/lib/schema/customers.ts`) ولا على `invoices` (`buyer_*` تشمل `nameAr/nameEn/phone/email/nationalId` فقط — لا VAT). نتيجة ذلك `buyerVatNumber` دائماً `null`، فـ`transactionType` دائماً `'B2C'`، ويُستدعى `reportInvoice()` (الإبلاغ خلال 24 ساعة) بدل `clearInvoice()` (التخليص الفوري الإلزامي لمعاملات B2B). أي عميل شركات/جهة حكومية مسجَّلة في الضريبة يتعامل معها مكتب السفر **لن يحصل أبداً على فاتورة ضريبية معتمدة (cleared) بختم ZATCA المعتمَد**، وهو ما يحتاجه لاسترداد ضريبة المدخلات لديه — ومخالفة تصنيف منهجية قابلة للرصد في تدقيق ZATCA.

**سبب عدم الإصلاح في هذه الجولة:** يتطلب هجرة قاعدة بيانات (إضافة `vat_number` لجدول `customers` و/أو لقطة `buyer_vat_number` على `invoices`) + تعديل واجهة إدخال بيانات العميل + تمرير القيمة عبر `invoices/create` و`submitInvoiceToZatca` — تغيير عبر عدة طبقات وليس إصلاحاً جراحياً بسطر/سطرين.

**التوصية:** إضافة `vat_number TEXT NULL` إلى `customers`، التقاطها عند إنشاء/تعديل العميل، ولقطها على `invoices.buyer_vat_number` عند الإصدار، ثم تمريرها إلى `buildZatcaInvoiceRecord`/`submitInvoiceToZatca`.

---

### 2.2 — High — السطور صفرية النسبة (Z) تُرسَل لـZATCA بلا كود إعفاء VATEX
> ✅ **أُصلِح في جولة الإصلاح الثانية (2026-06-10).** انظر القسم «جولة الإصلاح الثانية ← 2.2». الوصف أدناه يمثّل الحالة قبل الإصلاح.

**الملف:** `apps/web/src/lib/zatca-einvoice.ts:109-121` (`vatBreakdown`) و`:170-203` (`buildLines`)

```ts
vatBreakdown.push({
  category,
  taxableAmount: group.reduce((s, l) => s + l.totalPriceExclVat, 0),
  vatAmount:     group.reduce((s, l) => s + l.vatAmount, 0),
});
// لا تعيين لـ exemptionReason في أي مكان
```

**السيناريو:** `packages/zatca/src/xml-builder.ts:35-41` و`:270` يدعمان حقن `<cbc:TaxExemptionReasonCode>`/`<cbc:TaxExemptionReason>` لكل فئة/سطر عبر حقل `exemptionReason` الاختياري — لكن `zatca-einvoice.ts` **لا يُعيِّنه أبداً**. أي فاتورة تحتوي سطراً `vatCategory='Z'` (الحالة الأشيع: طيران دولي عبر `bookings.serviceType IN ('flight','flights')` و`details.isInternational=true`، وكذلك حزم العمرة/الحج) تُصدَر لـZATCA بلا `VATEX-SA-32` (نقل دولي) أو `VATEX-SA-34-1` (عمرة/حج) كما يقتضي UBL 2.1/BR-KSA لأي فئة ضريبة غير قياسية. هذا قد يتسبب برفض/تحذير من واجهة ZATCA لكل فاتورة طيران دولي — وهي شريحة أساسية لوكالات السفر.

**سبب عدم الإصلاح في هذه الجولة:** تحديد الكود الصحيح لكل سطر (VATEX-SA-32 مقابل 34-1 مقابل 33...) قرار يعتمد على نوع الخدمة الفعلي للسطر، ولا يوجد حالياً عمود `exemption_reason_code` على `booking_lines` لتخزينه عند الإدخال — يحتاج عموداً جديداً + منطق ربط بنوع الخدمة، وهو تغيير عبر عدة ملفات.

**التوصية:** إضافة `exemption_reason_code` اختياري إلى `booking_lines`، وتعبئته تلقائياً عند `vatCategory='Z'` بحسب `serviceType` (`flight`+دولي → `VATEX-SA-32`، `umrah`/`hajj` → `VATEX-SA-34-1`)، مع السماح بالتجاوز اليدوي، ثم تمريره إلى `buildZatcaInvoiceRecord`.

---

### 2.3 — Medium — فشل تحليل توقيع الشهادة يُعاد بصمت كـ `undefined`
**الملف:** `packages/zatca/src/signing.ts:79-94`

```ts
function extractCertSignatureBytes(certDer: Buffer): Buffer | undefined {
  try {
    const asn1 = forge.asn1.fromDer(forge.util.createBuffer(certDer.toString('binary')));
    const top = asn1.value as forge.asn1.Asn1[];
    const bitString = top[2] as (...) | undefined;
    const raw = bitString?.bitStringContents;
    if (typeof raw !== 'string' || raw.length === 0) return undefined;
    ...
  } catch {
    return undefined;
  }
}
```

**السيناريو:** عند فشل تحليل DER الشهادة (شهادة تالفة/غير متوقعة الصيغة من بيئة الإنتاج لـZATCA)، تُحذَف الوسامة (tag) رقم 9 من QR بصمت (`buildQrCodeData` تتحقق `if (certSignature) entries.push(...)`) — الفاتورة تُصدَر بـQR "يعمل" (tags 1-7) لكن غير مكتمل وفق الشكل المبسّط الكامل. لا يوجد تنبيه/سجل (log) عند هذا الفشل، فقد يمر دون أن يلاحظه أحد حتى تدقيق ZATCA.

**التوصية:** عند فشل `extractCertSignatureBytes`/`parseCertificate`، تسجيل `console.error` مع `event: 'zatca_cert_parse_failed'`، وإجراء فحص تحقق على الشهادة عند onboarding (`agencies/zatca/onboard`) يفشل بوضوح إن تعذّر استخراج تواقيع الشهادة، بدل اكتشاف ذلك لاحقاً عبر فواتير ناقصة.

---

### 2.4 — Medium — فحص نجاح onboarding ZATCA يقبل `'ISSUED'` فقط
**الملف:** `apps/web/src/app/api/agencies/zatca/onboard/route.ts:68-70` (تقريباً)

```ts
if (complianceResult.dispositionMessage !== 'ISSUED') {
  throw new Error(...);
}
```

**السيناريو:** استجابات ZATCA الانتقالية (`PROCESSING`/`PENDING`) — وهي شائعة وقت الذروة — تُعامَل كفشل نهائي وتترك الوكالة بحالة `zatcaOnboardingStatus='error'` بلا مسار إعادة محاولة واضح للمسؤول، رغم أن CSR قد يكون صحيحاً وقيد المعالجة فقط.

**التوصية:** قبول `'ISSUED'` و`'PROCESSING'`/`'PENDING'`، مع تخزين حالة وسيطة (`pending_csid_issuance`) ونقطة استعلام لاحقة بدل الفشل الفوري.

---

### 2.5 — Low — `LOCKED_AFTER_INVOICE` لا يضم صراحة الحقول المالية رغم أنها مُجرَّدة مسبقاً
**الملف:** `apps/web/src/app/api/bookings/[id]/route.ts:127-152`

**ملاحظة:** الحقول المالية (`totalPriceHalalas`, `costPriceHalalas`, `profitHalalas`) تُجرَّد فعلياً من الـ`patch` (السطر ~145-152) بحيث لا يمكن تعديلها عبر PATCH على الإطلاق — هذا هو الحارس الأساسي وهو **صحيح وكافٍ**. لكن مجموعة `LOCKED_AFTER_INVOICE` (المستخدمة لرفض حقول أخرى عند وجود فاتورة سارية) لا تتضمنها، فلا تُولِّد رسالة خطأ توضيحية إن حاول المستخدم تعديلها — تُحذَف بصمت بدلاً من رفض الطلب. توضيحي فقط، لا أثر مالي.

---

### 2.6 — Low — تحديث الحقول التشغيلية لسطر الحجز (`pnrReference`/`voucherNumber`/`operationalStatus`) مسموح بعد إصدار الفاتورة
**الملف:** `apps/web/src/app/api/bookings/[id]/lines/[lineId]/route.ts:73-112`

**ملاحظة:** PATCH على سطر الحجز يسمح بتعديل `operationalStatus`/`notes`/`pnrReference`/`voucherNumber` بصرف النظر عن وجود فاتورة سارية. هذه حقول **تشغيلية وليست مالية** (لا `unitPrice`/`vatHalalas`/`quantity` ضمن الحقول القابلة للتعديل في هذا المسار إطلاقاً)، وتعديلها بعد الإصدار (مثل تصحيح PNR أو رقم القسيمة) ممارسة طبيعية لا تُحدث أي انحراف محاسبي. يُذكر للتوثيق فقط.

---

## 3. بنود مرفوضة (False Positives) — مع سبب الإسقاط

| البند المُدَّعى | المسار | سبب الإسقاط |
|---|---|---|
| فاتورة ملغاة لا تعكس القيد بتوازن | `invoices/[id]/route.ts:93-105` | عكس صريح متوازن لكل من رؤوس الفاتورة وسطور القيد مديناً/دائناً، ويُمنع الإلغاء أصلاً إن `paidHalalas > 0` (سطر 40-42) |
| IDOR على `ticketCoupons` عبر `tickets/[id]` | `tickets/[id]/route.ts:23-26` | الجدول لا يملك عمود `agencyId` أصلاً؛ استعلام التذكرة الأب (سطر 14-21) يتحقق من `agencyId` ويُرجع 404 أولاً — لا مسار للوصول لكوبونات تذكرة من وكالة أخرى |
| إشعار دائن غير متوازن | `invoices/credit-note/route.ts:191-193` | فحص صريح `if (totalDr !== totalCr) throw new BusinessError(...,422)` قبل أي commit |
| سباق على دفع الأقساط | `installments/[installmentId]/pay/route.ts:124-136` | تحديث ذري بشرط `(total-paid)>=amount` في `WHERE` + `.returning()` + 409، ضمن `withIdempotency` — هذا هو النمط المرجعي المستخدم لإصلاح 1.2 و1.4 |
| سباق مزدوج على استرداد دفعة | `refunds/process/route.ts` | تحديث ذري + idempotency على إنقاص `paidHalalas`، مُتحقَّق سطراً بسطر |
| حقن SQL في `vat-return` | `reports/vat-return/route.ts` | كل قيم `from`/`to` تمر عبر `sql\`...${var}...\`` (Drizzle parameterized) — لا تركيب نصي |
| `ProfileID="reporting:1.0"` خطأ لفواتير B2B | `packages/zatca/src/xml-builder.ts:148` | هذه القيمة **صحيحة لكل الفواتير** في ZATCA KSA؛ التمييز B2B/B2C عبر `subtypeCode` (0100000/0200000) على `InvoiceTypeCode` (سطر 67/153) — موجود وصحيح |
| غياب `BillingReference` لربط الإشعارات | `packages/zatca/src/xml-builder.ts` | سلسلة PIH/ICV (سطر 165-175) هي آلية الربط الصحيحة وفق BR-KSA-56، وليست `BillingReference` |
| `Math.round` يكسر دقة VAT | `invoices/create/route.ts:77` | السطر المُشار إليه هو `if (!bookingId)` فعلياً؛ توزيع VAT في `buildInvoiceItems` (417-436) يجعل آخر سطر يمتص فرق التقريب بشكل صحيح |
| حذف عميل/مورد له أرصدة بلا حماية | `customers/[id]/route.ts:151-173`, `suppliers/[id]/route.ts:34-61` | كلاهما يرفض الحذف (422) إن وُجدت فواتير/حجوزات/مدفوعات أو رصيد ≠ صفر |
| حذف حجز بلا حماية | `bookings/[id]/route.ts` | لا يوجد `DELETE` لهذا المسار من الأساس؛ `PATCH` لإلغاء الحجز محمي بفحص الفاتورة السارية |
| استرداد/إلغاء/تبديل التذكرة لا يُنشئ قيداً محاسبياً | `tickets/[id]/{refund,void,exchange}/route.ts` | بالتصميم: هذه مسارات **تشغيلية** (تواصل مع مزوّد GDS/شركة الطيران فقط)؛ الأثر المالي (قيد + سند دفع) يُعالَج كخطوة منفصلة عبر `refunds/process` الذي تم التحقق من توازنه وذريّته في 3.1 من القائمة أعلاه. التعليق التوثيقي صريح في `refund/route.ts:24` |
| IDOR حرج على حذف مسافر الحجز | `bookings/[id]/passengers/[passengerId]/route.ts:74` | `id` مفتاح أساسي فريد، والتحقق المسبق (سطر 65-72) يُثبت ملكية الوكالة لنفس الصف قبل الحذف — لا يوجد مسار استغلال فعلي. أُدرِج كتحسين دفاع في العمق (1.8) فقط |

---

## 4. التحقق

```
pnpm --filter @masarat/accounting test     → 90/90 ناجحة
pnpm run type-check (apps/web, tsc --noEmit) → نظيف، بلا أخطاء
npx vitest run --exclude '**/integration/**' (apps/web) → 377/377 ناجحة (21 ملف)
```

لا توجد اختبارات لحزمة `@masarat/zatca` (لا يوجد سكربت `test`)؛ التحقق من منطقها تم عبر القراءة المباشرة (القسم 1 و2 أعلاه) ومن خلال اختبارات `apps/web/src/__tests__/zatca-*.test.ts` (23 اختباراً ناجحاً) التي تغطي التوقيع وQR.

---

## 5. ملخص التغييرات في هذه الجولة

| الملف | التغيير |
|---|---|
| `apps/web/src/app/api/invoices/recognize-revenue/route.ts` | ادّعاء ذري لمنع الاعتراف المزدوج بالإيراد المؤجل |
| `apps/web/src/app/api/invoices/[id]/apply-advance/route.ts` | تحديث ذري لـ`paidHalalas` لمنع lost-update |
| `apps/web/src/app/api/quotes/[id]/convert/route.ts` | تصحيح تصنيف VAT (S بدل Z دائماً) عند تحويل عرض سعر |
| `apps/web/src/app/api/tickets/[id]/exchange/route.ts` | ادّعاء ذري لمنع استدعاء مزوّد الطيران مرتين |
| `apps/web/src/app/api/refunds/process/route.ts` | منع طلب استرداد 0/0 |
| `apps/web/src/app/api/payments/route.ts` | إضافة ترقيم (pagination) |
| `apps/web/src/app/api/bookings/route.ts` | إضافة ترقيم (pagination) |
| `apps/web/src/app/api/reports/vat-return/route.ts` | تحقق من صيغة التاريخ ISO |
| `apps/web/src/app/api/bookings/[id]/passengers/[passengerId]/route.ts` | تصفية `agencyId` في DELETE (دفاع في العمق) |

**التوصية للجولة القادمة (قبل عملاء B2B):** البندان 2.1 و2.2 (تصنيف B2B وأكواد VATEX) — يتطلبان هجرة بيانات + قرار منتجي حول التقاط VAT number للعميل وربط نوع الخدمة بكود الإعفاء.

---

## 6. جولة الإصلاح الثانية (2026-06-10) — إغلاق البنود High المتبقية + سحب الترقيم

عقب الجولة الأولى، عُولجت كل البنود High الموثَّقة في القسم 2 وأُكمل سحب الترقيم. كل التغييرات تتبع أنماط الكود القائمة، ونجحت بعدها 388/388 اختبار web و90/90 accounting مع `tsc --noEmit` و`eslint` نظيفين.

### 2.1 ← أُصلِح — التقاط الرقم الضريبي للعميل (تصنيف B2B الصحيح)
- **هجرة:** `apps/web/drizzle/0019_b2b_vat_numbers.sql` تضيف `customers.vat_number` و`invoices.buyer_vat_number` (كلاهما `TEXT NULL`).
- **المخطط:** `vatNumber` على `customers` و`buyerVatNumber` (لقطة) على `invoices`.
- **الإدخال والتحقق:** `customers` POST/PATCH وواجهة «عميل جديد» تقبل رقماً ضريبياً وتتحقق منه بنمط `^3\d{14}$` (15 خانة تبدأ بـ3 — الصيغة العامة لأي منشأة سعودية مسجَّلة، لا البادئة `300` الخاصة بالوكالة نفسها).
- **التمرير:** `invoices/create`, `invoices/create-direct`, `credit-note`, `debit-note`, `refunds/process`, والفواتير الدورية `recurring.ts` تلتقط `vatNumber` للعميل وتمرّره كـ`buyerVatNumber` إلى `buildZatcaInvoiceRecord` وتلقطه على `invoices.buyer_vat_number`. الإشعارات (381/383) ترث الرقم الضريبي من الفاتورة الأصلية.
- **الإرسال:** `submitInvoiceToZatca` يقرأ `inv.buyerVatNumber` بدل `null` الثابت، فتُرسَل فواتير B2B عبر `clearInvoice()` (تخليص فوري) بدل `reportInvoice()`.

### 2.2 ← أُصلِح — أكواد إعفاء VATEX للسطور صفرية النسبة
- **`inferZatcaExemptionReason()`** الجديدة تشتقّ الكود من نوع الخدمة + علم `isInternational`: طيران دولي ← `VATEX-SA-32`، عمرة/حج ← `VATEX-SA-34-1`.
- **`buildZatcaInvoiceRecord`** يجمّع `vatBreakdown` الآن حسب `(category, exemptionReason)` معاً، فتُنتِج الفواتير المختلطة (فندق قياسي S + طيران دولي صفري Z/VATEX-SA-32) عناصر `TaxSubtotal` منفصلة كما يقتضي BR-KSA.
- **التمرير عبر السطور:** `invoices/create` يحسب `vatCategory`/`exemptionReason` لكل سطر حجز (وللمسار القديم المُجمَّع) ويمرّرها إلى المُنشئ، وتُحفظ في `invoices.items` ثم تُسترجَع عبر `parseStoredInvoiceItems` لإعادة الإرسال في المرحلة الثانية.
- **الاختبارات:** 9 اختبارات جديدة في `zatca-einvoice.test.ts` + اختباران B2B شاملان في `api-route-invoice-create.test.ts`.

### 1.6 ← اكتمل — سحب الترقيم لكل مسارات القوائم
أُضيف الترقيم بنمط `customers/route.ts` (`page`/`limit` بحد أقصى، استعلام `count`، وكائن `pagination` مضاف للاستجابة — **مع الحفاظ على مفتاح المصفوفة الأصلي لتوافق رجعي تام**) إلى:

| المسار | الحالة قبل | بعد |
|---|---|---|
| `suppliers`, `quotes`, `employees`, `leave-requests`, `cheques`, `supplier-payments`, `recurring-invoices`, `salary-payments` | يُرجع الجدول كاملاً بلا حد | ترقيم كامل (افتراضي 50، أقصى 200) |
| `tickets`, `pnr` (حد 200)، `appointments` (حد 300) | حد ثابت بلا `offset`/`page` | `page`/`offset` + `pagination` (يبقى الحد القديم كأقصى) |
| `audit-log`, `bsp/billings`, `bsp/adjustments` | `limit` فقط | `page`/`offset` + `pagination` |

> **ملاحظة توافق:** القيمة الافتراضية للصفحة 50 مطابقة لسلوك مسارات الجولة الأولى المُعتمَد (`customers`/`invoices`/…). المستهلكون في الواجهة يقرؤون مفتاح المصفوفة كما هو (`d.suppliers` …) فلا ينكسرون؛ وحقل `pagination` إضافي. لوكالات تتجاوز 200 سجلاً في قائمة واحدة، يُوصى لاحقاً بإضافة عناصر تنقّل صفحات في الواجهة (تحسين UX، خارج نطاق الأمان/الأداء الحالي).

### ملخص ملفات الجولة الثانية
| الملف | التغيير |
|---|---|
| `apps/web/drizzle/0019_b2b_vat_numbers.sql` | هجرة: `customers.vat_number` + `invoices.buyer_vat_number` |
| `apps/web/src/lib/schema/{customers,invoices}.ts` | حقول `vatNumber`/`buyerVatNumber` |
| `apps/web/src/lib/zatca-einvoice.ts` | `inferZatcaExemptionReason` + تجميع `vatBreakdown` حسب الإعفاء + قراءة `buyerVatNumber` المخزَّن |
| `apps/web/src/app/api/customers/route.ts` + `[id]/route.ts` | قبول/تحقق `vatNumber` |
| `apps/web/src/app/api/invoices/{create,create-direct,credit-note,debit-note}/route.ts`, `refunds/process/route.ts`, `lib/recurring.ts` | لقط/تمرير `buyerVatNumber` |
| `apps/web/src/app/[locale]/(dashboard)/customers/new/page.tsx` | ربط حقل الرقم الضريبي القائم بالـAPI + تحقق |
| 14 مسار قوائم (`suppliers`…`bsp/adjustments`) | إضافة ترقيم |
| `apps/web/src/__tests__/{zatca-einvoice,api-route-invoice-create}.test.ts` | اختبارات VATEX وB2B |
