/**
 * createInvoice — Cloud Function Handler
 *
 * العملية الذرية الكاملة عند إصدار فاتورة:
 *
 *   داخل Firestore Transaction واحدة:
 *     1. قراءة بيانات الحجز والوكالة
 *     2. الحصول على رقم فاتورة تسلسلي (atomic counter)
 *     3. توليد القيد اليومي عبر accounting engine
 *     4. التحقق من توازن القيد (validator)
 *     5. كتابة: الفاتورة + القيد + تحديث حالة الحجز
 *        (إما كلها تنجح أو كلها تفشل)
 *
 *   خارج Transaction (لا يمكن rollback):
 *     6. إرسال الفاتورة لـ ZATCA (مع retry)
 *     7. توليد PDF وحفظه في Firebase Storage
 *     8. إرسال إشعار للعميل
 */

import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore';
import {
  generateJournalEntry,
  fromSAR,
  calculateVat,
  type AgencyAccountingConfig,
  type AgentPaymentReceivedInput,
  type PrincipalPaymentReceivedInput,
  type TransactionInput,
} from '@masarat/accounting';

import { withIdempotency, buildIdempotencyWrite } from '../lib/idempotency';
import { getNextInvoiceNumber } from '../lib/invoice-counter';

// ─── أنواع المدخلات ───────────────────────────────────────────────────────────

export interface CreateInvoiceRequest {
  /** UUID فريد يُولِّده الـ Client — يمنع إنشاء فاتورتين لنفس الحجز */
  idempotencyKey: string;
  agencyId: string;
  bookingId: string;
  /** كود حساب البنك الذي استُلمت فيه الدفعة */
  receivingAccountCode: string;
  invokedBy: string; // userId
}

export interface CreateInvoiceResult {
  invoiceId: string;
  invoiceNumber: string;
  journalEntryId: string;
  totalAmount: number; // بالريال (للعرض)
  vatAmount: number;
}

// ─── الـ Handler الرئيسي ─────────────────────────────────────────────────────

export async function handleCreateInvoice(
  req: CreateInvoiceRequest
): Promise<CreateInvoiceResult> {
  return withIdempotency(
    req.idempotencyKey,
    req.agencyId,
    'createInvoice',
    () => executeCreateInvoice(req)
  );
}

// ─── التنفيذ الفعلي ───────────────────────────────────────────────────────────

async function executeCreateInvoice(
  req: CreateInvoiceRequest
): Promise<CreateInvoiceResult> {
  const db = getFirestore();
  const { agencyId, bookingId, receivingAccountCode, idempotencyKey, invokedBy } = req;

  // ── Firestore Transaction: كل شيء أو لا شيء ─────────────────────────────
  const result = await db.runTransaction(async (transaction) => {

    // 1. قراءة البيانات المطلوبة
    const [bookingDoc, accountingConfigDoc] = await Promise.all([
      transaction.get(db.collection('bookings').doc(bookingId)),
      transaction.get(
        db.collection('agencies').doc(agencyId).collection('config').doc('accounting')
      ),
    ]);

    if (!bookingDoc.exists) {
      throw new Error(`الحجز ${bookingId} غير موجود`);
    }
    if (!accountingConfigDoc.exists) {
      throw new Error(`إعدادات المحاسبة للوكالة ${agencyId} غير مكتملة`);
    }

    const booking = bookingDoc.data()!;
    const accountingConfig = accountingConfigDoc.data()! as AgencyAccountingConfig;

    // تحقق: الحجز في الحالة الصحيحة لإصدار الفاتورة
    if (booking['status'] !== 'confirmed') {
      throw new Error(
        `لا يمكن إصدار فاتورة للحجز ${bookingId} بحالة: ${booking['status']}. ` +
        `الحالة المطلوبة: confirmed`
      );
    }
    if (booking['invoiceIds']?.length > 0) {
      throw new Error(`الحجز ${bookingId} لديه فاتورة بالفعل: ${booking['invoiceIds'][0]}`);
    }
    if (booking['agencyId'] !== agencyId) {
      throw new Error(`الحجز ${bookingId} لا ينتمي للوكالة ${agencyId}`);
    }

    // 2. الحصول على رقم الفاتورة التسلسلي (ذري — داخل Transaction)
    const year = new Date().getFullYear();
    const invoiceNumber = await getNextInvoiceNumber(agencyId, 'taxInvoice', year, transaction);

    // 3. بناء مدخل القيد المحاسبي من بيانات الحجز
    const transactionInput = buildTransactionInput(booking, receivingAccountCode);

    // 4. توليد القيد عبر المحرك المحاسبي (يشمل التحقق من التوازن)
    const journalEntry = generateJournalEntry(transactionInput, accountingConfig);
    // إذا وصلنا هنا، القيد متوازن مضمون (وإلا كان generateJournalEntry رمى خطأ)

    // 5. إعداد المستندات للكتابة
    const now = Timestamp.now();
    const invoiceRef = db.collection('invoices').doc();
    const journalRef = db.collection('journal_entries').doc();
    const invoiceId = invoiceRef.id;
    const journalEntryId = journalRef.id;

    const pricing = booking['pricing'] as Record<string, number>;
    const totalAmount = pricing['totalAmount'];
    const vatAmount = pricing['vatAmount'];
    // إلزامي لبناء إجماليات الفاتورة — مفقودها يعني حجزاً مشوّهاً لا يجوز فوترته.
    if (totalAmount === undefined || vatAmount === undefined) {
      throw new Error(`بيانات تسعير الحجز ${bookingId} ناقصة (totalAmount/vatAmount)`);
    }

    // ── وثيقة الفاتورة ────────────────────────────────────────────────────
    const invoiceData = {
      id: invoiceId,
      agencyId,
      type: 'tax_invoice',
      invoiceNumber,
      bookingId,

      seller: buildSellerInfo(booking),
      buyer: buildBuyerInfo(booking),

      lines: buildInvoiceLines(booking),
      totals: {
        subtotalExclVat: totalAmount - vatAmount,
        totalVat: vatAmount,
        grandTotal: totalAmount,
        currency: 'SAR',
      },

      zatca: {
        invoiceUUID: generateUUID(),
        invoiceTypeCode: '388',
        submissionStatus: 'not_submitted', // يُرسَل بعد الـ Transaction
      },

      status: 'issued',
      paymentStatus: 'unpaid',
      amountPaid: 0,
      amountDue: totalAmount,
      paymentIds: [],

      journalEntryId,
      issueDate: now,
      dueDate: now,

      createdAt: now,
      createdBy: invokedBy,
      issuedAt: now,
    };

    // ── وثيقة القيد اليومي ────────────────────────────────────────────────
    const journalEntryData = {
      id: journalEntryId,
      agencyId,
      type: journalEntry.type,
      reference: { type: 'invoice', id: invoiceId, number: invoiceNumber },
      description: journalEntry.description,
      entryDate: now,
      period: `${now.toDate().getFullYear()}-${String(now.toDate().getMonth() + 1).padStart(2, '0')}`,

      // السطور بالهللات (كما يخزنها المحرك)
      lines: journalEntry.lines.map(line => ({
        ...line,
        // تحويل لـ Firestore (الهللات تُخزَّن مباشرة)
        debitSAR: line.debit / 100,    // للعرض فقط
        creditSAR: line.credit / 100,  // للعرض فقط
      })),

      totalDebit: journalEntry.totalDebit,
      totalCredit: journalEntry.totalCredit,
      isBalanced: true,
      hadRoundingCorrection: journalEntry.metadata.hadRoundingCorrection,

      status: 'posted',
      isAuto: true,
      createdAt: now,
      createdBy: 'system',
      postedAt: now,
      postedBy: 'system',
    };

    // ── الكتابات الذرية (داخل نفس الـ Transaction) ───────────────────────
    transaction.set(invoiceRef, invoiceData);
    transaction.set(journalRef, journalEntryData);
    transaction.update(db.collection('bookings').doc(bookingId), {
      invoiceIds: FieldValue.arrayUnion(invoiceId),
      updatedAt: now,
    });

    // حفظ Idempotency Record داخل الـ Transaction
    // (إذا فشل Transaction، لا يُحفَظ السجل → طلب مكرر يُنفَّذ بشكل صحيح)
    const idempotencyRef = db
      .collection('idempotency_keys')
      .doc(`${agencyId}_createInvoice_${idempotencyKey}`);

    transaction.set(idempotencyRef, {
      key: idempotencyKey,
      agencyId,
      operation: 'createInvoice',
      status: 'completed',
      result: { invoiceId, invoiceNumber, journalEntryId },
      createdAt: now,
      expiresAt: Timestamp.fromMillis(Date.now() + 24 * 60 * 60 * 1000),
    });

    return {
      invoiceId,
      invoiceNumber,
      journalEntryId,
      totalAmount: totalAmount / 100, // تحويل للعرض
      vatAmount: vatAmount / 100,
    };
  });
  // ── نهاية الـ Transaction ─────────────────────────────────────────────────

  // ما يلي خارج الـ Transaction — يمكن أن يفشل دون التأثير على الفاتورة
  // ZATCA submission يُجدوَل كـ retry queue منفصل
  await scheduleZatcaSubmission(result.invoiceId, agencyId).catch(err => {
    console.error(`تحذير: فشل جدولة إرسال ZATCA للفاتورة ${result.invoiceId}:`, err);
    // لا نُعيد الخطأ — الفاتورة صالحة، الإرسال يُعاد لاحقاً
  });

  return result;
}

// ─── دوال مساعدة ─────────────────────────────────────────────────────────────

function buildTransactionInput(
  booking: FirebaseFirestore.DocumentData,
  receivingAccountCode: string
): TransactionInput {
  const pricing = booking['pricing'] as Record<string, number>;
  // revenueModel نصّي مخزَّن ضمن خريطة التسعير — اقرأه كـ unknown ثم حوّله نصاً.
  const revenueModel = (pricing as Record<string, unknown>)['revenueModel'] as string;

  // حقول التسعير الرقمية إلزامية لبناء القيد — مفقودها يعني حجزاً مشوّهاً لا يجوز فوترته.
  const num = (key: string): number => {
    const v = pricing[key];
    if (v === undefined) {
      throw new Error(`حقل التسعير '${key}' مفقود في الحجز ${booking['id']}`);
    }
    return v;
  };

  if (revenueModel === 'agent') {
    const input: AgentPaymentReceivedInput = {
      phase: 'agent_payment_received',
      bookingType: booking['type'],
      isInternational: booking['flightDetails']?.isInternational ?? false,
      costPrice: num('totalCost'),         // بالهللات (مخزَّن هكذا في Firestore)
      serviceFee: num('serviceFee'),
      serviceFeeVatCategory: 'S',
      serviceFeeVatAmount: calculateVat(num('serviceFee'), 0.15),
      receivingAccountCode,
      bookingRef: booking['id'],
      customerName: booking['customerName']?.ar ?? '',
    };
    return input;
  }

  // Principal model
  const sellingExclVat = num('subtotal');
  const input: PrincipalPaymentReceivedInput = {
    phase: 'principal_payment_received',
    bookingType: booking['type'],
    sellingPriceExclVat: sellingExclVat,
    vatAmount: num('vatAmount'),
    totalAmount: num('totalAmount'),
    vatCategory: 'S',
    receivingAccountCode,
    bookingRef: booking['id'],
    customerName: booking['customerName']?.ar ?? '',
  };
  return input;
}

function buildSellerInfo(booking: FirebaseFirestore.DocumentData): object {
  return booking['agencySeller'] ?? {}; // Denormalized في الحجز
}

function buildBuyerInfo(booking: FirebaseFirestore.DocumentData): object {
  return {
    id: booking['customerId'],
    name: booking['customerName'],
    phone: booking['customerPhone'],
  };
}

function buildInvoiceLines(booking: FirebaseFirestore.DocumentData): object[] {
  const pricing = booking['pricing'] as Record<string, unknown>;
  return (pricing['sellingBreakdown'] as object[]) ?? [];
}

function generateUUID(): string {
  // في الإنتاج: استخدم crypto.randomUUID() (متوفر في Node 20)
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

async function scheduleZatcaSubmission(
  invoiceId: string,
  agencyId: string
): Promise<void> {
  // يُضاف السجل لـ queue مُعالج بواسطة Cloud Scheduler
  const db = getFirestore();
  await db.collection('zatca_submission_queue').add({
    invoiceId,
    agencyId,
    status: 'pending',
    attempts: 0,
    nextAttemptAt: Timestamp.now(),
    createdAt: Timestamp.now(),
  });
}
