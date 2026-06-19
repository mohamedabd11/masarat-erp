# Masarat ERP — دليل المشروع لـ Claude

نظام ERP متعدد المستأجرين لوكالات السفر (محاسبة + حجوزات + ZATCA).
**المكدّس:** Next.js 14 (App Router) في `apps/web` · Drizzle ORM على Neon Postgres (serverless Pool) · مصادقة Firebase · pnpm 9 + turbo (monorepo).

---

## حقائق معمارية حاسمة (لا تخالفها — تحقّقت في تدقيق سابق)

1. **المُطبِّق الفعلي للـ migrations = `apps/web/src/instrumentation.ts`** (مصفوفة SQL idempotent تعمل عند كل إقلاع). ملفات `apps/web/drizzle/*.sql` **توثيقية** بعد أول مدخلات في `meta/_journal.json` ولا تُطبَّق تلقائياً (`build` لا يشغّل migrate). ⇒ **أي تغيير DB يجب أن يدخل `instrumentation.ts`** ليأخذ مفعوله، مع ملف drizzle مطابق للتوثيق.
2. **المبالغ المالية = أعداد صحيحة بالهللات** (`integer`/`bigint`)، **لا `float` أبداً**. الأعمدة `*_halalas`.
3. **عزل المستأجرين (RLS):** التطبيق يتصل كـ**مالك الجداول** فيتجاوز RLS ما لم يُضَف `FORCE ROW LEVEL SECURITY`. السياق يُحقَن داخل `db.transaction` عبر AsyncLocalStorage من `verifyAuth` (`lib/db.ts` + `lib/tenant-context.ts`). السياسة **fail-open** عند غياب السياق. استثنِ `idempotency_keys` (agency_id قابل للـ NULL). **لا تمسّ** الـ triggers (`prevent_posted_journal_modification`…) ولا أدوار BYPASSRLS.
4. **المصادقة:** كل route محمي يستدعي `verifyAuth(request)` ويُرجع `agencyId`. ~15 route محمية بآليات بديلة (CRON_SECRET/admin) ولا تستدعي verifyAuth.
5. **ثوابت GL** في `apps/web/src/lib/gl-accounts.ts` بشكل `{ code, ar, en }` مع `as const`. لإعادة تعيين متغيّر من نوع GL استخدم: `let x: { code: string; ar: string; en: string } = GL.xxx;`

---

## التحقق قبل الدفع (إلزامي — البناء فشل سابقاً مرتين)

```bash
pnpm install --frozen-lockfile          # أول مرة في بيئة جديدة (pnpm 9)
# 1) فحص الأنواع (صفر مخرجات = نظيف):
npx tsc --noEmit --project apps/web/tsconfig.json 2>&1 | grep -v "e2e\|drizzle.config\|playwright\|vitest\|Cannot find module 'next\|Cannot find module 'drizzle\|Cannot find module '@masarat\|Cannot find name 'process\|Cannot find name 'Buffer'"
# 2) بناء فعلي:
cd apps/web && npx next build
```
**لا تدفع قبل نجاح البناء.** لإصلاحات RLS/الأمان: صرّح بصدق إن كان "مُطبَّقاً لكن لم يُختبر على DB حية".

---

## Git
- طوّر وادفع على **الفرع الذي يحدّده المستخدم صراحةً** (تحقّق بـ `git branch --show-current` ولا تفترض).
- **لا تنشئ Pull Request إلا بطلب صريح.**

---

## المهارات (في `.claude/skills/` — استخدمها تلقائياً عند المطابقة)
- **`erp-audit`** — أي تدقيق/مراجعة جاهزية إنتاج. **اقرأ `playbook.md` بداخلها أولاً** (8 أطوار + قاعدة الحقول الخمسة + قاعدة الغياب).
- **`safe-db-change`** — أي تعديل schema/migration/فهرس/قيد/RLS.
- **`plan-first`** — قبل أي مهمة برمجية غير تافهة: اقرأ الكود، تحقّق من الواقع لا الوصف، خطّط بأولويات.

## مراجع
- `AUDIT_FINAL_REPORT.md` — التقرير الموحّد + درجة الجاهزية.
- `AUDIT_PHASE_*.md` — تقارير الأطوار التفصيلية.
