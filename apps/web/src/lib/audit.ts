import { db } from './db';
import { auditLog } from './schema';

interface AuditParams {
  agencyId:   string;
  userId:     string;
  userEmail?: string;
  action:     string;  // create|update|delete|approve|reject|reverse|export
  resource:   string;  // booking|invoice|payment|pnr|employee|...
  resourceId?: string;
  before?:    unknown;
  after?:     unknown;
  metadata?:  unknown;
}

export async function logAudit(p: AuditParams): Promise<void> {
  try {
    await db.insert(auditLog).values({
      id:         crypto.randomUUID(),
      agencyId:   p.agencyId,
      userId:     p.userId,
      userEmail:  p.userEmail  ?? null,
      action:     p.action,
      resource:   p.resource,
      resourceId: p.resourceId ?? null,
      before:     (p.before   ?? null) as never,
      after:      (p.after    ?? null) as never,
      metadata:   (p.metadata ?? null) as never,
    });
  } catch {
    // Audit failures must never break the main transaction
    console.error(JSON.stringify({ event: 'audit_log_failed', resource: p.resource, action: p.action }));
  }
}
