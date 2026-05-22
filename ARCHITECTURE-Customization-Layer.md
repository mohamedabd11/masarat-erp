# وثيقة معمارية: طبقة التخصيص (Customization Layer)
# نظام مسارات ERP — مرونة بلا تعديل للكود
**الإصدار:** 1.0 | **التاريخ:** مايو 2026

---

## المشكلة الجوهرية

وكالات السفر ليست متماثلة:

| نوع الوكالة | نشاطها الرئيسي | ما تحتاجه |
|------------|--------------|-----------|
| وكالة أفراد صغيرة | تذاكر فقط | CRM بسيط + فوترة |
| وكالة متوسطة | طيران + فنادق + تأمين | نظام كامل |
| شركة عمرة وحج | مجموعات + تصاريح + نقل | إدارة مجموعات معقدة |
| شركة MICE | مؤتمرات + رحلات شركات | تسعير خاص + عقود |
| وكيل BSP | تذاكر جملة B2B | حسابات جمله + تسويات |
| منظم رحلات | باقات سياحية | بناء باقات + مخزون |

الحل ليس بناء 6 أنظمة منفصلة — بل بناء **منصة واحدة قابلة للتشكيل**.

---

## المبدأ المعماري الأساسي

```
كل شيء في مسارات يُعرَّف بـ "بيانات" (Data)، وليس بـ "كود" (Code).

الكود يُنفِّذ القواعد العامة.
البيانات تُشكِّل السلوك المحدد لكل وكالة.
```

هذا هو نفس المبدأ الذي تقوم عليه Odoo (XML + Python Rules) وERPNext (DocType + Jinja).

---

## طبقات التخصيص (Customization Layers)

```
┌─────────────────────────────────────────────────────────────┐
│  Layer 5: White Label & Branding (شكل النظام)               │
├─────────────────────────────────────────────────────────────┤
│  Layer 4: Workflow Engine (مسارات الموافقة والأتمتة)         │
├─────────────────────────────────────────────────────────────┤
│  Layer 3: Form Builder (تخصيص النماذج والحقول)              │
├─────────────────────────────────────────────────────────────┤
│  Layer 2: Pricing Rules Engine (محرك التسعير)               │
├─────────────────────────────────────────────────────────────┤
│  Layer 1: Module Activation (تفعيل/تعطيل الوحدات)           │
├─────────────────────────────────────────────────────────────┤
│  Core Engine (النواة الثابتة — لا تُلمس)                    │
└─────────────────────────────────────────────────────────────┘
```

---

---

# Layer 1: نظام الوحدات القابلة للتفعيل (Module Registry)

## 1.1 المفهوم

كل وحدة في مسارات هي كيان **مستقل** يمكن تفعيله أو تعطيله من لوحة التحكم دون إعادة تشغيل النظام.

## 1.2 تعريف الوحدة (Module Manifest)

كل وحدة تُعرَّف بملف manifest داخل Firebase:

```
/module_registry/{moduleId}
  ├── id: "umrah_hajj"
  ├── name_ar: "العمرة والحج"
  ├── name_en: "Umrah & Hajj"
  ├── version: "1.2.0"
  ├── description_ar: "إدارة برامج العمرة والحج والمجموعات الدينية"
  ├── icon: "🕋"
  ├── category: "booking"           ← booking / finance / crm / ops / reporting
  ├── dependencies: ["crm", "booking_base", "group_management"]
  ├── incompatibleWith: []
  ├── requiredLicense: "professional"  ← free / starter / professional / enterprise
  ├── defaultEnabled: false
  ├── menuItems: [...]               ← يُضاف للقائمة عند التفعيل
  ├── permissions: [...]             ← الصلاحيات الجديدة المُضافة
  ├── firestoreCollections: [...]    ← المجموعات التي يحتاجها
  └── hooks: [...]                  ← نقاط الربط بالوحدات الأخرى
```

## 1.3 كتالوج الوحدات الكاملة

### المجموعة: الأساس (Core — دائماً مُفعَّلة، لا يمكن تعطيلها)
```
core_auth          — المصادقة والصلاحيات
core_crm           — إدارة العملاء الأساسية
core_billing       — الفوترة والمدفوعات
core_accounting    — المحرك المحاسبي والقيود
core_zatca         — الامتثال الضريبي السعودي
core_settings      — الإعدادات العامة
```

### المجموعة: الحجوزات (Booking Modules)
```
booking_flights      — حجوزات الطيران (GDS Integration)
booking_hotels       — حجوزات الفنادق
booking_packages     — الباقات السياحية المركبة
booking_umrah_hajj   — العمرة والحج
booking_visa         — خدمات التأشيرات
booking_insurance    — تأمين السفر
booking_transport    — تأجير السيارات والنقل
booking_cruises      — رحلات بحرية (Cruises)
```

### المجموعة: العمليات (Operations)
```
ops_groups           — إدارة المجموعات والبرامج
ops_fleet            — إدارة أسطول النقل
ops_guides           — إدارة المرشدين السياحيين
ops_hotels_allotment — إدارة عقود allotment مع الفنادق
ops_b2b_agents       — شبكة الوكلاء الفرعيين
```

### المجموعة: المالية المتقدمة (Advanced Finance)
```
finance_multi_currency  — محاسبة متعددة العملات
finance_budgeting       — الميزانيات التقديرية
finance_cost_centers    — مراكز التكلفة (حج / عمرة / طيران)
finance_commissions     — محرك العمولات التلقائية
finance_bsp_settlement  — تسويات BSP/IATA
finance_credit_limits   — حدود الائتمان للعملاء
```

### المجموعة: المبيعات والتسويق
```
sales_quotations     — عروض الأسعار المتقدمة
sales_targets        — أهداف وعمولات المبيعات
sales_loyalty        — برامج الولاء والنقاط
sales_promotions     — الخصومات والعروض الترويجية
marketing_whatsapp   — تكامل واتساب للتواصل
marketing_email      — التسويق بالبريد الإلكتروني
```

### المجموعة: التقارير والذكاء
```
reports_advanced     — تقارير مالية IFRS كاملة
reports_bi           — لوحات BI تفاعلية
reports_forecasting  — توقعات المبيعات
reports_audit_trail  — سجل التدقيق الشامل
```

### المجموعة: التكاملات الخارجية
```
integration_amadeus   — GDS Amadeus
integration_sabre     — GDS Sabre
integration_galileo   — GDS Galileo
integration_hotelbeds — Hotelbeds API
integration_nusuk     — نظام نُسُك (عمرة/حج)
integration_stcpay    — STC Pay
integration_hyperpay  — HyperPay بوابة الدفع
integration_tamara    — تمارة (تقسيط BNPL)
integration_tabby     — تابي (تقسيط BNPL)
```

## 1.4 هيكل Firebase للوحدات المفعَّلة (Per Agency)

```
/agencies/{agencyId}/config/modules
  ├── enabled: ["core_auth", "core_crm", "core_billing", "core_accounting",
  │             "core_zatca", "booking_flights", "booking_hotels",
  │             "booking_umrah_hajj", "ops_groups", "finance_bsp_settlement"]
  ├── disabled: ["booking_cruises", "ops_fleet", "marketing_email"]
  ├── lastModified: Timestamp
  └── modifiedBy: userId
```

## 1.5 آلية التفعيل الديناميكي في الـ Frontend

```
منطق القائمة الجانبية:

الكود لا يحتوي على قائمة ثابتة.
بدلاً من ذلك، يقرأ:
  1. قائمة الوحدات المفعَّلة للوكالة
  2. menuItems لكل وحدة مفعَّلة
  3. صلاحيات المستخدم الحالي
  4. يبني القائمة ديناميكياً في runtime

النتيجة:
- وكالة A ترى: طيران + فنادق + عمرة
- وكالة B ترى: طيران فقط + B2B
- وكالة C ترى: باقات + MICE + أسطول نقل
```

---

---

# Layer 2: محرك التسعير القابل للتخصيص (Pricing Rules Engine)

## 2.1 المشكلة

كل وكالة لها سياسة تسعير مختلفة:
- وكالة A: سعر ثابت + رسوم خدمة 50 ريال
- وكالة B: نسبة 5% فوق سعر المورد
- وكالة C: سعر مختلف حسب العميل (VIP / عادي / B2B)
- وكالة D: خصومات تلقائية في المواسم

## 2.2 هيكل قاعدة التسعير (Pricing Rule Schema)

```
/agencies/{agencyId}/pricing_rules/{ruleId}
  ├── id: string
  ├── name_ar: "رسوم الخدمة — طيران دولي"
  ├── isActive: true
  ├── priority: 10                    ← عند تعارض القواعد، الأعلى أولوية
  ├── appliesTo: {
  │     bookingType: ["flight"]        ← flight / hotel / package / umrah / all
  │     destination: "international"   ← domestic / international / all
  │     customerTags: ["B2C"]          ← B2C / B2B / VIP / all
  │     minAmount: 0
  │     maxAmount: null
  │   }
  ├── pricingType: "fixed_fee"         ← انظر أنواع التسعير أدناه
  ├── value: 75                        ← 75 ريال رسوم خدمة
  ├── vatTreatment: "taxable_15"       ← taxable_15 / zero_rate / exempt
  ├── revenueAccount: "6007"           ← الحساب المحاسبي المرتبط
  ├── conditions: []                   ← شروط إضافية (if/then)
  └── validFrom / validTo: Timestamp   ← صلاحية القاعدة
```

## 2.3 أنواع التسعير المدعومة

```
أنواع pricingType:

1. fixed_fee         — رسوم ثابتة (مثل: 50 ريال لكل تذكرة)
2. percentage_markup — نسبة على سعر التكلفة (مثل: 8% فوق سعر المورد)
3. percentage_selling — نسبة من سعر البيع (مثل: 5% من سعر التذكرة)
4. tiered            — شرائح حسب المبلغ أو العدد
5. custom_formula    — معادلة مخصصة بمتغيرات
6. manual_only       — لا حساب تلقائي، يُدخله الموظف يدوياً
7. cost_plus         — تكلفة + هامش ربح محدد
8. from_contract     — مأخوذ من عقد مورد محدد
```

## 2.4 نموذج القواعد المتدرجة (Tiered Pricing)

```
مثال: رسوم خدمة متدرجة حسب قيمة التذكرة

/pricing_rules/tiered_flight_fee
  tiers: [
    { upTo: 500,  fee: 25 },      ← تذاكر حتى 500 ريال → 25 ريال رسوم
    { upTo: 2000, fee: 50 },      ← 501 → 2000 ريال → 50 ريال رسوم
    { upTo: 5000, fee: 100 },     ← 2001 → 5000 ريال → 100 ريال رسوم
    { upTo: null, fee: 200 }      ← فوق 5000 ريال → 200 ريال رسوم
  ]
```

## 2.5 المعادلات المخصصة (Custom Formula Engine)

```
بناء جملة المعادلة (DSL بسيطة):

متغيرات متاحة:
  {cost}          — سعر التكلفة من المورد
  {selling}       — سعر البيع
  {passengers}    — عدد المسافرين
  {nights}        — عدد الليالي (للفنادق)
  {customer.tier} — درجة العميل
  {booking.type}  — نوع الحجز

أمثلة على معادلات:
  "({selling} - {cost}) * 0.5"      ← 50% من هامش الربح كرسوم
  "{passengers} * 35"                ← 35 ريال لكل راكب
  "{nights} * {cost} * 0.08"         ← 8% من إجمالي تكلفة الفندق
  "IF({customer.tier}=='VIP', 0, 50)" ← VIP بدون رسوم، غيرهم 50 ريال
```

---

---

# Layer 3: Form Builder — تخصيص النماذج والحقول

## 3.1 المشكلة

- وكالة عمرة تحتاج حقل "رقم تصريح العمرة" على نموذج الحجز
- وكالة MICE تحتاج حقول "اسم المؤتمر" و"اسم الشركة المنظِّمة"
- وكالة طيران تريد حقل "رمز الموظف المسؤول في شركة العميل"

الحل: كل نموذج في مسارات يدعم **حقولاً مخصصة إضافية** تُعرَّف من واجهة الإدارة.

## 3.2 أنواع الحقول المدعومة

```
field_types:
  text            — نص حر
  number          — رقم
  currency        — مبلغ مالي
  date            — تاريخ
  datetime        — تاريخ ووقت
  boolean         — نعم / لا
  select          — قائمة اختيار منفرد (Dropdown)
  multiselect     — اختيار متعدد
  file_upload     — رفع ملف (يُحفَظ في Firebase Storage)
  image           — رفع صورة
  phone           — رقم هاتف (مع التحقق)
  email           — بريد إلكتروني
  url             — رابط
  textarea        — نص طويل
  barcode_scan    — مسح باركود/QR
  signature       — توقيع رقمي
  location        — موقع جغرافي
  linked_record   — ربط بسجل آخر (مثل: ربط حجز بعميل)
  calculated      — محسوب من حقول أخرى (Formula)
```

## 3.3 هيكل Firebase للحقول المخصصة

```
/agencies/{agencyId}/custom_fields/{fieldId}
  ├── id: "umrah_permit_number"
  ├── name_ar: "رقم تصريح العمرة"
  ├── name_en: "Umrah Permit Number"
  ├── fieldType: "text"
  ├── appliesTo: "booking"           ← الكيان الذي يُضاف إليه
  ├── applyWhen: {
  │     module: "booking_umrah_hajj" ← يظهر فقط إذا كانت الوحدة مفعَّلة
  │     bookingType: ["umrah", "hajj"]
  │   }
  ├── validation: {
  │     required: true,
  │     pattern: "^[A-Z0-9]{10,15}$",  ← Regex للتحقق
  │     minLength: 10,
  │     maxLength: 15
  │   }
  ├── displayOrder: 5                ← ترتيب الظهور في النموذج
  ├── section: "travel_documents"    ← القسم الذي يندرج تحته
  ├── showInList: true               ← هل يظهر في قوائم الحجوزات؟
  ├── showInPrint: true              ← هل يظهر في الطباعة؟
  ├── searchable: true
  └── isActive: true
```

## 3.4 القسمية (Sections) — تنظيم الحقول

```
كل نموذج مقسم لأقسام قابلة للتكوين:

نموذج الحجز — مثال تخصيص وكالة عمرة:

قسم 1: بيانات الرحلة الأساسية [Core — غير قابل للحذف]
  ├── تاريخ السفر
  ├── وجهة السفر
  └── نوع الحجز

قسم 2: بيانات المسافر [Core]
  ├── الاسم الكامل
  ├── رقم الجواز
  └── تاريخ الانتهاء

قسم 3: وثائق العمرة [Custom — يظهر فقط عند تفعيل وحدة العمرة]
  ├── رقم تصريح العمرة [Custom Field]
  ├── تاريخ انتهاء التصريح [Custom Field]
  └── الموسم (رجب / رمضان / حج) [Custom Field]

قسم 4: بيانات إضافية [Custom — اختياري]
  └── [يضيف المستخدم ما يشاء]
```

## 3.5 مخصص الطباعة (Print Templates)

```
/agencies/{agencyId}/print_templates/{templateId}
  ├── name: "قسيمة الحجز الرسمية"
  ├── appliesTo: "booking"
  ├── language: "ar" | "en" | "bilingual"
  ├── layout: "A4" | "A5" | "thermal_80mm"
  ├── sections: [...]                   ← أقسام التصميم
  ├── headerLogo: "storage_url"
  ├── footerText: "نص تذييل مخصص"
  ├── showFields: ["booking_ref", "customer_name", ...] ← الحقول المُدرجة
  ├── customFields: ["umrah_permit_number"]              ← الحقول المخصصة
  └── htmlTemplate: "<html>...</html>"  ← Jinja-like template
```

---

---

# Layer 4: محرك سير العمل (Workflow Engine)

## 4.1 المشكلة

- وكالة صغيرة: موظف واحد يحجز ويُصدر التذكرة مباشرة
- وكالة متوسطة: الحجز يحتاج موافقة المشرف قبل الإصدار
- شركة كبيرة: سلسلة موافقات (موظف → مشرف → مدير مالي) للحجوزات الكبيرة

## 4.2 تعريف سير عمل (Workflow Definition)

```
/agencies/{agencyId}/workflows/{workflowId}
  ├── id: "booking_approval_high_value"
  ├── name_ar: "موافقة الحجوزات عالية القيمة"
  ├── appliesTo: "booking"
  ├── isActive: true
  ├── trigger: {
  │     event: "booking.created",
  │     conditions: [
  │       { field: "pricing.totalAmount", operator: ">=", value: 10000 }
  │     ]
  │   }
  ├── states: [...]                    ← انظر أدناه
  ├── transitions: [...]               ← الانتقالات المسموحة
  └── notifications: [...]             ← إشعارات تلقائية
```

## 4.3 الحالات والانتقالات (States & Transitions)

```
مثال: سير عمل الحجوزات فوق 10,000 ريال

الحالات (States):
┌───────────────────────────────────────────────────────────┐
│  draft → pending_supervisor → pending_finance → confirmed │
│              ↓                      ↓                     │
│           rejected              rejected                   │
└───────────────────────────────────────────────────────────┘

تعريف كل حالة:
  draft:
    label_ar: "مسودة"
    allowedActions: ["edit", "submit_for_approval", "delete"]
    assignedTo: "creator"

  pending_supervisor:
    label_ar: "بانتظار موافقة المشرف"
    allowedActions: ["approve", "reject", "request_info"]
    assignedTo: { role: "supervisor" }
    sla: { hours: 4 }               ← تصعيد تلقائي إذا تأخر
    notification: {
      onEnter: { to: "assignee", template: "approval_request" }
      onSLA: { to: ["assignee", "manager"], template: "sla_breach" }
    }

  pending_finance:
    label_ar: "بانتظار موافقة المالية"
    assignedTo: { role: "finance_manager" }
    sla: { hours: 8 }

  confirmed:
    label_ar: "مؤكد"
    allowedActions: ["issue_ticket", "cancel"]
    onEnter: { action: "create_journal_entry" }  ← تشغيل Firebase Function

  rejected:
    label_ar: "مرفوض"
    requiresNote: true              ← سبب الرفض إلزامي
    notification: { to: "creator", template: "booking_rejected" }
```

## 4.4 الأتمتة (Automation Actions)

```
كل حالة أو انتقال يمكن ربطه بإجراءات تلقائية:

أنواع الإجراءات التلقائية:
  send_notification     — إرسال إشعار (تطبيق / واتساب / إيميل)
  create_task           — إنشاء مهمة لموظف
  create_journal_entry  — إنشاء قيد محاسبي
  update_field          — تحديث حقل في السجل
  call_webhook          — استدعاء API خارجي
  generate_document     — توليد مستند (فاتورة / تذكرة / قسيمة)
  send_to_zatca         — إرسال الفاتورة لـ ZATCA
  schedule_reminder     — جدولة تذكير مستقبلي
  trigger_workflow      — تشغيل سير عمل آخر
```

## 4.5 سير العمل الجاهزة (Workflow Templates)

```
قوالب جاهزة يمكن للوكالة استخدامها كما هي أو تعديلها:

WF-001: حجز بسيط (بدون موافقات)
  draft → confirmed
  مناسب لـ: وكالات صغيرة

WF-002: موافقة مزدوجة
  draft → pending_approval → confirmed
  مناسب لـ: وكالات متوسطة

WF-003: موافقة ثلاثية (للحجوزات الكبيرة)
  draft → pending_supervisor → pending_finance → confirmed
  مناسب لـ: شركات كبيرة

WF-004: سير عمل العمرة
  draft → documents_check → pending_nusuk → confirmed → executed
  مناسب لـ: شركات العمرة

WF-005: سير عمل B2B (الوكلاء)
  draft → pending_agent_confirmation → confirmed → ticketed
  مناسب لـ: شبكات الوكلاء

WF-006: استرداد المبالغ
  refund_requested → airline_submitted → amount_received → refunded
  مناسب لـ: جميع الوكالات
```

---

---

# Layer 5: الهوية البصرية وWhite Label

## 5.1 مستويات التخصيص البصري

```
مستوى 1: أساسي (متاح لجميع الخطط)
  ├── شعار الوكالة
  ├── لون رئيسي واحد
  └── اسم الوكالة في رأس الصفحة

مستوى 2: متقدم (خطة Professional)
  ├── لوحة ألوان كاملة (Primary / Secondary / Accent)
  ├── خط عربي مخصص
  ├── صورة خلفية تسجيل الدخول
  └── تخصيص قوالب الطباعة

مستوى 3: Enterprise White Label
  ├── نطاق مخصص (agency.domain.com بدلاً من masarat.app)
  ├── تطبيق جوال بشعار الوكالة (App Rebrand)
  ├── إخفاء شعار مسارات بالكامل
  └── رسائل إيميل وواتساب بهوية الوكالة
```

## 5.2 هيكل Firebase للهوية البصرية

```
/agencies/{agencyId}/config/branding
  ├── logoUrl: "storage://agencies/xxx/logo.png"
  ├── faviconUrl: "storage://agencies/xxx/favicon.ico"
  ├── colors: {
  │     primary: "#1B4F8A",
  │     secondary: "#F4A326",
  │     accent: "#2ECC71",
  │     background: "#F8F9FA",
  │     text: "#2C3E50"
  │   }
  ├── fonts: {
  │     arabic: "Tajawal",      ← Google Fonts Arabic
  │     english: "Inter"
  │   }
  ├── agencyName: { ar: "وكالة النجوم", en: "Al Nujoom Travel" }
  ├── tagline: { ar: "رحلتك.. حلمنا", en: "Your Journey, Our Dream" }
  ├── customDomain: "travel.alnujoom.sa"
  ├── loginBackground: "storage://agencies/xxx/bg.jpg"
  └── hidemasaratBranding: false   ← true في Enterprise فقط
```

---

---

# نظام الصلاحيات المتقدم (RBAC — Role-Based Access Control)

## بنية الأدوار

```
مستويان من الأدوار:

1. أدوار النظام (System Roles) — محددة مسبقاً، غير قابلة للحذف:
   super_admin    — مدير مسارات (SaaS Provider)
   agency_owner   — مالك الوكالة
   agency_admin   — مدير الوكالة
   finance_manager — مدير مالي
   supervisor     — مشرف
   agent          — موظف مبيعات
   accountant     — محاسب
   readonly       — قراءة فقط

2. أدوار مخصصة (Custom Roles) — تنشئها كل وكالة:
   مثال: "مشرف العمرة" = supervisor + صلاحيات وحدة العمرة فقط
   مثال: "محاسب الخليج" = accountant + قراءة تقارير فروع الخليج
```

## هيكل الصلاحيات (Permissions Schema)

```
/agencies/{agencyId}/roles/{roleId}
  ├── name_ar: "مشرف المبيعات"
  ├── permissions: {
  │     booking: {
  │       create: true,
  │       read: "own_team",    ← own / own_team / all
  │       update: "own",
  │       delete: false,
  │       approve: true        ← صلاحية الموافقة
  │     },
  │     invoice: {
  │       create: true,
  │       read: "all",
  │       update: false,       ← لا يعدل الفواتير الصادرة
  │       void: false
  │     },
  │     reports: {
  │       sales: "own_team",
  │       financial: false,    ← لا يرى التقارير المالية
  │       vat: false
  │     },
  │     settings: {
  │       modules: false,
  │       pricing_rules: false,
  │       users: false
  │     }
  │   }
  └── moduleAccess: ["booking_flights", "booking_hotels", "crm"]
```

---

---

# خطط الاشتراك (SaaS Subscription Plans)

## تقسيم الخطط

| الميزة | مجاني | Starter | Professional | Enterprise |
|-------|-------|---------|-------------|-----------|
| عدد المستخدمين | 2 | 5 | 20 | غير محدود |
| الحجوزات / شهر | 50 | 500 | غير محدود | غير محدود |
| الوحدات الأساسية | ✓ | ✓ | ✓ | ✓ |
| وحدات الحجوزات | طيران فقط | 3 وحدات | جميعها | جميعها |
| العمرة والحج | ✗ | ✗ | ✓ | ✓ |
| B2B الوكلاء | ✗ | ✗ | ✓ | ✓ |
| محرك التسعير | ✗ | أساسي | متقدم | كامل |
| سير العمل | ✗ | قوالب فقط | مخصص | مخصص + API |
| Form Builder | ✗ | 3 حقول | 20 حقل | غير محدود |
| White Label | ✗ | ✗ | ✗ | ✓ |
| تكامل GDS | ✗ | Sandbox | ✓ | ✓ |
| ZATCA Phase 2 | ✓ | ✓ | ✓ | ✓ |
| دعم فني | مجتمع | إيميل | أولوية | مدير حساب |

## التسعير المقترح

```
Free        — 0 ريال / شهر          (للتجربة والوكالات الصغيرة جداً)
Starter     — 299 ريال / شهر        (وكالة تذاكر بسيطة)
Professional — 799 ريال / شهر       (وكالة سياحية متكاملة)
Enterprise  — من 1,999 ريال / شهر  (تفاوضي حسب الحجم)

نموذج بديل للوكالات الكبيرة:
  رسوم ثابتة + X ريال لكل 100 حجزة فوق الحد
```

---

---

# هيكل Firebase الموسّع (مع طبقة التخصيص)

## المجموعات الجديدة المطلوبة

```
/module_registry/                     ← كتالوج الوحدات (Admin-managed)

/agencies/{agencyId}/
  ├── config/
  │   ├── modules                     ← الوحدات المفعَّلة
  │   ├── branding                    ← الهوية البصرية
  │   ├── accounting_settings         ← إعدادات المحاسبة والضريبة
  │   ├── zatca_config                ← مفاتيح ZATCA والشهادات
  │   └── integrations                ← مفاتيح API الخارجية
  │
  ├── pricing_rules/                  ← قواعد التسعير المخصصة
  ├── custom_fields/                  ← الحقول المخصصة
  ├── print_templates/                ← قوالب الطباعة
  ├── workflows/                      ← سير العمل
  ├── roles/                          ← الأدوار والصلاحيات
  ├── notification_templates/         ← قوالب الإشعارات والرسائل
  └── audit_log/                      ← سجل كل تغيير في الإعدادات
```

## Firestore Security Rules — الطبقة الحماية

```
قاعدة العزل متعدد المستأجرين (Multi-Tenant Isolation):

rule: لكل مجموعة بيانات، يُتحقق من:
  1. المستخدم مسجل الدخول (authenticated)
  2. agencyId في البيانات = agencyId في token المستخدم
  3. المستخدم لديه الصلاحية المطلوبة (من roles collection)
  4. الوحدة المطلوبة مفعَّلة للوكالة

لا يستطيع مستخدم وكالة A أن يرى أو يعدل أي بيانات لوكالة B.
```

---

---

# خارطة الطريق المحدّثة (مع طبقة التخصيص)

## المرحلة 0 — البنية التحتية للتخصيص (الشهر 1-2)
- [ ] Multi-Tenant Foundation مع agencyId isolation
- [ ] Module Registry وآلية التفعيل الديناميكي
- [ ] نظام الصلاحيات RBAC
- [ ] Subscription Plans وفحص الوصول

## المرحلة 1 — MVP التشغيلي (الشهر 3-4)
- [ ] النواة الأساسية (Core Modules)
- [ ] وحدتا الطيران والفنادق
- [ ] محرك التسعير الأساسي (Fixed Fee + Percentage)
- [ ] ZATCA Compliance

## المرحلة 2 — التخصيص الكامل (الشهر 5-6)
- [ ] Form Builder الكامل
- [ ] Workflow Engine مع القوالب الجاهزة
- [ ] White Label (الهوية البصرية)
- [ ] وحدة العمرة والحج

## المرحلة 3 — المتقدم (الشهر 7-8)
- [ ] محرك تسعير متقدم (Tiered + Formula)
- [ ] B2B Agents Network
- [ ] تطبيق الجوال
- [ ] تكاملات GDS

## المرحلة 4 — Enterprise (الشهر 9+)
- [ ] Custom Domain / Full White Label
- [ ] API للتكاملات الخارجية
- [ ] Webhooks لـ third-party
- [ ] BI وتقارير متقدمة

---

## ملخص القرارات المعمارية الجوهرية

| القرار | الاختيار | السبب |
|--------|---------|-------|
| نموذج التخصيص | Config-driven (Data over Code) | لا تعديل كود عند كل وكالة |
| عزل المستأجرين | agencyId في كل document | أبسط وأسرع من collections منفصلة |
| محرك القواعد | Client-side evaluation + Server validation | سرعة + أمان |
| الأدوار | RBAC مع Firestore Security Rules | أمان حقيقي على مستوى قاعدة البيانات |
| الوحدات | Runtime activation (لا build-time) | تفعيل فوري بدون نشر |
| القوالب | Jinja-like templating في Firebase Functions | تنفيذ آمن server-side |

---

*وثيقة مسارات ERP — Customization Architecture v1.0*
