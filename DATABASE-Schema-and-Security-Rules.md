# Data Schema التفصيلي وFirebase Security Rules
# نظام مسارات ERP
**الإصدار:** 1.0 | **التاريخ:** مايو 2026

---

## هيكل المجموعات الكامل (Collections Map)

```
Firestore Root
│
├── /platform/                          ← إعدادات مسارات (SaaS Provider فقط)
│   ├── config
│   └── module_registry/
│
├── /agencies/{agencyId}/               ← بيانات كل وكالة
│   ├── profile
│   ├── config/
│   │   ├── modules
│   │   ├── branding
│   │   ├── accounting
│   │   ├── zatca
│   │   └── integrations
│   ├── pricing_rules/
│   ├── custom_fields/
│   ├── print_templates/
│   ├── workflows/
│   ├── roles/
│   ├── notification_templates/
│   └── audit_log/
│
├── /users/{userId}/                    ← حسابات المستخدمين
│
├── /customers/{customerId}/            ← ملفات العملاء
│   └── passports/
│
├── /bookings/{bookingId}/              ← جميع الحجوزات
│   ├── passengers/
│   ├── payments/
│   └── history/
│
├── /invoices/{invoiceId}/              ← الفواتير الرسمية
│   └── lines/
│
├── /journal_entries/{entryId}/         ← دفتر اليومية
│   └── lines/
│
├── /suppliers/{supplierId}/            ← الموردون
│   └── contracts/
│
├── /supplier_settlements/{id}/         ← تسويات الموردين
│
├── /vat_returns/{returnId}/            ← إقرارات VAT
│
└── /notifications/{notifId}/           ← الإشعارات
```

---

---

# القسم الأول: Schema التفصيلي

---

## 1. platform/config — إعدادات النظام المركزية

```javascript
// /platform/config  (document واحد)
{
  version: "1.0.0",
  maintenanceMode: false,
  supportedCountries: ["SA", "AE", "KW", "BH", "QA", "OM"],
  defaultCurrency: "SAR",
  vatRates: {
    SA: 0.15,
    AE: 0.05
  },
  subscriptionPlans: {
    free:         { maxUsers: 2,  maxBookingsPerMonth: 50,   price: 0 },
    starter:      { maxUsers: 5,  maxBookingsPerMonth: 500,  price: 299 },
    professional: { maxUsers: 20, maxBookingsPerMonth: -1,   price: 799 },
    enterprise:   { maxUsers: -1, maxBookingsPerMonth: -1,   price: -1 }
  },
  updatedAt: Timestamp
}
```

---

## 2. platform/module_registry/{moduleId} — كتالوج الوحدات

```javascript
// /platform/module_registry/booking_umrah_hajj
{
  id: "booking_umrah_hajj",
  name: { ar: "العمرة والحج", en: "Umrah & Hajj" },
  version: "1.2.0",
  category: "booking",                   // booking | finance | crm | ops | reporting
  icon: "🕋",
  description: { ar: "...", en: "..." },

  requiredPlan: "professional",          // free | starter | professional | enterprise
  dependencies: ["core_crm", "booking_base", "ops_groups"],
  incompatibleWith: [],

  defaultEnabled: false,

  // عناصر القائمة التي تُضاف عند التفعيل
  menuItems: [
    {
      id: "umrah_bookings",
      label: { ar: "حجوزات العمرة", en: "Umrah Bookings" },
      icon: "mosque",
      route: "/bookings/umrah",
      parentMenu: "bookings",
      order: 30,
      requiredPermission: "booking.read"
    }
  ],

  // الصلاحيات الجديدة التي تُضاف مع الوحدة
  permissions: [
    "umrah.manage_permits",
    "umrah.manage_groups",
    "hajj.manage_quota"
  ],

  // مجموعات Firestore التي تحتاجها الوحدة
  firestoreCollections: ["umrah_groups", "umrah_permits"],

  // الحقول الإضافية التي تُضاف تلقائياً على حجوزات العمرة
  defaultCustomFields: [
    {
      id: "umrah_permit_number",
      name: { ar: "رقم تصريح العمرة", en: "Umrah Permit Number" },
      fieldType: "text",
      required: true,
      appliesWhen: { bookingType: ["umrah", "hajj"] }
    },
    {
      id: "umrah_season",
      name: { ar: "الموسم", en: "Season" },
      fieldType: "select",
      options: [
        { value: "rajab",   label: { ar: "رجب",   en: "Rajab" } },
        { value: "ramadan", label: { ar: "رمضان", en: "Ramadan" } },
        { value: "hajj",    label: { ar: "حج",    en: "Hajj" } }
      ],
      required: true
    }
  ],

  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

---

## 3. agencies/{agencyId} — ملف الوكالة

### 3.1 الملف الرئيسي (profile document)

```javascript
// /agencies/{agencyId}  (document رئيسي)
{
  id: "ag_01HXYZ...",                    // ULID لسرعة الفرز
  
  // بيانات الوكالة الأساسية
  legalName:     { ar: "شركة النجوم للسياحة", en: "Al Nujoom Tourism Co." },
  tradeName:     { ar: "وكالة النجوم",        en: "Al Nujoom Travel" },
  
  // بيانات قانونية
  crNumber:      "1010XXXXXX",           // رقم السجل التجاري
  vatNumber:     "300XXXXXXXXXXX",       // 15 خانة تبدأ بـ 300
  tourismLicense: "T-XXXXX",            // ترخيص وزارة السياحة
  tourismCategory: "A",                  // A | B | C
  iataCode:      "XXXXX",               // كود IATA (إن وجد)
  
  // العنوان الوطني (REGA)
  address: {
    buildingNumber: "1234",
    streetName:     { ar: "شارع التحلية", en: "Tahlia Street" },
    district:       { ar: "العليا",       en: "Al Olaya" },
    city:           { ar: "الرياض",       en: "Riyadh" },
    postalCode:     "12345",
    additionalCode: "6789",
    countryCode:    "SA"
  },
  
  // بيانات التواصل
  phone:      "+966-11-XXXXXXX",
  mobile:     "+966-5X-XXXXXXX",
  email:      "info@alnujoom.sa",
  website:    "https://alnujoom.sa",
  
  // الاشتراك
  subscription: {
    plan:       "professional",
    status:     "active",               // active | suspended | cancelled | trial
    trialEnds:  null,
    currentPeriodStart: Timestamp,
    currentPeriodEnd:   Timestamp,
    stripeCustomerId:   "cus_XXXXX"     // أو بوابة دفع أخرى
  },
  
  // إحصائيات للمراقبة
  stats: {
    totalUsers:    8,
    bookingsThisMonth: 143,
    lastActiveAt:  Timestamp
  },
  
  // إعدادات عامة
  settings: {
    defaultCurrency: "SAR",
    defaultLanguage: "ar",
    timezone:        "Asia/Riyadh",
    dateFormat:      "DD/MM/YYYY",
    fiscalYearStart: "01-01"            // شهر-يوم بداية السنة المالية
  },
  
  isActive:   true,
  createdAt:  Timestamp,
  updatedAt:  Timestamp
}
```

### 3.2 إعدادات الوحدات

```javascript
// /agencies/{agencyId}/config/modules
{
  enabled: [
    "core_auth",
    "core_crm",
    "core_billing",
    "core_accounting",
    "core_zatca",
    "booking_flights",
    "booking_hotels",
    "booking_umrah_hajj",
    "ops_groups",
    "finance_bsp_settlement",
    "sales_quotations"
  ],
  lastModifiedAt: Timestamp,
  lastModifiedBy: "usr_XXXXX"
}
```

### 3.3 إعدادات المحاسبة

```javascript
// /agencies/{agencyId}/config/accounting
{
  // نموذج الإيراد الافتراضي
  defaultRevenueModel: {
    flights:  "agent",      // agent | principal
    hotels:   "agent",
    packages: "principal",
    umrah:    "principal",
    hajj:     "principal",
    insurance:"agent"
  },
  
  // ربط الحسابات بأنواع المعاملات
  accountMappings: {
    // إيرادات
    commissionFlightDomestic:   "6001",
    commissionFlightInternational: "6002",
    commissionHotelDomestic:    "6003",
    commissionHotelInternational: "6004",
    commissionUmrah:            "6005",
    commissionInsurance:        "6006",
    serviceFees:                "6007",
    packageRevenue:             "6101",
    
    // تكاليف
    flightCost:                 "7001",
    hotelCost:                  "7002",
    packageCost:                "7003",
    
    // أصول ومطلوبات
    mainCashAccount:            "1001",
    mainBankAccount:            "1002",
    bspClearingAccount:         "1004",
    customerDepositsAccount:    "3202",
    vatOutputAccount:           "3101",
    vatInputAccount:            "1203",
    airlinePayableAccount:      "3001",
    hotelPayableAccount:        "3002",
    deferredRevenueAccount:     "3201"
  },
  
  // إعدادات VAT
  vat: {
    registrationNumber: "300XXXXXXXXXXX",
    rate:               0.15,
    filingFrequency:    "quarterly",    // monthly | quarterly
    nextReturnDue:      Timestamp
  }
}
```

### 3.4 إعدادات ZATCA

```javascript
// /agencies/{agencyId}/config/zatca
{
  environment:     "production",        // sandbox | production
  sellerName:      { ar: "شركة النجوم للسياحة", en: "Al Nujoom Tourism" },
  vatNumber:       "300XXXXXXXXXXX",
  crNumber:        "1010XXXXXX",
  
  // الشهادات (Base64 — تُخزَّن في Firebase مشفَّرة)
  certificate:     "ENCRYPTED:BASE64...",
  privateKey:      "ENCRYPTED:BASE64...",
  certificateSerial: "XXXXXXXXXXXXXXXX",
  
  // عداد الفواتير (يجب أن يكون تسلسلياً بلا فجوات)
  invoiceCounter:  {
    lastTaxInvoice:   1547,
    lastCreditNote:   23,
    lastDebitNote:    5
  },
  
  // إعدادات الإرسال
  autoSubmit:      true,               // إرسال الفاتورة لـ ZATCA فور الإصدار
  submissionMode:  "clearance",        // clearance | reporting
  
  isConfigured:   true,
  configuredAt:   Timestamp,
  configuredBy:   "usr_XXXXX"
}
```

---

## 4. users/{userId} — حسابات المستخدمين

```javascript
// /users/{userId}
// ملاحظة: userId = Firebase Auth UID
{
  id:        "usr_firebase_uid_XXXXX",
  agencyId:  "ag_01HXYZ...",           // ربط بالوكالة
  
  // بيانات شخصية
  name:      { ar: "أحمد محمد العتيبي", en: "Ahmed Al-Otaibi" },
  email:     "ahmed@alnujoom.sa",
  mobile:    "+966-5X-XXXXXXX",
  avatarUrl: "storage://users/usr_XXX/avatar.jpg",
  
  // الدور والصلاحيات
  role:      "supervisor",             // دور من roles collection
  
  // الوحدات التي يمكنه الوصول إليها (subset من المفعَّلة للوكالة)
  allowedModules: null,                // null = جميع وحدات الوكالة
  
  // إعدادات شخصية
  preferences: {
    language:    "ar",
    theme:       "light",              // light | dark | system
    notifications: {
      bookingCreated:   true,
      paymentReceived:  true,
      approvalRequired: true,
      dailySummary:     false
    }
  },
  
  // بيانات الوصول
  lastLoginAt:  Timestamp,
  lastLoginIp:  "XXX.XXX.XXX.XXX",
  loginCount:   247,
  
  // حالة الحساب
  isActive:    true,
  isVerified:  true,
  
  createdAt:   Timestamp,
  updatedAt:   Timestamp,
  createdBy:   "usr_XXXXX"            // المدير الذي أنشأ الحساب
}
```

---

## 5. agencies/{agencyId}/roles/{roleId} — الأدوار والصلاحيات

```javascript
// /agencies/{agencyId}/roles/supervisor
{
  id:        "supervisor",
  name:      { ar: "مشرف المبيعات", en: "Sales Supervisor" },
  isSystem:  false,                    // true = دور نظام لا يُحذف
  
  permissions: {
    
    // ---- إدارة العملاء ----
    customer: {
      create:     true,
      read:       "all",               // own | own_team | all
      update:     "all",
      delete:     false,
      export:     false                // تصدير البيانات
    },
    
    // ---- الحجوزات ----
    booking: {
      create:     true,
      read:       "all",
      update:     "own_team",
      delete:     false,
      approve:    true,                // الموافقة على حجوزات الفريق
      cancel:     "own_team",
      viewCost:   true                 // رؤية سعر التكلفة
    },
    
    // ---- الفواتير ----
    invoice: {
      create:     true,
      read:       "all",
      update:     false,               // لا تعديل على فاتورة صادرة
      void:       false,               // لا إلغاء فاتورة
      print:      true,
      sendToZatca: false
    },
    
    // ---- المدفوعات ----
    payment: {
      create:     true,               // استلام دفعة
      read:       "all",
      refund:     false               // الاسترداد للمدير فقط
    },
    
    // ---- المحاسبة ----
    accounting: {
      viewJournal:    false,
      createEntry:    false,
      viewReports:    false,
      vatReturn:      false
    },
    
    // ---- التقارير ----
    reports: {
      sales:          "own_team",
      financial:      false,
      vat:            false,
      suppliers:      false,
      export:         false
    },
    
    // ---- إدارة النظام ----
    settings: {
      modules:        false,
      pricingRules:   false,
      customFields:   false,
      workflows:      false,
      users:          false,
      roles:          false
    }
  },
  
  // الوحدات التي يستطيع الوصول إليها
  moduleAccess: [
    "core_crm",
    "booking_flights",
    "booking_hotels",
    "booking_umrah_hajj",
    "sales_quotations"
  ],
  
  createdAt:  Timestamp,
  updatedAt:  Timestamp
}
```

---

## 6. customers/{customerId} — ملفات العملاء

```javascript
// /customers/{customerId}
{
  id:        "cust_01HXYZ...",
  agencyId:  "ag_01HXYZ...",           // Multi-tenant isolation
  
  // نوع العميل
  type:      "individual",             // individual | company | sub_agent
  
  // بيانات الفرد
  name:      { ar: "عبدالله سعد الغامدي", en: "Abdullah Al-Ghamdi" },
  gender:    "male",                   // male | female
  nationality: "SA",                  // ISO 3166-1 alpha-2
  dateOfBirth: "1985-03-15",
  
  // بيانات الشركة (إذا كان type = company)
  company: null,
  // أو:
  // company: {
  //   name:      { ar: "شركة ألفا", en: "Alpha Co." },
  //   crNumber:  "XXXXXXXXXX",
  //   vatNumber: "300XXXXXXXXXX",
  //   contactPerson: "علي أحمد"
  // }
  
  // بيانات التواصل
  mobile:    "+966-5X-XXXXXXX",
  email:     "abdullah@email.com",
  whatsapp:  "+966-5X-XXXXXXX",       // قد يختلف عن الجوال
  
  // العنوان
  address: {
    city:    { ar: "جدة", en: "Jeddah" },
    district: "النزهة",
    countryCode: "SA"
  },
  
  // تصنيفات وعلامات
  tags:      ["VIP", "frequent_traveler", "ramadan_umrah"],
  tier:      "gold",                   // standard | silver | gold | platinum
  
  // برنامج الولاء
  loyalty: {
    points:        2450,
    totalEarned:   5200,
    totalRedeemed: 2750,
    tier:          "gold",
    joinedAt:      Timestamp
  },
  
  // إحصائيات (Denormalized للسرعة)
  stats: {
    totalBookings:    18,
    totalSpent:       45230,           // ريال
    lastBookingAt:    Timestamp,
    lastBookingId:    "bk_XXXXX"
  },
  
  // حالة الائتمان (للشركات والوكلاء)
  credit: {
    limit:     0,                      // 0 = لا ائتمان
    used:      0,
    available: 0
  },
  
  // تنبيهات
  flags: {
    hasUnpaidBalance: false,
    isBlacklisted:    false,
    blacklistReason:  null,
    requiresDeposit:  false
  },
  
  // الموظف المسؤول
  assignedAgentId: "usr_XXXXX",
  
  notes:     "عميل VIP يفضل طيران الأعمال",
  
  isActive:  true,
  createdAt: Timestamp,
  updatedAt: Timestamp,
  createdBy: "usr_XXXXX"
}
```

### Sub-collection: customers/{customerId}/passports/{passportId}

```javascript
// /customers/{customerId}/passports/{passportId}
{
  id:            "pp_01HXYZ...",
  
  // بيانات الجواز
  number:        "A12345678",
  type:          "regular",            // regular | diplomatic | service
  issuingCountry: "SA",
  issueDate:     "2020-05-10",
  expiryDate:    "2030-05-09",
  
  // بيانات شخصية (قد تختلف عن ملف العميل)
  fullNameAr:    "عبدالله سعد الغامدي",
  fullNameEn:    "ABDULLAH SAAD ALGHAMDI",
  nationality:   "SAU",               // ISO 3166-1 alpha-3 (كما في الجواز)
  dateOfBirth:   "1985-03-15",
  gender:        "M",
  
  // صورة الجواز
  imageUrl:      "storage://customers/cust_XXX/passports/pp_XXX.jpg",
  
  // حالة الجواز
  isPrimary:     true,                 // الجواز الرئيسي
  isExpired:     false,
  expiresInDays: 1440,                 // Computed (لا يُخزَّن — يُحسب في runtime)
  
  // تنبيهات
  alerts: {
    expiryWarning: false,              // true إذا انتهى خلال 6 أشهر
    nearExpiry:    false               // true إذا انتهى خلال سنة
  },
  
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

---

## 7. bookings/{bookingId} — الحجوزات

```javascript
// /bookings/{bookingId}
{
  id:        "bk_01HXYZ...",
  agencyId:  "ag_01HXYZ...",
  
  // ---- التصنيف ----
  type:      "flight",                 // flight | hotel | package | umrah | hajj |
                                       // visa | insurance | transport | cruise
  subType:   null,                     // للتفاصيل: one_way | round_trip | multi_city
  
  // ---- الحالة (تتحكم فيها الـ Workflow Engine) ----
  status:    "confirmed",              // draft | pending_approval | confirmed |
                                       // ticketed | completed | cancelled | refunded
  workflowState: {
    currentState:  "confirmed",
    workflowId:    "wf_booking_standard",
    history: [
      {
        from:       "draft",
        to:         "pending_approval",
        by:         "usr_XXXXX",
        at:         Timestamp,
        note:       null
      },
      {
        from:       "pending_approval",
        to:         "confirmed",
        by:         "usr_YYYYY",
        at:         Timestamp,
        note:       "تم التحقق من الأسعار"
      }
    ]
  },
  
  // ---- العميل ----
  customerId:    "cust_01HXYZ...",
  customerName:  { ar: "عبدالله الغامدي", en: "Abdullah Al-Ghamdi" },  // Denormalized
  customerPhone: "+966-5X-XXXXXXX",                                     // Denormalized
  
  // ---- الموظف المسؤول ----
  agentId:       "usr_XXXXX",
  agentName:     "أحمد العتيبي",      // Denormalized
  
  // ---- تفاصيل الرحلة (مخصص لكل نوع) ----
  flightDetails: {                     // يوجد فقط إذا type = "flight"
    
    segments: [
      {
        segmentOrder: 1,
        origin:       { code: "RUH", name: { ar: "الرياض",   en: "Riyadh" } },
        destination:  { code: "JED", name: { ar: "جدة",      en: "Jeddah" } },
        airline:      { code: "SV",  name: { ar: "الخطوط السعودية", en: "Saudia" } },
        flightNumber: "SV123",
        departureDateTime: Timestamp,
        arrivalDateTime:   Timestamp,
        cabin:        "economy",       // economy | business | first
        fareClass:    "Y",
        baggageAllowance: "23kg"
      }
    ],
    
    isInternational: false,
    gdsSource:       "amadeus",       // amadeus | sabre | galileo | direct
    pnrCode:         "ABCDEF",        // كود الحجز في GDS
    ticketTimeLimit: Timestamp,       // آخر موعد لإصدار التذكرة
    fareBasis:       "YOWSA"
  },
  
  hotelDetails: null,                  // مثال في حجز الفندق (انظر أدناه)
  packageDetails: null,
  umrahDetails: null,
  
  // ---- المسافرون ----
  // Denormalized لسرعة القراءة (بيانات مكررة من passports)
  passengers: [
    {
      order:         1,
      type:          "adult",          // adult | child | infant
      title:         "Mr",
      nameEn:        "ABDULLAH ALGHAMDI",
      nameAr:        "عبدالله الغامدي",
      passportNumber: "A12345678",
      passportExpiry: "2030-05-09",
      nationality:   "SA",
      dateOfBirth:   "1985-03-15",
      gender:        "male",
      customerId:    "cust_01HXYZ...", // ربط بالملف الأصلي
      passportId:    "pp_01HXYZ...",
      
      // تذكرة الطيران (بعد الإصدار)
      ticket: {
        number:   "0652345678901",     // 13 خانة
        issuedAt: Timestamp,
        issuedBy: "usr_XXXXX",
        status:   "active",           // active | used | refunded | exchanged
        emdNumber: null               // Electronic Miscellaneous Document
      }
    }
  ],
  
  // ---- التسعير ----
  pricing: {
    revenueModel:  "agent",           // agent | principal
    currency:      "SAR",
    
    // التكلفة (من المورد)
    costBreakdown: [
      { description: "سعر التذكرة",  amount: 850, vatAmount: 0 }
    ],
    totalCost:     850,
    
    // سعر البيع للعميل
    sellingBreakdown: [
      { description: "سعر التذكرة",  amount: 850,  vatAmount: 0,   vatType: "zero_rate" },
      { description: "رسوم الخدمة",  amount: 75,   vatAmount: 11.25, vatType: "taxable" }
    ],
    subtotal:      925,
    vatAmount:     11.25,
    totalAmount:   936.25,
    
    // الربح (في نموذج الوكيل = commissions)
    commission:    75,                 // 925 - 850
    serviceFee:    75,
    
    // الحقوق المحاسبية
    revenueAccountCode: "6002",       // رقم حساب الإيراد المرتبط
    
    pricingRulesApplied: ["rule_intl_flight_service_fee"]   // القواعد المطبّقة
  },
  
  // ---- الدفع والفواتير ----
  paymentStatus:  "fully_paid",       // unpaid | partial | fully_paid | refunded
  totalPaid:      936.25,
  totalDue:       0,
  invoiceIds:     ["inv_01HXYZ..."],
  paymentIds:     ["pay_01HXYZ...", "pay_01HABC..."],
  
  // ---- المورد ----
  supplierId:     "sup_saudia",
  supplierName:   "الخطوط الجوية السعودية",   // Denormalized
  supplierRef:    "ABCDEF",           // PNR أو رقم تأكيد المورد
  settlementStatus: "pending",        // pending | settled
  settlementId:   null,
  
  // ---- الحقول المخصصة ----
  // يُملأ ديناميكياً حسب الوحدات المفعَّلة والحقول المخصصة للوكالة
  customFields: {},
  
  // ---- الوثائق ----
  documents: [
    {
      type:      "eticket",           // eticket | voucher | insurance_policy | permit
      url:       "storage://bookings/bk_XXX/eticket.pdf",
      generatedAt: Timestamp,
      sentToCustomer: true,
      sentAt:    Timestamp,
      sentVia:   "whatsapp"
    }
  ],
  
  // ---- بيانات إضافية ----
  source:        "web",               // web | mobile | api | whatsapp
  notes:         "العميل يفضل مقعد نافذة",
  internalNotes: "تم التفاوض على سعر خاص",  // لا يرى العميل هذا
  
  travelDate:    Timestamp,           // مُفهرس للبحث السريع
  returnDate:    Timestamp,
  
  createdAt:     Timestamp,
  updatedAt:     Timestamp,
  completedAt:   null,
  cancelledAt:   null,
  cancelReason:  null
}
```

### مثال: hotelDetails

```javascript
hotelDetails: {
  checkIn:       "2026-08-01",
  checkOut:      "2026-08-07",
  nights:        6,
  
  hotel: {
    id:          "htl_hilton_jeddah",
    name:        { ar: "هيلتون جدة", en: "Hilton Jeddah" },
    stars:       5,
    city:        { ar: "جدة", en: "Jeddah" },
    countryCode: "SA",
    address:     "King Abdullah Road, Jeddah",
    phone:       "+966-12-XXXXXXX",
    confirmationNumber: "HTL-XXXXXXXX"
  },
  
  rooms: [
    {
      type:        "deluxe_sea_view",
      description: { ar: "ديلوكس إطلالة بحر", en: "Deluxe Sea View" },
      guests:      2,
      mealPlan:    "BB",             // RO | BB | HB | FB | AI
      bedType:     "king",
      costPerNight: 450,
      sellingPerNight: 520
    }
  ],
  
  isRefundable:  true,
  cancellationDeadline: Timestamp,
  cancellationPolicy: "مجاني حتى 48 ساعة قبل الوصول"
}
```

### مثال: umrahDetails

```javascript
umrahDetails: {
  season:        "ramadan",
  packageType:   "economy",          // economy | standard | vip
  
  makkahHotel: {
    name:       "برج ساعة مكة",
    stars:      5,
    distanceFromHaram: "150m",
    checkIn:    "2026-03-01",
    checkOut:   "2026-03-10",
    nights:     9,
    roomType:   "quad"               // single | double | triple | quad
  },
  
  madinahHotel: {
    name:       "أنوار المدينة",
    stars:      4,
    distanceFromMasjid: "500m",
    checkIn:    "2026-03-10",
    checkOut:   "2026-03-14",
    nights:     4,
    roomType:   "quad"
  },
  
  // تصاريح نظام نُسُك
  nusukPermits: [
    {
      passengerId: 0,                // index في passengers array
      permitNumber: "NU-XXXXXXXXXX",
      permitType:   "umrah",
      issueDate:    Timestamp,
      expiryDate:   Timestamp,
      status:       "issued"
    }
  ],
  
  // برنامج الرحلة
  itinerary: [
    { day: 1, description: { ar: "السفر من الرياض", en: "Departure from Riyadh" } },
    { day: 2, description: { ar: "الوصول لمكة المكرمة", en: "Arrival in Makkah" } }
  ],
  
  transportIncluded: true,
  transportType: "bus",              // bus | private_car | van
  groupId: "grp_XXXXX"              // إذا كان ضمن مجموعة
}
```

---

## 8. invoices/{invoiceId} — الفواتير

```javascript
// /invoices/{invoiceId}
{
  id:            "inv_01HXYZ...",
  agencyId:      "ag_01HXYZ...",
  
  // ---- نوع الوثيقة ----
  type:          "tax_invoice",       // tax_invoice | credit_note | debit_note
  invoiceNumber: "INV-2026-001547",   // تسلسلي بلا فجوات
  
  // رقم الوثيقة الأصل (للإشعارات)
  originalInvoiceId:     null,
  originalInvoiceNumber: null,
  
  // ---- الأطراف ----
  seller: {
    // Denormalized من agency profile
    name:        { ar: "شركة النجوم للسياحة", en: "Al Nujoom Tourism" },
    vatNumber:   "300XXXXXXXXXXX",
    crNumber:    "1010XXXXXX",
    address: {
      buildingNumber: "1234",
      streetName:     "التحلية",
      district:       "العليا",
      city:           "الرياض",
      postalCode:     "12345",
      countryCode:    "SA"
    }
  },
  
  buyer: {
    id:          "cust_01HXYZ...",
    name:        { ar: "عبدالله الغامدي", en: "Abdullah Al-Ghamdi" },
    vatNumber:   null,                // للعملاء غير المسجلين في VAT
    phone:       "+966-5X-XXXXXXX",
    address:     { city: "جدة", countryCode: "SA" }
  },
  
  // ---- مرجع الحجز ----
  bookingId:     "bk_01HXYZ...",
  bookingRef:    "BK-2026-00843",
  
  // ---- بنود الفاتورة ----
  lines: [
    {
      lineNumber:    1,
      description:   { ar: "تذكرة طيران — الرياض إلى لندن", en: "Flight Ticket RUH-LHR" },
      quantity:      1,
      unitPrice:     850,
      totalPrice:    850,
      
      // الضريبة
      vatCategory:   "Z",             // S=خاضع | Z=صفري | E=معفى | O=خارج النطاق
      vatReason:     "VATEX-SA-32",   // سبب الإعفاء/الصفري
      vatRate:       0,
      vatAmount:     0,
      
      // الحساب المرتبط
      revenueAccount: "6002",
      costAccount:    null
    },
    {
      lineNumber:    2,
      description:   { ar: "رسوم خدمة", en: "Service Fee" },
      quantity:      1,
      unitPrice:     75,
      totalPrice:    75,
      
      vatCategory:   "S",
      vatReason:     null,
      vatRate:       0.15,
      vatAmount:     11.25,
      
      revenueAccount: "6007",
      costAccount:    null
    }
  ],
  
  // ---- الإجماليات ----
  totals: {
    subtotalExclVat: 925,
    vatBreakdown: [
      { category: "Z", taxableAmount: 850,  vatAmount: 0     },
      { category: "S", taxableAmount: 75,   vatAmount: 11.25 }
    ],
    totalVat:    11.25,
    grandTotal:  936.25,
    currency:    "SAR"
  },
  
  // ---- ZATCA ----
  zatca: {
    // UUID فريد للفاتورة (v4 — إلزامي)
    invoiceUUID:   "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx",
    
    // Hash و Signature
    invoiceHash:   "base64_sha256_hash",
    digitalSignature: "base64_ecdsa_signature",
    
    // بيانات الشهادة
    certificateSerial: "XXXXXXXXXXXXXXXX",
    
    // QR Code (TLV مُشفَّر Base64)
    qrCodeData:    "ARAAAAAAAAAAA...",
    
    // حالة الإرسال لـ ZATCA
    submissionStatus: "reported",    // not_submitted | submitted | reported | cleared | rejected
    submissionId:     "zatca_ref_XXXXX",
    submissionAt:     Timestamp,
    zatcaResponse:    { status: "REPORTED", warnings: [] },
    
    // نوع الفاتورة (XML)
    invoiceTypeCode: "388",          // 388=ضريبية | 381=إشعار دائن | 383=إشعار مدين
    invoiceSubtype:  "0100000",      // B2C Tax Invoice
    
    // XML الكامل (مخزَّن في Firebase Storage لا في Firestore)
    xmlStorageUrl:   "storage://invoices/inv_XXX/zatca.xml"
  },
  
  // ---- حالة الفاتورة ----
  status:        "issued",           // draft | issued | cancelled | credited
  
  // ---- المدفوعات ----
  paymentStatus: "paid",             // unpaid | partial | paid
  amountPaid:    936.25,
  amountDue:     0,
  paymentIds:    ["pay_01HXYZ..."],
  
  // ---- الإرسال ----
  sentToCustomer: true,
  sentAt:         Timestamp,
  sentVia:        ["whatsapp", "email"],
  
  // ---- المحاسبة ----
  journalEntryId: "je_01HXYZ...",
  
  issueDate:     Timestamp,
  dueDate:       Timestamp,
  
  createdAt:     Timestamp,
  createdBy:     "usr_XXXXX",
  issuedAt:      Timestamp,
  cancelledAt:   null,
  cancelReason:  null
}
```

---

## 9. bookings/{bookingId}/payments/{paymentId} — المدفوعات

```javascript
// /bookings/{bookingId}/payments/{paymentId}
// (أيضاً مرجع في /payments/{paymentId} للاستعلام العام)
{
  id:         "pay_01HXYZ...",
  agencyId:   "ag_01HXYZ...",
  bookingId:  "bk_01HXYZ...",
  invoiceId:  "inv_01HXYZ...",
  customerId: "cust_01HXYZ...",
  
  // ---- تفاصيل الدفعة ----
  amount:      500,
  currency:    "SAR",
  
  method:      "bank_transfer",       // cash | bank_transfer | credit_card |
                                      // mada | apple_pay | stc_pay | tamara |
                                      // tabby | cheque | loyalty_points
  
  // تفاصيل إضافية حسب طريقة الدفع
  methodDetails: {
    bankName:        "بنك الراجحي",
    transferRef:     "TRF-XXXXXXXXXX",
    transferDate:    "2026-05-15",
    depositorName:   "عبدالله الغامدي"
    // للبطاقات:
    // last4Digits: "1234",
    // cardBrand: "visa",
    // authCode: "XXXXXX"
  },
  
  // ---- الإيصال ----
  receiptNumber:  "RCT-2026-002341",
  
  // ---- التسجيل ----
  receivedAt:    Timestamp,
  receivedBy:    "usr_XXXXX",         // الموظف الذي استلم
  receiverName:  "أحمد العتيبي",     // Denormalized
  
  // ---- المحاسبة ----
  bankAccountCode:   "1002",          // الحساب الذي استُلمت فيه الدفعة
  journalEntryId:    "je_01HXYZ...",
  
  // ---- الاسترداد (إذا كانت دفعة مستردة) ----
  isRefund:      false,
  refundedFrom:  null,                // paymentId الأصلي
  
  notes:         null,
  
  createdAt:     Timestamp
}
```

---

## 10. journal_entries/{entryId} — دفتر اليومية

```javascript
// /journal_entries/{entryId}
{
  id:          "je_01HXYZ...",
  agencyId:    "ag_01HXYZ...",
  
  // ---- التصنيف ----
  type:        "payment_received",    // payment_received | invoice_issued |
                                      // supplier_payment | refund | adjustment |
                                      // manual | opening_balance
  
  // ---- المرجع ----
  reference: {
    type:   "payment",                // booking | invoice | payment | settlement | manual
    id:     "pay_01HXYZ...",
    number: "RCT-2026-002341"
  },
  
  description:   "استلام دفعة — حجز BK-2026-00843 — عبدالله الغامدي",
  descriptionEn: "Payment received — Booking BK-2026-00843 — Abdullah Al-Ghamdi",
  
  // ---- تاريخ القيد ----
  entryDate:   Timestamp,             // تاريخ المعاملة (قد يختلف عن createdAt)
  period:      "2026-05",             // للتجميع والتقارير الشهرية
  
  // ---- السطور (مجموع مدين = مجموع دائن دائماً) ----
  lines: [
    {
      lineNumber:    1,
      accountCode:   "1002",
      accountName:   { ar: "بنك الراجحي — حساب تشغيلي", en: "Al-Rajhi Bank — Operating" },
      debit:         500,
      credit:        0,
      description:   "تحويل بنكي",
      costCenter:    null              // مركز التكلفة (إذا كان مُفعَّلاً)
    },
    {
      lineNumber:    2,
      accountCode:   "3202",
      accountName:   { ar: "أمانات العملاء", en: "Customer Deposits" },
      debit:         0,
      credit:        500,
      description:   "دفعة مقدمة — حجز BK-2026-00843"
    }
  ],
  
  // ---- التحقق ----
  totalDebit:    500,
  totalCredit:   500,
  isBalanced:    true,                 // totalDebit === totalCredit
  
  // ---- الحالة ----
  status:        "posted",            // draft | posted | reversed
  isAuto:        true,                // true = أنشأه النظام تلقائياً
  
  reversalOf:    null,                // je_XXXXX إذا كان هذا القيد عكساً
  reversedBy:    null,
  
  createdAt:     Timestamp,
  createdBy:     "system",            // "system" | userId
  postedAt:      Timestamp,
  postedBy:      "system"
}
```

---

## 11. suppliers/{supplierId} — الموردون

```javascript
// /suppliers/{supplierId}
{
  id:         "sup_saudia",
  agencyId:   "ag_01HXYZ...",
  
  type:       "airline",              // airline | hotel | hotel_chain | umrah_operator |
                                      // transport | insurance | visa_agent
  
  name:       { ar: "الخطوط الجوية السعودية", en: "Saudi Arabian Airlines" },
  code:       "SV",                   // IATA Airline Code
  vatNumber:  "300XXXXXXXXXX",
  
  contact: {
    name:     "محمد السبيعي",
    email:    "m.alsabei@saudia.com",
    phone:    "+966-11-XXXXXXX",
    address:  "جدة، المملكة العربية السعودية"
  },
  
  // ---- عقود العمولات ----
  commissionRates: {
    domestic:      { type: "percentage", value: 0 },
    international: { type: "percentage", value: 0 },
    // بعض الخطوط تدفع override commissions
    overrideThreshold:  100,           // عند 100 تذكرة شهرياً
    overrideRate:        0.03          // 3% إضافية
  },
  
  // ---- التسوية ----
  settlement: {
    method:    "bsp",                  // bsp | direct | monthly
    bspCode:   "XXXXX",
    currency:  "SAR",
    paymentTerms: 15                   // أيام
  },
  
  // ---- الحسابات المحاسبية ----
  accountCode:   "3001",              // حساب ذمم الخط الجوي
  
  // ---- الإحصائيات ----
  stats: {
    totalBookings: 450,
    totalAmountOwed: 12500,
    lastSettlementAt: Timestamp
  },
  
  notes:      null,
  isActive:   true,
  createdAt:  Timestamp,
  updatedAt:  Timestamp
}
```

---

## 12. pricing_rules/{ruleId} — قواعد التسعير

```javascript
// /agencies/{agencyId}/pricing_rules/{ruleId}
{
  id:        "rule_intl_flight_service_fee",
  agencyId:  "ag_01HXYZ...",
  
  name:      { ar: "رسوم الخدمة — طيران دولي", en: "Service Fee — International Flights" },
  isActive:  true,
  priority:  10,                      // عند التعارض، الأعلى يُطبَّق أولاً
  
  // ---- شروط التطبيق ----
  appliesTo: {
    bookingTypes:    ["flight"],
    destinations:    ["international"],  // domestic | international | all
    customerTags:    ["all"],            // ["B2C"] | ["B2B"] | ["VIP"] | ["all"]
    minAmount:       0,
    maxAmount:       null,
    airlines:        null,              // null = جميع الخطوط
    supplierId:      null
  },
  
  // ---- نوع التسعير ----
  pricingType:   "fixed_fee",         // fixed_fee | percentage_markup | percentage_selling |
                                      // tiered | custom_formula | cost_plus | from_contract
  
  // للـ fixed_fee:
  value:          75,
  
  // للـ tiered (مثال):
  // tiers: [
  //   { upTo: 500,  fee: 25 },
  //   { upTo: 2000, fee: 50 },
  //   { upTo: null, fee: 100 }
  // ]
  
  // للـ custom_formula:
  // formula: "{passengers} * 35"
  
  // ---- المحاسبة والضريبة ----
  vatTreatment:     "taxable_15",     // taxable_15 | zero_rate | exempt
  revenueAccount:   "6007",
  
  // ---- الصلاحية ----
  validFrom:   null,                  // null = دائم
  validTo:     null,
  
  // ---- الاستخدام ----
  appliedCount:   1547,               // عدد مرات التطبيق
  
  createdAt:   Timestamp,
  updatedAt:   Timestamp,
  createdBy:   "usr_XXXXX"
}
```

---

## 13. vat_returns/{returnId} — إقرارات VAT

```javascript
// /agencies/{agencyId}/vat_returns/{returnId}
{
  id:         "vat_2026_Q2",
  agencyId:   "ag_01HXYZ...",
  
  period:     "2026-Q2",             // أو "2026-05" للشهري
  periodStart: Timestamp,
  periodEnd:   Timestamp,
  
  // ---- المبيعات (Box 1) ----
  standardRatedSales: {               // خاضع 15%
    amount:   145000,
    vat:      21750
  },
  zeroRatedSales: {                   // صفري
    amount:   320000,
    vat:      0
  },
  exemptSales: {                      // معفى
    amount:   0,
    vat:      0
  },
  
  // ---- المشتريات (Box 2) ----
  standardRatedPurchases: {
    amount:   45000,
    vat:      6750
  },
  
  // ---- الحساب الإجمالي ----
  outputVat:   21750,
  inputVat:    6750,
  netVat:      15000,                 // المستحق للحكومة
  
  // تفاصيل المعاملات المُدرجة
  invoiceCount:    234,
  creditNoteCount: 12,
  
  // ---- الحالة ----
  status:      "draft",              // draft | finalized | submitted | paid
  
  // عند التقديم لـ ZATCA
  submissionRef:  null,
  submittedAt:    null,
  submittedBy:    null,
  
  dueDate:     Timestamp,
  
  createdAt:   Timestamp,
  updatedAt:   Timestamp
}
```

---

---

# القسم الثاني: Firebase Security Rules

---

## مبادئ التصميم

```
1. Deny by default — كل شيء محظور ما لم يُسمح صراحةً
2. كل قراءة/كتابة تتحقق من:
   أ. تسجيل الدخول (authentication)
   ب. agencyId يطابق agencyId المستخدم في token
   ج. الوحدة المطلوبة مفعَّلة للوكالة
   د. المستخدم لديه الصلاحية المحددة من roles
3. البيانات الحساسة (شهادات ZATCA، مفاتيح API) لا يصل إليها إلا Cloud Functions
4. Super Admin (مسارات) له صلاحيات خاصة عبر Custom Claims
```

## ملف firestore.rules الكامل

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // ================================================================
    // دوال مساعدة (Helper Functions)
    // ================================================================

    // هل المستخدم مسجل الدخول؟
    function isAuth() {
      return request.auth != null;
    }

    // هل المستخدم super admin لمسارات؟
    function isSuperAdmin() {
      return isAuth() && request.auth.token.masarat_role == 'super_admin';
    }

    // agencyId المستخدم من JWT Custom Claims
    function userAgencyId() {
      return request.auth.token.agencyId;
    }

    // دور المستخدم من JWT Custom Claims
    function userRole() {
      return request.auth.token.role;
    }

    // هل السجل ينتمي لوكالة المستخدم؟
    function belongsToUserAgency(agencyId) {
      return isAuth() && agencyId == userAgencyId();
    }

    // هل البيانات المطلوب كتابتها تحتوي على agencyId صحيح؟
    function hasCorrectAgencyId() {
      return request.resource.data.agencyId == userAgencyId();
    }

    // قراءة بيانات دور المستخدم من Firestore
    // ملاحظة: يُخزَّن في Custom Claims لتجنب طلب Firestore إضافي في كل عملية
    function hasPermission(action, resource) {
      return request.auth.token['perm_' + resource + '_' + action] == true;
    }

    // هل الوحدة مفعَّلة؟ (يُخزَّن في Custom Claims أيضاً)
    function isModuleEnabled(moduleId) {
      return moduleId in request.auth.token.enabledModules;
    }

    // هل هو مالك السجل؟
    function isOwner(createdBy) {
      return request.auth.uid == createdBy;
    }

    // دالة للتحقق من صحة Timestamp
    function isValidTimestamp(ts) {
      return ts is timestamp;
    }

    // ================================================================
    // platform/ — إعدادات النظام المركزية (مسارات فقط)
    // ================================================================

    match /platform/{document=**} {
      allow read:  if isSuperAdmin();
      allow write: if isSuperAdmin();
    }

    // ================================================================
    // agencies/{agencyId}/ — بيانات الوكالات
    // ================================================================

    match /agencies/{agencyId} {
      // مالك الوكالة أو super admin يقرأ الملف الرئيسي
      allow read:  if isSuperAdmin()
                   || (belongsToUserAgency(agencyId)
                       && (userRole() == 'agency_owner'
                           || userRole() == 'agency_admin'));
      // فقط super admin ينشئ وكالة جديدة
      allow create: if isSuperAdmin();
      // فقط مالك الوكالة أو super admin يعدل
      allow update: if isSuperAdmin()
                    || (belongsToUserAgency(agencyId)
                        && userRole() == 'agency_owner');
      allow delete: if isSuperAdmin();
    }

    // إعدادات الوكالة (config/)
    match /agencies/{agencyId}/config/{configDoc} {
      allow read: if belongsToUserAgency(agencyId);

      // إعدادات الوحدات — المدير فقط
      allow write: if belongsToUserAgency(agencyId)
                   && (userRole() == 'agency_owner'
                       || userRole() == 'agency_admin')
                   && configDoc != 'zatca';  // ZATCA يكتبه Cloud Function فقط

      // إعدادات ZATCA — Cloud Function فقط عبر Admin SDK
      // لا يسمح لأي client بالكتابة المباشرة
    }

    // الأدوار
    match /agencies/{agencyId}/roles/{roleId} {
      allow read:  if belongsToUserAgency(agencyId);
      allow write: if belongsToUserAgency(agencyId)
                   && (userRole() == 'agency_owner'
                       || userRole() == 'agency_admin')
                   && !resource.data.isSystem;  // لا تعديل الأدوار المدمجة
    }

    // قواعد التسعير
    match /agencies/{agencyId}/pricing_rules/{ruleId} {
      allow read:  if belongsToUserAgency(agencyId);
      allow write: if belongsToUserAgency(agencyId)
                   && hasPermission('manage', 'pricingRules');
    }

    // الحقول المخصصة
    match /agencies/{agencyId}/custom_fields/{fieldId} {
      allow read:  if belongsToUserAgency(agencyId);
      allow write: if belongsToUserAgency(agencyId)
                   && hasPermission('manage', 'customFields');
    }

    // سير العمل
    match /agencies/{agencyId}/workflows/{workflowId} {
      allow read:  if belongsToUserAgency(agencyId);
      allow write: if belongsToUserAgency(agencyId)
                   && hasPermission('manage', 'workflows');
    }

    // سجل التدقيق (للقراءة فقط من الـ client)
    match /agencies/{agencyId}/audit_log/{logId} {
      allow read:  if belongsToUserAgency(agencyId)
                   && (userRole() == 'agency_owner'
                       || userRole() == 'agency_admin'
                       || userRole() == 'finance_manager');
      allow write: if false;  // يكتبه Cloud Function فقط
    }

    // ================================================================
    // users/{userId}/ — حسابات المستخدمين
    // ================================================================

    match /users/{userId} {
      // المستخدم يقرأ ملفه الشخصي
      // المدير يقرأ ملفات موظفيه
      allow read:  if isAuth()
                   && (request.auth.uid == userId
                       || (belongsToUserAgency(resource.data.agencyId)
                           && hasPermission('read', 'users')));

      // المدير ينشئ مستخدمين جدد
      allow create: if isAuth()
                    && hasCorrectAgencyId()
                    && hasPermission('create', 'users')
                    // لا يمكن إنشاء مستخدم بدور أعلى من دوره
                    && !isEscalatedRole(request.resource.data.role);

      // المستخدم يعدل إعداداته الشخصية، المدير يعدل أي مستخدم
      allow update: if isAuth()
                    && (request.auth.uid == userId
                        || (belongsToUserAgency(resource.data.agencyId)
                            && hasPermission('update', 'users')));

      allow delete: if belongsToUserAgency(resource.data.agencyId)
                    && (userRole() == 'agency_owner'
                        || userRole() == 'agency_admin');
    }

    // دالة مساعدة: منع ترقية الدور
    function isEscalatedRole(newRole) {
      return (userRole() == 'agency_admin' && newRole == 'agency_owner')
          || (userRole() == 'supervisor' && newRole in ['agency_admin', 'agency_owner']);
    }

    // ================================================================
    // customers/{customerId}/ — ملفات العملاء
    // ================================================================

    match /customers/{customerId} {
      allow read:  if isAuth()
                   && belongsToUserAgency(resource.data.agencyId)
                   && hasPermission('read', 'customer');

      allow create: if isAuth()
                    && hasCorrectAgencyId()
                    && hasPermission('create', 'customer')
                    && isModuleEnabled('core_crm')
                    // حقول إلزامية
                    && request.resource.data.keys().hasAll(['name', 'mobile', 'agencyId', 'type'])
                    // حماية: agencyId في البيانات = agencyId المستخدم
                    && request.resource.data.agencyId == userAgencyId();

      allow update: if isAuth()
                    && belongsToUserAgency(resource.data.agencyId)
                    && hasPermission('update', 'customer')
                    // منع تغيير الـ agencyId
                    && request.resource.data.agencyId == resource.data.agencyId;

      allow delete: if false;  // لا حذف للعملاء — يُعطَّل فقط (isActive: false)
    }

    // جوازات السفر
    match /customers/{customerId}/passports/{passportId} {
      allow read:  if isAuth()
                   && belongsToUserAgency(
                        get(/databases/$(database)/documents/customers/$(customerId)).data.agencyId
                      )
                   && hasPermission('read', 'customer');

      allow write: if isAuth()
                   && belongsToUserAgency(
                        get(/databases/$(database)/documents/customers/$(customerId)).data.agencyId
                      )
                   && hasPermission('update', 'customer');
    }

    // ================================================================
    // bookings/{bookingId}/ — الحجوزات
    // ================================================================

    match /bookings/{bookingId} {

      // القراءة حسب نطاق الصلاحية
      allow read:  if isAuth()
                   && belongsToUserAgency(resource.data.agencyId)
                   && hasPermission('read', 'booking')
                   && (
                     // الكل يرى الكل
                     request.auth.token['perm_booking_read'] == 'all'
                     // أو يرى فريقه فقط
                     || (request.auth.token['perm_booking_read'] == 'own_team'
                         && resource.data.agentId in request.auth.token.teamMemberIds)
                     // أو يرى حجوزاته هو فقط
                     || (request.auth.token['perm_booking_read'] == 'own'
                         && resource.data.agentId == request.auth.uid)
                   );

      allow create: if isAuth()
                    && hasCorrectAgencyId()
                    && hasPermission('create', 'booking')
                    && isModuleEnabled('booking_' + request.resource.data.type)
                    && request.resource.data.keys().hasAll([
                        'agencyId', 'type', 'status', 'customerId',
                        'agentId', 'passengers', 'pricing'
                      ])
                    // الحجز الجديد دائماً يبدأ كـ draft
                    && request.resource.data.status == 'draft'
                    // الموظف لا يسجل نفسه إلا كـ agent
                    && request.resource.data.agentId == request.auth.uid;

      allow update: if isAuth()
                    && belongsToUserAgency(resource.data.agencyId)
                    && hasPermission('update', 'booking')
                    // لا يتغير الـ agencyId و customerId
                    && request.resource.data.agencyId == resource.data.agencyId
                    && request.resource.data.customerId == resource.data.customerId
                    // الحجز الملغى لا يُعدَّل
                    && resource.data.status != 'cancelled'
                    // التحقق من الـ Workflow: التغييرات في status تمر عبر Cloud Function
                    && (request.resource.data.status == resource.data.status
                        || request.auth.token.workflowTransitionAllowed == true);

      allow delete: if false;  // الإلغاء عبر status update، لا حذف حقيقي
    }

    // مدفوعات الحجز
    match /bookings/{bookingId}/payments/{paymentId} {
      allow read:  if isAuth()
                   && belongsToUserAgency(
                        get(/databases/$(database)/documents/bookings/$(bookingId)).data.agencyId
                      )
                   && hasPermission('read', 'payment');

      allow create: if isAuth()
                    && belongsToUserAgency(
                         get(/databases/$(database)/documents/bookings/$(bookingId)).data.agencyId
                       )
                    && hasPermission('create', 'payment')
                    && request.resource.data.amount > 0
                    // لا يُسجَّل دفع أكثر من المبلغ المتبقي (Cloud Function يتحقق منه)
                    && request.resource.data.receivedBy == request.auth.uid;

      allow update: if false;  // المدفوعات لا تُعدَّل — تُعكس بقيد جديد
      allow delete: if false;
    }

    // ================================================================
    // invoices/{invoiceId}/ — الفواتير
    // ================================================================

    match /invoices/{invoiceId} {
      allow read:  if isAuth()
                   && belongsToUserAgency(resource.data.agencyId)
                   && hasPermission('read', 'invoice');

      // الفواتير تُنشأ عبر Cloud Function فقط (لضمان صحة ZATCA وتسلسل الأرقام)
      allow create: if false;

      // تحديث محدود: فقط حالة الإرسال للعميل
      allow update: if isAuth()
                    && belongsToUserAgency(resource.data.agencyId)
                    && hasPermission('read', 'invoice')
                    && request.resource.data.diff(resource.data).affectedKeys()
                        .hasOnly(['sentToCustomer', 'sentAt', 'sentVia'])
                    // الفواتير الصادرة لا يُعدَّل محتواها
                    && resource.data.status == 'issued';

      allow delete: if false;  // إلغاء الفاتورة عبر Cloud Function (يُنشئ credit note)
    }

    // ================================================================
    // journal_entries/{entryId}/ — دفتر اليومية
    // ================================================================

    match /journal_entries/{entryId} {
      // المحاسب والمدير المالي يقرآن
      allow read:  if isAuth()
                   && belongsToUserAgency(resource.data.agencyId)
                   && hasPermission('read', 'accounting');

      // القيود التلقائية تُنشأ عبر Cloud Function فقط
      allow create: if isAuth()
                    && belongsToUserAgency(resource.data.agencyId)
                    && hasPermission('create', 'accounting')
                    // فقط القيود اليدوية من الـ client
                    && request.resource.data.type == 'manual'
                    && request.resource.data.isAuto == false
                    // التحقق من التوازن
                    && request.resource.data.totalDebit == request.resource.data.totalCredit
                    && request.resource.data.totalDebit > 0;

      // لا تعديل على القيود المُرحَّلة
      allow update: if false;
      allow delete: if false;
    }

    // ================================================================
    // suppliers/{supplierId}/ — الموردون
    // ================================================================

    match /suppliers/{supplierId} {
      allow read:  if isAuth()
                   && belongsToUserAgency(resource.data.agencyId)
                   && hasPermission('read', 'suppliers');

      allow write: if isAuth()
                   && belongsToUserAgency(resource.data.agencyId)
                   && hasPermission('manage', 'suppliers');
    }

    // ================================================================
    // vat_returns/{returnId}/ — إقرارات VAT
    // ================================================================

    match /agencies/{agencyId}/vat_returns/{returnId} {
      allow read:  if belongsToUserAgency(agencyId)
                   && hasPermission('read', 'vatReturn');

      // إنشاء إقرار مسودة فقط
      allow create: if belongsToUserAgency(agencyId)
                    && hasPermission('manage', 'vatReturn')
                    && request.resource.data.status == 'draft';

      // التحديث: فقط ما لم يُقدَّم بعد
      allow update: if belongsToUserAgency(agencyId)
                    && hasPermission('manage', 'vatReturn')
                    && resource.data.status in ['draft', 'finalized']
                    // التقديم الرسمي عبر Cloud Function
                    && request.resource.data.status != 'submitted';

      allow delete: if false;
    }

    // ================================================================
    // notifications/{notifId}/ — الإشعارات
    // ================================================================

    match /notifications/{notifId} {
      // المستخدم يقرأ إشعاراته فقط
      allow read:  if isAuth()
                   && resource.data.userId == request.auth.uid;

      // الإشعارات تُنشأ بواسطة Cloud Functions فقط
      allow create: if false;

      // المستخدم يُعلِّم إشعاره كمقروء فقط
      allow update: if isAuth()
                    && resource.data.userId == request.auth.uid
                    && request.resource.data.diff(resource.data).affectedKeys()
                        .hasOnly(['isRead', 'readAt']);

      allow delete: if isAuth()
                    && resource.data.userId == request.auth.uid;
    }

  }
}
```

---

## Firebase Storage Rules

```javascript
// storage.rules
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {

    // دوال مساعدة
    function isAuth() {
      return request.auth != null;
    }
    function userAgencyId() {
      return request.auth.token.agencyId;
    }
    function maxSizeMB(mb) {
      return request.resource.size < mb * 1024 * 1024;
    }
    function isImage() {
      return request.resource.contentType.matches('image/.*');
    }
    function isPDF() {
      return request.resource.contentType == 'application/pdf';
    }

    // شعارات الوكالات
    match /agencies/{agencyId}/branding/{file} {
      allow read:  if isAuth();       // كل مستخدم يرى الشعار
      allow write: if isAuth()
                   && request.auth.token.agencyId == agencyId
                   && request.auth.token.role in ['agency_owner', 'agency_admin']
                   && isImage()
                   && maxSizeMB(2);   // حد 2 MB للشعار
    }

    // صور جوازات السفر (حساسة جداً)
    match /customers/{customerId}/passports/{file} {
      allow read:  if isAuth()
                   // يجب التحقق من ملكية العميل (يتطلب Firestore read)
                   // يُفضَّل استخدام Cloud Function signed URLs بدلاً من هذا
                   && request.auth.token.role in [
                       'agency_owner', 'agency_admin',
                       'finance_manager', 'supervisor', 'agent', 'accountant'
                     ];

      allow write: if isAuth()
                   && isImage()
                   && maxSizeMB(5);
    }

    // مستندات الحجوزات (تذاكر، قسائم)
    match /bookings/{bookingId}/{file} {
      allow read:  if isAuth();       // الموظف يرى الوثيقة بعد التحقق من الـ bookingId
      allow write: if false;          // تُولَّد وترفع بواسطة Cloud Functions فقط
    }

    // فواتير PDF و XML
    match /invoices/{invoiceId}/{file} {
      allow read:  if isAuth()
                   && request.auth.token.role in [
                       'agency_owner', 'agency_admin',
                       'finance_manager', 'accountant'
                     ];
      allow write: if false;          // Cloud Function فقط
    }

    // قوالب الطباعة
    match /agencies/{agencyId}/templates/{file} {
      allow read:  if isAuth() && request.auth.token.agencyId == agencyId;
      allow write: if isAuth()
                   && request.auth.token.agencyId == agencyId
                   && request.auth.token.role in ['agency_owner', 'agency_admin']
                   && isPDF()
                   && maxSizeMB(10);
    }
  }
}
```

---

## Custom Claims في Firebase Auth (JWT)

```javascript
// هذه الـ Claims تُضاف لكل مستخدم بواسطة Cloud Function عند تسجيل الدخول
// تُجنّب طلبات Firestore إضافية في كل عملية

{
  // هوية الوكالة
  agencyId: "ag_01HXYZ...",

  // الدور الأساسي
  role: "supervisor",

  // اسم مسارات (للـ Super Admin فقط)
  masarat_role: null,                 // "super_admin" | null

  // الصلاحيات المحسوبة (مُشتقة من roles collection)
  // الصيغة: perm_{resource}_{action}
  perm_booking_create: true,
  perm_booking_read:   "all",         // "own" | "own_team" | "all"
  perm_booking_update: "own_team",
  perm_booking_approve: true,
  perm_invoice_create: true,
  perm_invoice_read:   "all",
  perm_invoice_void:   false,
  perm_payment_create: true,
  perm_accounting_read: false,
  perm_reports_sales:  "own_team",
  perm_reports_financial: false,
  perm_pricingRules_manage: false,
  perm_users_read:     false,
  // ... إلخ

  // الوحدات المفعَّلة للوكالة
  enabledModules: [
    "core_crm", "booking_flights", "booking_hotels",
    "booking_umrah_hajj", "ops_groups"
  ],

  // أعضاء الفريق (للمشرفين)
  teamMemberIds: ["usr_A", "usr_B", "usr_C"],

  // خطة الاشتراك
  subscriptionPlan: "professional",
  subscriptionStatus: "active",

  // للـ Workflow
  workflowTransitionAllowed: false    // تُضبط مؤقتاً أثناء تنفيذ Workflow
}
```

---

## Cloud Functions الحساسة (لا يصل إليها Client مباشرة)

```
الوظائف التي يجب تنفيذها في Cloud Functions لا في الـ Client:

1. createInvoice()
   - يتحقق من صحة البيانات
   - يُولِّد رقم تسلسلي بدون فجوات (atomic counter)
   - يحسب الضريبة بدقة
   - يُنشئ XML ويوقّعه بشهادة ZATCA
   - يرفع XML لـ Storage
   - يُرسل لـ ZATCA API
   - يُنشئ القيد المحاسبي التلقائي
   - يُحدِّث Firestore

2. processPayment()
   - يتحقق أن المبلغ لا يتجاوز الرصيد المتبقي
   - ينشئ قيد محاسبي للدفعة
   - يحدّث paymentStatus في الحجز
   - يُرسل إيصال للعميل

3. processRefund()
   - يتحقق من صلاحية الاسترداد
   - يُنشئ إشعار دائن (Credit Note) تلقائياً
   - يُسجِّل قيد العكس
   - يُغيِّر حالة الحجز

4. transitionWorkflowState()
   - يتحقق من صحة الانتقال
   - يُسجِّل في workflowState.history
   - يُشغِّل automation actions
   - يُرسل الإشعارات المناسبة
   - يُعيِّن workflowTransitionAllowed=true مؤقتاً

5. refreshUserClaims()
   - يُعيد حساب جميع الـ Custom Claims
   - يُستدعى عند تغيير الدور أو تفعيل وحدة جديدة

6. generateVatReturn()
   - يُجمِّع جميع الفواتير في الفترة
   - يُصنِّفها حسب نوع الضريبة
   - يُنشئ وثيقة إقرار مسودة
```

---

## مؤشرات الأداء (Composite Indexes)

```javascript
// firestore.indexes.json
{
  "indexes": [
    // الحجوزات — البحث والفلترة
    { "collectionGroup": "bookings",
      "fields": [
        { "fieldPath": "agencyId", "order": "ASCENDING" },
        { "fieldPath": "status",   "order": "ASCENDING" },
        { "fieldPath": "travelDate", "order": "ASCENDING" }
      ]
    },
    { "collectionGroup": "bookings",
      "fields": [
        { "fieldPath": "agencyId",   "order": "ASCENDING" },
        { "fieldPath": "customerId", "order": "ASCENDING" },
        { "fieldPath": "createdAt",  "order": "DESCENDING" }
      ]
    },
    { "collectionGroup": "bookings",
      "fields": [
        { "fieldPath": "agencyId", "order": "ASCENDING" },
        { "fieldPath": "agentId",  "order": "ASCENDING" },
        { "fieldPath": "createdAt", "order": "DESCENDING" }
      ]
    },
    { "collectionGroup": "bookings",
      "fields": [
        { "fieldPath": "agencyId",       "order": "ASCENDING" },
        { "fieldPath": "supplierId",     "order": "ASCENDING" },
        { "fieldPath": "settlementStatus", "order": "ASCENDING" }
      ]
    },
    // الفواتير
    { "collectionGroup": "invoices",
      "fields": [
        { "fieldPath": "agencyId",  "order": "ASCENDING" },
        { "fieldPath": "status",    "order": "ASCENDING" },
        { "fieldPath": "issueDate", "order": "DESCENDING" }
      ]
    },
    { "collectionGroup": "invoices",
      "fields": [
        { "fieldPath": "agencyId",       "order": "ASCENDING" },
        { "fieldPath": "paymentStatus",  "order": "ASCENDING" },
        { "fieldPath": "issueDate",      "order": "DESCENDING" }
      ]
    },
    // دفتر اليومية
    { "collectionGroup": "journal_entries",
      "fields": [
        { "fieldPath": "agencyId",   "order": "ASCENDING" },
        { "fieldPath": "period",     "order": "ASCENDING" },
        { "fieldPath": "entryDate",  "order": "ASCENDING" }
      ]
    },
    // العملاء
    { "collectionGroup": "customers",
      "fields": [
        { "fieldPath": "agencyId",    "order": "ASCENDING" },
        { "fieldPath": "isActive",    "order": "ASCENDING" },
        { "fieldPath": "stats.lastBookingAt", "order": "DESCENDING" }
      ]
    },
    // الإشعارات
    { "collectionGroup": "notifications",
      "fields": [
        { "fieldPath": "userId",    "order": "ASCENDING" },
        { "fieldPath": "isRead",    "order": "ASCENDING" },
        { "fieldPath": "createdAt", "order": "DESCENDING" }
      ]
    }
  ]
}
```

---

## ملخص القرارات الأمنية

| القرار | التنفيذ | السبب |
|--------|---------|-------|
| Multi-tenant isolation | `agencyId` field + Security Rules | لا يمكن أي وكالة رؤية بيانات أخرى |
| شهادات ZATCA | في Firestore مشفّرة + Cloud Function فقط تقرأها | منع تسرب المفاتيح الخاصة |
| أرقام الفواتير التسلسلية | Atomic Counter في Cloud Function | ضمان عدم وجود فجوات (إلزامي قانونياً) |
| قيود المحاسبة | Cloud Function فقط ينشئها تلقائياً | منع التلاعب بدفتر اليومية |
| Custom Claims | تُحدَّث لحظة تغيير الدور | قواعد الأمان تعمل بدون Firestore reads إضافية |
| تصعيد الدور | Security Rule تمنعه صراحةً | موظف لا يستطيع منح نفسه صلاحيات أعلى |
| صور الجوازات | Cloud Function signed URLs | لا رابط مباشر للملفات الحساسة |

---

*وثيقة مسارات ERP — Database Schema & Security Rules v1.0*
