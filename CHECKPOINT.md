# نقطة التفتيش — مسارات ERP
**آخر تحديث:** مايو 2026

---

## كيفية الاستئناف

إذا انقطعت المحادثة، أرسل هذا في الرسالة الأولى:
> "استأنف من CHECKPOINT.md — نقطة التوقف: [انسخ اسم النقطة من الأسفل]"

---

## حالة الوثائق ✅ مكتملة

| الملف | الحالة |
|-------|--------|
| `PRD-Masarat-ERP.md` | ✅ مكتمل |
| `ARCHITECTURE-Customization-Layer.md` | ✅ مكتمل |
| `DATABASE-Schema-and-Security-Rules.md` | ✅ مكتمل |

---

## حالة الكود

### المرحلة 1: إعداد Monorepo ✅
| الملف | الحالة |
|-------|--------|
| `package.json` (root) | ✅ مكتمل |
| `pnpm-workspace.yaml` | ✅ مكتمل |
| `turbo.json` | ✅ مكتمل |
| `.gitignore` | ✅ مكتمل |
| `firebase.json` | ✅ مكتمل |
| `firestore.indexes.json` | ✅ مكتمل |

### المرحلة 2: حزمة المحاسبة `packages/accounting` ✅
| الملف | الحالة |
|-------|--------|
| `package.json` | ✅ مكتمل |
| `tsconfig.json` | ✅ مكتمل |
| `vitest.config.ts` | ✅ مكتمل |
| `src/types.ts` | ✅ مكتمل |
| `src/money.ts` | ✅ مكتمل |
| `src/validator.ts` | ✅ مكتمل |
| `src/strategies/agent.strategy.ts` | ✅ مكتمل |
| `src/strategies/principal.strategy.ts` | ✅ مكتمل |
| `src/engine.ts` | ✅ مكتمل |
| `src/index.ts` | ✅ مكتمل |
| `src/__tests__/money.test.ts` | ✅ مكتمل |
| `src/__tests__/validator.test.ts` | ✅ مكتمل |
| `src/__tests__/agent.strategy.test.ts` | ✅ مكتمل |
| `src/__tests__/principal.strategy.test.ts` | ✅ مكتمل |

### المرحلة 3: Cloud Functions `functions/` ✅
| الملف | الحالة |
|-------|--------|
| `package.json` | ✅ مكتمل |
| `tsconfig.json` | ✅ مكتمل |
| `src/lib/idempotency.ts` | ✅ مكتمل |
| `src/lib/invoice-counter.ts` | ✅ مكتمل |
| `src/handlers/create-invoice.ts` | ✅ مكتمل |
| `src/handlers/process-payment.ts` | ✅ مكتمل |
| `src/handlers/process-refund.ts` | ✅ مكتمل |
| `src/index.ts` | ✅ مكتمل |

### المرحلة 4: الحزم المشتركة ✅
| الملف | الحالة |
|-------|--------|
| `packages/firebase/package.json` | ✅ مكتمل |
| `packages/firebase/tsconfig.json` | ✅ مكتمل |
| `packages/firebase/src/config.ts` | ✅ مكتمل |
| `packages/firebase/src/collections.ts` | ✅ مكتمل |
| `packages/firebase/src/types.ts` | ✅ مكتمل |
| `packages/firebase/src/bookings.ts` | ✅ مكتمل |
| `packages/firebase/src/customers.ts` | ✅ مكتمل |
| `packages/firebase/src/invoices.ts` | ✅ مكتمل |
| `packages/firebase/src/hooks/useBookings.ts` | ✅ مكتمل |
| `packages/firebase/src/hooks/useAuth.ts` | ✅ مكتمل |
| `packages/firebase/src/index.ts` | ✅ مكتمل |
| `packages/zatca/package.json` | ✅ مكتمل |
| `packages/zatca/tsconfig.json` | ✅ مكتمل |
| `packages/zatca/src/types.ts` | ✅ مكتمل |
| `packages/zatca/src/xml-builder.ts` | ✅ مكتمل |
| `packages/zatca/src/qr-code.ts` | ✅ مكتمل |
| `packages/zatca/src/index.ts` | ✅ مكتمل |

### المرحلة 5: تطبيق الويب `apps/web/` ✅
| الملف | الحالة |
|-------|--------|
| `package.json` | ✅ مكتمل |
| `next.config.ts` | ✅ مكتمل |
| `tailwind.config.ts` | ✅ مكتمل |
| `tsconfig.json` | ✅ مكتمل |
| `postcss.config.js` | ✅ مكتمل |
| `.env.example` | ✅ مكتمل |
| `messages/ar.json` | ✅ مكتمل |
| `messages/en.json` | ✅ مكتمل |
| `src/i18n.ts` | ✅ مكتمل |
| `src/middleware.ts` | ✅ مكتمل |
| `src/app/globals.css` | ✅ مكتمل |
| `src/app/layout.tsx` | ✅ مكتمل |
| `src/app/[locale]/layout.tsx` | ✅ مكتمل |
| `src/app/[locale]/(auth)/layout.tsx` | ✅ مكتمل |
| `src/app/[locale]/(auth)/login/page.tsx` | ✅ مكتمل |
| `src/app/[locale]/(dashboard)/layout.tsx` | ✅ مكتمل |
| `src/app/[locale]/(dashboard)/page.tsx` | ✅ مكتمل |
| `src/app/[locale]/(dashboard)/dashboard/page.tsx` | ✅ مكتمل |
| `src/app/[locale]/(dashboard)/bookings/page.tsx` | ✅ مكتمل |
| `src/app/[locale]/(dashboard)/bookings/new/page.tsx` | ✅ مكتمل |
| `src/components/ui/Button.tsx` | ✅ مكتمل |
| `src/components/ui/Input.tsx` | ✅ مكتمل |
| `src/components/ui/Select.tsx` | ✅ مكتمل |
| `src/components/ui/Card.tsx` | ✅ مكتمل |
| `src/components/ui/Badge.tsx` | ✅ مكتمل |
| `src/components/ui/StatusBadge.tsx` | ✅ مكتمل |
| `src/components/ui/Spinner.tsx` | ✅ مكتمل |
| `src/components/ui/EmptyState.tsx` | ✅ مكتمل |
| `src/components/layout/LanguageSwitcher.tsx` | ✅ مكتمل |
| `src/components/layout/Sidebar.tsx` | ✅ مكتمل |
| `src/components/layout/Header.tsx` | ✅ مكتمل |
| `src/components/dashboard/StatsCard.tsx` | ✅ مكتمل |
| `src/providers/DirectionProvider.tsx` | ✅ مكتمل |
| `src/providers/AuthProvider.tsx` | ✅ مكتمل |
| `src/lib/utils.ts` | ✅ مكتمل |

### المرحلة 6: التالي (لم تبدأ)
- [ ] `apps/mobile/` — تطبيق الجوال (React Native / Expo)
- [ ] صفحات إضافية: العملاء، الفواتير، المحاسبة، الإعدادات
- [ ] مكوّن عرض الفاتورة (PDF-ready)
- [ ] ربط Cloud Functions بالـ UI (استدعاء createInvoice)
- [ ] لوحة التحكم بالبيانات الحقيقية من Firestore
- [ ] اختبارات E2E (Playwright)

---

## ملاحظات معمارية مهمة للاستئناف

1. **المبلغ دائماً بالهللات (integers)** — لا float في أي مكان مالي
2. **القيود الآلية تُنشأ في Cloud Functions فقط** — لا في الـ Client
3. **Idempotency Key** يجب أن يُرسَل مع كل طلب من الـ Client
4. **الفاتورة تُنشأ عبر `createInvoice` Cloud Function** — لا كتابة مباشرة لـ Firestore
5. **نموذجا الإيراد:** Agent (تذاكر مفردة) = صافي إيراد / Principal (باقات) = إيراد كامل
6. **Validator** يقبل فرق 1 هللة كـ rounding، يرفض ما فوق ذلك
7. **اللغة العربية والإنجليزية** — كل مكوّن يدعم الـ RTL والـ LTR باستخدام `locale` prop
8. **Tailwind logical properties** — `ps-*`, `pe-*`, `ms-*`, `me-*`, `start-*`, `end-*` للـ RTL
9. **next-intl** — يستخدم `localePrefix: 'always'` — الروابط دائماً تبدأ بـ `/ar/` أو `/en/`
10. **Firebase Emulator** — يُفعَّل بـ `NEXT_PUBLIC_USE_FIREBASE_EMULATOR=true`

---

## نقاط التوقف المتاحة

- `CHECKPOINT-A: بعد إعداد Monorepo`
- `CHECKPOINT-B: بعد packages/accounting`
- `CHECKPOINT-C: بعد functions/`
- `CHECKPOINT-D: بعد packages/ (firebase + zatca)`
- **`CHECKPOINT-E: بعد apps/web/ ✅ الحالة الآن`** — الويب مكتمل، التالي apps/mobile أو توسيع الصفحات
