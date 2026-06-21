# Masarat ERP — دليل المشروع لـ Claude

نظام ERP متعدد المستأجرين لوكالات السفر (محاسبة + حجوزات + ZATCA).
**المكدّس:** Next.js 14 (App Router) في `apps/web` · Drizzle ORM على Neon Postgres (serverless Pool) · مصادقة Firebase · pnpm 9 + turbo (monorepo).

---

## 📌 الحالة الحالية وأين توقفنا (آخر تحديث: 2026-06-21)

> **اقرأ هذا أولاً في أي جلسة جديدة.** يلخّص أين وصلنا وما تبقّى.

**تدقيق جاهزية شامل (جلسة 2026-06-21 — التفصيل في `docs/AUDIT-SESSION-2026-06-21.md`):**
أُنجزت الأطوار 0→5 بقراءة مباشرة. ثلاثة اكتشافات حقيقية أُصلِحت ودُفِعت على فرع
`claude/masarat-dark-mode-i3zine`:
- ✅ **buyer_vat_number** (`1dc575c`): أعمدة VAT للمشتري (B2B) كانت في `lib/schema.ts`
  لكن غير مُنشأة في `instrumentation.ts` ⇒ إصدار الفاتورة يفشل 500. أُضيفت لـ boot migrator + setup-db.
- ✅ **ACC-1** (`085f082`): `receipts/create` كان المسار المالي الوحيد بلا idempotency ⇒ أُضيف.
- ✅ **OPS-1** (`1d44f53`): تنبيه (غير مانع) عند عميل بنفس الرقم الضريبي.
**درجة الجاهزية: 88/100 — جاهز للتشغيل**؛ القيد الوحيد = ZATCA production ينتظر CRIT-4.

**الفرع الرئيسي = `main`** (يحوي أحدث نسخة شاملة). آخر دمج وحّد ثلاثة خطوط في `main`:
آخر ديبلوي `eca24d6` (تفعيل RLS، ZATCA onboarding، تقارير التدقيق) + إصلاحات الجاهزية + أداء main الأصلي (B4/B5/B6/L7 + الواجهة). تحقّق: `tsc` نظيف، `next build` ناجح، 405 اختبار وحدة يمرّ.

**آخر ما نُفِّذ (جولة تدقيق الجاهزية — تفصيلها في `docs/READINESS-REMEDIATION-eca24d6.md`):**
- ✅ **TRIG-1**: نقل مَحفّزات حصانة السجلات المالية إلى `instrumentation.ts` (كانت في `packages/database/002` غير المُطبَّق) + `allowFinancialPurge(tx)` لمسارات الصيانة.
- ✅ **حارس RLS**: تحديث `__tests__/rls-route-guard.test.ts` (كتابات + قراءات مسارات `[id]`) وإغلاق ثغرة كتابة كامنة في `accounting/periods`.
- ✅ **اختبارات period-lock**: تصحيحها لسلوك MED-1 (fail-closed على التاريخ المشوّه).
- ✅ تأكيد أن **HIGH-2 (idempotency)** مُصلَح أصلاً (كل المسارات تستدعي `markIdempotencyComplete` داخل المعاملة).

**المؤجَّل (بقرار صريح):**
- ⏸️ **CRIT-4 — توقيع ZATCA / XML-C14N11** (`packages/zatca/src/signing.ts`): يهاش البايتات المجرّدة بدل C14N11 الحقيقي. **يتطلب بوابة ZATCA sandbox للتحقق.** خامل وآمن افتراضياً (مُسوَّر على `zatcaOnboardingStatus='production'`)، لا يفسد الدفاتر، لكن يمنع وكالة مسجّلة بالضريبة من الانتقال للإنتاج. عند توفّر sandbox: طبّق C14N11 + الـ Transforms، تحقّق ضد البوابة، ثم CRIT-3/5.

**حالة الفروع (تنظيف غير مكتمل — صلاحيات الحذف 403):**
- الفرع الافتراضي للمستودع حالياً = `claude/masarat-travel-erp-design-NO1ST` (مطابق لـ main تماماً). **خطوة يدوية مطلوبة:** تغيير الافتراضي إلى `main` من GitHub Settings.
- `claude/repo-code-push-bypass-yo70bw` = مصدر نشر Vercel المحتمل. **خطوة يدوية:** توجيه إنتاج Vercel إلى `main`.
- 11 فرعاً متوازياً (عمل أقدم غير مدموج) محفوظة كأرشيف — مزاياها الكبرى موجودة في main أصلاً.
- 8 فروع مدموجة 100% آمنة للحذف (القائمة في `docs/READINESS-REMEDIATION-eca24d6.md` أسفل القسم).
- **سير العمل المستقبلي:** فرع قصير لكل مهمة من `main` → PR إلى `main` → حذف الفرع. لا تطوير مباشر على main ولا فروع موازية طويلة العمر. النشر من `main` فقط.

**التالي المقترح:** ZATCA Phase-2 عند توفّر sandbox · إكمال خطوتي تغيير الافتراضي/Vercel · توحيد آلية الهجرة (HIGH-9).

---

## حقائق معمارية حاسمة (لا تخالفها — تحقّقت في تدقيق سابق)

1. **المُطبِّق الفعلي للـ migrations = `apps/web/src/instrumentation.ts`** (مصفوفة SQL idempotent تعمل عند كل إقلاع). ملفات `apps/web/drizzle/*.sql` **توثيقية** بعد أول مدخلات في `meta/_journal.json` ولا تُطبَّق تلقائياً (`build` لا يشغّل migrate). ⇒ **أي تغيير DB يجب أن يدخل `instrumentation.ts`** ليأخذ مفعوله، مع ملف drizzle مطابق للتوثيق.
2. **المبالغ المالية = أعداد صحيحة بالهللات** (`integer`/`bigint`)، **لا `float` أبداً**. الأعمدة `*_halalas`.
3. **عزل المستأجرين (RLS):** التطبيق يتصل كـ**مالك الجداول** فيتجاوز RLS ما لم يُضَف `FORCE ROW LEVEL SECURITY`. السياق يُحقَن داخل `db.transaction` عبر AsyncLocalStorage من `verifyAuth` (`lib/db.ts` + `lib/tenant-context.ts`). السياسة **fail-open** عند غياب السياق ⇒ القراءات خارج المعاملات لا تحميها RLS؛ يبقى مُسنِد `agencyId` بطبقة التطبيق هو الضابط الأساسي (يحرسه `__tests__/rls-route-guard.test.ts` للكتابات ولقراءات مسارات `[id]`). استثنِ `idempotency_keys` (agency_id قابل للـ NULL).
   - **مَحفّزات حصانة السجلات المالية** (TRIG-1) معرّفة في `instrumentation.ts` (تُطبَّق عند الإقلاع): `prevent_posted_journal_mutation` (لا تعديل/حذف قيد `is_posted`)، `prevent_issued_invoice_deletion`، `prevent_payment_deletion`. **لا تمسّها** ولا أدوار BYPASSRLS. مسارات الصيانة المشروعة (`admin/wipe-agency`، `accounting/periods` إغلاق السنة، `banking/accounts/[id]`) ترفعها للمعاملة الواحدة عبر `allowFinancialPurge(tx)` (`lib/financial-guard.ts` ⇒ GUC `app.allow_financial_purge`).
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
