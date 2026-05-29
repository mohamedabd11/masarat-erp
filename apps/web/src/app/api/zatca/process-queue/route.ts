/**
 * ZATCA Queue Processor — API Route
 *
 * يُستدعى بواسطة Vercel Cron Job كل دقيقة
 * يُعالج الفواتير المنتظرة الإرسال لـ ZATCA
 *
 * الحماية:
 * - CRON_SECRET header verification
 * - يعمل في Node.js runtime (ليس Edge — يحتاج transactions)
 */

import { eq, and, lte, lt } from 'drizzle-orm';
import { zatcaSubmissionQueue, invoices, agencyZatcaConfigs } from '@masarat/database/schema';
import { getHttpClient } from '@/lib/db/client';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: Request): Promise<Response> {
  // التحقق من هوية الـ cron job
  const cronSecret = request.headers.get('x-cron-secret');
  if (cronSecret !== process.env['CRON_SECRET']) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = getHttpClient();
  const now = new Date();

  // جلب العناصر الجاهزة للمعالجة
  const pendingItems = await db
    .select({
      id: zatcaSubmissionQueue.id,
      agencyId: zatcaSubmissionQueue.agencyId,
      invoiceId: zatcaSubmissionQueue.invoiceId,
      invoiceTypeCode: zatcaSubmissionQueue.invoiceTypeCode,
      transactionType: zatcaSubmissionQueue.transactionType,
      attemptCount: zatcaSubmissionQueue.attemptCount,
      maxAttempts: zatcaSubmissionQueue.maxAttempts,
    })
    .from(zatcaSubmissionQueue)
    .where(
      and(
        eq(zatcaSubmissionQueue.status, 'pending'),
        lte(zatcaSubmissionQueue.nextRetryAt, now),
        lt(zatcaSubmissionQueue.attemptCount, zatcaSubmissionQueue.maxAttempts)
      )
    )
    .limit(10); // معالجة 10 فواتير في كل دورة

  const results = {
    processed: 0,
    succeeded: 0,
    failed: 0,
    deadLettered: 0,
  };

  for (const item of pendingItems) {
    results.processed++;

    try {
      // تحديث الحالة إلى processing
      await db
        .update(zatcaSubmissionQueue)
        .set({ status: 'processing', lastAttemptAt: now })
        .where(eq(zatcaSubmissionQueue.id, item.id));

      // جلب بيانات الفاتورة وإعدادات ZATCA
      const [invoice, zatcaConfig] = await Promise.all([
        db.select().from(invoices).where(eq(invoices.id, item.invoiceId)).limit(1).then(r => r[0]),
        db.select().from(agencyZatcaConfigs).where(eq(agencyZatcaConfigs.agencyId, item.agencyId)).limit(1).then(r => r[0]),
      ]);

      if (!invoice || !zatcaConfig) {
        throw new Error('Invoice or ZATCA config not found');
      }

      if (!zatcaConfig.isEnabled) {
        // ZATCA غير مُفعَّل — أغلق العنصر بنجاح
        await db
          .update(zatcaSubmissionQueue)
          .set({ status: 'completed', processedAt: now })
          .where(eq(zatcaSubmissionQueue.id, item.id));

        await db
          .update(invoices)
          .set({ zatcaSubmissionStatus: 'not_submitted' })
          .where(eq(invoices.id, item.invoiceId));

        results.succeeded++;
        continue;
      }

      // إرسال لـ ZATCA API
      const zatcaResult = await submitToZatca(invoice, zatcaConfig, item);

      // تحديث بنجاح
      await db
        .update(zatcaSubmissionQueue)
        .set({
          status: 'completed',
          processedAt: now,
          zatcaStatus: zatcaResult.status,
          zatcaClearanceId: zatcaResult.clearanceId ?? null,
          zatcaResponse: zatcaResult.rawResponse as Record<string, unknown>,
        })
        .where(eq(zatcaSubmissionQueue.id, item.id));

      await db
        .update(invoices)
        .set({
          zatcaSubmissionStatus: zatcaResult.cleared ? 'cleared' : 'reported',
          zatcaClearanceId: zatcaResult.clearanceId ?? null,
          zatcaSubmittedAt: now,
          zatcaQrCodeData: zatcaResult.qrCode ?? null,
        })
        .where(eq(invoices.id, item.invoiceId));

      results.succeeded++;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      const newAttemptCount = (item.attemptCount ?? 0) + 1;
      const isDeadLetter = newAttemptCount >= (item.maxAttempts ?? 5);

      // Exponential backoff: 2^attempt minutes
      const nextRetryMinutes = Math.pow(2, newAttemptCount);
      const nextRetryAt = new Date(now.getTime() + nextRetryMinutes * 60 * 1000);

      await db
        .update(zatcaSubmissionQueue)
        .set({
          status: isDeadLetter ? 'dead_letter' : 'pending',
          attemptCount: newAttemptCount,
          nextRetryAt: isDeadLetter ? null : nextRetryAt,
          errorMessage,
        })
        .where(eq(zatcaSubmissionQueue.id, item.id));

      if (isDeadLetter) {
        await db
          .update(invoices)
          .set({ zatcaSubmissionStatus: 'failed' })
          .where(eq(invoices.id, item.invoiceId));

        results.deadLettered++;
        console.error(`[ZATCA] Dead letter: invoice ${item.invoiceId}`, errorMessage);
      } else {
        results.failed++;
        console.error(`[ZATCA] Attempt ${newAttemptCount} failed: invoice ${item.invoiceId}`, errorMessage);
      }
    }
  }

  return Response.json({ success: true, results });
}

// ─── ZATCA API Integration ────────────────────────────────────────────────────

interface ZatcaSubmissionResult {
  status: string;
  cleared: boolean;
  clearanceId?: string;
  qrCode?: string;
  rawResponse: unknown;
}

async function submitToZatca(
  invoice: typeof invoices.$inferSelect,
  zatcaConfig: typeof agencyZatcaConfigs.$inferSelect,
  queueItem: { invoiceTypeCode: string; transactionType: string }
): Promise<ZatcaSubmissionResult> {
  // في simulation mode: محاكاة الإرسال
  if (zatcaConfig.environment === 'simulation') {
    return {
      status: 'REPORTED',
      cleared: queueItem.invoiceTypeCode === '388', // Tax invoices get cleared
      clearanceId: `SIM-${Date.now()}`,
      qrCode: invoice.zatcaQrCodeData ?? undefined,
      rawResponse: { simulation: true },
    };
  }

  // Production: استدعاء ZATCA API الفعلي
  const zatcaApiUrl = 'https://gw-fatoora.zatca.gov.sa/e-invoicing/core';

  const endpoint = queueItem.transactionType === 'B2B'
    ? `${zatcaApiUrl}/invoices/clearance/single`
    : `${zatcaApiUrl}/invoices/reporting/single`;

  if (!invoice.zatcaSignedXmlUrl) {
    throw new Error('Signed XML URL is missing. Cannot submit to ZATCA.');
  }

  // جلب الـ XML الموقع من object storage
  const xmlResponse = await fetch(invoice.zatcaSignedXmlUrl);
  if (!xmlResponse.ok) throw new Error('Failed to fetch signed XML');
  const signedXml = await xmlResponse.text();

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Accept-Version': 'V2',
      'Accept-Language': 'en',
      'Content-Type': 'application/json',
      Authorization: `Basic ${Buffer.from(
        `${zatcaConfig.certificateSerial}:${process.env['ZATCA_API_SECRET']}`
      ).toString('base64')}`,
    },
    body: JSON.stringify({
      invoiceHash: invoice.zatcaXmlHash,
      uuid: invoice.zatcaUuid,
      invoice: Buffer.from(signedXml).toString('base64'),
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`ZATCA API error ${response.status}: ${errorBody}`);
  }

  const result = await response.json() as Record<string, unknown>;

  return {
    status: (result['reportingStatus'] as string) ?? (result['clearanceStatus'] as string) ?? 'UNKNOWN',
    cleared: result['clearanceStatus'] === 'CLEARED',
    clearanceId: result['clearanceId'] as string | undefined,
    rawResponse: result,
  };
}
