---
name: safe-db-change
description: >
  استخدمها عند أي تغيير على قاعدة بيانات Masarat ERP — schema، migration، فهارس،
  قيود، RLS، triggers، أو أعمدة. تضمن أن التغيير يُطبَّق فعلاً، idempotent، آمن على
  بيانات مالية حية، ومُتحقَّق منه قبل الدفع.
  Triggers: migration, schema change, ALTER TABLE, index, constraint, RLS,
  DB column, تعديل قاعدة بيانات، إضافة عمود/جدول/فهرس.
---

# تغيير قاعدة البيانات بأمان — Masarat ERP

## أين يُطبَّق التغيير فعلاً (الأهم)
- المُطبِّق الفعلي = `apps/web/src/instrumentation.ts` (مصفوفة SQL تعمل عند كل إقلاع).
- ملفات `apps/web/drizzle/` **توثيقية فقط** بعد أول مدخلات في `meta/_journal.json` — لا تُطبَّق تلقائياً (`build = next build`، و`drizzle-kit migrate` يدوي).
- ⇒ أي تغيير يجب أن يدخل **`instrumentation.ts`** ليأخذ مفعوله، مع ملف `drizzle/NNNN_*.sql` مطابق للتوثيق/التماثل.

## قواعد كل عبارة SQL (بيانات مالية حية)
1. **idempotent:** `IF NOT EXISTS` / `IF EXISTS` / `DO $$ ... END $$` مع حراسة من pg_constraint/information_schema.
2. **all-or-nothing:** لِف المنطق متعدد الخطوات في كتلة `DO` واحدة، فإن فشلت تتراجع كاملةً ولا تترك حالة نصفية.
3. **لا يكسر الإقلاع:** المُطبِّق يلتقط أخطاء كل عبارة ويكمل؛ ومع ذلك صمّم العبارة كي لا تفشل على بيانات قديمة (NOT VALID للـ CHECK، تحقّق من التكرارات قبل UNIQUE).
4. **حذر التوسعة:** توسيع الأعمدة المالية إلى `bigint` لا `integer`؛ المبالغ هللات صحيحة لا float.

## خاص بـ RLS
- التطبيق يتصل كـ**مالك الجداول** → يتجاوز RLS ما لم يُضَف `FORCE ROW LEVEL SECURITY`.
- السياسة **fail-open** عند غياب `app.current_agency_id` (حتى لا تنكسر مسارات CRON/super-admin/النظام).
- استثنِ الجداول ذات `agency_id` القابل للـ NULL (مثل `idempotency_keys`).
- السياق يُحقَن عبر `db.transaction` (AsyncLocalStorage من `verifyAuth`) — راجع `lib/db.ts` و`lib/tenant-context.ts`.
- لا تُسقط/تعطّل الـ triggers (`prevent_posted_journal_modification`…) ولا أدوار BYPASSRLS.

## التحقق قبل الدفع (إلزامي — البناء فشل سابقاً مرتين)
```
npx tsc --noEmit --project apps/web/tsconfig.json 2>&1 | grep -v "e2e\|drizzle.config\|playwright\|vitest\|Cannot find module 'next\|Cannot find module 'drizzle\|Cannot find module '@masarat\|Cannot find name 'process\|Cannot find name 'Buffer'"
```
ثم `next build` فعلي ينجح. صرّح بصدق إن كان التغيير "مُطبَّقاً لكن لم يُختبر على DB حية".

## Git
الفرع الذي يحدّده المستخدم صراحةً. لا Pull Request إلا بطلب صريح.
