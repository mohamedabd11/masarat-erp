# Masarat ERP — نظام إدارة وكالات السفر

نظام ERP متكامل لوكالات السفر والسياحة في السعودية والخليج.  
يشمل: حجوزات الرحلات والفنادق والعمرة والحج والتأشيرات والتأمين، مع محاسبة IFRS وفاتورة ZATCA المرحلة الثانية.

## المتطلبات

- Node.js 20+
- pnpm 9+

## التثبيت

```bash
pnpm install
```

## التشغيل المحلي

```bash
pnpm --filter @masarat/web dev
```

## متغيرات البيئة

انسخ `.env.example` إلى `.env.local` في مجلد `apps/web/`:

| المتغير | الوصف |
|---------|-------|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | مفتاح Firebase |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | نطاق المصادقة |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | معرّف المشروع |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | مجلد التخزين |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | معرّف المُرسِل |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | معرّف التطبيق |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | JSON حساب الخدمة (للـ API Routes) |
| `SUPER_ADMIN_EMAIL` | بريد المشرف العام |

## البنية

```
masarat-erp/
├── apps/
│   ├── web/        ← Next.js 14 (Vercel)
│   └── mobile/     ← React Native + Expo
├── packages/
│   ├── accounting/ ← محرك المحاسبة (IFRS 15)
│   ├── firebase/   ← أنواع Firestore وـ hooks
│   └── zatca/      ← فاتورة ZATCA المرحلة 2
└── functions/      ← Cloud Functions (مرجعية فقط)
```

## الأوامر

```bash
pnpm turbo build        # بناء جميع الحزم
pnpm turbo typecheck    # فحص TypeScript
pnpm turbo lint         # فحص ESLint
pnpm turbo test         # تشغيل الاختبارات
```

## الاختبارات

```bash
# اختبارات الوحدة (المحاسبة)
pnpm --filter @masarat/accounting test

# اختبارات E2E
pnpm --filter @masarat/web test:e2e
```
