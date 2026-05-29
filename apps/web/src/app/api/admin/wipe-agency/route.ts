import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

const SUPER_ADMIN_EMAIL = process.env['SUPER_ADMIN_EMAIL'];
if (!SUPER_ADMIN_EMAIL) throw new Error('SUPER_ADMIN_EMAIL env var is not configured');

function adminSql() {
  const url = process.env['ADMIN_DATABASE_URL'] ?? process.env['DATABASE_URL'];
  if (!url) throw new Error('DATABASE_URL is not configured');
  return neon(url);
}

async function verifySuperAdmin(request: Request) {
  const authHeader = request.headers.get('Authorization') ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) throw new Error('NO_TOKEN');

  const { getAuth } = await import('firebase-admin/auth');
  const decoded = await getAuth().verifyIdToken(token);
  if (decoded.email !== SUPER_ADMIN_EMAIL) throw new Error('FORBIDDEN');
  return decoded;
}

export async function POST(request: Request) {
  try {
    const { ensureAdminApp } = await import('@/lib/firebase-admin');
    ensureAdminApp();
    const adminUser = await verifySuperAdmin(request);

    const body = await request.json() as { agencyId: string; confirmName: string };
    const { agencyId, confirmName } = body;

    if (!agencyId || !confirmName) {
      return NextResponse.json({ error: 'agencyId و confirmName مطلوبان' }, { status: 400 });
    }

    const db = adminSql();

    // Verify agency exists and name matches
    const [agency] = await db`
      SELECT id, name_ar AS "nameAr", subscription_status AS "subscriptionStatus"
      FROM agencies
      WHERE id = ${agencyId}::uuid
    `;

    if (!agency) {
      return NextResponse.json({ error: 'الوكالة غير موجودة' }, { status: 404 });
    }

    if (agency['nameAr'] !== confirmName) {
      return NextResponse.json({ error: 'اسم الوكالة غير مطابق' }, { status: 422 });
    }

    if (agency['subscriptionStatus'] !== 'trial') {
      return NextResponse.json(
        { error: 'التصفير متاح فقط للوكالات في الفترة التجريبية' },
        { status: 403 }
      );
    }

    const stats: Record<string, number> = {};

    // Delete in FK-safe order (leaf tables first, then parents)
    // Note: tables with onDelete: 'cascade' clean up automatically
    // We handle 'restrict' tables explicitly

    // 1. Financial leaves
    const jlResult = await db`
      DELETE FROM journal_lines
      WHERE journal_entry_id IN (
        SELECT id FROM journal_entries WHERE agency_id = ${agencyId}::uuid
      )
    `;
    if (jlResult.length) stats['journal_lines'] = jlResult.length;

    const ilResult = await db`
      DELETE FROM invoice_lines
      WHERE invoice_id IN (
        SELECT id FROM invoices WHERE agency_id = ${agencyId}::uuid
      )
    `;
    if (ilResult.length) stats['invoice_lines'] = ilResult.length;

    // 2. Financial heads (require explicit delete — onDelete: restrict on agency)
    const szResult = await db`
      DELETE FROM zatca_submission_queue WHERE agency_id = ${agencyId}::uuid
    `;
    if (szResult.length) stats['zatca_submission_queue'] = szResult.length;

    const spResult = await db`
      DELETE FROM supplier_payments WHERE agency_id = ${agencyId}::uuid
    `;
    if (spResult.length) stats['supplier_payments'] = spResult.length;

    const chResult = await db`
      DELETE FROM cheques WHERE agency_id = ${agencyId}::uuid
    `;
    if (chResult.length) stats['cheques'] = chResult.length;

    const btResult = await db`
      DELETE FROM bank_transactions WHERE agency_id = ${agencyId}::uuid
    `;
    if (btResult.length) stats['bank_transactions'] = btResult.length;

    const pmResult = await db`
      DELETE FROM payments WHERE agency_id = ${agencyId}::uuid
    `;
    if (pmResult.length) stats['payments'] = pmResult.length;

    const jeResult = await db`
      DELETE FROM journal_entries WHERE agency_id = ${agencyId}::uuid
    `;
    if (jeResult.length) stats['journal_entries'] = jeResult.length;

    const invResult = await db`
      DELETE FROM invoices WHERE agency_id = ${agencyId}::uuid
    `;
    if (invResult.length) stats['invoices'] = invResult.length;

    // 3. Booking passengers (cascade from bookings — but delete explicitly for stats)
    const bpResult = await db`
      DELETE FROM booking_passengers
      WHERE booking_id IN (
        SELECT id FROM bookings WHERE agency_id = ${agencyId}::uuid
      )
    `;
    if (bpResult.length) stats['booking_passengers'] = bpResult.length;

    const bkResult = await db`
      DELETE FROM bookings WHERE agency_id = ${agencyId}::uuid
    `;
    if (bkResult.length) stats['bookings'] = bkResult.length;

    // 4. Customers (cascade from agency, but explicit for stats)
    const cpResult = await db`
      DELETE FROM customer_passports
      WHERE customer_id IN (
        SELECT id FROM customers WHERE agency_id = ${agencyId}::uuid
      )
    `;
    if (cpResult.length) stats['customer_passports'] = cpResult.length;

    const cuResult = await db`DELETE FROM customers WHERE agency_id = ${agencyId}::uuid`;
    if (cuResult.length) stats['customers'] = cuResult.length;

    // 5. Operational tables
    const opTables = [
      'chart_of_accounts', 'invoice_counters', 'suppliers',
      'bank_accounts', 'employees', 'departments',
      'exchange_rates', 'service_types',
    ] as const;

    for (const table of opTables) {
      // Safe: table names are a controlled constant tuple, not user input
      const r = await db(`DELETE FROM ${table} WHERE agency_id = $1`, [agencyId]);
      if (r.length) stats[table] = r.length;
    }

    // 6. Audit + idempotency
    const alResult = await db`DELETE FROM audit_logs WHERE agency_id = ${agencyId}::uuid`;
    if (alResult.length) stats['audit_logs'] = alResult.length;

    const ikResult = await db`DELETE FROM idempotency_keys WHERE agency_id = ${agencyId}::uuid`;
    if (ikResult.length) stats['idempotency_keys'] = ikResult.length;

    // 7. Users (restrict on agency — delete last before agency config)
    const usResult = await db`DELETE FROM users WHERE agency_id = ${agencyId}::uuid`;
    if (usResult.length) stats['users'] = usResult.length;

    // 8. Reset invoice counters (already deleted above) and agency config
    // agency_accounting_configs and agency_zatca_configs cascade-delete with agency
    // We keep the agency row itself — just wipe its data

    // 9. Write audit log (using agency's own admin user context won't work post-delete,
    //    write to a separate admin_audit_log table if it exists, else skip)
    try {
      await db`
        INSERT INTO audit_logs (agency_id, action, resource_type, metadata)
        VALUES (
          ${agencyId}::uuid,
          'wipe_agency_data',
          'agency',
          ${JSON.stringify({ performedBy: adminUser.email, stats })}::jsonb
        )
      `;
    } catch {
      // audit_logs might not exist yet — non-fatal
    }

    const totalDeleted = Object.values(stats).reduce((s, n) => s + n, 0);

    return NextResponse.json({
      success: true,
      message: `تم تصفير بيانات وكالة "${agency['nameAr']}" — حُذف ${totalDeleted} سجل`,
      stats,
    });
  } catch (err: unknown) {
    const msg = (err as Error).message ?? '';
    if (msg === 'NO_TOKEN' || msg === 'FORBIDDEN') {
      return NextResponse.json({ error: 'ممنوع الوصول' }, { status: 403 });
    }
    console.error('[admin/wipe-agency]', err);
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
