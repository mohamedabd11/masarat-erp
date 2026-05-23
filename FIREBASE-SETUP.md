# إعداد Firebase — مسارات ERP
# Firebase Setup — Masarat ERP

## المتطلبات / Prerequisites
- Node.js 20+
- pnpm 9+
- Firebase CLI: `npm install -g firebase-tools`
- حساب Google مع صلاحيات Firebase

## 1. إنشاء مشروع Firebase / Create Firebase Project

1. افتح [Firebase Console](https://console.firebase.google.com)
2. انقر "Add project" → اختر اسم (مثال: `masarat-erp-prod`)
3. فعّل Google Analytics (اختياري)
4. انتظر حتى يكتمل الإنشاء

## 2. تفعيل الخدمات / Enable Services

### Firestore Database
1. Firestore Database → Create database
2. اختر **Production mode**
3. اختر المنطقة: **`me-central2` (Dammam)** — الأقرب للسعودية والخليج
4. انقر "Enable"

### Authentication
1. Authentication → Get started
2. فعّل **Email/Password** provider

### Cloud Functions
1. Upgrade to **Blaze plan** (required for Cloud Functions)
2. Functions → Get started → اختر TypeScript

### Storage (اختياري للمرفقات)
1. Storage → Get started → Production mode → `me-central2`

## 3. إعداد بيانات التطبيق / App Configuration

### Web App
1. Project Settings ⚙️ → General → Your apps → Add app → Web
2. اسم التطبيق: `Masarat ERP Web`
3. انسخ الـ config object

### Service Account (للـ Cloud Functions)
1. Project Settings → Service accounts → Generate new private key
2. احفظ الملف كـ `functions/service-account.json`
3. **لا ترفع هذا الملف إلى Git أبداً**

## 4. إعداد متغيرات البيئة / Environment Variables

### تطبيق الويب (`apps/web/.env.local`)
```env
NEXT_PUBLIC_FIREBASE_API_KEY=your-api-key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789
NEXT_PUBLIC_FIREBASE_APP_ID=1:123456789:web:abcdef

# للتطوير المحلي — يتصل بـ Firebase Emulator
NEXT_PUBLIC_USE_FIREBASE_EMULATOR=true
```

### Cloud Functions (`functions/.env`)
```env
FIREBASE_PROJECT_ID=your-project-id
ZATCA_ENVIRONMENT=simulation  # simulation | production
```

## 5. تشغيل Firebase Emulator / Run Firebase Emulator

```bash
# تثبيت الاعتماديات
pnpm install

# تسجيل الدخول لـ Firebase
firebase login

# ربط المشروع
firebase use your-project-id

# تشغيل الـ Emulator
firebase emulators:start

# في terminal آخر — تشغيل تطبيق الويب
cd apps/web && pnpm dev
```

**روابط الـ Emulator:**
| الخدمة | الرابط |
|--------|--------|
| Emulator UI | http://localhost:4000 |
| Firestore | http://localhost:8080 |
| Auth | http://localhost:9099 |
| Functions | http://localhost:5001 |
| Storage | http://localhost:9199 |

## 6. نشر Cloud Functions / Deploy Cloud Functions

```bash
cd functions
pnpm build
firebase deploy --only functions
```

## 7. نشر Firestore Rules and Indexes

```bash
firebase deploy --only firestore:rules,firestore:indexes
```

## 8. إعداد Custom Claims (JWT) / Custom Claims Setup

مطلوب تشغيل هذا السكريبت مرة واحدة لإنشاء أول مستخدم admin:

```bash
cd functions
node scripts/create-admin-user.js \
  --email admin@youragency.sa \
  --agencyId agency-001 \
  --role admin
```

## 9. إعداد ZATCA / ZATCA Configuration

للبيئة الإنتاجية، احتاج إلى:
1. شهادة ZATCA من بوابة ZATCA للفوترة الإلكترونية
2. رفع الشهادة في إعدادات النظام → ZATCA
3. تبديل `ZATCA_ENVIRONMENT=production` في متغيرات البيئة
4. تشغيل عملية الإعداد (Onboarding) عبر ZATCA API

في بيئة الاختبار، يعمل النظام بوضع `simulation` تلقائياً.

## 10. نشر تطبيق الويب / Deploy Web App

### Firebase Hosting
```bash
cd apps/web
pnpm build
firebase deploy --only hosting
```

### Vercel (الخيار الموصى به)
```bash
# من مجلد الجذر
vercel --prod
```
أضف متغيرات البيئة في Vercel Dashboard.

## الهيكل النهائي / Final Structure

```
masarat-erp/
├── apps/web/           # Next.js web app → Firebase Hosting / Vercel
├── apps/mobile/        # Expo React Native → EAS Build
├── functions/          # Firebase Cloud Functions → me-central2
├── packages/
│   ├── accounting/     # محرك المحاسبة — IFRS 15
│   ├── firebase/       # Firebase client SDK helpers
│   └── zatca/          # ZATCA Phase 2 — UBL 2.1 XML + QR
├── firebase.json       # Emulator + deploy config
└── firestore.indexes.json
```

## استكشاف الأخطاء / Troubleshooting

| المشكلة | الحل |
|---------|------|
| `PERMISSION_DENIED` في Firestore | تحقق من Custom Claims — `agencyId` يجب أن يكون موجوداً في الـ JWT |
| Cloud Function timeout | تأكد من استخدام `me-central2` (الدمام) وليس `us-central1` |
| ZATCA XML rejection | تحقق من صحة رقم الضريبي (VAT number) 15 رقماً |
| Emulator لا يعمل | `firebase emulators:start --import=./emulator-data --export-on-exit` |
