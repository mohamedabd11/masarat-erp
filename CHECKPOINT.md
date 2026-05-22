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

## حالة الكود 🔨 قيد البناء

### المرحلة 1: إعداد Monorepo
| الملف | الحالة |
|-------|--------|
| `package.json` (root) | ✅ مكتمل |
| `pnpm-workspace.yaml` | ✅ مكتمل |
| `turbo.json` | ✅ مكتمل |
| `.gitignore` | ✅ مكتمل |

### المرحلة 2: حزمة المحاسبة `packages/accounting`
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

### المرحلة 3: Cloud Functions `functions/`
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

### المرحلة 4: التالي (لم يُبدأ بعد)
- [ ] `apps/web/` — واجهة الويب (React/Next.js)
- [ ] `apps/mobile/` — تطبيق الجوال (React Native)
- [ ] `packages/firebase/` — Firebase SDK wrapper + Firestore Rules
- [ ] `packages/zatca/` — مولّد فواتير ZATCA (XML + QR)

---

## ملاحظات معمارية مهمة للاستئناف

1. **المبلغ دائماً بالهللات (integers)** — لا float في أي مكان مالي
2. **القيود الآلية تُنشأ في Cloud Functions فقط** — لا في الـ Client
3. **Idempotency Key** يجب أن يُرسَل مع كل طلب من الـ Client
4. **الفاتورة تُنشأ عبر `createInvoice` Cloud Function** — لا كتابة مباشرة لـ Firestore
5. **نموذجا الإيراد:** Agent (تذاكر مفردة) = مرحلتان / Principal (باقات) = مرحلتان مختلفتان
6. **Validator** يقبل فرق 1 هللة كـ rounding، يرفض ما فوق ذلك

---

## نقاط التوقف المتاحة

- `CHECKPOINT-A: بعد إعداد Monorepo` — لو انتهى الحد قبل كتابة الكود
- `CHECKPOINT-B: بعد packages/accounting` — المحرك المحاسبي مكتمل، الـ Functions لم تكتب
- `CHECKPOINT-C: بعد functions/` — كل الكود مكتمل، التالي هو apps/
- **الحالة الآن: CHECKPOINT-C ✅ — انتهت المرحلة 3 — جاهز للمرحلة 4 (apps/)**
