/**
 * Audit Logger — سجل لا يُحذف لجميع العمليات الحساسة
 * مطلب ZATCA + امتثال مالي + أمن المعلومات
 */

import { auditLogs } from '@masarat/database/schema';
import { getHttpClient } from './db/client.js';

export interface AuditEntry {
  agencyId?: string;
  userId?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  oldValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * تسجيل عملية في سجل التدقيق
 * لا تُرمى exception إذا فشل التسجيل — يُسجَّل في console فقط
 */
export async function writeAuditLog(entry: AuditEntry): Promise<void> {
  try {
    const db = getHttpClient();
    await db.insert(auditLogs).values({
      agencyId: entry.agencyId ?? null,
      userId: entry.userId ?? null,
      action: entry.action,
      resourceType: entry.resourceType,
      resourceId: entry.resourceId ?? null,
      oldValues: entry.oldValues ?? null,
      newValues: entry.newValues ?? null,
      ipAddress: entry.ipAddress ?? null,
      userAgent: entry.userAgent ?? null,
      requestId: entry.requestId ? entry.requestId as unknown as undefined : null,
      metadata: entry.metadata ?? null,
    });
  } catch (err) {
    // لا نُوقف تنفيذ العملية إذا فشل تسجيل الـ audit
    console.error('[AuditLog] Failed to write audit log:', err);
  }
}

/**
 * Helper لـ financial operations
 */
export async function auditFinancialAction(
  agencyId: string,
  userId: string,
  action: 'invoice_created' | 'payment_processed' | 'refund_issued' | 'invoice_cancelled',
  resourceId: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  await writeAuditLog({
    agencyId,
    userId,
    action,
    resourceType: action.split('_')[0],
    resourceId,
    metadata,
  });
}
