# تنفيذ إصلاحات الجاهزية — أساس الديبلوي `eca24d6`

> تكملة لتقرير التدقيق (منهجية `.claude/skills/erp-audit`). يوثّق ما نُفِّذ فعلاً
> في هذه الجولة، وما أُجِّل بقرار صريح، وحالة بنود البنية التحتية.
> **القاعدة:** «مُطبَّق» لا «موجود فقط» — كل بند أدناه مع موضعه وكيفية التحقق منه.

## ✅ نُفِّذ في هذه الجولة

### TRIG-1 — مَحفّزات حصانة السجلات المالية (نقلها إلى المُطبِّق الفعلي)
- **المشكلة:** المَحفّزات (`prevent_posted_journal_modification`…) كانت في
  `packages/database/src/migrations/002_row_level_security.sql` فقط — وهو ملف **لا
  يُطبَّق**: `deploy.yml` لا يحوي خطوة هجرة DB، و`runMigrations()` لا يُستدعى في
  الديبلوي. كما أن نسخة 002 تشير إلى عمود `journal_entries.status` غير الموجود
  (المخطط الفعلي يستخدم `is_posted` boolean).
- **الإصلاح:** أُضيفت المَحفّزات إلى `apps/web/src/instrumentation.ts` (المُطبِّق
  الفعلي عند الإقلاع، idempotent عبر `CREATE OR REPLACE FUNCTION` + `DROP TRIGGER IF
  EXISTS`)، مطابِقةً للمخطط الحقيقي:
  - `prevent_posted_journal_mutation` على `journal_entries` (BEFORE UPDATE OR DELETE) — يمنع تعديل/حذف قيد `is_posted=true`.
  - `prevent_issued_invoice_deletion` على `invoices` (BEFORE DELETE) — يمنع حذف فاتورة `status <> 'draft'`.
  - `prevent_payment_deletion` على `payments` (BEFORE DELETE) — المدفوعات append-only.
- **عدم كسر مسارات الصيانة المشروعة:** المسارات الثلاثة التي تحذف صفوفاً مالية
  عمداً — `admin/wipe-agency`، `accounting/periods` (استبدال قيد إغلاق السنة)،
  `banking/accounts/[id]` (حذف قيد افتتاحي عند حذف حساب بنكي) — ترفع المَحفّز
  للمعاملة الواحدة فقط عبر `allowFinancialPurge(tx)` (`lib/financial-guard.ts`،
  GUC `app.allow_financial_purge` بـ `set_config(..., true)` المحلي للمعاملة).
- **التحقق:** `tsc` نظيف + `next build` ناجح. السلوك على DB حية يُتحقَّق منه عند أول
  إقلاع (يُسجَّل في `db_migrations_applied`). لم يُختبر بعدُ على Postgres حيّ في هذه الجلسة.

### RLS — حارس عزل المستأجر (قراءات + كتابات)
- **التحديث:** `apps/web/src/__tests__/rls-route-guard.test.ts`:
  - صُحِّح رأس الملف (RLS صار مُفعَّلاً فعلاً FORCE، دفاعاً في العمق، لا no-op).
  - أُبقي حارس الكتابات (`.update`/`.delete` على جدول مستأجر يجب أن يُسنَد بـ `agencyId` أو PK).
  - أُضيف حارس قراءات لمسارات `[id]` الديناميكية فقط (طبقة IDOR-on-read): كل
    `.from(<جدول مستأجر>)` يجب أن يحوي `agencyId` — لأن RLS fail-open على القراءات خارج المعاملات.
- **اكتشاف عرضي أُصلح:** كان `accounting/periods` يحذف `journalLines` بمسنِد `entryId`
  فقط دون `agencyId` (ثغرة كتابة كامنة موجودة منذ `eca24d6`) — أُضيف `eq(journalLines.agencyId, agencyId)`.
- **التحقق:** الاختباران يمرّان (write + read).

### اختبارات قديمة صُحِّحت لتطابق سلوك MED-1
- `__tests__/period-lock.test.ts`: اختباران كانا يفترضان السلوك القديم «تاريخ
  مشوّه/فارغ يمرّ بصمت»؛ بعد إصلاح MED-1 صار fail-closed (يرمي `BusinessError`).
  حُدِّثا ليؤكّدا الرفض. (الفشل كان قائماً في `eca24d6`، لا من هذه الجولة.)
- **التحقق:** كامل اختبارات الوحدة للويب تمرّ (405 pass، 56 integration skip بلا DB)،
  وحزمة `@masarat/accounting` (90 pass).

### أكِّد أنه مُصلَح أصلاً في `eca24d6` (تحقّقت لا أكثر)
- **HIGH-2 idempotency:** كل المسارات الثمانية المستهلِكة لـ `withIdempotency`
  تستدعي `markIdempotencyComplete(tx, …)` **داخل** معاملة العمل ⇒ نافذة التعطّل
  بين commit والإكمال مغلقة. لا عمل إضافي.

## ⏸️ مؤجَّل بقرار صريح

### CRIT-4 — توقيع ZATCA / XML-C14N11
- **الحالة:** مؤجَّل (يتطلب بوابة ZATCA sandbox للتحقق، غير متاحة في هذه الجلسة).
- **الموضع:** `packages/zatca/src/signing.ts:212-220` يهاش البايتات المجرّدة بـ regex
  بدل C14N11 الحقيقي (مُقَر به في تعليق الملف).
- **لماذا آمن مؤقتاً:** مسار الإرسال مُسوَّر بـ `zatcaOnboardingStatus !== 'production'`
  (`zatca-einvoice.ts`)، والافتراضي `simulation`/`not_started` ⇒ المسار خامل، لا يفسد
  الدفاتر. الأثر: لا يمكن لوكالة مسجّلة بالضريبة إكمال الانتقال للإنتاج حتى يُطبَّق
  C14N11 ويُتحقَّق منه مقابل بوابة المحاكاة.
- **الخطوة عند توفّر sandbox:** تطبيق C14N11 + الـ `ds:Transforms` المعلنة، ثم
  التحقق ضد البوابة قبل قلب الحالة للإنتاج، ثم CRIT-3/5 (إشعارات 381/383 والـ QR التسعة — بنيتهما حاضرة).

## 📌 حالة HIGH-9 (تباعد مصادر الهجرة)
- نُقلت مَحفّزات الحصانة إلى `instrumentation.ts` ⇒ تقلّص الاعتماد على
  `packages/database/migrations` غير المُطبَّق. يبقى التوحيد الكامل (اعتماد
  `instrumentation.ts` مرجعاً وحيداً وإزالة/تحييد ملفات 002 المتباعدة، أو إضافة خطوة
  `db:migrate` للديبلوي) بنداً قائماً يتطلب قراراً تشغيلياً + DB حية للتحقق.
