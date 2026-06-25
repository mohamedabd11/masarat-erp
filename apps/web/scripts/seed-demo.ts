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
 *   DATABASE_URL="postgres://...neon.tech/...?sslmode=require" \
 *   pnpm --filter @masarat/web exec tsx scripts/seed-demo.ts
 *   # أو:  npx tsx apps/web/scripts/seed-demo.ts   (مع ضبط DATABASE_URL)
 *
 * خصائص:
 *   • idempotent — إعادة التشغيل لا تُكرّر ولا تحذف (معرّفات ثابتة + ON CONFLICT DO NOTHING).
 *   • لا يحذف أي سجل مالي (يحترم محفّزات حصانة السجلات).
 *   • البريد الافتراضي zoolsamet4@gmail.com — غيّره بـ SEED_EMAIL=other@x.com
 */
import { readFileSync } from 'node:fs';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { eq } from 'drizzle-orm';

import {
  users, customers, suppliers, bookings, bookingLines,
  invoices, journalEntries, journalLines, payments, supplierPayments,
  type BookingLine,
} from '../src/lib/schema';
import { buildJournalLinesFromBookingLines } from '../src/lib/invoice-journal';
import { buildCustomerReceiptLines, buildRevenueRecognitionLines } from '../src/lib/payment-journal';
import { buildRefundJournalLines } from '../src/lib/refund-journal';
import { buildSupplierPaymentJournalLines } from '../src/lib/supplier-payment-journal';

// ─── الإعداد ──────────────────────────────────────────────────────────────────

const EMAIL = process.env['SEED_EMAIL'] ?? 'zoolsamet4@gmail.com';

function resolveDatabaseUrl(): string {
  if (process.env['DATABASE_URL']) return process.env['DATABASE_URL']!;
  for (const p of ['apps/web/.env.local', '.env.local', '../.env.local']) {
    try {
      const m = readFileSync(p, 'utf8').match(/^\s*DATABASE_URL\s*=\s*(.+)\s*$/m);
      if (m) return m[1]!.trim().replace(/^["']|["']$/g, '');
    } catch { /* keep looking */ }
  }
  throw new Error(
    'DATABASE_URL غير مضبوط.\n' +
    'شغّل:  DATABASE_URL="postgres://...neon.tech/...?sslmode=require" npx tsx apps/web/scripts/seed-demo.ts',
  );
}

const db = drizzle(neon(resolveDatabaseUrl()));

// أرقام صحيحة بالهللات (1 ر.س = 100 هللة)
const SAR = (riyals: number) => Math.round(riyals * 100);
const today = new Date().toISOString().split('T')[0]!;
const addDays = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().split('T')[0]!;

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
}) {
  const totalDr = args.lines.reduce((s, l) => s + l.dr, 0);
  const totalCr = args.lines.reduce((s, l) => s + l.cr, 0);
  if (totalDr !== totalCr) throw new Error(`قيد غير متوازن (${args.descAr}): ${totalDr} ≠ ${totalCr}`);

  await db.insert(journalEntries).values({
    id: args.id, agencyId: args.agencyId, entryNumber: jeNo(), date: args.date,
    descriptionAr: args.descAr, source: args.source, sourceId: args.sourceId,
    serviceType: args.serviceType ?? null, isPosted: true,
    totalDebitHalalas: totalDr, totalCreditHalalas: totalCr, createdBy: 'seed',
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
}): BookingLine {
  const vatCategory = p.vatCategory ?? (p.vat > 0 ? 'S' : 'Z');
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
    sortOrder: 1, notes: null, createdAt: new Date(), updatedAt: new Date(),
  } as BookingLine;
}

/** يدرج حجزاً + سطره. يُعيد المعرّفات والمبالغ. */
async function insertBooking(p: {
  agencyId: string; id: string; serviceType: string; customerId: string;
  customerNameAr: string; line: BookingLine; status?: string; details?: Record<string, unknown>;
}) {
  const total = p.line.totalPriceExclVatHalalas + p.line.vatHalalas;
  const cost  = p.line.totalCostHalalas;
  await db.insert(bookings).values({
    id: p.id, agencyId: p.agencyId, bookingNumber: bkNo(), serviceType: p.serviceType,
    customerId: p.customerId, customerNameAr: p.customerNameAr, status: p.status ?? 'completed',
    totalPriceHalalas: total, costPriceHalalas: cost, profitHalalas: total - cost,
    paidHalalas: 0, currency: 'SAR', details: { revenueModel: p.line.revenueModel, ...(p.details ?? {}) },
    createdBy: 'seed',
  }).onConflictDoNothing();
  await db.insert(bookingLines).values(p.line).onConflictDoNothing();
  return { total, cost };
}

// ─── البرنامج الرئيسي ─────────────────────────────────────────────────────────

async function main() {
  console.log(`\n▸ البحث عن الوكالة المرتبطة بـ ${EMAIL} …`);
  const [u] = await db.select().from(users).where(eq(users.email, EMAIL));
  if (!u) {
    throw new Error(
      `لا يوجد مستخدم بالبريد ${EMAIL} في قاعدة البيانات.\n` +
      `سجّل الوكالة أولاً عبر صفحة /register (تنشئ الوكالة + دليل الحسابات)، ثم أعد التشغيل.`,
    );
  }
  const agencyId = u.agencyId;
  console.log(`  ✓ الوكالة: ${agencyId}`);

  // ── العملاء والموردون ──────────────────────────────────────────────────────
  const custB2C = 'demo-cust-b2c';
  const custB2B = 'demo-cust-b2b';
  await db.insert(customers).values([
    { id: custB2C, agencyId, nameAr: 'عميل تجريبي — فردي', phone: '0550000001', isActive: true },
    { id: custB2B, agencyId, nameAr: 'شركة تجريبية — اعتباري', phone: '0550000002',
      vatNumber: '310123456700003', isActive: true },
  ]).onConflictDoNothing();

  const supAir = 'demo-sup-airline';
  const supHotel = 'demo-sup-hotel';
  await db.insert(suppliers).values([
    { id: supAir,   agencyId, nameAr: 'الخطوط الجوية (تجريبي)', type: 'airline', balanceHalalas: SAR(8000), isActive: true },
    { id: supHotel, agencyId, nameAr: 'فندق مكة (تجريبي)',      type: 'hotel',   balanceHalalas: SAR(3300), isActive: true },
  ]).onConflictDoNothing();

  const toJL = (ls: { code: string; ar: string; en: string; dr: number; cr: number }[]) => ls as Line[];

  // ════════════════════════════════════════════════════════════════════════
  // (1) طيران (وكيل) — فاتورة مدفوعة بالكامل
  // ════════════════════════════════════════════════════════════════════════
  {
    const bId = 'demo-bk-flight';
    const line = makeLine({ agencyId, bookingId: bId, serviceType: 'flight',
      description: 'تذكرة الرياض ⇄ القاهرة', revenueModel: 'agent',
      priceExclVat: SAR(1600), vat: SAR(15), cost: SAR(1500),
      supplierId: supAir, supplierName: 'الخطوط الجوية (تجريبي)' });
    const { total } = await insertBooking({ agencyId, id: bId, serviceType: 'flight',
      customerId: custB2C, customerNameAr: 'عميل تجريبي — فردي', line });

    const invId = 'demo-inv-flight', jeId = 'demo-je-inv-flight';
    await db.insert(invoices).values({
      id: invId, agencyId, invoiceNumber: invNo(), type: '388', bookingId: bId, customerId: custB2C,
      buyerNameAr: 'عميل تجريبي — فردي', subtotalHalalas: SAR(1600), vatHalalas: SAR(15),
      totalHalalas: total, paidHalalas: total, issueDate: today, status: 'paid',
      isEInvoice: true, journalEntryId: jeId, createdBy: 'seed',
      items: [{ description: 'تذكرة الرياض ⇄ القاهرة', quantity: 1, unitPriceHalalas: SAR(1600), vatHalalas: SAR(15), totalHalalas: total }],
    }).onConflictDoNothing();
    await postJournal({ agencyId, id: jeId, date: today, descAr: `فاتورة ${invId} — حجز طيران`,
      source: 'invoice', sourceId: invId, serviceType: 'flight',
      lines: toJL(buildJournalLinesFromBookingLines([line], true, false)) });

    // دفعة كاملة
    const payId = 'demo-pay-flight', jePay = 'demo-je-pay-flight';
    await db.insert(payments).values({
      id: payId, agencyId, invoiceId: invId, bookingId: bId, customerId: custB2C,
      customerName: 'عميل تجريبي — فردي', amountHalalas: total, method: 'bank_transfer',
      voucherNumber: rctNo(), date: today, journalEntryId: jePay, createdBy: 'seed',
    }).onConflictDoNothing();
    await postJournal({ agencyId, id: jePay, date: today, descAr: `استلام دفعة — ${invId}`,
      source: 'payment', sourceId: payId, lines: toJL(buildCustomerReceiptLines(total, 'bank_transfer')) });
  }

  // ════════════════════════════════════════════════════════════════════════
  // (2) باقة (أصيل) — فاتورة مدفوعة جزئياً (دفعتان: مقدّمة ثم باقٍ)
  // ════════════════════════════════════════════════════════════════════════
  {
    const bId = 'demo-bk-package';
    const line = makeLine({ agencyId, bookingId: bId, serviceType: 'package',
      description: 'باقة سياحية — إسطنبول 5 ليالٍ', revenueModel: 'principal',
      priceExclVat: SAR(10000), vat: SAR(1500), cost: SAR(6000),
      supplierId: supHotel, supplierName: 'فندق مكة (تجريبي)' });
    const { total } = await insertBooking({ agencyId, id: bId, serviceType: 'package',
      customerId: custB2B, customerNameAr: 'شركة تجريبية — اعتباري', line });

    const invId = 'demo-inv-package', jeId = 'demo-je-inv-package';
    const firstPay = SAR(5000), secondPay = total - firstPay;
    await db.insert(invoices).values({
      id: invId, agencyId, invoiceNumber: invNo(), type: '388', bookingId: bId, customerId: custB2B,
      buyerNameAr: 'شركة تجريبية — اعتباري', buyerVatNumber: '310123456700003',
      subtotalHalalas: SAR(10000), vatHalalas: SAR(1500), totalHalalas: total,
      paidHalalas: total, issueDate: today, status: 'paid', isEInvoice: true,
      journalEntryId: jeId, createdBy: 'seed',
      items: [{ description: 'باقة سياحية — إسطنبول', quantity: 1, unitPriceHalalas: SAR(10000), vatHalalas: SAR(1500), totalHalalas: total }],
    }).onConflictDoNothing();
    await postJournal({ agencyId, id: jeId, date: today, descAr: `فاتورة ${invId} — باقة`,
      source: 'invoice', sourceId: invId, serviceType: 'package',
      lines: toJL(buildJournalLinesFromBookingLines([line], true, false)) });

    // قسط 1 (مقدّمة)
    await db.insert(payments).values({
      id: 'demo-pay-pkg-1', agencyId, invoiceId: invId, bookingId: bId, customerId: custB2B,
      customerName: 'شركة تجريبية — اعتباري', amountHalalas: firstPay, method: 'cash',
      voucherNumber: rctNo(), date: addDays(-20), journalEntryId: 'demo-je-pkg-pay1', createdBy: 'seed',
    }).onConflictDoNothing();
    await postJournal({ agencyId, id: 'demo-je-pkg-pay1', date: addDays(-20), descAr: `دفعة مقدّمة — ${invId}`,
      source: 'payment', sourceId: 'demo-pay-pkg-1', lines: toJL(buildCustomerReceiptLines(firstPay, 'cash')) });

    // قسط 2 (الباقي عند الموعد)
    await db.insert(payments).values({
      id: 'demo-pay-pkg-2', agencyId, invoiceId: invId, bookingId: bId, customerId: custB2B,
      customerName: 'شركة تجريبية — اعتباري', amountHalalas: secondPay, method: 'bank_transfer',
      voucherNumber: rctNo(), date: today, journalEntryId: 'demo-je-pkg-pay2', createdBy: 'seed',
    }).onConflictDoNothing();
    await postJournal({ agencyId, id: 'demo-je-pkg-pay2', date: today, descAr: `سداد الباقي — ${invId}`,
      source: 'payment', sourceId: 'demo-pay-pkg-2', lines: toJL(buildCustomerReceiptLines(secondPay, 'bank_transfer')) });
  }

  // ════════════════════════════════════════════════════════════════════════
  // (3) عمرة (أصيل، معفاة) — إيراد مؤجل (الرحلة بعد شهر)
  // ════════════════════════════════════════════════════════════════════════
  {
    const bId = 'demo-bk-umrah';
    const line = makeLine({ agencyId, bookingId: bId, serviceType: 'umrah',
      description: 'برنامج عمرة — 4 ليالٍ', revenueModel: 'principal',
      priceExclVat: SAR(5000), vat: 0, cost: SAR(3300), vatCategory: 'E',
      supplierId: supHotel, supplierName: 'فندق مكة (تجريبي)' });
    const { total } = await insertBooking({ agencyId, id: bId, serviceType: 'umrah',
      customerId: custB2C, customerNameAr: 'عميل تجريبي — فردي', line, details: { travelDate: addDays(30) } });

    const invId = 'demo-inv-umrah', jeId = 'demo-je-inv-umrah';
    await db.insert(invoices).values({
      id: invId, agencyId, invoiceNumber: invNo(), type: '388', bookingId: bId, customerId: custB2C,
      buyerNameAr: 'عميل تجريبي — فردي', subtotalHalalas: SAR(5000), vatHalalas: 0, totalHalalas: total,
      paidHalalas: total, issueDate: today, status: 'paid', isEInvoice: true,
      deferredUntil: addDays(30), journalEntryId: jeId, createdBy: 'seed',
      items: [{ description: 'برنامج عمرة', quantity: 1, unitPriceHalalas: SAR(5000), vatHalalas: 0, totalHalalas: total }],
    }).onConflictDoNothing();
    // deferRevenue=true → الإيراد يُقيَّد في 3201 (إيراد مؤجل) لا 4100
    await postJournal({ agencyId, id: jeId, date: today, descAr: `فاتورة ${invId} — عمرة (إيراد مؤجل)`,
      source: 'invoice', sourceId: invId, serviceType: 'umrah',
      lines: toJL(buildJournalLinesFromBookingLines([line], true, true)) });

    // دفعة كاملة
    await db.insert(payments).values({
      id: 'demo-pay-umrah', agencyId, invoiceId: invId, bookingId: bId, customerId: custB2C,
      customerName: 'عميل تجريبي — فردي', amountHalalas: total, method: 'cash',
      voucherNumber: rctNo(), date: today, journalEntryId: 'demo-je-umrah-pay', createdBy: 'seed',
    }).onConflictDoNothing();
    await postJournal({ agencyId, id: 'demo-je-umrah-pay', date: today, descAr: `استلام دفعة عمرة — ${invId}`,
      source: 'payment', sourceId: 'demo-pay-umrah', lines: toJL(buildCustomerReceiptLines(total, 'cash')) });
  }

  // ════════════════════════════════════════════════════════════════════════
  // (4) حجز مؤكَّد بلا فاتورة بعد (خط أنابيب — لا قيد محاسبي)
  // ════════════════════════════════════════════════════════════════════════
  {
    const bId = 'demo-bk-pipeline';
    const line = makeLine({ agencyId, bookingId: bId, serviceType: 'flight',
      description: 'تذكرة جدة ⇄ دبي (لم تُفوتر بعد)', revenueModel: 'agent',
      priceExclVat: SAR(900), vat: SAR(15), cost: SAR(800),
      supplierId: supAir, supplierName: 'الخطوط الجوية (تجريبي)' });
    await insertBooking({ agencyId, id: bId, serviceType: 'flight', status: 'confirmed',
      customerId: custB2C, customerNameAr: 'عميل تجريبي — فردي', line, details: { travelDate: addDays(25) } });
    // لا فاتورة ولا قيد — يظهر في خط الأنابيب فقط (سلوك صحيح وفق IFRS 15)
  }

  // ════════════════════════════════════════════════════════════════════════
  // (5) استرداد جزئي على فاتورة الطيران (مذكرة دائنة + قيد عكسي)
  // ════════════════════════════════════════════════════════════════════════
  {
    const origInvId = 'demo-inv-flight';
    const origLines = await db.select({
      accountCode: journalLines.accountCode, accountNameAr: journalLines.accountNameAr,
      accountNameEn: journalLines.accountNameEn, debitHalalas: journalLines.debitHalalas,
      creditHalalas: journalLines.creditHalalas,
    }).from(journalLines).where(eq(journalLines.entryId, 'demo-je-inv-flight'));

    const refundCash = SAR(1200), cancelFee = SAR(300), cancelFeeVat = SAR(45);
    const cnId = 'demo-cn-flight', jeId = 'demo-je-refund-flight';
    const refundLines = buildRefundJournalLines({
      originalLines: origLines.map(l => ({
        accountCode: l.accountCode, accountNameAr: l.accountNameAr, accountNameEn: l.accountNameEn,
        debitHalalas: Number(l.debitHalalas), creditHalalas: Number(l.creditHalalas),
      })),
      originalTotalHalalas: SAR(1615), originalVatHalalas: SAR(15), paidHalalas: SAR(1615),
      refundAmountHalalas: refundCash, cancellationFeeHalalas: cancelFee + cancelFeeVat, isEInvoice: true,
    });

    await db.insert(invoices).values({
      id: cnId, agencyId, invoiceNumber: invNo(), type: '381', bookingId: 'demo-bk-flight',
      customerId: custB2C, buyerNameAr: 'عميل تجريبي — فردي', subtotalHalalas: SAR(1200) - Math.round(SAR(1200) * 15 / 1615),
      vatHalalas: Math.round(SAR(1200) * 15 / 1615), totalHalalas: refundCash, paidHalalas: refundCash,
      issueDate: today, status: 'issued', isEInvoice: true, originalInvoiceId: origInvId,
      journalEntryId: jeId, createdBy: 'seed', notes: 'استرداد جزئي تجريبي',
    }).onConflictDoNothing();
    await postJournal({ agencyId, id: jeId, date: today, descAr: `مذكرة دائنة ${cnId} — استرداد جزئي`,
      source: 'receipt', sourceId: cnId,
      lines: refundLines.map(l => ({ code: l.code, ar: l.ar, en: l.en, dr: l.dr, cr: l.cr })) });
  }

  // ════════════════════════════════════════════════════════════════════════
  // (6) دفعة مورد بالريال (تسوية مستحق الخطوط)
  // ════════════════════════════════════════════════════════════════════════
  {
    const spId = 'demo-sp-airline', jeId = 'demo-je-sp-airline';
    const built = buildSupplierPaymentJournalLines({
      expenseAccount: { code: '2000', ar: 'ذمم دائنة - موردون', en: 'Accounts Payable' },
      paymentAccount: { code: '1110', ar: 'البنك', en: 'Bank' },
      resolvedAmountHalalas: SAR(5000), vatAmountHalalas: 0, expenseDebitHalalas: SAR(5000),
    });
    await db.insert(supplierPayments).values({
      id: spId, agencyId, supplierId: supAir, supplierName: 'الخطوط الجوية (تجريبي)',
      payeeName: 'الخطوط الجوية (تجريبي)', amountHalalas: SAR(5000), method: 'bank_transfer',
      voucherNumber: pvNo(), expenseCategory: 'supplier', date: today, status: 'completed',
      journalEntryId: jeId, createdBy: 'seed',
    }).onConflictDoNothing();
    await postJournal({ agencyId, id: jeId, date: today, descAr: `سند صرف — تسوية الخطوط الجوية`,
      source: 'payment', sourceId: spId, lines: toJL(built) });
  }

  // ════════════════════════════════════════════════════════════════════════
  // (7) دفعة مورد بعملة أجنبية — يوضّح معالجة IAS 21 (فرق صرف منفصل)
  // ════════════════════════════════════════════════════════════════════════
  {
    const spId = 'demo-sp-hotel-fx', jeId = 'demo-je-sp-hotel-fx';
    const bookedSAR = SAR(3300), paidSAR = SAR(3360); // فرق صرف 60 ر.س (خسارة)
    const built = buildSupplierPaymentJournalLines({
      expenseAccount: { code: '2000', ar: 'ذمم دائنة - موردون', en: 'Accounts Payable' },
      paymentAccount: { code: '1110', ar: 'البنك', en: 'Bank' },
      resolvedAmountHalalas: paidSAR, vatAmountHalalas: 0, expenseDebitHalalas: bookedSAR,
    });
    await db.insert(supplierPayments).values({
      id: spId, agencyId, supplierId: supHotel, supplierName: 'فندق مكة (تجريبي)',
      payeeName: 'فندق مكة (تجريبي)', amountHalalas: paidSAR, method: 'bank_transfer',
      voucherNumber: pvNo(), expenseCategory: 'supplier', reference: 'USD @ 3.78', date: today,
      status: 'completed', journalEntryId: jeId, createdBy: 'seed',
    }).onConflictDoNothing();
    await postJournal({ agencyId, id: jeId, date: today, descAr: `سند صرف (USD) — فندق مكة (فرق صرف)`,
      source: 'payment', sourceId: spId, lines: toJL(built) });
    // ملاحظة: دفتر المورد ينقص بـ bookedSAR (3300) — لا paidSAR — والفرق (60) في 5900 خسائر صرف
  }

  console.log('\n✅ تمت زراعة البيانات التجريبية بنجاح. سجّل الدخول لتراها:');
  console.log('   • حجوزات: طيران (مدفوع) · باقة (مدفوعة على قسطين) · عمرة (إيراد مؤجل) · حجز غير مفوتر');
  console.log('   • فواتير + قيود متوازنة · استرداد جزئي (مذكرة دائنة) · دفعتا مورد (ريال + عملة أجنبية)');
  console.log('   • قارن: ميزان المراجعة، قائمة الدخل، الذمم المدينة/الدائنة، الإيراد المؤجل، الداش بورد.\n');
}

main().catch((err) => {
  console.error('\n✗ فشلت الزراعة:', err instanceof Error ? err.message : err);
  process.exit(1);
});
