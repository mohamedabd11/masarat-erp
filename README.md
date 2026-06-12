# Masarat ERP — نظام إدارة وكالات السفر

نظام ERP متكامل لوكالات السفر والسياحة في السعودية والخليج.  
يشمل: حجوزات الرحلات والفنادق والعمرة والحج والتأشيرات والتأمين، مع محاسبة IFRS 15 وفاتورة ZATCA المرحلة الثانية.

## المتطلبات

- Node.js 20+
- pnpm 9+
- مشروع Firebase (Spark أو Blaze) مع تفعيل Authentication فقط (Firestore لم يعد مطلوباً)
- قاعدة بيانات Neon Postgres (أو أي PostgreSQL 15+)

> **ملاحظة:** البيانات تُخزَّن في **Neon Postgres**، والمصادقة عبر **Firebase Auth** فقط.  
> النظام يعمل على **Vercel API Routes** وليس Cloud Functions، لذا خطة Spark المجانية كافية.

## التثبيت السريع

```bash
# 1. تثبيت الاعتماديات
pnpm install

# 2. إعداد متغيرات البيئة
cp apps/web/.env.example apps/web/.env.local
# ثم افتح apps/web/.env.local وأدخل القيم (انظر قسم المتغيرات أدناه)

# 3. تشغيل تطبيق الويب
pnpm --filter @masarat/web dev
```

التطبيق يعمل على: http://localhost:3000

## متغيرات البيئة

### Client-side — من Firebase Console → Project Settings → Your Apps

| المتغير | الوصف |
|---------|-------|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | مفتاح Firebase |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | `your-project.firebaseapp.com` |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | معرّف المشروع |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | `your-project.appspot.com` |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | رقم المُرسِل |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | معرّف التطبيق |
| `NEXT_PUBLIC_USE_FIREBASE_EMULATOR` | `true` للتطوير المحلي |

### Server-side — لـ API Routes (Vercel / محلي)

| المتغير | الوصف |
|---------|-------|
| `DATABASE_URL` | رابط اتصال Neon Postgres: `postgresql://user:pass@host/db?sslmode=require` |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | كامل محتوى ملف Service Account JSON كـ string واحد (انظر أدناه) |
| `SUPER_ADMIN_EMAIL` | بريد المشرف العام الذي يملك صلاحية تفعيل الوكالات |

#### كيف تحصل على `FIREBASE_SERVICE_ACCOUNT_JSON`

1. Firebase Console → Project Settings → Service accounts
2. انقر **Generate new private key** → تحميل ملف JSON
3. افتح الملف ونسخ كامل محتواه
4. ضعه في `.env.local` على سطر واحد:
   ```
   FIREBASE_SERVICE_ACCOUNT_JSON={"type":"service_account","project_id":"..."}
   ```
5. في Vercel: Settings → Environment Variables → أضف المتغير بنفس الطريقة

## البنية

```
masarat-erp/
├── apps/
│   └── web/            ← Next.js 14 — يُنشر على Vercel
│       └── src/
│           ├── app/api/    ← 45+ API Route Handlers (Drizzle ORM + Neon Postgres)
│           └── lib/schema/ ← Drizzle schema (agencies, users, bookings, invoices, …)
├── packages/
│   ├── accounting/     ← محرك المحاسبة (IFRS 15، هلالات، استراتيجيتا وكيل/أصيل)
│   ├── firebase/       ← Firebase Auth hooks فقط (Firestore مُزال)
│   └── zatca/          ← فاتورة ZATCA المرحلة 2 (UBL 2.1 XML + QR)
└── functions/          ← مرجعية فقط — لا تُنشر (المنطق انتقل إلى API Routes)
```

### API Routes الرئيسية

| المسار | الوظيفة |
|--------|---------|
| `POST /api/auth/register` | تسجيل وكالة جديدة + إنشاء Chart of Accounts |
| `POST /api/auth/invite` | دعوة مستخدم جديد |
| `POST /api/auth/sync` | مزامنة Firebase Auth user ← Postgres (يُستدعى تلقائياً عند تسجيل الدخول) |
| `GET /api/users/me` | بيانات المستخدم الحالي من Postgres |
| `GET/POST /api/bookings` | قائمة الحجوزات / إنشاء حجز |
| `GET/POST /api/invoices` | قائمة الفواتير / إنشاء فاتورة مع قيد محاسبي |
| `POST /api/payments/record` | تسجيل دفعة |
| `POST /api/refunds/process` | معالجة استرداد |
| `POST /api/admin/action` | تفعيل / تعليق وكالة (SUPER_ADMIN فقط) |

## إعداد أول وكالة

لا يوجد واجهة تسجيل مفتوحة — الوكالات تُسجَّل عبر API:

```bash
curl -X POST https://your-app.vercel.app/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "agencyNameAr": "وكالة الرحلات",
    "agencyNameEn": "Travel Agency",
    "adminEmail": "admin@agency.sa",
    "adminNameAr": "محمد"
  }'
```

يرسل النظام رابط إعداد كلمة المرور تلقائياً إلى البريد المدخل.

## الأوامر

```bash
pnpm turbo build        # بناء جميع الحزم
pnpm turbo typecheck    # فحص TypeScript
pnpm turbo lint         # فحص ESLint
pnpm turbo test         # تشغيل الاختبارات
```

## الاختبارات

```bash
# اختبارات الوحدة — محرك المحاسبة
pnpm --filter @masarat/accounting test

# E2E (يتطلب تطبيق مُشغَّل)
pnpm --filter @masarat/web test:e2e
```

## النشر على Vercel

```bash
vercel --prod
```

أضف جميع متغيرات البيئة في: Vercel Dashboard → Settings → Environment Variables

## ترحيل قاعدة البيانات (Drizzle)

⚠️ **لا تُشغّل `drizzle-kit push` (أو `pnpm db:push`) على قاعدة البيانات المشتركة
(`DATABASE_URL`) أبدًا.** هذا الأمر يقارن المخطط الحالي مباشرة مع قاعدة البيانات
الفعلية، وقد **يحذف/يعيد إنشاء جداول كاملة** (مثل `invoices`) فتُفقد كل بياناتها —
خصوصًا عند التشغيل غير التفاعلي (من سكربت أو وكيل) حيث يختار تلقائيًا الخيار
الأكثر تدميرًا عند أي تغيير غامض في الأعمدة أو الفهارس. `DATABASE_URL` هنا هي نفس
القاعدة التي يستخدمها التطبيق المنشور و`.github/workflows/backup.yml`.

تغييرات المخطط تُطبَّق بإحدى الطريقتين الآمنتين فقط:

1. **تعديلات إضافية** (عمود/جدول/فهرس جديد): أضِف عبارة SQL متكررة الأمان
   (`ADD COLUMN IF NOT EXISTS`, `CREATE TABLE IF NOT EXISTS`, ...) إلى مصفوفة
   `migrations` في `apps/web/src/instrumentation.ts` — تُطبَّق تلقائيًا عند كل
   تشغيل للخادم دون أي تدخل يدوي.
2. **أي تغيير آخر** (إعادة تسمية، حذف، قيود): أضِف ملف هجرة مرقّم في
   `apps/web/drizzle/` بعبارات `IF EXISTS` / `IF NOT EXISTS` فقط، وراجعه قبل
   تطبيقه يدويًا على القاعدة.

## روابط

- [إعداد Firebase التفصيلي](./FIREBASE-SETUP.md)
- [مخطط قاعدة البيانات](./DATABASE-Schema-and-Security-Rules.md)
- [وثيقة المتطلبات](./PRD-Masarat-ERP.md)
