'use server';

/**
 * Payment Server Actions — PostgreSQL Implementation
 * processPayment + processRefund مع ACID transactions كاملة
 */

import { eq, and } from 'drizzle-orm';
import {
  bookings,
  invoices,
  payments,
  journalEntries,
  journalLines,
  agencyAccountingConfigs,
} from '@masarat/database/schema';
import {
  generateJournalEntry,
  calculateVat,
  type AgencyAccountingConfig,
  type RefundInput,
} from '@masarat/accounting';
import { withTransaction } from '@/lib/db/client';
import { withIdempotency } from '@/lib/idempotency';
import { verifyToken, assertRole, assertPermission, type AuthContext } from '@/lib/auth';

// ─── Types ────────────────────────────────────────────────────────────────────

export type PaymentMethod =
  | 'cash' | 'bank_transfer' | 'credit_card' | 'mada'
  | 'apple_pay' | 'stc_pay' | 'tamara' | 'tabby' | 'cheque';

export interface ProcessPaymentInput {
  idempotencyKey: string;
  bookingId: string;
  invoiceId: string;
  amountHalalas: number;
  method: PaymentMethod;
  methodDetails?: Record<string, string>;
  receivingAccountCode: string;
}

export interface ProcessPaymentResult {
  paymentId: string;
  receiptNumber: string;
  amountPaidSar: number;
  remainingDueSar: number;
  isFullyPaid: boolean;
}

export interface ProcessRefundInput {
  idempotencyKey: string;
  bookingId: string;
  originalInvoiceId: string;
  refundAmountHalalas: number;
  cancellationFeeHalalas: number;
  reason: string;
  refundAccountCode: string;
  supplierReceivableAccountCode: string;
}

export interface ProcessRefundResult {
  refundPaymentId: string;
  creditNoteId: string;
  creditNoteNumber: string;
  journalEntryId: string;
  refundedAmountSar: number;
  cancellationFeeSar: number;
}

// ─── processPayment Action ────────────────────────────────────────────────────

export async function processPaymentAction(
  idToken: string,
  input: ProcessPaymentInput
): Promise<{ success: true; data: ProcessPaymentResult } | { success: false; error: string }> {
  let auth: AuthContext;
  try {
    auth = await verifyToken(idToken);
    assertRole(auth, ['admin', 'accountant', 'agent']);
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unauthorized' };
  }

  try {
    const result = await withIdempotency(
      input.idempotencyKey,
      auth.agencyId,
      'process_payment',
      () => executeProcessPayment(auth, input)
    );
    return { success: true, data: result };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to process payment',
    };
  }
}

async function executeProcessPayment(
  auth: AuthContext,
  input: ProcessPaymentInput
): Promise<ProcessPaymentResult> {
  const { agencyId, uid: userId } = auth;
  const { bookingId, invoiceId, amountHalalas, method, methodDetails, receivingAccountCode } = input;

  if (!Number.isInteger(amountHalalas) || amountHalalas <= 0) {
    throw new Error(`مبلغ الدفعة غير صالح: ${amountHalalas}`);
  }

  return withTransaction(agencyId, async (tx) => {
    // قراءة الفاتورة والحجز
    const [invoice] = await tx
      .select()
      .from(invoices)
      .where(and(eq(invoices.id, invoiceId), eq(invoices.agencyId, agencyId)))
      .limit(1);

    if (!invoice) throw new Error(`الفاتورة ${invoiceId} غير موجودة`);
    if (invoice.bookingId !== bookingId) {
      throw new Error(`الفاتورة لا تنتمي للحجز المحدد`);
    }

    const currentDue = Number(invoice.amountDueHalalas);
    if (amountHalalas > currentDue) {
      throw new Error(
        `المبلغ (${amountHalalas / 100} ر.س) يتجاوز المستحق (${currentDue / 100} ر.س)`
      );
    }

    // توليد رقم الإيصال
    const [receiptResult] = await tx.execute(
      `SELECT get_next_invoice_number($1::uuid, 'tax_invoice'::invoice_type, $2::integer) AS receipt_number`,
      [agencyId, new Date().getFullYear()]
    ) as unknown as [{ receipt_number: string }];

    // نستخدم prefix مختلف — نحوله لـ RCT
    const receiptNumber = receiptResult.receipt_number.replace('INV-', 'RCT-');

    const now = new Date();
    const newAmountPaid = Number(invoice.amountPaidHalalas) + amountHalalas;
    const newAmountDue = currentDue - amountHalalas;
    const newPaymentStatus = newAmountDue === 0 ? 'fully_paid' as const
      : newAmountDue < Number(invoice.grandTotalHalalas) ? 'partial' as const
      : 'unpaid' as const;

    const paymentId = crypto.randomUUID();
    const journalEntryId = crypto.randomUUID();

    // سجل الدفعة
    await tx.insert(payments).values({
      id: paymentId,
      agencyId,
      bookingId,
      invoiceId,
      receiptNumber,
      amountHalalas: BigInt(amountHalalas),
      currency: 'SAR',
      method,
      methodDetails: methodDetails ?? null,
      receivingAccountCode,
      journalEntryId,
      receivedBy: userId,
      isRefund: false,
    });

    // قيد الدفعة: DR Cash/Bank → CR AR Customers
    await tx.insert(journalEntries).values({
      id: journalEntryId,
      agencyId,
      type: 'payment_received',
      description: `استلام دفعة — ${invoice.invoiceNumber} — ${receiptNumber}`,
      entryDate: now.toISOString().split('T')[0] as unknown as Date,
      period: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
      totalDebitHalalas: BigInt(amountHalalas),
      totalCreditHalalas: BigInt(amountHalalas),
      isBalanced: true,
      status: 'posted',
      isAutoGenerated: true,
      bookingId,
      invoiceId,
      postedAt: now,
      createdBy: userId,
    });

    await tx.insert(journalLines).values([
      {
        journalEntryId,
        agencyId,
        lineNumber: 1,
        accountCode: receivingAccountCode,
        accountNameAr: 'النقد / البنك',
        accountNameEn: 'Cash / Bank',
        debitHalalas: BigInt(amountHalalas),
        creditHalalas: 0n,
        description: `استلام دفعة — ${receiptNumber}`,
      },
      {
        journalEntryId,
        agencyId,
        lineNumber: 2,
        accountCode: '1120',
        accountNameAr: 'ذمم مدينة - عملاء',
        accountNameEn: 'Accounts Receivable - Customers',
        debitHalalas: 0n,
        creditHalalas: BigInt(amountHalalas),
        description: `تسديد فاتورة ${invoice.invoiceNumber}`,
      },
    ]);

    // تحديث الفاتورة
    await tx
      .update(invoices)
      .set({
        amountPaidHalalas: BigInt(newAmountPaid),
        amountDueHalalas: BigInt(newAmountDue),
        paymentStatus: newPaymentStatus,
      })
      .where(and(eq(invoices.id, invoiceId), eq(invoices.agencyId, agencyId)));

    // تحديث الحجز
    await tx
      .update(bookings)
      .set({
        totalPaidHalalas: BigInt(newAmountPaid),
        totalDueHalalas: BigInt(newAmountDue),
        paymentStatus: newPaymentStatus,
        updatedAt: now,
      })
      .where(and(eq(bookings.id, bookingId), eq(bookings.agencyId, agencyId)));

    return {
      paymentId,
      receiptNumber,
      amountPaidSar: newAmountPaid / 100,
      remainingDueSar: newAmountDue / 100,
      isFullyPaid: newPaymentStatus === 'fully_paid',
    };
  });
}

// ─── processRefund Action ─────────────────────────────────────────────────────

export async function processRefundAction(
  idToken: string,
  input: ProcessRefundInput
): Promise<{ success: true; data: ProcessRefundResult } | { success: false; error: string }> {
  let auth: AuthContext;
  try {
    auth = await verifyToken(idToken);
    // الاسترداد يتطلب صلاحية خاصة
    assertRole(auth, ['admin', 'accountant']);
    assertPermission(auth, 'perm_payment_refund');
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unauthorized' };
  }

  try {
    const result = await withIdempotency(
      input.idempotencyKey,
      auth.agencyId,
      'process_refund',
      () => executeProcessRefund(auth, input)
    );
    return { success: true, data: result };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to process refund',
    };
  }
}

async function executeProcessRefund(
  auth: AuthContext,
  input: ProcessRefundInput
): Promise<ProcessRefundResult> {
  const { agencyId, uid: userId } = auth;
  const {
    bookingId, originalInvoiceId,
    refundAmountHalalas, cancellationFeeHalalas,
    reason, refundAccountCode, supplierReceivableAccountCode,
  } = input;

  if (!Number.isInteger(refundAmountHalalas) || refundAmountHalalas < 0) {
    throw new Error(`مبلغ الاسترداد غير صالح: ${refundAmountHalalas}`);
  }

  return withTransaction(agencyId, async (tx) => {
    // قراءة البيانات المطلوبة
    const [originalInvoice, booking, accountingConfig] = await Promise.all([
      tx.select().from(invoices)
        .where(and(eq(invoices.id, originalInvoiceId), eq(invoices.agencyId, agencyId)))
        .limit(1).then(r => r[0]),
      tx.select().from(bookings)
        .where(and(eq(bookings.id, bookingId), eq(bookings.agencyId, agencyId)))
        .limit(1).then(r => r[0]),
      tx.select().from(agencyAccountingConfigs)
        .where(eq(agencyAccountingConfigs.agencyId, agencyId))
        .limit(1).then(r => r[0]),
    ]);

    if (!originalInvoice) throw new Error(`الفاتورة ${originalInvoiceId} غير موجودة`);
    if (!booking) throw new Error(`الحجز ${bookingId} غير موجود`);
    if (!accountingConfig?.accountMapping) throw new Error('إعدادات المحاسبة غير مكتملة');

    // التحققات
    if (originalInvoice.status === 'cancelled') {
      throw new Error('الفاتورة ملغاة بالفعل');
    }
    const amountPaid = Number(originalInvoice.amountPaidHalalas);
    if (refundAmountHalalas + cancellationFeeHalalas > amountPaid) {
      throw new Error(
        `مجموع الاسترداد يتجاوز المبلغ المدفوع (${amountPaid / 100} ر.س)`
      );
    }

    // توليد قيد الاسترداد
    const vatRate = (accountingConfig.vatRateBps ?? 1500) / 10000;
    const cancellationFeeVat = calculateVat(cancellationFeeHalalas, vatRate);

    const refundInput: RefundInput = {
      phase: 'refund_issued',
      refundAmountToCustomer: refundAmountHalalas,
      cancellationFee: cancellationFeeHalalas,
      cancellationFeeVat,
      supplierRefundReceivableAccount: supplierReceivableAccountCode,
      refundPaymentAccountCode: refundAccountCode,
      bookingRef: bookingId,
      customerName: booking.customerNameAr,
    };

    const accountingCfg: AgencyAccountingConfig = {
      agencyId,
      accounts: accountingConfig.accountMapping!,
      vatRate,
      defaultRevenueModel: {},
    };

    const journalEntry = generateJournalEntry(refundInput, accountingCfg);

    // رقم إشعار دائن تسلسلي
    const [creditNoteResult] = await tx.execute(
      `SELECT get_next_invoice_number($1::uuid, 'credit_note'::invoice_type, $2::integer) AS cn_number`,
      [agencyId, new Date().getFullYear()]
    ) as unknown as [{ cn_number: string }];

    const creditNoteNumber = creditNoteResult.cn_number;
    const now = new Date();
    const creditNoteId = crypto.randomUUID();
    const journalEntryId = crypto.randomUUID();
    const refundPaymentId = crypto.randomUUID();

    // إنشاء الإشعار الدائن
    await tx.insert(invoices).values({
      id: creditNoteId,
      agencyId,
      type: 'credit_note',
      status: 'issued',
      invoiceNumber: creditNoteNumber,
      zatcaUuid: crypto.randomUUID() as unknown as undefined,
      bookingId,
      originalInvoiceId,
      journalEntryId,
      sellerNameAr: originalInvoice.sellerNameAr,
      sellerVatNumber: originalInvoice.sellerVatNumber,
      buyerId: originalInvoice.buyerId ?? null,
      buyerName: originalInvoice.buyerName,
      subtotalExclVatHalalas: BigInt(refundAmountHalalas),
      totalVatHalalas: BigInt(cancellationFeeVat),
      grandTotalHalalas: BigInt(refundAmountHalalas),
      currency: 'SAR',
      paymentStatus: 'refunded',
      amountPaidHalalas: BigInt(refundAmountHalalas),
      amountDueHalalas: 0n,
      zatcaInvoiceTypeCode: '381',
      zatcaTransactionType: 'B2C',
      zatcaSubmissionStatus: 'not_submitted',
      issueDate: now.toISOString().split('T')[0] as unknown as Date,
      createdBy: userId,
    });

    // القيد المحاسبي
    await tx.insert(journalEntries).values({
      id: journalEntryId,
      agencyId,
      type: 'refund_payment',
      description: journalEntry.description,
      entryDate: now.toISOString().split('T')[0] as unknown as Date,
      period: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`,
      totalDebitHalalas: BigInt(journalEntry.totalDebit),
      totalCreditHalalas: BigInt(journalEntry.totalCredit),
      isBalanced: true,
      status: 'posted',
      isAutoGenerated: true,
      bookingId,
      invoiceId: creditNoteId,
      postedAt: now,
      createdBy: userId,
    });

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
      }))
    );

    // سجل الاسترداد
    await tx.insert(payments).values({
      id: refundPaymentId,
      agencyId,
      bookingId,
      invoiceId: creditNoteId,
      receiptNumber: creditNoteNumber,
      amountHalalas: BigInt(-refundAmountHalalas),
      currency: 'SAR',
      method: 'bank_transfer',
      receivingAccountCode: refundAccountCode,
      journalEntryId,
      receivedBy: userId,
      isRefund: true,
      refundOfPaymentId: null,
    });

    // تحديث الحجز والفاتورة
    await Promise.all([
      tx.update(bookings)
        .set({
          status: 'cancelled',
          paymentStatus: 'refunded',
          cancellationReason: reason,
          cancelledAt: now,
          cancelledBy: userId,
          updatedAt: now,
        })
        .where(and(eq(bookings.id, bookingId), eq(bookings.agencyId, agencyId))),

      tx.update(invoices)
        .set({ status: 'credited' })
        .where(and(eq(invoices.id, originalInvoiceId), eq(invoices.agencyId, agencyId))),
    ]);

    return {
      refundPaymentId,
      creditNoteId,
      creditNoteNumber,
      journalEntryId,
      refundedAmountSar: refundAmountHalalas / 100,
      cancellationFeeSar: cancellationFeeHalalas / 100,
    };
  });
}
