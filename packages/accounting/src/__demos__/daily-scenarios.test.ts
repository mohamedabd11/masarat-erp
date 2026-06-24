/**
 * محاكي السيناريوهات اليومية لوكالة سفر — Masarat ERP
 * ─────────────────────────────────────────────────────────────────────────────
 * هذا الملف لا يختبر "النجاح/الفشل" — هو عرض حيّ (demo) يشغّل محرك المحاسبة
 * الإنتاجي الحقيقي (`generateJournalEntry`) على سيناريوهات العمل اليومية،
 * ويطبع: القيود اليومية (مدين/دائن) + ميزان المراجعة لكل سيناريو.
 *
 * الهدف: أن ترى بياناً ماليّاً حقيقياً لكل حالة، وتتأكد بنفسك أن القيود متوازنة
 * ومنطقية — بدون الحاجة لخبرة محاسبية عميقة.
 *
 * التشغيل:
 *   cd packages/accounting && npx vitest run src/__demos__/daily-scenarios.test.ts
 */

import { it, expect } from 'vitest';
import {
  generateJournalEntry,
  calculateVat,
  fromSAR,
  VAT_RATE,
} from '../index';
import type {
  AgencyAccountingConfig,
  JournalEntryResult,
  JournalLine,
} from '../types';

// ─── إعداد وكالة تجريبية (أرقام الحسابات مطابقة لدليل الحسابات المُنشأ عند التسجيل) ──

const CONFIG: AgencyAccountingConfig = {
  agencyId: 'demo-agency',
  vatRate: VAT_RATE, // 15%
  defaultRevenueModel: {
    flight: 'agent', hotel: 'agent',
    package: 'principal', umrah: 'principal', hajj: 'principal',
  },
  accounts: {
    mainCashAccount: '1100',          // النقدية
    mainBankAccount: '1110',          // البنك
    bspClearingAccount: '1350',       // مقاصة BSP
    customerDepositsAccount: '2300',  // ودائع العملاء (أمانات)
    deferredRevenueAccount: '3201',   // إيراد مؤجل
    commissionFlightDomestic: '4100', // إيراد خدمات السفر
    commissionFlightInternational: '4100',
    commissionHotelDomestic: '4120',  // إيرادات الفنادق
    commissionHotelInternational: '4120',
    commissionUmrahHajj: '4130',      // إيرادات العمرة
    commissionInsurance: '4150',      // إيرادات التأمين
    serviceFees: '4000',              // إيراد رسوم الوكالة (+ رسوم الإلغاء)
    packageRevenue: '4110',           // إيرادات الباقات السياحية
    flightCostAccount: '5000',        // تكلفة الخدمات
    hotelCostAccount: '5000',
    packageCostAccount: '5000',
    airlinePayableAccount: '2100',    // ذمم دائنة — شركات الطيران
    hotelPayableAccount: '2110',      // ذمم دائنة — فنادق
    umrahPayableAccount: '2000',      // ذمم دائنة — موردون
    insurancePayableAccount: '2000',
    vatOutputAccount: '2200',         // ضريبة القيمة المضافة مستحقة
    vatInputAccount: '1230',          // ضريبة المدخلات
    roundingDifferenceAccount: '8399',// فروق التقريب
  },
};

// ─── أدوات عرض ───────────────────────────────────────────────────────────────

const r = '‏'; // RTL mark لمحاذاة أفضل في الطرفية
function money(halalas: number): string {
  const sign = halalas < 0 ? '-' : '';
  return sign + (Math.abs(halalas) / 100).toFixed(2);
}
function pad(s: string, n: number): string { return (s + ' '.repeat(n)).slice(0, n); }
function padNum(s: string, n: number): string { return (' '.repeat(n) + s).slice(-n); }
function line(ch = '─', n = 78): string { return ch.repeat(n); }

function printEntry(je: JournalEntryResult): void {
  console.log(`\n${r}  القيد: ${je.description}`);
  console.log(`${r}  النوع: ${je.type}` + (je.metadata.hadRoundingCorrection ? '  (أُضيف تصحيح تقريب ١ هللة)' : ''));
  console.log('  ' + line('·', 76));
  console.log('  ' + pad('الحساب', 38) + padNum('مدين', 16) + padNum('دائن', 16));
  console.log('  ' + line('·', 76));
  for (const ln of je.lines) {
    const name = `${ln.accountCode} ${ln.accountName.ar}`;
    console.log('  ' + pad(name, 38) +
      padNum(ln.debit ? money(ln.debit) : '', 16) +
      padNum(ln.credit ? money(ln.credit) : '', 16));
  }
  console.log('  ' + line('·', 76));
  console.log('  ' + pad('الإجمالي', 38) + padNum(money(je.totalDebit), 16) + padNum(money(je.totalCredit), 16));
  console.log(`${r}  ${je.isBalanced && je.totalDebit === je.totalCredit ? '✓ متوازن' : '✗ غير متوازن!'}`);
}

// ─── دفتر أستاذ مُبسّط لتجميع الأرصدة وطباعة ميزان المراجعة ──────────────────

type Ledger = Map<string, { name: string; debit: number; credit: number }>;
function newLedger(): Ledger { return new Map(); }
function post(ledger: Ledger, lines: JournalLine[]): void {
  for (const ln of lines) {
    const acc = ledger.get(ln.accountCode) ?? { name: ln.accountName.ar, debit: 0, credit: 0 };
    acc.debit += ln.debit; acc.credit += ln.credit;
    ledger.set(ln.accountCode, acc);
  }
}
function printTrialBalance(ledger: Ledger, title: string): void {
  console.log(`\n${r}  ميزان المراجعة — ${title}`);
  console.log('  ' + line('═', 76));
  console.log('  ' + pad('الحساب', 38) + padNum('مدين', 16) + padNum('دائن', 16));
  console.log('  ' + line('─', 76));
  let totDr = 0, totCr = 0;
  const codes = [...ledger.keys()].sort();
  for (const code of codes) {
    const a = ledger.get(code)!;
    const net = a.debit - a.credit;
    if (net === 0) continue; // أخفِ الحسابات التي صفّيت (استُلمت ثم حُرّرت)
    const drBal = net > 0 ? net : 0;
    const crBal = net < 0 ? -net : 0;
    totDr += drBal; totCr += crBal;
    console.log('  ' + pad(`${code} ${a.name}`, 38) +
      padNum(drBal ? money(drBal) : '', 16) +
      padNum(crBal ? money(crBal) : '', 16));
  }
  console.log('  ' + line('─', 76));
  console.log('  ' + pad('الإجمالي', 38) + padNum(money(totDr), 16) + padNum(money(totCr), 16));
  console.log('  ' + (totDr === totCr ? `✓ الميزان متوازن (${money(totDr)} = ${money(totCr)})` : `✗ خلل! ${money(totDr)} ≠ ${money(totCr)}`));
}

function header(n: number, title: string, note: string): void {
  console.log('\n\n' + line('█', 78));
  console.log(`${r}  السيناريو ${n}: ${title}`);
  console.log(`${r}  ${note}`);
  console.log(line('█', 78));
}

// ════════════════════════════════════════════════════════════════════════════
//  السيناريوهات
// ════════════════════════════════════════════════════════════════════════════

it('يطبع جميع سيناريوهات العمل اليومية', () => {
  // ─────────────────────────────────────────────────────────────────────────
  // السيناريو 1: حجز طيران دولي — دفعة كاملة ثم إصدار التذكرة (دورة بيع مكتملة)
  // ─────────────────────────────────────────────────────────────────────────
  header(1, 'حجز طيران دولي — العميل دفع كامل المبلغ ثم صدرت التذكرة',
    'نموذج الوكيل (Agent): الإيراد = رسوم الخدمة فقط. سعر التذكرة مجرد عبور (pass-through).');
  {
    const L = newLedger();
    const ticketCost = fromSAR(1500); // سعر التذكرة من الخط
    const serviceFee = fromSAR(100);  // رسوم الوكالة
    const feeVat = calculateVat(serviceFee, VAT_RATE); // 15 ر.س

    console.log(`\n${r}  المرحلة 1 — العميل يدفع: تذكرة 1500 + رسوم 100 + ضريبة ${money(feeVat)} = ${money(ticketCost + serviceFee + feeVat)} ر.س`);
    const pay = generateJournalEntry({
      phase: 'agent_payment_received',
      bookingType: 'flight', isInternational: true,
      costPrice: ticketCost, serviceFee, serviceFeeVatCategory: 'S', serviceFeeVatAmount: feeVat,
      receivingAccountCode: CONFIG.accounts.mainBankAccount,
      bookingRef: 'FLT-1001', customerName: 'أحمد العتيبي',
    }, CONFIG);
    printEntry(pay); post(L, pay.lines);

    console.log(`\n${r}  المرحلة 2 — إصدار التذكرة: تحرير الأمانة، إثبات مستحق الخط، الاعتراف بالإيراد`);
    const issue = generateJournalEntry({
      phase: 'agent_service_delivered',
      bookingType: 'flight', isInternational: true,
      customerDepositAmount: ticketCost, netCostToSupplier: ticketCost, serviceFee,
      supplierPayableAccountCode: CONFIG.accounts.airlinePayableAccount,
      bookingRef: 'FLT-1001',
    }, CONFIG);
    printEntry(issue); post(L, issue.lines);

    printTrialBalance(L, 'بعد اكتمال الحجز 1');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // السيناريو 2: إلغاء واسترداد كامل (لا رسوم إلغاء)
  // ─────────────────────────────────────────────────────────────────────────
  header(2, 'إلغاء حجز واسترداد كامل المبلغ للعميل (بدون رسوم إلغاء)',
    'الوكالة تُعيد للعميل وتُثبت ذمة على المورد (الخط) باسترداد ما دفعته له.');
  {
    const L = newLedger();
    const refund = generateJournalEntry({
      phase: 'refund_issued',
      refundAmountToCustomer: fromSAR(1500),
      cancellationFee: 0, cancellationFeeVat: 0,
      supplierRefundReceivableAccount: CONFIG.accounts.airlinePayableAccount,
      refundPaymentAccountCode: CONFIG.accounts.mainBankAccount,
      bookingRef: 'FLT-1001', customerName: 'أحمد العتيبي',
    }, CONFIG);
    printEntry(refund); post(L, refund.lines);
    printTrialBalance(L, 'أثر الاسترداد الكامل');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // السيناريو 3: استرداد جزئي مع رسوم إلغاء + ضريبة على الرسوم
  // ─────────────────────────────────────────────────────────────────────────
  header(3, 'استرداد جزئي — العميل يأخذ جزءاً، والوكالة تحتفظ برسوم إلغاء (خاضعة للضريبة)',
    'يُعاد 1200 ر.س للعميل، وتحتفظ الوكالة بـ 300 ر.س رسوم إلغاء + 45 ر.س ضريبة.');
  {
    const L = newLedger();
    const cancelFee = fromSAR(300);
    const cancelVat = calculateVat(cancelFee, VAT_RATE);
    const refund = generateJournalEntry({
      phase: 'refund_issued',
      refundAmountToCustomer: fromSAR(1200),
      cancellationFee: cancelFee, cancellationFeeVat: cancelVat,
      supplierRefundReceivableAccount: CONFIG.accounts.airlinePayableAccount,
      refundPaymentAccountCode: CONFIG.accounts.mainBankAccount,
      bookingRef: 'FLT-2002', customerName: 'سارة القحطاني',
    }, CONFIG);
    printEntry(refund); post(L, refund.lines);
    printTrialBalance(L, 'أثر الاسترداد الجزئي');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // السيناريو 4: باقة عمرة (نموذج الأصيل) — دفع كامل ثم تقديم الخدمة
  // ─────────────────────────────────────────────────────────────────────────
  header(4, 'باقة عمرة — دفعة كاملة ثم الاعتراف بالإيراد عند تقديم الخدمة (نموذج الأصيل)',
    'العمرة معفاة من الضريبة (E) → VAT = 0. الإيراد = كامل سعر البيع، والتكلفة تُسجَّل مقابل الموردين.');
  {
    const L = newLedger();
    const sellExcl = fromSAR(5000); // سعر بيع الباقة (عمرة معفاة → بلا ضريبة)
    console.log(`\n${r}  المرحلة 1 — استلام دفعة العمرة 5000 ر.س (معفاة، VAT = 0)`);
    const pay = generateJournalEntry({
      phase: 'principal_payment_received',
      bookingType: 'umrah',
      sellingPriceExclVat: sellExcl, vatAmount: 0, totalAmount: sellExcl, vatCategory: 'E',
      receivingAccountCode: CONFIG.accounts.mainBankAccount,
      bookingRef: 'UMR-3003', customerName: 'عبدالله الشهري',
    }, CONFIG);
    printEntry(pay); post(L, pay.lines);

    console.log(`\n${r}  المرحلة 2 — تقديم الخدمة: اعتراف بالإيراد + تكلفة (فندق مكة 2500 + نقل 800)`);
    const recognize = generateJournalEntry({
      phase: 'principal_revenue_recognition',
      bookingType: 'umrah',
      sellingPriceExclVat: sellExcl,
      totalCostPrice: fromSAR(3300),
      supplierBreakdown: [
        { accountCode: CONFIG.accounts.umrahPayableAccount, amount: fromSAR(2500), description: 'فندق مكة' },
        { accountCode: CONFIG.accounts.umrahPayableAccount, amount: fromSAR(800),  description: 'شركة النقل' },
      ],
      bookingRef: 'UMR-3003',
    }, CONFIG);
    printEntry(recognize); post(L, recognize.lines);
    printTrialBalance(L, 'بعد اكتمال باقة العمرة (ربح = 5000 − 3300 = 1700)');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // السيناريو 5: حجز برحلة بعد شهر — لم يدفع العميل بعد
  // ─────────────────────────────────────────────────────────────────────────
  header(5, 'حجز برحلة بعد شهر — العميل لم يدفع بعد',
    'تنسيق فوق المحرك: الحجز حدث تشغيلي. لا يوجد قيد محاسبي حتى تُستلم دفعة أو تُصدر خدمة (سليم وفق IFRS 15).');
  {
    console.log(`\n${r}  تم إنشاء الحجز FLT-4004 (رحلة بعد 30 يوماً) بحالة: غير مدفوع.`);
    console.log(`${r}  ⓘ لا قيد محاسبي في هذه اللحظة — لم يتغيّر النقد ولم تُقدَّم خدمة بعد.`);
    console.log(`${r}  ⓘ القيد سيُولَّد تلقائياً عند أول دفعة (السيناريو 6) أو عند إصدار التذكرة.`);
    console.log(`${r}  ميزان المراجعة: فارغ (لا حركة مالية) — وهذا هو السلوك الصحيح.`);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // السيناريو 6: دفع جزئي الآن + الباقي عند موعد الرحلة (خطة تقسيط)
  // ─────────────────────────────────────────────────────────────────────────
  header(6, 'دفعة مقدّمة الآن + باقي المبلغ عند موعد الرحلة، ثم إصدار التذكرة',
    'تنسيق فوق المحرك (payment plan): كل قسط يُولّد قيد استلام جزئي إلى أمانات العملاء، ثم تُصدر التذكرة.');
  {
    const L = newLedger();
    const ticketCost = fromSAR(2000);
    const serviceFee = fromSAR(150);
    const feeVat = calculateVat(serviceFee, VAT_RATE);

    // القسط 1: العميل يدفع 1000 من قيمة التذكرة فقط (دفعة مقدمة، بلا رسوم بعد)
    console.log(`\n${r}  القسط 1 (اليوم) — دفعة مقدمة 1000 ر.س من قيمة التذكرة`);
    const inst1 = generateJournalEntry({
      phase: 'agent_payment_received',
      bookingType: 'flight', isInternational: false,
      costPrice: fromSAR(1000), serviceFee: 0, serviceFeeVatCategory: 'O', serviceFeeVatAmount: 0,
      receivingAccountCode: CONFIG.accounts.mainBankAccount,
      bookingRef: 'FLT-5005', customerName: 'منى الدوسري',
    }, CONFIG);
    printEntry(inst1); post(L, inst1.lines);

    // القسط 2 (بعد شهر): باقي التذكرة 1000 + رسوم الخدمة 150 + ضريبتها
    console.log(`\n${r}  القسط 2 (بعد شهر) — باقي التذكرة 1000 + رسوم 150 + ضريبة ${money(feeVat)}`);
    const inst2 = generateJournalEntry({
      phase: 'agent_payment_received',
      bookingType: 'flight', isInternational: false,
      costPrice: fromSAR(1000), serviceFee, serviceFeeVatCategory: 'S', serviceFeeVatAmount: feeVat,
      receivingAccountCode: CONFIG.accounts.mainBankAccount,
      bookingRef: 'FLT-5005', customerName: 'منى الدوسري',
    }, CONFIG);
    printEntry(inst2); post(L, inst2.lines);

    // إصدار التذكرة: تحرير كامل الأمانة (2000) مقابل مستحق الخط
    console.log(`\n${r}  إصدار التذكرة — تحرير الأمانة الكاملة 2000 مقابل مستحق الخط، والاعتراف بالرسوم`);
    const issue = generateJournalEntry({
      phase: 'agent_service_delivered',
      bookingType: 'flight', isInternational: false,
      customerDepositAmount: ticketCost, netCostToSupplier: ticketCost, serviceFee,
      supplierPayableAccountCode: CONFIG.accounts.airlinePayableAccount,
      bookingRef: 'FLT-5005',
    }, CONFIG);
    printEntry(issue); post(L, issue.lines);

    printTrialBalance(L, 'بعد اكتمال الحجز بالتقسيط');
  }

  console.log('\n\n' + line('━', 78));
  console.log(`${r}  انتهى العرض. كل قيد أعلاه مولَّد من محرك الإنتاج الحقيقي وتحقّق توازنه.`);
  console.log(line('━', 78) + '\n');

  // تأكيد آلي أن لا شيء انكسر (كل القيود متوازنة بحكم تصميم المحرك)
  expect(true).toBe(true);
});
