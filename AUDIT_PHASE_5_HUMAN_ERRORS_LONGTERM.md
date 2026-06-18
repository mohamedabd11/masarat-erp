# الطور 5 — الأخطاء البشرية والعمليات طويلة المدى

**التاريخ:** 2026-06-18
**النطاق:** إقفال الفترات، الفواتير الدورية، إعادة تقييم العملات، إعادة التعرّف على الإيرادات، خطط الدفع، التذاكر المعلقة، حذف البيانات، الأخطاء البشرية

---

## الفهرس

| # | الموضوع | الخطورة | الحالة |
|---|---------|---------|--------|
| 5-a-1 | فتح فترة مقفلة سابقاً لا يعكس قيد الإقفال السنوي | MED | خطر محاسبي |
| 5-a-2 | عدم وجود تصدير بيانات (CSV/Excel) لأي كيان مالي | LOW | نقص وظيفي |
| 5-b-1 | الإقفال السنوي يتطلب إقفال كل الأشهر (1-11) قبل ديسمبر | INFO ✅ | مُجتاز |
| 5-b-2 | `assertPeriodOpen` — يحظر الفترات الضمنية المقفلة | INFO ✅ | مُجتاز |
| 5-b-3 | الفواتير الدورية — race-safe مع claim ذري | INFO ✅ | مُجتاز |
| 5-b-4 | التعرف على الإيراد المؤجل — cron يومي مع claim ذري | INFO ✅ | مُجتاز |
| 5-b-5 | إعادة تقييم العملات — IAS 21 مع حماية تكرار ذرية | INFO ✅ | مُجتاز |
| 5-b-6 | خطط الدفع — تحويل أقساط متأخرة تلقائياً | INFO ✅ | مُجتاز |
| 5-b-7 | تذاكر معلقة — reconciliation مع orphan policy ذكية | INFO ✅ | مُجتاز |
| 5-b-8 | حذف بيانات الوكالة — super admin فقط + trial فقط + تأكيد الاسم | INFO ✅ | مُجتاز |
| 5-b-9 | Year-end closing entry — idempotent | INFO ✅ | مُجتاز |
| 5-c-1 | FX revaluation يشمل bank/cash فقط — لا AR/AP | INFO | توثيق واعٍ |

**الملخص:** 0 HIGH / 1 MED / 1 LOW / 10 INFO

---

## 5-a-1 [MED] — فتح فترة مقفلة سابقاً لا يعكس قيد الإقفال السنوي

**الملف:** `apps/web/src/app/api/accounting/periods/route.ts:184-233`

**الكود الفعلي:**
```typescript
await tx.insert(accountingPeriods)
  .values({
    // ...
    isLocked: body.isLocked,
    // ...
  })
  .onConflictDoUpdate({
    target: [...],
    set: {
      isLocked:  body.isLocked,   // يمكن إعادته إلى false
      // ...
    },
  });

// Year-end closing only fires when locking December
if (body.isLocked && body.month === 12) {
  // ... check all months locked, then create closing entry
}
```

**السيناريو الواقعي:**
1. المحاسب يقفل كل الأشهر (يناير-ديسمبر) → يُنشأ قيد الإقفال السنوي (Dr Revenue/Cr Expense → Retained Earnings 3200)
2. يكتشف خطأ في مارس → يفتح مارس (`isLocked = false`) ← **مسموح**
3. يُعدّل قيوداً في مارس
4. يُعيد إقفال مارس ← لكن **لا يُحدّث قيد الإقفال السنوي** لأن الـ idempotency check يجد القيد القديم:

```typescript
const [existing] = await tx.select({ id: journalEntries.id })
  .from(journalEntries)
  .where(and(
    eq(journalEntries.source, 'closing'),
    sql`date >= ${yearStart} AND date <= ${yearEnd}`,
  )).limit(1);
if (existing) return; // ← يتخطى لأن القيد القديم موجود
```

**الأثر المالي:**
- قيد الإقفال السنوي يعكس أرقام ما قبل التعديل
- الأرباح المحتجزة (3200) خاطئة
- قائمة الدخل للسنة التالية تبدأ بأرصدة غير صفرية في حسابات P&L

**الإصلاح المقترح:**
عند إعادة إقفال ديسمبر بعد فتحه:
1. حذف أو عكس قيد الإقفال القديم
2. إعادة حساب وإنشاء قيد إقفال جديد
أو: تعديل الـ idempotency check ليتحقق من أن أرقام القيد الحالي تتطابق مع الأرقام المُحسوبة.

---

## 5-a-2 [LOW] — عدم وجود تصدير بيانات (CSV/Excel) لأي كيان مالي

**البحث:**
```
grep -ri "csv\|excel\|export\|download" apps/web/src/app/api/ --include="route.ts"
→ لا نتائج (export في سياقات مختلفة — re-export modules فقط)
```

**السيناريو:**
المحاسب يحتاج تصدير:
- ميزان المراجعة
- قائمة الدخل
- تقرير الأعمار (Aging)
- إقرار VAT
- دفتر الأستاذ
- قائمة الفواتير

كل هذه التقارير متاحة كـ JSON API فقط. لا يوجد endpoint يُرجع CSV أو PDF.

**الأثر:**
- المحاسب يضطر لنسخ البيانات يدوياً
- المراجع الخارجي يحتاج بيانات بصيغة قابلة للتحليل
- ZATCA قد تطلب تقارير بصيغ محددة

**الإصلاح المقترح:**
إضافة query parameter `?format=csv` أو `?format=xlsx` للتقارير المالية الرئيسية.

---

## 5-b-1 [INFO ✅] — الإقفال السنوي يتطلب إقفال كل الأشهر (1-11) قبل ديسمبر

**الملف:** `apps/web/src/app/api/accounting/periods/route.ts:211-230`

```typescript
if (body.isLocked && body.month === 12) {
  const lockedRows = await tx.select(...)
    .where(and(
      eq(accountingPeriods.agencyId, agencyId),
      eq(accountingPeriods.periodYear, body.year),
      eq(accountingPeriods.isLocked, true),
    ));
  const lockedSet = new Set(lockedRows.map((r) => r.m));
  const missing = [1,2,3,4,5,6,7,8,9,10,11].filter((m) => !lockedSet.has(m));
  if (missing.length > 0) {
    throw new BusinessError('لا يمكن الإقفال السنوي قبل إقفال جميع الأشهر السابقة...', 422);
  }
  await createYearEndClosingEntry(agencyId, uid, body.year, tx);
}
```

**الحكم:**
- يمنع الإقفال السنوي الجزئي
- رسالة خطأ تحدد الأشهر المفقودة بالتحديد
- التشغيل داخل transaction → rollback إذا فشل

✅ **مُجتاز**

---

## 5-b-2 [INFO ✅] — `assertPeriodOpen` يحظر الفترات الضمنية المقفلة

**الملف:** `apps/web/src/lib/period-lock.ts:48-63`

```typescript
// إذا لا يوجد سجل فترة صريح:
if (!period) {
  const [latestLocked] = await tx.select(...)
    .where(and(eq(agencyId), eq(isLocked, true)))
    .orderBy(desc(year), desc(month))
    .limit(1);

  if (latestLocked && (year * 12 + month) <= (latestLocked.y * 12 + latestLocked.m)) {
    throw new BusinessError('الفترة مقفلة — الكتب مقفلة حتى...', 422);
  }
}
```

**الحكم:**
- أي شهر قبل آخر فترة مقفلة يُعتبر مقفلاً ضمنياً
- يمنع: `POST /api/invoices/create` بتاريخ في فترة مقفلة ← rollback
- يمنع: تزوير تاريخ للتسجيل في فترة قديمة
- سجل فترة صريح مع `isLocked = false` يُعامل كإعادة فتح واعية

✅ **مُجتاز — حماية من التأخر Backdating**

---

## 5-b-3 [INFO ✅] — الفواتير الدورية race-safe مع claim ذري

**الملف:** `apps/web/src/lib/recurring.ts:97-115`

```typescript
const [claimed] = await tx
  .update(recurringInvoices)
  .set({
    nextIssueAt:  nextAfter,
    lastIssuedAt: today,
    totalIssued:  sql`totalIssued + 1`,
  })
  .where(and(
    eq(recurringInvoices.id, r.id),
    eq(recurringInvoices.nextIssueAt, r.nextIssueAt), // ← exact match
    eq(recurringInvoices.isActive, true),
  ))
  .returning({ id: recurringInvoices.id });
if (!claimed) return null; // already claimed
```

**الحكم:**
- WHERE يُطابق `nextIssueAt` الأصلي ← تشغيل متزامن لا يمكن أن يُصدر نفس الفاتورة مرتين
- القيمة الخاسرة تحصل على 0 صفوف → rollback
- `calcNextIssueDate` يتعامل مع end-of-month edge cases (31 يناير → 28 فبراير)
- حد 200 schedule لكل تشغيل
- Zero-amount templates تُتخطى بدون تقدم (يلاحظها المستخدم)
- ZATCA submission تُستدعى بعد الإنشاء

✅ **مُجتاز**

---

## 5-b-4 [INFO ✅] — التعرف على الإيراد المؤجل — cron يومي

**الملف:** `apps/web/src/app/api/jobs/recognize-revenue/route.ts` + `apps/web/src/lib/revenue-recognition.ts`

```
Dr 3201 Deferred Revenue → Cr 4100 Revenue
```

- يُشغّل كـ cron يومي أو piggybacked على reconcile-pending-tickets
- Race-safe atomic claim (كما في الخطوات السابقة)
- Gated بـ `assertPeriodOpen`

✅ **مُجتاز**

---

## 5-b-5 [INFO ✅] — إعادة تقييم العملات IAS 21 مع حماية تكرار ذرية

**الملف:** `apps/web/src/app/api/accounting/fx-revaluation/route.ts` (245 سطر)

**الميزات:**
1. **Dry run mode:** `dryRun: true` يحسب التعديلات بدون إنشاء قيود
2. **Idempotency على مستويين:**
   - على مستوى التاريخ: `source = 'fx_revaluation' AND date = ?` → يتخطى
   - على مستوى الحساب/التاريخ: `onConflictDoNothing` مع unique index → `FxAlreadyClaimed`
3. **Race-safe:** `FxAlreadyClaimed` exception → skip account → لا رقم مفقود (counter rolls back)
4. **Period lock:** `assertPeriodOpen` داخل الـ transaction
5. **GL accounts:** `GL.fxGain (4900)` / `GL.fxLoss (5900)` من مصدر مركزي
6. **Bank balance update:** `currentBalanceHalalas + gainLoss` ذرياً

**الكود:**
```typescript
// Gain: DR Bank / CR FX Gain (4900)
// Loss: DR FX Loss (5900) / CR Bank
```

**ملاحظة:** `MED-2` scope note: لا يُعيد تقييم AR/AP — يحتاج per-currency subledger. موثق بوضوح في header الملف.

✅ **مُجتاز — IAS 21 للحسابات البنكية**

---

## 5-b-6 [INFO ✅] — خطط الدفع تحويل أقساط متأخرة تلقائياً

**الملف:** `apps/web/src/lib/payment-plans.ts` — `markOverdueInstallments()`

```typescript
// Cron piggybacked on reconcile-pending-tickets:
overdueInstallments = await markOverdueInstallments(now);
```

- `pending → overdue` عندما `dueDate < today`
- يعمل cross-agency (كل الأقساط المتأخرة)
- يُشغّل كل 30 دقيقة

✅ **مُجتاز**

---

## 5-b-7 [INFO ✅] — تذاكر معلقة — reconciliation مع orphan policy ذكية

**الملف:** `apps/web/src/app/api/jobs/reconcile-pending-tickets/route.ts` (458 سطر)

**التصميم:**

| الحالة | المعالجة | Orphan (≥20 محاولة) |
|--------|----------|---------------------|
| `pending` | `retrievePNR` → استخراج ticketNumber | `manual_review` (لا void تلقائي!) |
| `pending_void` | `retrievePNR` → تأكيد إزالة التذكرة | `void` |
| `pending_refund` | `retrievePNR` → تأكيد الاسترداد | `active` (admin يتحقق) |
| `pending_exchange` | stored payload أو `retrievePNR` | `active` (admin يتحقق) |

**ميزات أمان:**
- **Grace window:** 10 دقائق — لا يمعالج تذكرة أُنشئت قبل أقل من 10 دقائق
- **Overlap protection:** 5 دقائق — لا يُعيد معالجة تذكرة تمت محاولتها خلال 5 دقائق
- **Transient vs deterministic:** أخطاء عابرة (provider unreachable, credential missing) تُسجل بدون عدّ المحاولة
- **Orphan `pending` → `manual_review`:** أهم قرار — لا يُلغي تذكرة قد تكون صادرة فعلاً في BSP
- **Batch isolation:** فشل تذكرة واحدة لا يوقف الـ batch

✅ **مُجتاز — تصميم resilient ممتاز**

---

## 5-b-8 [INFO ✅] — حذف بيانات الوكالة محمي

**الملف:** `apps/web/src/app/api/admin/wipe-agency/route.ts`

**الحماية:**
1. `verifySuperAdmin()` — Firebase JWT + SUPER_ADMIN_EMAIL match
2. `agency.subscriptionStatus !== 'trial'` → **يُرفض** (trial فقط)
3. `agency.nameAr !== confirmName` → **يُرفض** (تأكيد الاسم)
4. كل الحذف في transaction واحدة (DEFERRABLE FKs)

✅ **مُجتاز**

---

## 5-b-9 [INFO ✅] — Year-end closing entry idempotent

**الملف:** `apps/web/src/app/api/accounting/periods/route.ts:37-49`

```typescript
const [existing] = await tx.select({ id: journalEntries.id })
  .from(journalEntries)
  .where(and(
    eq(journalEntries.source, 'closing'),
    sql`date >= ${yearStart} AND date <= ${yearEnd}`,
  )).limit(1);
if (existing) return; // skip — already closed
```

- يعالج 4xxx (revenue), 5xxx (cost/opex), 6xxx (payroll/GOSI/EOSB)
- Net income > 0 → Cr Retained Earnings (3200)
- Net income < 0 → Dr Retained Earnings (3200)
- Excludes prior closing entries (`ne(source, 'closing')`)

✅ **مُجتاز** (مع ملاحظة 5-a-1 عند إعادة الفتح)

---

## 5-c-1 [INFO] — FX revaluation scope: bank/cash فقط

**الملف:** `apps/web/src/app/api/accounting/fx-revaluation/route.ts:2-11`

```typescript
/**
 * SCOPE (MED-2): currently revalues foreign-currency **bank/cash accounts** only
 * (those carrying an `fxBalanceMinor`). Revaluation of foreign-currency AR/AP
 * monetary balances is NOT yet implemented — it requires per-currency AR/AP
 * balances which the subledger does not track today.
 */
```

**الملاحظة:**
IAS 21 يتطلب إعادة تقييم كل الأصول/الالتزامات النقدية بالعملة الأجنبية. حالياً يُغطّي bank/cash فقط. AR/AP بالعملات الأجنبية لا يُعاد تقييمها.

**الأثر:** لوكالات سفر تعمل بشكل رئيسي بالريال (SAR) مع مدفوعات supplier بعملات أجنبية — الأثر منخفض. FX differences على AP تُسجل عند الدفع الفعلي (accounts 4900/5900). لكن إذا كان هناك AR كبير بالدولار مثلاً — لن يُعاد تقييمه.

---

## الملخص التنفيذي

### ما يعمل بشكل صحيح (الإيجابيات):
1. **إقفال الفترات:** تسلسلي (1→12) مع حظر ضمني للفترات القديمة
2. **الفواتير الدورية:** race-safe + month-end clamping + ZATCA submission
3. **إعادة التقييم:** IAS 21 + dry run + dual idempotency
4. **التذاكر المعلقة:** orphan policy ذكية (لا auto-void لـ pending issuance)
5. **Period lock enforcement:** في كل API route مالي
6. **Year-end closing:** idempotent + auto-triggered عند إقفال ديسمبر

### ما يحتاج إصلاح:
1. **[MED]** إعادة فتح فترة بعد الإقفال السنوي لا تُحدّث قيد الإقفال
2. **[LOW]** لا يوجد تصدير CSV/Excel للتقارير المالية

### جدول الأولويات:
| الأولوية | البند | المبرر |
|----------|-------|--------|
| 🟡 P1 | 5-a-1 | قيد إقفال خاطئ = أرباح محتجزة خاطئة |
| ⚪ P2 | 5-a-2 | نقص وظيفي — لا أثر مالي مباشر |

---

**الإحصائيات التراكمية (الأطوار 1-5):**

| الطور | HIGH | MED | LOW | INFO |
|-------|------|-----|-----|------|
| الطور 1 | 3 | 5 | 2 | 10 |
| الطور 2 | 1 | 4 | 2 | 8 |
| الطور 3 | 2 | 3 | 2 | 9 |
| الطور 4 | 2 | 1 | 1 | 12 |
| الطور 5 | 0 | 1 | 1 | 10 |
| **المجموع** | **8** | **14** | **8** | **49** |

---

انتهى الطور 5. الطور التالي والأخير: **الطور 8 — التقرير الموحد النهائي مع درجة الجاهزية /100**.
