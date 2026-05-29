'use server';

/**
 * Invoice Server Actions — PostgreSQL Implementation
 *
 * يُحوِّل Cloud Function createInvoice إلى Next.js Server Action
 * مع ACID transactions كاملة عبر PostgreSQL
 *
 * العملية الذرية:
 * 1. قراءة الحجز وإعدادات المحاسبة
 * 2. توليد رقم فاتورة تسلسلي (FOR UPDATE lock آمن)
 * 3. توليد القيد المحاسبي (accounting engine)
 * 4. كتابة: فاتورة + قيد + تحديث حجز (transaction واحد)
 * 5. إضافة للـ ZATCA queue (خارج الـ transaction)
 */

import { eq, and, sql } from 'drizzle-orm';
import {
  bookings,
  invoices,
  invoiceLines,
  journalEntries,
  journalLines,
  agencyAccountingConfigs,
  agencyZatcaConfigs,
  zatcaSubmissionQueue,
} from '@masarat/database/schema';
import {
  generateJournalEntry,
  calculateVat,
  type AgencyAccountingConfig,
  type AgentPaymentReceivedInput,
  type PrincipalPaymentReceivedInput,
} from '@masarat/accounting';
import { withTransaction } from '@/lib/db/client';
import { withIdempotency } from '@/lib/idempotency';
import { verifyToken, assertRole, type AuthContext } from '@/lib/auth';
import { writeAuditLog } from '@/lib/audit';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CreateInvoiceInput {
  idempotencyKey: string;
  bookingId: string;
  receivingAccountCode: string;
}

export interface CreateInvoiceResult {
  invoiceId: string;
  invoiceNumber: string;
  journalEntryId: string;
  grandTotalSar: number;
  vatAmountSar: number;
}

// ─── Main Action ──────────────────────────────────────────────────────────────

export async function createInvoiceAction(
  idToken: string,
  input: CreateInvoiceInput
): Promise<{ success: true; data: CreateInvoiceResult } | { success: false; error: string }> {
  // 1. التحقق من الهوية والصلاحيات
  let auth: AuthContext;
  try {
    auth = await verifyToken(idToken);
    assertRole(auth, ['admin', 'accountant']);
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unauthorized' };
  }

  // 2. Idempotency check
  try {
    const result = await withIdempotency(
      input.idempotencyKey,
      auth.agencyId,
      'create_invoice',
      () => executeCreateInvoice(auth, input)
    );
    return { success: true, data: result };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to create invoice',
    };
  }
}

// ─── Core Logic ───────────────────────────────────────────────────────────────

async function executeCreateInvoice(
  auth: AuthContext,
  input: CreateInvoiceInput
): Promise<CreateInvoiceResult> {
  const { agencyId, uid: userId } = auth;
  const { bookingId, receivingAccountCode } = input;

  return withTransaction(agencyId, async (tx) => {
    // ── Step 1: قراءة البيانات ──────────────────────────────────────────────

    const [booking] = await tx
      .select()
      .from(bookings)
      .where(and(eq(bookings.id, bookingId), eq(bookings.agencyId, agencyId)))
      .limit(1);

    if (!booking) throw new Error(`الحجز ${bookingId} غير موجود`);

    const [accountingConfig] = await tx
      .select()
      .from(agencyAccountingConfigs)
      .where(eq(agencyAccountingConfigs.agencyId, agencyId))
      .limit(1);

    if (!accountingConfig?.accountMapping) {
      throw new Error('إعدادات المحاسبة غير مكتملة. يرجى إعداد خريطة الحسابات أولاً.');
    }

    const [zatcaConfig] = await tx
      .select()
      .from(agencyZatcaConfigs)
      .where(eq(agencyZatcaConfigs.agencyId, agencyId))
      .limit(1);

    // ── Step 2: التحققات ────────────────────────────────────────────────────

    if (booking.status !== 'confirmed') {
      throw new Error(
        `لا يمكن إصدار فاتورة للحجز بحالة: ${booking.status}. الحالة المطلوبة: confirmed`
      );
    }

    // التحقق من عدم وجود فاتورة سابقة
    const [existingInvoice] = await tx
      .select({ id: invoices.id })
      .from(invoices)
      .where(
        and(
          eq(invoices.bookingId, bookingId),
          eq(invoices.agencyId, agencyId),
          eq(invoices.type, 'tax_invoice')
        )
      )
      .limit(1);

    if (existingInvoice) {
      throw new Error(`الحجز ${bookingId} لديه فاتورة مسبقاً: ${existingInvoice.id}`);
    }

    // ── Step 3: رقم الفاتورة التسلسلي (Atomic) ─────────────────────────────
    // استخدام PostgreSQL function المُعرَّفة في migration 002
    const currentYear = new Date().getFullYear();
    const [counterResult] = await tx.execute(
      sql`SELECT get_next_invoice_number(${agencyId}::uuid, 'tax_invoice'::invoice_type, ${currentYear}::integer) AS invoice_number`
    ) as unknown as [{ invoice_number: string }];

    const invoiceNumber = counterResult.invoice_number;

    // ── Step 4: توليد القيد المحاسبي ────────────────────────────────────────

    const accountingCfg: AgencyAccountingConfig = {
      agencyId,
      accounts: accountingConfig.accountMapping!,
      vatRate: (accountingConfig.vatRateBps ?? 1500) / 10000,
      defaultRevenueModel: (accountingConfig.defaultRevenueModels ?? {}) as AgencyAccountingConfig['defaultRevenueModel'],
    };

    const transactionInput = buildTransactionInput(booking, receivingAccountCode);
    const journalEntry = generateJournalEntry(transactionInput, accountingCfg);

    // ── Step 5: إنشاء الفاتورة ──────────────────────────────────────────────

    const now = new Date();
    const invoiceId = crypto.randomUUID();
    const journalEntryId = crypto.randomUUID();
    const zatcaUuid = crypto.randomUUID();

    const subtotalExclVat = booking.totalAmountHalalas - booking.vatAmountHalalas;
    const grandTotal = booking.totalAmountHalalas;
    const vatAmount = booking.vatAmountHalalas;

    await tx.insert(invoices).values({
      id: invoiceId,
      agencyId,
      type: 'tax_invoice',
      status: 'issued',
      invoiceNumber,
      zatcaUuid,
      bookingId,
      journalEntryId,

      // بيانات البائع (من إعدادات ZATCA)
      sellerNameAr: zatcaConfig?.sellerNameAr ?? '',
      sellerNameEn: zatcaConfig?.sellerNameEn ?? null,
      sellerVatNumber: zatcaConfig?.vatNumber ?? '',
      sellerCrNumber: zatcaConfig?.crNumber ?? null,

      // بيانات المشتري
      buyerId: booking.customerId,
      buyerName: booking.customerNameAr,
      buyerPhone: booking.customerPhone ?? null,

      // المبالغ
      subtotalExclVatHalalas: subtotalExclVat,
      totalVatHalalas: vatAmount,
      grandTotalHalalas: grandTotal,
      currency: 'SAR',

      // حالة الدفع
      paymentStatus: 'unpaid',
      amountPaidHalalas: 0n,
      amountDueHalalas: grandTotal,

      // ZATCA
      zatcaInvoiceTypeCode: '388',
      zatcaTransactionType: 'B2C',
      zatcaSubmissionStatus: 'not_submitted',

      issueDate: now.toISOString().split('T')[0] ,
      createdBy: userId,
    });

    // بنود الفاتورة
    await tx.insert(invoiceLines).values({
      invoiceId,
      agencyId,
      lineId: '1',
      name: `خدمة ${booking.type} — ${booking.customerNameAr}`,
      quantity: 1,
      unitPriceExclVatHalalas: subtotalExclVat,
      totalPriceExclVatHalalas: subtotalExclVat,
      vatCategory: booking.vatCategory,
      vatRateBps: accountingConfig.vatRateBps ?? 1500,
      vatAmountHalalas: vatAmount,
    });

    // ── Step 6: إنشاء القيد المحاسبي ────────────────────────────────────────

    await tx.insert(journalEntries).values({
      id: journalEntryId,
      agencyId,
      type: journalEntry.type,
      description: journalEntry.description,
      entryDate: now.toISOString().split('T')[0] ,
      period: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
      totalDebitHalalas: BigInt(journalEntry.totalDebit),
      totalCreditHalalas: BigInt(journalEntry.totalCredit),
      isBalanced: true,
      status: 'posted',
      isAutoGenerated: true,
      bookingId,
      invoiceId,
      metadata: {
        revenueModel: journalEntry.metadata.revenueModel,
        bookingType: journalEntry.metadata.bookingType,
        hadRoundingCorrection: journalEntry.metadata.hadRoundingCorrection,
      },
      postedAt: now,
      createdBy: userId,
    });

    // سطور القيد
    await tx.insert(journalLines).values(
      journalEntry.lines.map((line) => ({
        journalEntryId,
        agencyId,
        lineNumber: line.lineNumber,
        accountCode: line.accountCode,
        accountNameAr: line.accountName.ar,
        accountNameEn: line.accountName.en,
        debitHalalas: BigInt(line.debit),
        creditHalalas: BigInt(line.credit),
        description: line.description,
        costCenter: line.costCenter ?? null,
      }))
    );

    // ── Step 7: تحديث الحجز ─────────────────────────────────────────────────

    await tx
      .update(bookings)
      .set({ updatedAt: now })
      .where(and(eq(bookings.id, bookingId), eq(bookings.agencyId, agencyId)));

    // ── Step 8: إضافة ZATCA Queue ────────────────────────────────────────────
    // يُنفَّذ داخل نفس الـ transaction — إذا فشل لا نعلم بذلك حتى يُعالج القائمة
    await tx.insert(zatcaSubmissionQueue).values({
      agencyId,
      invoiceId,
      status: 'pending',
      invoiceTypeCode: '388',
      transactionType: booking.customerNameAr ? 'B2C' : 'B2B',
      attemptCount: 0,
      maxAttempts: 5,
      nextRetryAt: now,
    });

    return {
      invoiceId,
      invoiceNumber,
      journalEntryId,
      grandTotalSar: Number(grandTotal) / 100,
      vatAmountSar: Number(vatAmount) / 100,
    };
  });
}

// ─── Helper: بناء مدخل القيد من بيانات الحجز ─────────────────────────────────

function buildTransactionInput(
  booking: typeof bookings.$inferSelect,
  receivingAccountCode: string
): AgentPaymentReceivedInput | PrincipalPaymentReceivedInput {
  if (booking.revenueModel === 'agent') {
    return {
      phase: 'agent_payment_received',
      bookingType: booking.type,
      isInternational: false,
      costPrice: Number(booking.totalCostHalalas),
      serviceFee: Number(booking.serviceFeeHalalas),
      serviceFeeVatCategory: booking.vatCategory as 'S' | 'Z' | 'E' | 'O',
      serviceFeeVatAmount: calculateVat(Number(booking.serviceFeeHalalas), 0.15),
      receivingAccountCode,
      bookingRef: booking.id,
      customerName: booking.customerNameAr,
    };
  }

  return {
    phase: 'principal_payment_received',
    bookingType: booking.type as 'package' | 'umrah' | 'hajj',
    sellingPriceExclVat: Number(booking.totalAmountHalalas - booking.vatAmountHalalas),
    vatAmount: Number(booking.vatAmountHalalas),
    totalAmount: Number(booking.totalAmountHalalas),
    vatCategory: booking.vatCategory as 'S' | 'Z' | 'E' | 'O',
    receivingAccountCode,
    bookingRef: booking.id,
    customerName: booking.customerNameAr,
  };
}
