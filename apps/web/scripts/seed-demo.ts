/**
 * seed-demo.ts — بذور بيانات تجريبية لوكالة Masarat ERP
 * ─────────────────────────────────────────────────────────────────────────────
 * يزرع مجموعة بيانات تغطي سيناريوهات العمل اليومية (حجوزات، فواتير، دفعات،
 * تقسيط، استرداد، إيراد مؤجل، دفعات موردين بعملة محلية/أجنبية) مرتبطة بالوكالة
 * المسجّلة ببريدك، فتجدها جاهزة عند تسجيل الدخول.
 *
 * القيود تُبنى بنفس دوال الإنتاج الحقيقية (lib/invoice-journal · lib/payment-journal
 * · lib/refund-journal · lib/supplier-payment-journal) فكل قيد متوازن ومطابق لما
 * يولّده النظام فعلاً — لذا تقدر تقارن التقارير والداش بورد بثقة.
 *
 * التشغيل (من جذر المستودع، بعد `pnpm install`):
 *   DEMO_DATABASE_URL="postgres://...neon.tech/...?sslmode=require" \
 *   DEMO_SEED_EMAIL="demo@example.com" \
 *   DEMO_SEED_AGENCY_ID="agency-id" \
 *   DEMO_SEED_TARGET="isolated-preview" \
 *   DEMO_SEED_CONFIRM="SEED:agency-id:demo@example.com" \
 *   pnpm --filter @masarat/web exec tsx scripts/seed-demo.ts
 *
 * خصائص:
 *   • idempotent — إعادة التشغيل لا تُكرّر ولا تحذف (معرّفات ثابتة + ON CONFLICT DO NOTHING).
 *   • لا يحذف أي سجل مالي (يحترم محفّزات حصانة السجلات).
 *   • لا يقرأ DATABASE_URL أو .env.local تلقائياً؛ يتطلب هدف العرض الصريح فقط.
 */
import { neon } from '@neondatabase/serverless';
import { Pool as LocalPgPool } from 'pg';
import { drizzle as drizzleNeon } from 'drizzle-orm/neon-http';
import { drizzle as drizzleLocal } from 'drizzle-orm/node-postgres';
import { and, asc, eq, like } from 'drizzle-orm';

import {
  agencies, users, customers, suppliers, bookings, bookingLines, chartOfAccounts,
  invoices, journalEntries, journalLines, payments, receiptVouchers, supplierPayments,
  bankAccounts, bankTransactions, paymentPlans, paymentPlanInstallments, quotes,
  type BookingLine,
} from '../src/lib/schema';
import { buildJournalLinesFromBookingLines } from '../src/lib/invoice-journal';
import { buildCustomerReceiptLines } from '../src/lib/payment-journal';
import { buildRefundJournalLines } from '../src/lib/refund-journal';
import { buildRefundDocument } from '../src/lib/refund-document';
import { validateRefundPolicy } from '../src/lib/refund-policy';
import { buildSupplierPaymentJournalLines, apClearedHalalas } from '../src/lib/supplier-payment-journal';
import { DEFAULT_COA } from '../src/lib/default-coa';
import { assertDemoSeedTarget, readDemoSeedConfig } from './seed-demo-safety';
import {
  HISTORICAL_DEMO_SCENARIOS,
  historicalScenarioDate,
  type DemoSupplierKind,
  type HistoricalDemoScenario,
} from './seed-demo-scenarios';

// ─── الإعداد ──────────────────────────────────────────────────────────────────

const config = readDemoSeedConfig();
const parsedDatabaseUrl = new URL(config.databaseUrl);
const isLocalDatabase = ['127.0.0.1', 'localhost', '::1'].includes(parsedDatabaseUrl.hostname);
const localPool = isLocalDatabase ? new LocalPgPool({ connectionString: config.databaseUrl, max: 2 }) : null;
type DemoDb = ReturnType<typeof drizzleLocal>;
const db: DemoDb = localPool
  ? drizzleLocal(localPool)
  : drizzleNeon(neon(config.databaseUrl)) as unknown as DemoDb;

// أرقام صحيحة بالهللات (1 ر.س = 100 هللة)
const SAR = (riyals: number) => Math.round(riyals * 100);
const today = new Date().toISOString().split('T')[0]!;
const addDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().split('T')[0]!;
const atNoonUtc = (date: string) => new Date(`${date}T12:00:00.000Z`);
const addIsoDays = (date: string, days: number) => {
  const value = atNoonUtc(date);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};

// عدّادات أرقام ثابتة (DEMO- لتجنّب التصادم مع الترقيم الحقيقي + ثبات إعادة التشغيل)
let invSeq = 0, jeSeq = 0, rctSeq = 0, pvSeq = 0, bkSeq = 0;
const invNo = () => `DEMO-INV-${String(++invSeq).padStart(4, '0')}`;
const jeNo  = () => `DEMO-JE-${String(++jeSeq).padStart(4, '0')}`;
const rctNo = () => `DEMO-RCT-${String(++rctSeq).padStart(4, '0')}`;
const pvNo  = () => `DEMO-PV-${String(++pvSeq).padStart(4, '0')}`;
const bkNo  = () => `DEMO-BK-${String(++bkSeq).padStart(4, '0')}`;

type Line = { code: string; ar: string; en: string; dr: number; cr: number };

// ─── أدوات إدراج (idempotent) ─────────────────────────────────────────────────

async function postJournal(args: {
  agencyId: string; id: string; date: string; descAr: string;
  source: string; sourceId: string; serviceType?: string; lines: Line[];
  entryNumber?: string;   // override the auto counter (for stable, non-colliding ids)
}) {
  const totalDr = args.lines.reduce((s, l) => s + l.dr, 0);
  const totalCr = args.lines.reduce((s, l) => s + l.cr, 0);
  if (totalDr !== totalCr) throw new Error(`قيد غير متوازن (${args.descAr}): ${totalDr} ≠ ${totalCr}`);

  await db.insert(journalEntries).values({
    id: args.id, agencyId: args.agencyId, entryNumber: args.entryNumber ?? jeNo(), date: args.date,
    descriptionAr: args.descAr, source: args.source, sourceId: args.sourceId,
    serviceType: args.serviceType ?? null, isPosted: true,
    totalDebitHalalas: totalDr, totalCreditHalalas: totalCr, createdBy: 'seed',
    createdAt: atNoonUtc(args.date),
  }).onConflictDoNothing();

  await db.insert(journalLines).values(args.lines.map((l, i) => ({
    id: `${args.id}-l${i + 1}`, entryId: args.id, agencyId: args.agencyId,
    accountCode: l.code, accountNameAr: l.ar, accountNameEn: l.en,
    debitHalalas: l.dr, creditHalalas: l.cr, sortOrder: i + 1,
  }))).onConflictDoNothing();
}

/** يبني سطر حجز بالشكل الذي تتوقعه بُناة القيود. */
function makeLine(p: {
  agencyId: string; bookingId: string; serviceType: string; description: string;
  revenueModel: 'agent' | 'principal'; priceExclVat: number; vat: number; cost: number;
  vatCategory?: string; supplierId?: string | null; supplierName?: string | null;
  createdOn?: string;
}): BookingLine {
  const vatCategory = p.vatCategory ?? (p.vat > 0 ? 'S' : 'Z');
  const createdAt = p.createdOn ? atNoonUtc(p.createdOn) : new Date();
  return {
    id: `${p.bookingId}-line1`, bookingId: p.bookingId, agencyId: p.agencyId,
    serviceType: p.serviceType, description: p.description,
    supplierId: p.supplierId ?? null, supplierName: p.supplierName ?? null,
    quantity: 1, unitCostHalalas: p.cost, totalCostHalalas: p.cost,
    unitPriceExclVatHalalas: p.priceExclVat, totalPriceExclVatHalalas: p.priceExclVat,
    vatCategory, vatRateBps: p.vat > 0 ? 1500 : 0, vatHalalas: p.vat,
    revenueModel: p.revenueModel, revenueAccountCode: null, costAccountCode: null,
    operationalStatus: 'confirmed', pnrReference: null, voucherNumber: null,
    isLegacy: false, status: 'active', cancelledAt: null, refundHalalas: 0,
    sortOrder: 1, notes: null, createdAt, updatedAt: createdAt,
  } as BookingLine;
}

/** يدرج حجزاً + سطره. يُعيد المعرّفات والمبالغ. */
async function insertBooking(p: {
  agencyId: string; id: string; serviceType: string; customerId: string;
  customerNameAr: string; line: BookingLine; status?: string; details?: Record<string, unknown>;
  createdOn?: string;
}) {
  const total = p.line.totalPriceExclVatHalalas + p.line.vatHalalas;
  const cost  = p.line.totalCostHalalas;
  const createdAt = p.createdOn ? atNoonUtc(p.createdOn) : new Date();
  await db.insert(bookings).values({
    id: p.id, agencyId: p.agencyId, bookingNumber: bkNo(), serviceType: p.serviceType,
    customerId: p.customerId, customerNameAr: p.customerNameAr, status: p.status ?? 'completed',
    totalPriceHalalas: total, costPriceHalalas: cost, profitHalalas: total - cost,
    paidHalalas: 0, currency: 'SAR', details: { revenueModel: p.line.revenueModel, ...(p.details ?? {}) },
    createdBy: 'seed', createdAt, updatedAt: createdAt,
  }).onConflictDoNothing();
  await db.insert(bookingLines).values(p.line).onConflictDoNothing();
  if (p.createdOn) {
    await db.update(bookings).set({ createdAt }).where(and(
      eq(bookings.id, p.id), eq(bookings.agencyId, p.agencyId),
    ));
  }
  return { total, cost };
}

// ─── البرنامج الرئيسي ─────────────────────────────────────────────────────────

async function main() {
  console.log(`\n▸ التحقق من الحساب التجريبي ${config.email} …`);
  const [[u], [agency]] = await Promise.all([
    db.select().from(users).where(eq(users.email, config.email)),
    db.select().from(agencies).where(eq(agencies.id, config.agencyId)),
  ]);
  assertDemoSeedTarget(config, u, agency);
  const agencyId = config.agencyId;
  console.log(`  ✓ تطابق البريد ومعرف الوكالة: ${agencyId}`);

  // الإصدار القديم استخدم معرّفات عامة. لا ننشئ نسخة ثانية فوقه ولا نحذف بياناته
  // تلقائياً؛ نتوقف برسالة واضحة كي تتم معالجة الحالة يدوياً وبموافقة منفصلة.
  const [legacyDemoCustomer] = await db.select({ agencyId: customers.agencyId })
    .from(customers).where(eq(customers.id, 'demo-cust-b2c'));
  if (legacyDemoCustomer?.agencyId === agencyId) {
    throw new Error('توجد بيانات عرض بالإصدار القديم في هذه الوكالة؛ أوقفنا التشغيل لتجنب التكرار');
  }

  // يظهر للمجرّب اسم واضح بدل اسم شخص أو وكالة حقيقية. لا نغيّر البريد أو كلمة المرور.
  await db.update(agencies).set({
    nameAr: config.accountNameAr,
    nameEn: config.accountNameEn,
    isVatRegistered: true,
    vatRate: 15,
    updatedAt: new Date(),
  }).where(and(eq(agencies.id, agencyId), eq(agencies.isActive, true)));

  // كل معرف مربوط بالوكالة؛ يمنع تصادم بيانات العرض إذا كانت هناك قاعدة تجربة مشتركة.
  const demoId = (name: string) => `${agencyId}-demo-${name}`;
  const ids = {
    customerIndividual: demoId('customer-individual'),
    customerCompany: demoId('customer-company'),
    supplierAirline: demoId('supplier-airline'),
    supplierHotel: demoId('supplier-hotel'),
    supplierGovernment: demoId('supplier-government'),
    supplierTransport: demoId('supplier-transport'),
    supplierInsurance: demoId('supplier-insurance'),
    bank: demoId('bank-main'),
    cash: demoId('cash-main'),
  } as const;

  // ── ضمان اكتمال دليل الحسابات ───────────────────────────────────────────────
  // الوكالات المُنشأة قبل إضافة رموز كـ 3201 (إيراد مؤجل) و5900 (فروق صرف) تفتقدها،
  // فيختفي أي قيد عليها من ميزان المراجعة. نُدرج المجموعة الكاملة (idempotent) حتى
  // تُطابق التقاريرُ القيودَ فوراً عند إعادة التشغيل — دون انتظار نشر جديد.
  await db.insert(chartOfAccounts).values(
    DEFAULT_COA.map((ac) => ({
      id: `${agencyId}-coa-${ac.code}`, agencyId, code: ac.code,
      nameAr: ac.nameAr, nameEn: ac.nameEn, type: ac.type, isSystem: true, level: 1,
    })),
  ).onConflictDoNothing({ target: [chartOfAccounts.agencyId, chartOfAccounts.code] });

  // دفتر الموردين الفرعي: يُبنى من المعاملات (لا أرصدة اعتباطية) ليطابق حساب
  // المراقبة 2000 في الأستاذ. نتتبّع رصيد كل مورد ثم نكتبه قيمةً مطلقة في النهاية
  // (idempotent: إعادة التشغيل تُعيد نفس القيمة بدل أن تُراكم).
  const supBal = new Map<string, number>();
  const addAP = (sid: string, amt: number) => supBal.set(sid, (supBal.get(sid) ?? 0) + amt);

  // ── العملاء والموردون ──────────────────────────────────────────────────────
  const custB2C = ids.customerIndividual;
  const custB2B = ids.customerCompany;
  await db.insert(customers).values([
    { id: custB2C, agencyId, nameAr: 'عميل تجريبي — فردي', phone: '0550000001', isActive: true },
    { id: custB2B, agencyId, nameAr: 'شركة تجريبية — اعتباري', phone: '0550000002',
      vatNumber: '310123456700003', isActive: true },
  ]).onConflictDoNothing();

  const supAir = ids.supplierAirline;
  const supHotel = ids.supplierHotel;
  const supGovernment = ids.supplierGovernment;
  const supTransport = ids.supplierTransport;
  const supInsurance = ids.supplierInsurance;
  await db.insert(suppliers).values([
    { id: supAir,   agencyId, nameAr: 'الخطوط الجوية (تجريبي)', type: 'airline', balanceHalalas: 0, isActive: true },
    { id: supHotel, agencyId, nameAr: 'فندق مكة (تجريبي)',      type: 'hotel',   balanceHalalas: 0, isActive: true },
    { id: supGovernment, agencyId, nameAr: 'جهة تأشيرات (تجريبي)', type: 'visa', balanceHalalas: 0, isActive: true },
    { id: supTransport, agencyId, nameAr: 'شركة نقل (تجريبي)', type: 'transport', balanceHalalas: 0, isActive: true },
    { id: supInsurance, agencyId, nameAr: 'شركة تأمين سفر (تجريبي)', type: 'insurance', balanceHalalas: 0, isActive: true },
  ]).onConflictDoNothing();

  await db.insert(bankAccounts).values([
    {
      id: ids.bank, agencyId, nameAr: 'الحساب البنكي التجريبي', nameEn: 'Demo Bank Account',
      type: 'bank', bankName: 'بنك العرض', accountNumber: 'DEMO-001',
      openingBalanceHalalas: SAR(8000), currentBalanceHalalas: SAR(8000), currency: 'SAR',
      glAccountId: `${agencyId}-coa-1110`, isActive: true,
    },
    {
      id: ids.cash, agencyId, nameAr: 'صندوق الوكالة التجريبي', nameEn: 'Demo Cash',
      type: 'cash', openingBalanceHalalas: 0, currentBalanceHalalas: 0, currency: 'SAR',
      glAccountId: `${agencyId}-coa-1100`, isActive: true,
    },
  ]).onConflictDoNothing();

  const bankBalances = new Map<string, number>([[ids.bank, 0], [ids.cash, 0]]);
  async function recordBankTransaction(input: {
    id: string; bankAccountId: string; type: 'deposit' | 'withdrawal'; amountHalalas: number;
    date: string; description: string; sourceType: string; sourceId: string; reference: string;
  }) {
    const direction = input.type === 'deposit' ? 1 : -1;
    const balanceAfterHalalas = (bankBalances.get(input.bankAccountId) ?? 0) + direction * input.amountHalalas;
    bankBalances.set(input.bankAccountId, balanceAfterHalalas);
    await db.insert(bankTransactions).values({
      ...input, agencyId, balanceAfterHalalas, currency: 'SAR', isReconciled: false,
      createdAt: atNoonUtc(input.date),
    }).onConflictDoNothing();
  }

  const toJL = (ls: { code: string; ar: string; en: string; dr: number; cr: number }[]) => ls as Line[];

  const customerRefs = {
    individual: { id: custB2C, name: 'عميل تجريبي — فردي', vatNumber: null },
    company: { id: custB2B, name: 'شركة تجريبية — اعتباري', vatNumber: '310123456700003' },
  } as const;
  const supplierRefs: Record<DemoSupplierKind, { id: string; name: string }> = {
    airline: { id: supAir, name: 'الخطوط الجوية (تجريبي)' },
    hotel: { id: supHotel, name: 'فندق مكة (تجريبي)' },
    government: { id: supGovernment, name: 'جهة تأشيرات (تجريبي)' },
    transport: { id: supTransport, name: 'شركة نقل (تجريبي)' },
    insurance: { id: supInsurance, name: 'شركة تأمين سفر (تجريبي)' },
  };

  async function insertHistoricalScenario(scenario: HistoricalDemoScenario) {
    const issueDate = historicalScenarioDate(today, scenario);
    const paymentDate = addIsoDays(issueDate, 5);
    const customer = customerRefs[scenario.customer];
    const supplier = supplierRefs[scenario.supplier];
    const bookingId = demoId(`booking-${scenario.key}`);
    const invoiceId = demoId(`invoice-${scenario.key}`);
    const invoiceJournalId = demoId(`journal-invoice-${scenario.key}`);
    const line = makeLine({
      agencyId,
      bookingId,
      serviceType: scenario.serviceType,
      description: scenario.description,
      revenueModel: scenario.revenueModel,
      priceExclVat: scenario.priceExclVatHalalas,
      vat: scenario.vatHalalas,
      cost: scenario.costHalalas,
      vatCategory: scenario.vatCategory,
      supplierId: supplier.id,
      supplierName: supplier.name,
      createdOn: issueDate,
    });
    const { total } = await insertBooking({
      agencyId,
      id: bookingId,
      serviceType: scenario.serviceType,
      customerId: customer.id,
      customerNameAr: customer.name,
      line,
      createdOn: issueDate,
      details: { revenueModel: scenario.revenueModel, historicalDemo: true },
    });

    await postJournal({
      agencyId,
      id: invoiceJournalId,
      date: issueDate,
      descAr: `فاتورة تاريخية تجريبية — ${scenario.description}`,
      source: 'invoice',
      sourceId: invoiceId,
      serviceType: scenario.serviceType,
      lines: toJL(buildJournalLinesFromBookingLines([line], true, false)),
    });

    const paymentAmount = scenario.payment.state === 'full'
      ? total
      : scenario.payment.state === 'partial'
        ? scenario.payment.amountHalalas
        : 0;
    const invoiceStatus = paymentAmount === 0 ? 'issued' : paymentAmount === total ? 'paid' : 'partial';
    const feeHalalas = scenario.priceExclVatHalalas - scenario.costHalalas;
    const items = scenario.revenueModel === 'agent'
      ? [
          {
            description: `تكلفة المورد — ${scenario.description}`, quantity: 1,
            unitPriceHalalas: scenario.costHalalas, vatHalalas: 0,
            totalHalalas: scenario.costHalalas, vatCategory: 'O',
          },
          {
            description: `رسوم خدمة الوكالة — ${scenario.description}`, quantity: 1,
            unitPriceHalalas: feeHalalas, vatHalalas: scenario.vatHalalas,
            totalHalalas: feeHalalas + scenario.vatHalalas, vatCategory: scenario.vatCategory,
          },
        ]
      : [
          {
            description: scenario.description, quantity: 1,
            unitPriceHalalas: scenario.priceExclVatHalalas, vatHalalas: scenario.vatHalalas,
            totalHalalas: total, vatCategory: scenario.vatCategory,
          },
        ];

    await db.insert(invoices).values({
      id: invoiceId, agencyId, invoiceNumber: invNo(), type: '388',
      bookingId, customerId: customer.id, buyerNameAr: customer.name,
      buyerVatNumber: customer.vatNumber,
      subtotalHalalas: scenario.priceExclVatHalalas, vatHalalas: scenario.vatHalalas,
      totalHalalas: total, paidHalalas: paymentAmount, issueDate,
      dueDate: paymentAmount === total ? null : addIsoDays(issueDate, 30),
      status: invoiceStatus, isEInvoice: true, journalEntryId: invoiceJournalId,
      createdBy: 'seed', items, createdAt: atNoonUtc(issueDate), updatedAt: atNoonUtc(issueDate),
    }).onConflictDoNothing();
    addAP(supplier.id, scenario.costHalalas);

    if (paymentAmount > 0 && scenario.payment.state !== 'none') {
      const paymentId = demoId(`payment-${scenario.key}`);
      const paymentJournalId = demoId(`journal-payment-${scenario.key}`);
      const receiptId = demoId(`receipt-${scenario.key}`);
      const voucherNumber = rctNo();
      const method = scenario.payment.method;

      await postJournal({
        agencyId, id: paymentJournalId, date: paymentDate,
        descAr: `تحصيل تاريخي تجريبي — ${scenario.description}`,
        source: 'payment', sourceId: paymentId,
        lines: toJL(buildCustomerReceiptLines(paymentAmount, method)),
      });
      await db.insert(payments).values({
        id: paymentId, agencyId, invoiceId, bookingId, customerId: customer.id,
        customerName: customer.name, amountHalalas: paymentAmount, method,
        voucherNumber, date: paymentDate, journalEntryId: paymentJournalId,
        createdBy: 'seed', createdAt: atNoonUtc(paymentDate),
      }).onConflictDoNothing();
      await db.insert(receiptVouchers).values({
        id: receiptId, agencyId, voucherNumber, customerId: customer.id,
        customerName: customer.name, amountHalalas: paymentAmount, method,
        description: `تحصيل ${scenario.description}`, bookingId, invoiceId,
        date: paymentDate, journalEntryId: paymentJournalId, createdBy: 'seed',
        createdAt: atNoonUtc(paymentDate),
      }).onConflictDoNothing();
      await db.update(bookings).set({ paidHalalas: paymentAmount, updatedAt: atNoonUtc(paymentDate) }).where(and(
        eq(bookings.id, bookingId), eq(bookings.agencyId, agencyId),
      ));

      const bankAccountId = method === 'bank_transfer' ? ids.bank : method === 'cash' ? ids.cash : null;
      if (bankAccountId) {
        await recordBankTransaction({
          id: demoId(`bank-tx-receipt-${scenario.key}`), bankAccountId, type: 'deposit',
          amountHalalas: paymentAmount, date: paymentDate,
          description: `تحصيل ${scenario.description}`, sourceType: 'receipt', sourceId: receiptId,
          reference: voucherNumber,
        });
      }
    }
  }

  // ── رصيد افتتاحي للمورد (واقعي) ──────────────────────────────────────────────
  // الوكالة بدأت وهي تحتفظ بـ 8000 ر.س نقداً محصّلة من العملاء مستحقة للخطوط الجوية
  // (Dr نقدية / Cr ذمم دائنة موردون). قيد متوازن يجعل دفعة المورد لاحقاً منطقية،
  // ويُبقي الدفتر الفرعي مطابقاً للأستاذ.
  const AIRLINE_OPENING = SAR(8000);
  const openingJournalId = demoId('journal-opening-ap');
  const openingSourceId = demoId('opening-ap');
  await postJournal({ agencyId, id: openingJournalId, date: addDays(-90),
    descAr: 'رصيد افتتاحي — مستحق الخطوط الجوية', source: 'manual', sourceId: openingSourceId,
    entryNumber: 'DEMO-JE-0000', // ثابت خارج تسلسل DEMO-JE-#### حتى لا يصطدم بإعادة التشغيل
    lines: [
      { code: '1110', ar: 'البنك', en: 'Bank', dr: AIRLINE_OPENING, cr: 0 },
      { code: '2000', ar: 'ذمم دائنة - موردون', en: 'Accounts Payable - Suppliers', dr: 0, cr: AIRLINE_OPENING },
    ] });
  await recordBankTransaction({
    id: demoId('bank-tx-opening'), bankAccountId: ids.bank, type: 'deposit', amountHalalas: AIRLINE_OPENING,
    date: addDays(-90), description: 'الرصيد الافتتاحي التجريبي', sourceType: 'manual', sourceId: openingSourceId,
    reference: 'DEMO-OPENING',
  });
  addAP(supAir, AIRLINE_OPENING);

  // ════════════════════════════════════════════════════════════════════════
  // (1) طيران (وكيل) — فاتورة مدفوعة بالكامل
  // ════════════════════════════════════════════════════════════════════════
  {
    const scenarioDate = addDays(-30);
    const bId = demoId('booking-flight');
    const line = makeLine({ agencyId, bookingId: bId, serviceType: 'flight',
      description: 'تذكرة الرياض ⇄ القاهرة', revenueModel: 'agent',
      priceExclVat: SAR(1600), vat: SAR(15), cost: SAR(1500),
      supplierId: supAir, supplierName: 'الخطوط الجوية (تجريبي)', createdOn: scenarioDate });
    const { total } = await insertBooking({ agencyId, id: bId, serviceType: 'flight',
      customerId: custB2C, customerNameAr: 'عميل تجريبي — فردي', line, createdOn: scenarioDate });

    const invId = demoId('invoice-flight'), jeId = demoId('journal-invoice-flight');
    // أدرج القيد أولاً (قبل الفاتورة — FK constraint)
    await postJournal({ agencyId, id: jeId, date: scenarioDate, descAr: 'فاتورة طيران تجريبية',
      source: 'invoice', sourceId: invId, serviceType: 'flight',
      lines: toJL(buildJournalLinesFromBookingLines([line], true, false)) });
    // ثم الفاتورة
    await db.insert(invoices).values({
      id: invId, agencyId, invoiceNumber: invNo(), type: '388', bookingId: bId, customerId: custB2C,
      buyerNameAr: 'عميل تجريبي — فردي', subtotalHalalas: SAR(1600), vatHalalas: SAR(15),
      totalHalalas: total, paidHalalas: total, issueDate: scenarioDate, status: 'paid',
      isEInvoice: true, journalEntryId: jeId, createdBy: 'seed',
      items: [
        {
          description: 'قيمة التذكرة — تحصيل لصالح شركة الطيران', quantity: 1,
          unitPriceHalalas: SAR(1500), vatHalalas: 0, totalHalalas: SAR(1500), vatCategory: 'O',
        },
        {
          description: 'رسوم خدمة الوكالة', quantity: 1,
          unitPriceHalalas: SAR(100), vatHalalas: SAR(15), totalHalalas: SAR(115), vatCategory: 'S',
        },
      ],
    }).onConflictDoNothing();
    addAP(supAir, line.totalCostHalalas); // الفوترة تُضيف تكلفة المورد لـ AP (يطابق دائن 2000)

    // دفعة كاملة — القيد أولاً ثم الدفعة (FK)
    const payId = demoId('payment-flight'), jePay = demoId('journal-payment-flight');
    const voucherNumber = rctNo();
    await postJournal({ agencyId, id: jePay, date: scenarioDate, descAr: 'استلام دفعة — فاتورة الطيران التجريبية',
      source: 'payment', sourceId: payId, lines: toJL(buildCustomerReceiptLines(total, 'bank_transfer')) });
    await db.insert(payments).values({
      id: payId, agencyId, invoiceId: invId, bookingId: bId, customerId: custB2C,
      customerName: 'عميل تجريبي — فردي', amountHalalas: total, method: 'bank_transfer',
      voucherNumber, date: scenarioDate, journalEntryId: jePay, createdBy: 'seed',
    }).onConflictDoNothing();
    await db.update(bookings).set({ paidHalalas: total, updatedAt: new Date() }).where(and(
      eq(bookings.id, bId), eq(bookings.agencyId, agencyId),
    ));
    const receiptId = demoId('receipt-flight');
    await db.insert(receiptVouchers).values({
      id: receiptId, agencyId, voucherNumber, customerId: custB2C, customerName: 'عميل تجريبي — فردي',
      amountHalalas: total, method: 'bank_transfer', description: 'سداد فاتورة الطيران التجريبية',
      bookingId: bId, invoiceId: invId, date: scenarioDate, journalEntryId: jePay, createdBy: 'seed',
    }).onConflictDoNothing();
    await recordBankTransaction({
      id: demoId('bank-tx-receipt-flight'), bankAccountId: ids.bank, type: 'deposit', amountHalalas: total,
      date: scenarioDate, description: 'تحصيل فاتورة الطيران', sourceType: 'receipt', sourceId: receiptId,
      reference: voucherNumber,
    });
  }

  // ════════════════════════════════════════════════════════════════════════
  // (2) باقة (أصيل) — فاتورة مدفوعة جزئياً وقسط ثانٍ معلّق
  // ════════════════════════════════════════════════════════════════════════
  {
    const invoiceDate = addDays(-25);
    const firstPaymentDate = addDays(-20);
    const bId = demoId('booking-package');
    const line = makeLine({ agencyId, bookingId: bId, serviceType: 'package',
      description: 'باقة سياحية — إسطنبول 5 ليالٍ', revenueModel: 'principal',
      priceExclVat: SAR(10000), vat: SAR(1500), cost: SAR(6000),
      supplierId: supHotel, supplierName: 'فندق مكة (تجريبي)', createdOn: invoiceDate });
    const { total } = await insertBooking({ agencyId, id: bId, serviceType: 'package',
      customerId: custB2B, customerNameAr: 'شركة تجريبية — اعتباري', line, createdOn: invoiceDate });

    const invId = demoId('invoice-package'), jeId = demoId('journal-invoice-package');
    const firstPay = SAR(5000), secondPay = total - firstPay;
    await postJournal({ agencyId, id: jeId, date: invoiceDate, descAr: 'فاتورة باقة سياحية تجريبية',
      source: 'invoice', sourceId: invId, serviceType: 'package',
      lines: toJL(buildJournalLinesFromBookingLines([line], true, false)) });
    await db.insert(invoices).values({
      id: invId, agencyId, invoiceNumber: invNo(), type: '388', bookingId: bId, customerId: custB2B,
      buyerNameAr: 'شركة تجريبية — اعتباري', buyerVatNumber: '310123456700003',
      subtotalHalalas: SAR(10000), vatHalalas: SAR(1500), totalHalalas: total,
      paidHalalas: firstPay, issueDate: invoiceDate, status: 'partial', isEInvoice: true,
      journalEntryId: jeId, createdBy: 'seed',
      items: [{ description: 'باقة سياحية — إسطنبول', quantity: 1, unitPriceHalalas: SAR(10000), vatHalalas: SAR(1500), totalHalalas: total }],
    }).onConflictDoNothing();
    addAP(supHotel, line.totalCostHalalas);

    // قسط 1 (مقدّمة)
    const firstPaymentId = demoId('payment-package-1');
    const firstPaymentJournalId = demoId('journal-payment-package-1');
    const firstVoucherNumber = rctNo();
    await postJournal({ agencyId, id: firstPaymentJournalId, date: firstPaymentDate, descAr: 'الدفعة الأولى — الباقة التجريبية',
      source: 'payment', sourceId: firstPaymentId, lines: toJL(buildCustomerReceiptLines(firstPay, 'cash')) });
    await db.insert(payments).values({
      id: firstPaymentId, agencyId, invoiceId: invId, bookingId: bId, customerId: custB2B,
      customerName: 'شركة تجريبية — اعتباري', amountHalalas: firstPay, method: 'cash',
      voucherNumber: firstVoucherNumber, date: firstPaymentDate, journalEntryId: firstPaymentJournalId, createdBy: 'seed',
    }).onConflictDoNothing();
    await db.update(bookings).set({ paidHalalas: firstPay, updatedAt: new Date() }).where(and(
      eq(bookings.id, bId), eq(bookings.agencyId, agencyId),
    ));
    const firstReceiptId = demoId('receipt-package-1');
    await db.insert(receiptVouchers).values({
      id: firstReceiptId, agencyId, voucherNumber: firstVoucherNumber, customerId: custB2B, customerName: 'شركة تجريبية — اعتباري',
      amountHalalas: firstPay, method: 'cash', description: 'الدفعة الأولى من الباقة', bookingId: bId, invoiceId: invId,
      date: firstPaymentDate, journalEntryId: firstPaymentJournalId, createdBy: 'seed',
    }).onConflictDoNothing();
    await recordBankTransaction({
      id: demoId('bank-tx-receipt-package-1'), bankAccountId: ids.cash, type: 'deposit', amountHalalas: firstPay,
      date: firstPaymentDate, description: 'الدفعة الأولى من الباقة', sourceType: 'receipt', sourceId: firstReceiptId,
      reference: firstVoucherNumber,
    });

    const planId = demoId('payment-plan-package');
    await db.insert(paymentPlans).values({
      id: planId, agencyId, bookingId: bId, invoiceId: invId, totalAmountHalalas: total,
      numInstallments: 2, notes: 'خطة دفع تجريبية — القسط الثاني معلّق', status: 'active', createdBy: 'seed',
    }).onConflictDoNothing();
    await db.insert(paymentPlanInstallments).values([
      {
        id: demoId('installment-package-1'), agencyId, planId, bookingId: bId, invoiceId: invId,
        installmentNumber: 1, dueDate: firstPaymentDate, amountHalalas: firstPay, status: 'paid',
        paidAt: new Date(`${firstPaymentDate}T12:00:00.000Z`), paymentId: firstPaymentId,
      },
      {
        id: demoId('installment-package-2'), agencyId, planId, bookingId: bId, invoiceId: invId,
        installmentNumber: 2, dueDate: addDays(10), amountHalalas: secondPay, status: 'pending',
      },
    ]).onConflictDoNothing();
  }

  // ════════════════════════════════════════════════════════════════════════
  // (3) عمرة (أصيل، معفاة) — إيراد مؤجل (الرحلة بعد شهر)
  // ════════════════════════════════════════════════════════════════════════
  {
    const scenarioDate = today;
    const bId = demoId('booking-umrah');
    const line = makeLine({ agencyId, bookingId: bId, serviceType: 'umrah',
      description: 'برنامج عمرة — 4 ليالٍ', revenueModel: 'principal',
      priceExclVat: SAR(5000), vat: 0, cost: SAR(3300), vatCategory: 'E',
      supplierId: supHotel, supplierName: 'فندق مكة (تجريبي)', createdOn: scenarioDate });
    const { total } = await insertBooking({ agencyId, id: bId, serviceType: 'umrah',
      customerId: custB2C, customerNameAr: 'عميل تجريبي — فردي', line,
      details: { travelDate: addDays(30) }, createdOn: scenarioDate });

    const invId = demoId('invoice-umrah'), jeId = demoId('journal-invoice-umrah');
    // deferRevenue=true → الإيراد يُقيَّد في 3201 (إيراد مؤجل) لا 4100 — القيد أولاً ثم الفاتورة
    await postJournal({ agencyId, id: jeId, date: today, descAr: `فاتورة ${invId} — عمرة (إيراد مؤجل)`,
      source: 'invoice', sourceId: invId, serviceType: 'umrah',
      lines: toJL(buildJournalLinesFromBookingLines([line], true, true)) });
    await db.insert(invoices).values({
      id: invId, agencyId, invoiceNumber: invNo(), type: '388', bookingId: bId, customerId: custB2C,
      buyerNameAr: 'عميل تجريبي — فردي', subtotalHalalas: SAR(5000), vatHalalas: 0, totalHalalas: total,
      paidHalalas: total, issueDate: today, status: 'paid', isEInvoice: true,
      deferredUntil: addDays(30), journalEntryId: jeId, createdBy: 'seed',
      items: [{ description: 'برنامج عمرة', quantity: 1, unitPriceHalalas: SAR(5000), vatHalalas: 0, totalHalalas: total }],
    }).onConflictDoNothing();
    addAP(supHotel, line.totalCostHalalas);

    // دفعة كاملة — القيد أولاً ثم الدفعة
    const paymentId = demoId('payment-umrah');
    const paymentJournalId = demoId('journal-payment-umrah');
    const voucherNumber = rctNo();
    await postJournal({ agencyId, id: paymentJournalId, date: today, descAr: 'استلام دفعة برنامج العمرة التجريبي',
      source: 'payment', sourceId: paymentId, lines: toJL(buildCustomerReceiptLines(total, 'cash')) });
    await db.insert(payments).values({
      id: paymentId, agencyId, invoiceId: invId, bookingId: bId, customerId: custB2C,
      customerName: 'عميل تجريبي — فردي', amountHalalas: total, method: 'cash',
      voucherNumber, date: today, journalEntryId: paymentJournalId, createdBy: 'seed',
    }).onConflictDoNothing();
    await db.update(bookings).set({ paidHalalas: total, updatedAt: new Date() }).where(and(
      eq(bookings.id, bId), eq(bookings.agencyId, agencyId),
    ));
    const receiptId = demoId('receipt-umrah');
    await db.insert(receiptVouchers).values({
      id: receiptId, agencyId, voucherNumber, customerId: custB2C, customerName: 'عميل تجريبي — فردي',
      amountHalalas: total, method: 'cash', description: 'سداد برنامج عمرة تجريبي', bookingId: bId, invoiceId: invId,
      date: today, journalEntryId: paymentJournalId, createdBy: 'seed',
    }).onConflictDoNothing();
    await recordBankTransaction({
      id: demoId('bank-tx-receipt-umrah'), bankAccountId: ids.cash, type: 'deposit', amountHalalas: total,
      date: today, description: 'تحصيل برنامج العمرة', sourceType: 'receipt', sourceId: receiptId,
      reference: voucherNumber,
    });
  }

  // ════════════════════════════════════════════════════════════════════════
  // (4) حجز مؤكَّد بلا فاتورة بعد (خط أنابيب — لا قيد محاسبي)
  // ════════════════════════════════════════════════════════════════════════
  {
    const scenarioDate = today;
    const bId = demoId('booking-pipeline');
    const line = makeLine({ agencyId, bookingId: bId, serviceType: 'flight',
      description: 'تذكرة جدة ⇄ دبي (لم تُفوتر بعد)', revenueModel: 'agent',
      priceExclVat: SAR(900), vat: SAR(15), cost: SAR(800),
      supplierId: supAir, supplierName: 'الخطوط الجوية (تجريبي)', createdOn: scenarioDate });
    await insertBooking({ agencyId, id: bId, serviceType: 'flight', status: 'confirmed',
      customerId: custB2C, customerNameAr: 'عميل تجريبي — فردي', line,
      details: { travelDate: addDays(25) }, createdOn: scenarioDate });
    // لا فاتورة ولا قيد — يظهر في خط الأنابيب فقط (سلوك صحيح وفق IFRS 15)
  }

  // ════════════════════════════════════════════════════════════════════════
  // عروض أسعار — واحد مُرسل وآخر تحوّل فعلياً إلى حجز الباقة
  // ════════════════════════════════════════════════════════════════════════
  await db.insert(quotes).values([
    {
      id: demoId('quote-flight-sent'), agencyId, quoteNumber: 'DEMO-QT-0001',
      customerId: custB2C, customerName: 'عميل تجريبي — فردي', customerNameEn: 'Demo Individual Customer',
      customerPhone: '0550000001', customerEmail: 'individual@example.test',
      items: [{ serviceType: 'flight', description: 'تذكرة الرياض ⇄ دبي', quantity: 1, unitPriceSAR: 1800 }],
      subtotalHalalas: SAR(1800), vatHalalas: SAR(270), totalHalalas: SAR(2070),
      status: 'sent', issueDate: today, validUntil: addDays(14),
      notes: 'عرض سعر تجريبي شامل ضريبة القيمة المضافة', terms: 'صالح لمدة 14 يوماً', createdBy: 'seed',
    },
    {
      id: demoId('quote-package-converted'), agencyId, quoteNumber: 'DEMO-QT-0002',
      customerId: custB2B, customerName: 'شركة تجريبية — اعتباري', customerNameEn: 'Demo Company',
      customerPhone: '0550000002', customerEmail: 'company@example.test',
      items: [{ serviceType: 'package', description: 'باقة سياحية — إسطنبول 5 ليالٍ', quantity: 1, unitPriceSAR: 10000 }],
      subtotalHalalas: SAR(10000), vatHalalas: SAR(1500), totalHalalas: SAR(11500),
      status: 'converted', issueDate: addDays(-28), validUntil: addDays(-21),
      notes: 'عرض سعر تحوّل إلى حجز الباقة التجريبية', convertedToBookingId: demoId('booking-package'),
      convertedAt: new Date(), terms: 'تمت الموافقة والتحويل إلى حجز', createdBy: 'seed',
    },
  ]).onConflictDoNothing();

  // ════════════════════════════════════════════════════════════════════════
  // (5) استرداد جزئي على فاتورة الطيران (مذكرة دائنة + قيد عكسي)
  // ════════════════════════════════════════════════════════════════════════
  {
    const origInvId = demoId('invoice-flight');
    const originalJournalId = demoId('journal-invoice-flight');
    const origLines = await db.select({
      accountCode: journalLines.accountCode, accountNameAr: journalLines.accountNameAr,
      accountNameEn: journalLines.accountNameEn, debitHalalas: journalLines.debitHalalas,
      creditHalalas: journalLines.creditHalalas,
    }).from(journalLines).where(and(
      eq(journalLines.entryId, originalJournalId),
      eq(journalLines.agencyId, agencyId),
    ));

    const refundCash = SAR(800), cancellationFee = 0;
    const cnId = demoId('credit-note-flight'), jeId = demoId('journal-refund-flight');
    const creditNoteNumber = invNo();
    const refundPolicy = validateRefundPolicy({
      bookingId: demoId('booking-flight'), invoiceBookingId: demoId('booking-flight'),
      invoiceType: '388', invoiceStatus: 'paid', originalTotalHalalas: SAR(1615), paidHalalas: SAR(1615),
      refundAmountHalalas: refundCash, cancellationFeeHalalas: cancellationFee,
    });
    const refundDocument = buildRefundDocument({
      originalItems: [
        {
          description: 'قيمة التذكرة — تحصيل لصالح شركة الطيران', quantity: 1,
          unitPriceHalalas: SAR(1500), vatHalalas: 0, totalHalalas: SAR(1500), vatCategory: 'O',
        },
        {
          description: 'رسوم خدمة الوكالة', quantity: 1,
          unitPriceHalalas: SAR(100), vatHalalas: SAR(15), totalHalalas: SAR(115), vatCategory: 'S',
        },
      ],
      originalTotalHalalas: SAR(1615), originalVatHalalas: SAR(15),
      cancelledTotalHalalas: refundPolicy.cancelledTotalHalalas,
      cancellationFeeHalalas: cancellationFee, isEInvoice: true, vatRateBps: 1500,
    });
    const refundLines = buildRefundJournalLines({
      originalLines: origLines.map(l => ({
        accountCode: l.accountCode, accountNameAr: l.accountNameAr, accountNameEn: l.accountNameEn,
        debitHalalas: Number(l.debitHalalas), creditHalalas: Number(l.creditHalalas),
      })),
      originalTotalHalalas: SAR(1615), originalVatHalalas: SAR(15), paidHalalas: SAR(1615),
      refundAmountHalalas: refundCash, cancellationFeeHalalas: cancellationFee,
      cancelledTotalHalalas: refundPolicy.cancelledTotalHalalas, isEInvoice: true, vatRateBps: 1500,
    });

    await postJournal({ agencyId, id: jeId, date: today, descAr: 'إشعار دائن — استرداد جزئي للتذكرة',
      source: 'receipt', sourceId: cnId,
      lines: refundLines.map(l => ({ code: l.code, ar: l.ar, en: l.en, dr: l.dr, cr: l.cr })) });
    await db.insert(invoices).values({
      id: cnId, agencyId, invoiceNumber: creditNoteNumber, type: '381', bookingId: demoId('booking-flight'),
      customerId: custB2C, buyerNameAr: 'عميل تجريبي — فردي', subtotalHalalas: refundDocument.creditNoteSubtotalHalalas,
      vatHalalas: refundDocument.creditNoteVatHalalas, totalHalalas: refundDocument.creditNoteTotalHalalas,
      paidHalalas: refundDocument.creditNoteTotalHalalas, items: refundDocument.items,
      issueDate: today, status: 'issued', isEInvoice: true, originalInvoiceId: origInvId,
      journalEntryId: jeId, createdBy: 'seed', notes: 'استرداد جزئي تجريبي',
    }).onConflictDoNothing();
    await db.insert(payments).values({
      id: demoId('payment-refund-flight'), agencyId, invoiceId: origInvId,
      bookingId: demoId('booking-flight'), customerId: custB2C,
      customerName: 'عميل تجريبي — فردي', amountHalalas: -refundCash,
      method: 'bank_transfer', voucherNumber: creditNoteNumber, date: today,
      journalEntryId: jeId, createdBy: 'seed', notes: 'استرداد جزئي تجريبي',
    }).onConflictDoNothing();
    const remainingPaid = SAR(1615) - refundPolicy.claimedPaidHalalas;
    await db.update(invoices).set({ paidHalalas: remainingPaid, status: 'partial', updatedAt: new Date() }).where(and(
      eq(invoices.id, origInvId), eq(invoices.agencyId, agencyId),
    ));
    await db.update(bookings).set({ paidHalalas: remainingPaid, updatedAt: new Date() }).where(and(
      eq(bookings.id, demoId('booking-flight')), eq(bookings.agencyId, agencyId),
    ));
    const refundVoucherId = demoId('receipt-refund-flight');
    const refundVoucherNumber = rctNo();
    await db.insert(receiptVouchers).values({
      id: refundVoucherId, agencyId, voucherNumber: refundVoucherNumber, customerId: custB2C,
      customerName: 'عميل تجريبي — فردي', amountHalalas: refundCash, method: 'bank_transfer',
      description: 'استرداد جزئي للتذكرة التجريبية', bookingId: demoId('booking-flight'), invoiceId: origInvId,
      date: today, journalEntryId: jeId, isRefund: 'true', originalVoucherId: demoId('receipt-flight'), createdBy: 'seed',
    }).onConflictDoNothing();
    await recordBankTransaction({
      id: demoId('bank-tx-refund-flight'), bankAccountId: ids.bank, type: 'withdrawal', amountHalalas: refundCash,
      date: today, description: 'إعادة مبلغ للعميل — استرداد جزئي', sourceType: 'refund', sourceId: refundVoucherId,
      reference: refundVoucherNumber,
    });
    // الاسترداد يستردّ تكلفة المورد (مدين 2000) ⇒ يُنقص AP الخطوط الجوية بنفس القدر.
    const refundApDebit = refundLines.filter(l => l.code === '2000').reduce((s, l) => s + l.dr, 0);
    addAP(supAir, -refundApDebit);
  }

  // ════════════════════════════════════════════════════════════════════════
  // (6) دفعة مورد بالريال (تسوية مستحق الخطوط)
  // ════════════════════════════════════════════════════════════════════════
  {
    const spId = demoId('supplier-payment-airline'), jeId = demoId('journal-supplier-payment-airline');
    const built = buildSupplierPaymentJournalLines({
      expenseAccount: { code: '2000', ar: 'ذمم دائنة - موردون', en: 'Accounts Payable' },
      paymentAccount: { code: '1110', ar: 'البنك', en: 'Bank' },
      resolvedAmountHalalas: SAR(5000), vatAmountHalalas: 0, expenseDebitHalalas: SAR(5000),
    });
    await postJournal({ agencyId, id: jeId, date: today, descAr: `سند صرف — تسوية الخطوط الجوية`,
      source: 'payment', sourceId: spId, lines: toJL(built) });
    const voucherNumber = pvNo();
    await db.insert(supplierPayments).values({
      id: spId, agencyId, supplierId: supAir, supplierName: 'الخطوط الجوية (تجريبي)',
      payeeName: 'الخطوط الجوية (تجريبي)', amountHalalas: SAR(5000), method: 'bank_transfer',
      voucherNumber, expenseCategory: 'supplier', date: today, status: 'completed',
      journalEntryId: jeId, createdBy: 'seed',
    }).onConflictDoNothing();
    await recordBankTransaction({
      id: demoId('bank-tx-supplier-airline'), bankAccountId: ids.bank, type: 'withdrawal', amountHalalas: SAR(5000),
      date: today, description: 'سداد جزئي للخطوط الجوية', sourceType: 'supplier_payment', sourceId: spId,
      reference: voucherNumber,
    });
    addAP(supAir, -apClearedHalalas(built)); // الدفع يُنقص AP بما رُحّل لحساب 2000
  }

  // ════════════════════════════════════════════════════════════════════════
  // (7) دفعة مورد بعملة أجنبية — يوضّح معالجة IAS 21 (فرق صرف منفصل)
  // ════════════════════════════════════════════════════════════════════════
  {
    const spId = demoId('supplier-payment-hotel-fx'), jeId = demoId('journal-supplier-payment-hotel-fx');
    const bookedSAR = SAR(3300), paidSAR = SAR(3360); // فرق صرف 60 ر.س (خسارة)
    const built = buildSupplierPaymentJournalLines({
      expenseAccount: { code: '2000', ar: 'ذمم دائنة - موردون', en: 'Accounts Payable' },
      paymentAccount: { code: '1110', ar: 'البنك', en: 'Bank' },
      resolvedAmountHalalas: paidSAR, vatAmountHalalas: 0, expenseDebitHalalas: bookedSAR,
    });
    await postJournal({ agencyId, id: jeId, date: today, descAr: `سند صرف (USD) — فندق مكة (فرق صرف)`,
      source: 'payment', sourceId: spId, lines: toJL(built) });
    const voucherNumber = pvNo();
    await db.insert(supplierPayments).values({
      id: spId, agencyId, supplierId: supHotel, supplierName: 'فندق مكة (تجريبي)',
      payeeName: 'فندق مكة (تجريبي)', amountHalalas: paidSAR, method: 'bank_transfer',
      voucherNumber, expenseCategory: 'supplier', reference: 'USD @ 3.78', date: today,
      status: 'completed', journalEntryId: jeId, createdBy: 'seed',
    }).onConflictDoNothing();
    await recordBankTransaction({
      id: demoId('bank-tx-supplier-hotel-fx'), bankAccountId: ids.bank, type: 'withdrawal', amountHalalas: paidSAR,
      date: today, description: 'سداد الفندق بعملة أجنبية', sourceType: 'supplier_payment', sourceId: spId,
      reference: voucherNumber,
    });
    // دفتر المورد ينقص بـ bookedSAR (3300) — لا paidSAR — والفرق (60) في 5900 خسائر صرف (IAS 21)
    addAP(supHotel, -apClearedHalalas(built));
  }

  // ════════════════════════════════════════════════════════════════════════
  // (8–15) سجل تاريخي لثمانية أشهر — مدخلات متنوعة ومخرجات قابلة للمقارنة
  // ════════════════════════════════════════════════════════════════════════
  for (const scenario of HISTORICAL_DEMO_SCENARIOS) {
    await insertHistoricalScenario(scenario);
  }

  // ── كتابة أرصدة الموردين كقيمة مطلقة (idempotent) ────────────────────────────
  // الرصيد النهائي مُشتقّ بالكامل من القيود أعلاه فيطابق حساب المراقبة 2000.
  for (const [sid, bal] of supBal) {
    await db.update(suppliers).set({ balanceHalalas: bal, updatedAt: new Date() }).where(and(
      eq(suppliers.id, sid),
      eq(suppliers.agencyId, agencyId),
    ));
  }

  // التقارير الشهرية تعتمد على created_at للفواتير. نحاذيه مع تاريخ الإصدار
  // لكل سجلات العرض فقط، بما فيها السجلات التي زُرعت قبل إضافة التاريخ الصريح.
  const demoInvoices = await db.select({ id: invoices.id, issueDate: invoices.issueDate })
    .from(invoices)
    .where(and(eq(invoices.agencyId, agencyId), like(invoices.id, `${agencyId}-demo-%`)));
  for (const invoice of demoInvoices) {
    await db.update(invoices).set({ createdAt: atNoonUtc(invoice.issueDate) }).where(and(
      eq(invoices.id, invoice.id), eq(invoices.agencyId, agencyId),
    ));
  }

  // أُدخلت الحالات بحسب تسلسل منطقي لا بحسب التاريخ، لذلك نعيد بناء الرصيد الجاري
  // لكل حركة عرض حسب التاريخ حتى يكون كشف البنك نفسه صحيحاً شهراً بعد شهر.
  const demoBankTransactions = await db.select({
    id: bankTransactions.id,
    bankAccountId: bankTransactions.bankAccountId,
    type: bankTransactions.type,
    amountHalalas: bankTransactions.amountHalalas,
    date: bankTransactions.date,
  }).from(bankTransactions)
    .where(and(eq(bankTransactions.agencyId, agencyId), like(bankTransactions.id, `${agencyId}-demo-%`)))
    .orderBy(asc(bankTransactions.date), asc(bankTransactions.id));
  const recalculatedBankBalances = new Map<string, number>();
  for (const transaction of demoBankTransactions) {
    const previous = recalculatedBankBalances.get(transaction.bankAccountId) ?? 0;
    const direction = transaction.type === 'deposit' ? 1 : transaction.type === 'withdrawal' ? -1 : 0;
    const balance = previous + direction * Number(transaction.amountHalalas);
    recalculatedBankBalances.set(transaction.bankAccountId, balance);
    await db.update(bankTransactions).set({
      balanceAfterHalalas: balance,
      createdAt: atNoonUtc(transaction.date),
    }).where(and(
      eq(bankTransactions.id, transaction.id), eq(bankTransactions.agencyId, agencyId),
    ));
  }
  for (const [bankAccountId, balance] of recalculatedBankBalances) {
    await db.update(bankAccounts).set({ currentBalanceHalalas: balance, updatedAt: new Date() }).where(and(
      eq(bankAccounts.id, bankAccountId), eq(bankAccounts.agencyId, agencyId),
    ));
  }
  const subledgerTotal = [...supBal.values()].reduce((s, b) => s + b, 0);

  console.log('\n✅ تمت زراعة البيانات التجريبية بنجاح. سجّل الدخول لتراها:');
  console.log('   • حجوزات: طيران (وكيل) · باقة وعمرة (أصيل) · حجز غير مفوتر');
  console.log('   • فاتورة جزئية + خطة أقساط · عروض أسعار · سندات قبض · بنك وصندوق');
  console.log('   • قيود متوازنة · استرداد جزئي (مذكرة دائنة) · دفعتا مورد (ريال + عملة أجنبية)');
  console.log(`   • ${HISTORICAL_DEMO_SCENARIOS.length} حالات تاريخية موزعة على 8 أشهر (مدفوع/جزئي/آجل)`);
  console.log(`   • دفتر الموردين الفرعي = ${(subledgerTotal / 100).toFixed(2)} ر.س (مطابق لحساب المراقبة 2000)`);
  console.log('   • قارن: ميزان المراجعة، قائمة الدخل، الذمم المدينة/الدائنة، الإيراد المؤجل، الداش بورد.\n');
}

async function run() {
  try {
    await main();
  } catch (err) {
    console.error('\n✗ فشلت الزراعة:', err instanceof Error ? err.message : err);
    // خطأ PostgreSQL الحقيقي (مثل "column ... does not exist") يكون في cause
    const cause = (err as { cause?: unknown })?.cause;
    if (cause) {
      const cm = cause instanceof Error ? cause.message : String(cause);
      console.error('  ↳ السبب الجذري (PostgreSQL):', cm);
    }
    process.exitCode = 1;
  } finally {
    await localPool?.end();
  }
}

void run();
