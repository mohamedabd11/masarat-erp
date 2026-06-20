# الطور 2: دورة حياة الحجز — 40 سيناريو

> **المدقق:** Claude | **التاريخ:** 2026-06-18  
> **المنهج:** قراءة كود مباشرة + تتبع المسارات — بدون وكلاء فرعيين  
> **النطاق:** Booking → Invoice → Payment → Refund/Credit/Debit → Payment Plans

---

## ملخص تنفيذي

| الخطورة | العدد |
|---------|-------|
| HIGH    | 1     |
| MEDIUM  | 4     |
| LOW     | 2     |
| INFO    | 8     |

---

## الجزء أ: سيناريوهات الحجز (1–10)

### سيناريو 1: إنشاء حجز بخطوط خدمة
**الملف:** `apps/web/src/app/api/bookings/create/route.ts:184-258`

- إنشاء الحجز + booking_lines ذرياً داخل transaction ✅
- لا يُنشئ قيد يومية عند الحجز (صحيح حسب IFRS 15 — لا يوجد التزام أداء بعد) ✅
- المجاميع مشتقة من الخطوط:
```typescript
const derivedTotal  = preparedLines.reduce((s, l) => s + l.totalPriceExclVatHalalas + l.vatHalalas, 0);
const derivedCost   = preparedLines.reduce((s, l) => s + l.totalCostHalalas, 0);
const derivedProfit = derivedTotal - derivedCost;
```
- التحقق من نوع الخدمة / فئة الضريبة / نموذج الإيراد ✅
- Rate limiting + Audit logging ✅

**الحكم:** سليم

---

### سيناريو 2: إنشاء حجز بدون خطوط (مسار تراثي)
**الملف:** `apps/web/src/app/api/bookings/create/route.ts:146-175`

عند عدم تمرير `lines[]`، يُشتق خط افتراضي واحد من `pricing`:
```typescript
preparedLines = [{
  serviceType,
  description: SERVICE_LABEL_AR[serviceType] ?? serviceType,
  unitPriceExclVatHalalas:  priceExclVat,
  vatHalalas:               vatAmountHalalas,
  ...
}];
```
كل حجز جديد يحمل على الأقل خط واحد غير تراثي (`isLegacy: false`) مما يُفعّل المسار الجديد للفوترة.

**الحكم:** سليم

---

### سيناريو 3–7: آلة حالة الحجز (State Machine)
**الملف:** `apps/web/src/app/api/bookings/[id]/route.ts:84-99`

```
draft     → [confirmed, cancelled]
confirmed → [completed, cancelled]
completed → []  (terminal)
cancelled → []  (terminal)
```

| القاعدة | الملف:السطر | الحكم |
|---------|-------------|-------|
| الانتقالات المسموحة فقط | `:87-93` | ✅ |
| الحالات النهائية لا تقبل تغيير | `:92-93` (مصفوفة فارغة) | ✅ |
| حجب الإلغاء مع فاتورة سارية | `:106-123` | ✅ |
| إلغاء يُلغي booking_lines بالتعاقب | `:160-169` | ✅ |
| الحقول المالية محمية من التعديل المباشر | `:145-148` (STRIP set) | ✅ |

**الحكم:** سليم

---

### سيناريو 8: إضافة خطوط بعد الفوترة
**الملف:** `apps/web/src/app/api/bookings/[id]/lines/route.ts:64-81`

```typescript
const [liveInvoice] = await db.select({ id: invoices.id })
  .from(invoices)
  .where(and(
    eq(invoices.bookingId, booking.id),
    ne(invoices.status, 'cancelled'),
  ))
  .limit(1);
if (liveInvoice) {
  return NextResponse.json({ error: '...' }, { status: 422 });
}
```
يحجب أي فاتورة غير ملغاة (بما فيها المسودة).

**الحكم:** سليم

---

### سيناريو 9: إلغاء خط خدمة
**الملف:** `apps/web/src/app/api/bookings/[id]/lines/[lineId]/route.ts`

- يتطلب دور manager+ ✅
- يحجب الإلغاء مع وجود فاتورة سارية ✅
- لا يُحدّث مجاميع الحجز — مخاطر محدودة لأن الفاتورة تُبنى من الخطوط الفعلية

**الحكم:** سليم

---

### سيناريو 10: تعديل حقول مقفلة بعد الفاتورة
**الملف:** `apps/web/src/app/api/bookings/[id]/route.ts:127-140`

```typescript
const LOCKED_AFTER_INVOICE = new Set(['serviceType', 'customerId', 'details']);
```
يُفحص وجود أي فاتورة (ولو ملغاة) — أوسع من اللازم لكنه آمن.

**الحكم:** سليم (تحفظي)

---

## الجزء ب: سيناريوهات الفوترة (11–17)

### سيناريو 11: إصدار فاتورة — المسار الجديد (booking_lines)
**الملف:** `apps/web/src/app/api/invoices/create/route.ts:524-574`

`buildJournalLinesFromBookingLines()` يعالج:
- فصل agent/principal ✅
- DR AR / CR AP+Revenue (agent) و DR AR / CR Revenue (principal) ✅
- DR COGS / CR AP عند وجود تكلفة ✅
- VAT per-line (mixed supply) ✅
- Deferred revenue (3201) ✅
- Supplier subledger increment ✅

**ملاحظة (مُبلَّغ في الطور 1 — 1-a-2):** معالجة فرق التقريب غير محددة السقف:
```typescript
// سطر 569
if (lastCr) lastCr.cr += totalDr - totalCr;
```

**الحكم:** يعمل بشكل صحيح مع تحفظ التقريب المُبلَّغ سابقاً

---

### سيناريو 12: إصدار فاتورة — المسار التراثي
**الملف:** `apps/web/src/app/api/invoices/create/route.ts:576-617`

`buildInvoiceJournalLines()` — مسار احتياطي للحجوزات بدون booking_lines:
- Agent: DR AR / CR AP / CR Revenue / CR VAT ✅
- Principal: DR AR / CR Revenue / CR VAT + (DR COGS / CR AP) ✅
- Margin scheme: VAT على الهامش فقط ✅

**الحكم:** سليم

---

### سيناريو 13: فاتورة مباشرة (بدون حجز)

> **النتيجة 2-b-1 | MED | فاتورة مباشرة بدون حماية idempotency**

**الملف:** `apps/web/src/app/api/invoices/create-direct/route.ts`  
**الكود:**
```typescript
// الملف بأكمله — لا يوجد withIdempotency أو markIdempotencyComplete
const result = await db.transaction(async (tx: Tx) => {
  // ...
  return { id: invId, invoiceNumber };
});
```
**Grep verification:**
```
grep -n "idempotency" apps/web/src/app/api/invoices/create-direct/route.ts
→ (لا نتائج)
```
**السيناريو:** إعادة إرسال الطلب بسبب انقطاع الشبكة يُنشئ فاتورة مكررة بقيد يومية مكرر — مضاعفة AR والإيراد.

**الأثر المالي:** فاتورة مكررة = ذمم مدينة مكررة + إيراد مكرر.

**الإصلاح المقترح:** إضافة `withIdempotency` + `markIdempotencyComplete` كما في `invoices/create/route.ts`.

---

### سيناريو 14: منع فاتورة مكررة لنفس الحجز
**الملف:** `apps/web/src/app/api/invoices/create/route.ts:110-113`

```typescript
const [existingInvoice] = await tx.select({ id: invoices.id }).from(invoices).where(
  and(eq(invoices.bookingId, bookingId), eq(invoices.agencyId, agencyId)),
).limit(1);
if (existingInvoice) throw new BusinessError('...', 409);
```
يُفحص صريحاً + unique constraint على مستوى قاعدة البيانات (23505).

**الحكم:** سليم — دفاع مزدوج

---

### سيناريو 15: حد الائتمان
**الملف:** `apps/web/src/app/api/invoices/create/route.ts:177-199`

- يحسب الرصيد المستحق الحالي ✅
- يضيف الفاتورة الجديدة ✅
- يُقارن بالحد ✅
- يستثني المدفوعة والملغاة ✅

**الحكم:** سليم

---

### سيناريو 16: إيراد مؤجل (IFRS 15)
**الملف:** `apps/web/src/app/api/invoices/create/route.ts:216-221`

```typescript
const DEFERRABLE_SERVICE_TYPES = new Set(['umrah', 'hajj', 'package', 'packages']);
const isDeferrable   = DEFERRABLE_SERVICE_TYPES.has(booking.serviceType ?? '');
const isFutureTravel = travelDate != null && travelDate > today;
const deferRevenue   = isDeferrable && isFutureTravel;
```
Cr 3201 (Deferred Revenue) بدلاً من Cr 4100 ✅

**الحكم:** سليم

---

### سيناريو 17: إثبات الإيراد المؤجل
**الملف:** `apps/web/src/app/api/invoices/recognize-revenue/route.ts:61-108`

- Atomic claim: `WHERE revenueRecognizedAt IS NULL` ✅
- Dr 3201 / Cr 4100 ✅
- يستخدم `GL.revenuePrincipal` دائماً — صحيح لأن agent-model لا يُؤجَّل حالياً ✅
- Period lock ✅

**الحكم:** سليم

---

## الجزء ج: سيناريوهات التحصيل (18–26)

### سيناريو 18–19: تسجيل دفعة على فاتورة
**الملف:** `apps/web/src/app/api/payments/record/route.ts`

- Idempotency ✅
- Period lock ✅
- Fast-fail overpayment check (سطر 66-68) ✅
- Atomic overpayment guard (سطر 122-133):
```typescript
.where(and(
  eq(invoices.id, invoiceId),
  sql`(${invoices.totalHalalas} - ${invoices.paidHalalas}) >= ${amountHalalas}`,
))
```
- Status transition: `partial` → `paid` ✅
- يحدث booking.paidHalalas عبر `invoice.bookingId` (موثوق) وليس `body.bookingId` ✅
- يحجب الدفع على فاتورة ملغاة/مستردة/مُصدر بها إشعار دائن ✅

**الحكم:** سليم — نموذجي

---

### سيناريو 20: منع الدفع الزائد
**الملف:** `apps/web/src/app/api/payments/record/route.ts:66-68`

```typescript
if (amountHalalas > currentDue) {
  throw new BusinessError(`المبلغ يتجاوز المستحق`, 400);
}
```
+ atomic WHERE guard يمنع الحالة التنافسية.

**الحكم:** سليم

---

### سيناريو 21–22: سند قبض (وديعة / مرتبط بفاتورة)

> **النتيجة 2-c-1 | HIGH | سند القبض: تحديث paidHalalas بدون حماية ذرية**

**الملف:** `apps/web/src/app/api/receipts/create/route.ts:88-96`  
**الكود المعيب:**
```typescript
const newPaid = inv.paidHalalas + amountHalalas;
await tx.update(invoices)
  .set({
    paidHalalas: newPaid,
    status:      newPaid >= inv.totalHalalas ? 'paid' : inv.status,
    updatedAt:   now,
  })
  .where(eq(invoices.id, invoiceId));
```
**الكود الصحيح (كما في payments/record):**
```typescript
paidHalalas: sql`${invoices.paidHalalas} + ${amountHalalas}`,
.where(and(
  eq(invoices.id, invoiceId),
  sql`(${invoices.totalHalalas} - ${invoices.paidHalalas}) >= ${amountHalalas}`,
))
```

**السيناريو:** محاسبان يُنشئان سندي قبض لنفس الفاتورة في نفس اللحظة:
1. TX A يقرأ `paidHalalas = 0`، يحسب `newPaid = 5000`
2. TX B يقرأ `paidHalalas = 0`، يحسب `newPaid = 3000`
3. TX A يكتب `paidHalalas = 5000` ✓
4. TX B يكتب `paidHalalas = 3000` ← يمحو دفعة TX A

**الأثر المالي:** ضياع تسجيل دفعة (lost update) — الفاتورة تُظهر مبلغاً أقل من المسدد فعلياً، والعميل يطالَب بالفرق بدون وجه حق.

**الإصلاح المقترح:**
```typescript
const [updatedInv] = await tx.update(invoices)
  .set({
    paidHalalas: sql`${invoices.paidHalalas} + ${amountHalalas}`,
    status: sql`CASE WHEN ${invoices.paidHalalas} + ${amountHalalas} >= ${invoices.totalHalalas} THEN 'paid' ELSE 'partial' END`,
    updatedAt: now,
  })
  .where(and(
    eq(invoices.id, invoiceId),
    sql`(${invoices.totalHalalas} - ${invoices.paidHalalas}) >= ${amountHalalas}`,
  ))
  .returning({ paidHalalas: invoices.paidHalalas });
if (!updatedInv) throw new BusinessError('تعارض متزامن', 409);
```

---

### سيناريو 23: تطبيق دفعة مقدمة على فاتورة
**الملف:** `apps/web/src/app/api/invoices/[id]/apply-advance/route.ts`

- Atomic invoice update مع WHERE guard (سطر 113-124) ✅
- Atomic voucher claim مع WHERE `isNull(invoiceId)` (سطر 133-141) ✅
- Customer cross-check (سطر 59-61) ✅
- Period lock + Audit logging ✅

**الحكم:** سليم — نموذجي

---

### سيناريو 24: تطبيق وديعة على فاتورة (apply)

> **النتيجة 2-c-2 | MED | تطبيق وديعة: تحديث paidHalalas بدون حماية ذرية**

**الملف:** `apps/web/src/app/api/receipts/[id]/apply/route.ts:88-95`  
**الكود:**
```typescript
const newPaid = inv.paidHalalas + amount;
await tx.update(invoices)
  .set({
    paidHalalas: newPaid,
    status:      newPaid >= inv.totalHalalas ? 'paid' : inv.status,
    updatedAt:   now,
  })
  .where(and(eq(invoices.id, invoiceId), eq(invoices.agencyId, agencyId)));
```

**نفس المشكلة في 2-c-1** — read-then-write بدون WHERE guard. الحماية الوحيدة هي أن الوديعة نفسها لا يمكن تطبيقها مرتين (voucher.invoiceId claim). لكن وديعتين مختلفتين مُطبَّقتين على نفس الفاتورة متزامنًا → lost update.

**الأثر المالي:** مماثل ل 2-c-1 — ضياع تسجيل دفعة.

**الإصلاح المقترح:** نفس النمط الذري في `apply-advance/route.ts`.

---

### سيناريو 25–26: عكس سند قبض

> **النتيجة 2-c-3 | LOW | عكس سند القبض: تحديث paidHalalas بدون حماية ذرية**

**الملف:** `apps/web/src/app/api/receipts/[id]/reverse/route.ts:103-113`  
**الكود:**
```typescript
const newPaid = Math.max(0, (inv.paidHalalas ?? 0) - amountHalalas);
await tx.update(invoices)
  .set({ paidHalalas: newPaid, status: newStatus, updatedAt: now })
  .where(eq(invoices.id, orig.invoiceId));
```

**نفس النمط:** read-then-write. لكن الخطورة أقل لأن:
1. العملية محصورة بدور admin فقط
2. كل سند قبض يُعكس مرة واحدة فقط (unique index)
3. عكس سندين مختلفين على نفس الفاتورة بشكل متزامن نادر جداً

**الإصلاح المقترح:** `paidHalalas: sql\`GREATEST(0, ${invoices.paidHalalas} - ${amountHalalas})\``

---

## الجزء د: سيناريوهات الاسترداد والإشعارات (27–33)

### سيناريو 27: استرداد كامل
**الملف:** `apps/web/src/app/api/refunds/process/route.ts`

| الحماية | السطر | الحكم |
|---------|-------|-------|
| Idempotency | `:58` | ✅ |
| Period lock | `:107` | ✅ |
| Atomic refund claim | `:243-258` | ✅ |
| Supplier subledger decrement | `:266-284` | ✅ |
| Cascade cancel booking + lines | `:288-303` | ✅ |
| ZATCA credit note (381) | `:143-167` | ✅ |
| buildRefundJournalLines — pro-rata reversal | `:128-138` | ✅ |

**الحكم:** سليم

---

### سيناريو 28: استرداد جزئي
**الملف:** `apps/web/src/app/api/refunds/process/route.ts:304-311`

```typescript
await tx.update(bookings)
  .set({
    paidHalalas: sql`GREATEST(0, ${bookings.paidHalalas} - ${refundAmountHalalas})`,
    updatedAt: now,
  })
  .where(and(eq(bookings.id, bookingId), eq(bookings.agencyId, agencyId)));
```
- الحجز يبقى active ✅
- paidHalalas يُنقَص ✅
- GREATEST(0, ...) يمنع القيم السالبة ✅

**الحكم:** سليم

---

### سيناريو 29: استرداد مع رسوم إلغاء
**الملف:** `apps/web/src/lib/refund-journal.ts:90-95`

```typescript
const cancelFeeVat    = isEInvoice ? Math.round(originalVatHalalas * cancellationFeeHalalas / denom) : 0;
const cancelFeeNet    = cancellationFeeHalalas - cancelFeeVat;
const vatReversalBase = cancelledTotal - cancellationFeeHalalas;
const vatRev          = Math.round(originalVatHalalas * vatReversalBase / denom);
```
- رسوم الإلغاء تبقى إيراداً (Cr 4200) ✅
- ضريبة الرسوم تبقى في 2200 ✅
- الضريبة تُعكس فقط على الجزء المسترد ✅

**الحكم:** سليم

---

### سيناريو 30: استرداد فاتورة مدفوعة جزئياً
**الملف:** `apps/web/src/lib/refund-journal.ts:97-103`

```typescript
const arVoid = cancelledTotal - refundAmountHalalas - cancellationFeeHalalas;
if (arVoid < 0) {
  throw new BusinessError('...', 400);
}
```
- الجزء غير المدفوع (AR المفتوح) يُشطب (Cr 1120) ✅
- النقد المسترد (Cr 1110 Bank) ✅
- رسوم الإلغاء (Cr 4200) ✅

**الحكم:** سليم

---

### سيناريو 31: إشعار دائن (Credit Note)
**الملف:** `apps/web/src/app/api/invoices/credit-note/route.ts`

- Idempotency ✅
- Period lock ✅
- Balance assertion ✅
- Resolves GL from original journal ✅
- ZATCA type 381 ✅

**الحكم:** سليم (مع تحفظ 1-a-1 من الطور 1 — binary AR/Deposits split)

---

### سيناريو 32: إشعار دائن — سقف تراكمي
**الملف:** `apps/web/src/app/api/invoices/credit-note/route.ts:72-86`

```typescript
const alreadyCredited = Number(agg?.s ?? 0);
if (alreadyCredited + totalEarly > originalInvoice.totalHalalas) {
  throw new BusinessError('إجمالي الإشعارات الدائنة يتجاوز قيمة الفاتورة الأصلية', 422);
}
fullyCredited = alreadyCredited + totalEarly >= originalInvoice.totalHalalas;
```
- يمنع تجاوز قيمة الفاتورة الأصلية ✅
- يُعلّم الفاتورة `credit_noted` عند الاكتمال ✅

**الحكم:** سليم

---

### سيناريو 33: إشعار مدين (Debit Note)
**الملف:** `apps/web/src/app/api/invoices/debit-note/route.ts`

- Dr AR / Cr Revenue / Cr VAT ✅
- Resolves GL from original journal ✅
- Balance assertion ✅
- ZATCA type 383 ✅
- Period lock ✅
- Audit logging ✅

> **النتيجة 2-d-1 | MED | إشعار مدين بدون idempotency** (مُبلَّغ سابقاً في الطور 1 كـ 1-d-2)

**الحكم:** يعمل بشكل صحيح مع التحفظ المُبلَّغ

---

## الجزء هـ: سيناريوهات إلغاء الفاتورة (34–35)

### سيناريو 34: إلغاء فاتورة غير مدفوعة
**الملف:** `apps/web/src/app/api/invoices/[id]/route.ts:44-106`

- Atomic cancel claim (سطر 52-63) ✅
- يعكس جميع القيود المرتبطة (source='invoice') ✅
- يحجب إلغاء فاتورة مدفوعة ✅
- Period lock ✅
- Audit logging ✅

```typescript
const claim = await tx.update(invoices)
  .set({ status: 'cancelled' })
  .where(and(
    eq(invoices.id, params.id),
    ne(invoices.status, 'cancelled'),
    eq(invoices.paidHalalas, 0),
  ))
  .returning({ id: invoices.id });
```

**الحكم:** سليم

---

### سيناريو 35: منع إلغاء فاتورة مدفوعة
**الملف:** `apps/web/src/app/api/invoices/[id]/route.ts:40-42`

```typescript
if (invoice.status === 'paid' || invoice.paidHalalas > 0) {
  return NextResponse.json({ error: '...' }, { status: 409 });
}
```

**الحكم:** سليم — يتطلب إشعار دائن بدلاً من ذلك

---

## الجزء و: سيناريوهات خطة الأقساط (36–40)

### سيناريو 36: إنشاء خطة أقساط
**الملف:** `apps/web/src/app/api/bookings/[id]/payment-plan/route.ts:48-158`

| الحماية | السطر | الحكم |
|---------|-------|-------|
| حجز غير ملغى | `:58-60` | ✅ |
| فاتورة سارية مطلوبة | `:63-73` | ✅ |
| رصيد متبقي > 0 | `:75-78` | ✅ |
| خطة واحدة نشطة لكل حجز | `:81-91` | ✅ |
| 2-24 قسط | `:95-97` | ✅ |
| تاريخ أول قسط مستقبلي | `:99-106` | ✅ |
| توزيع المبلغ مع باقي في القسط الأخير | `payment-plans.ts:43-50` | ✅ |

**الحكم:** سليم

---

### سيناريو 37: دفع قسط
**الملف:** `apps/web/src/app/api/bookings/[id]/payment-plan/installments/[installmentId]/pay/route.ts`

| الحماية | السطر | الحكم |
|---------|-------|-------|
| Idempotency (server-derived per installment) | `:34` | ✅ |
| Period lock | `:41` | ✅ |
| يحجب فاتورة ملغاة/مستردة | `:61-63` | ✅ |
| يحجب حجز ملغى | `:69-71` | ✅ |
| Atomic overpayment guard | `:127-139` | ✅ |
| Atomic installment status flip | `:150-159` | ✅ |

```typescript
// Idempotency key مشتق من المُعرّف — يمنع دفع نفس القسط مرتين
const idempKey = `inst-pay-${installmentId}`;
```

**الحكم:** سليم — نموذجي

---

### سيناريو 38: إكمال خطة الأقساط
**الملف:** `apps/web/src/app/api/bookings/[id]/payment-plan/installments/[installmentId]/pay/route.ts:162-182`

```typescript
const allPaidNow = (await tx.select(...)
  .from(paymentPlanInstallments)
  .where(...))
  .every((r) => r.status === 'paid' || r.id === installmentId);

if (allPaidNow) {
  await tx.update(paymentPlans)
    .set({ status: 'completed', updatedAt: now })
    .where(...);
}
```

**الحكم:** سليم

---

### سيناريو 39: إلغاء خطة الأقساط
**الملف:** `apps/web/src/app/api/bookings/[id]/payment-plan/route.ts:161-187`

- Manager+ role ✅
- يُعلّم الخطة `cancelled` فقط — الأقساط المدفوعة سابقاً لا تتأثر ✅

> **النتيجة 2-f-1 | MED | خطة الأقساط لا تُلغى تلقائياً عند استرداد الفاتورة**

**الملف:** `apps/web/src/app/api/refunds/process/route.ts`  
**Grep verification:**
```
grep -n "paymentPlan" apps/web/src/app/api/refunds/process/route.ts
→ (لا نتائج)
```
**السيناريو:** استرداد كامل → الحجز يُلغى + الفاتورة تُسترد، لكن خطة الأقساط تبقى `active` مع أقساط `pending`. المحاسب يرى أقساط مستحقة على حجز ملغى.

**الأثر:** لا أثر مالي مباشر (دفع القسط يُرفض بسبب حالة الفاتورة)، لكن ارتباك تشغيلي وتقارير أقساط مضللة.

**الإصلاح المقترح:** في `refunds/process/route.ts`، بعد إلغاء الحجز:
```typescript
await tx.update(paymentPlans)
  .set({ status: 'cancelled', updatedAt: now })
  .where(and(
    eq(paymentPlans.bookingId, bookingId),
    eq(paymentPlans.agencyId, agencyId),
    eq(paymentPlans.status, 'active'),
  ));
```

---

### سيناريو 40: تحديث حالة الأقساط المتأخرة
**الملف:** `apps/web/src/lib/payment-plans.ts:5-20`

```typescript
export async function markOverdueInstallments(now: Date) {
  const result = await db.update(paymentPlanInstallments)
    .set({ status: 'overdue', updatedAt: now })
    .where(and(
      eq(paymentPlanInstallments.status, 'pending'),
      lt(paymentPlanInstallments.dueDate, today),
    ))
    .returning({ id: paymentPlanInstallments.id });
}
```
- يُعلّم الأقساط المتأخرة فقط إذا كانت `pending` ✅
- لا يُرسل إشعارات — يعتمد على route إشعارات منفصل ✅

**الحكم:** سليم

---

## الجزء ز: نتائج إضافية عرضية

> **النتيجة 2-g-1 | MED | تعديل الحجز (PATCH) بدون سجل تدقيق**

**الملف:** `apps/web/src/app/api/bookings/[id]/route.ts:56-177`  
**Grep verification:**
```
grep -n "logAudit" apps/web/src/app/api/bookings/[id]/route.ts
→ (لا نتائج)
```
**السيناريو:** تغيير حالة الحجز (بما فيها الإلغاء) لا يُسجَّل في سجل التدقيق. يُقارَن بـ:
- `bookings/create/route.ts` ← يحتوي `logAudit` ✅
- `invoices/[id]/route.ts` PATCH ← يحتوي `logAudit` ✅

**الأثر:** عدم القدرة على تتبع من ألغى حجزاً أو متى تم تغيير حالته — ثغرة في مسار التدقيق.

**الإصلاح المقترح:** إضافة `logAudit` بعد نجاح المعاملة.

---

> **النتيجة 2-g-2 | LOW | حجب إضافة خطوط الحجز لا يمنع التعديلات على الخطوط الموجودة**

**الملف:** `apps/web/src/app/api/bookings/[id]/lines/[lineId]/route.ts`  
**السياق:** الحجب يمنع إضافة خطوط جديدة بعد الفوترة، لكن تعديل الحقول التشغيلية (operationalStatus، notes، pnrReference، voucherNumber) مسموح حتى بعد الفوترة.

**الحكم:** مقبول — الحقول المعدّلة تشغيلية وليست مالية.

---

## ملخص النتائج

| # | الخطورة | الوصف | الملف |
|---|---------|-------|-------|
| 2-c-1 | **HIGH** | سند القبض: lost update على paidHalalas | `receipts/create/route.ts:88-96` |
| 2-b-1 | MED | فاتورة مباشرة بدون idempotency | `invoices/create-direct/route.ts` |
| 2-c-2 | MED | تطبيق وديعة: lost update على paidHalalas | `receipts/[id]/apply/route.ts:88-95` |
| 2-f-1 | MED | خطة الأقساط لا تُلغى عند الاسترداد | `refunds/process/route.ts` |
| 2-g-1 | MED | تعديل الحجز بدون سجل تدقيق | `bookings/[id]/route.ts:56-177` |
| 2-c-3 | LOW | عكس سند القبض: lost update (admin only) | `receipts/[id]/reverse/route.ts:103-113` |
| 2-g-2 | LOW | خطوط الحجز: تعديل تشغيلي بعد الفوترة | `bookings/[id]/lines/[lineId]/route.ts` |

## نقاط قوة مؤكدة

| # | الوصف |
|---|-------|
| INFO-1 | آلة حالة الحجز تمنع الانتقالات غير المسموحة + الحالات النهائية |
| INFO-2 | إنشاء الحجز لا يُنشئ قيد يومية (IFRS 15 صحيح) |
| INFO-3 | الحجب المالي بعد الفوترة يحمي من تعديل خطوط الحجز |
| INFO-4 | تسجيل الدفعة (payments/record) نموذجي: idempotency + atomic WHERE |
| INFO-5 | دفع الأقساط: idempotency key مشتق من المُعرّف يمنع الدفع المزدوج |
| INFO-6 | الاسترداد يعكس القيد الأصلي pro-rata ويعالج mixed supply |
| INFO-7 | حد الائتمان يُفحص عند إصدار الفاتورة |
| INFO-8 | IFRS 15 deferred revenue → recognition lifecycle مكتمل |

---

> **تقييم الطور 2:** النظام يُظهر نضجاً واضحاً في إدارة دورة حياة الحجز. المشكلة الوحيدة عالية الخطورة (2-c-1) هي نمط read-then-write في سندات القبض، وهي مُصلحة بالفعل في مسار الدفعات (`payments/record`). الإصلاح يتطلب نقل النمط الذري نفسه.

---

*انتهى الطور 2. الطور التالي: الطور 3 — الضرائب والامتثال ZATCA.*
