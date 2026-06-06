import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { ensureAdminApp } from '@/lib/firebase-admin';

// GET /api/admin/fk-audit — READ-ONLY. Super-admin only.
//
// Counts orphaned rows for each loose (FK-less) reference so we can decide which
// relationships are safe to harden with a real foreign key. It NEVER writes.
// Authorization: Bearer <super-admin Firebase token>.
async function verifySuperAdmin(request: Request) {
  const superAdminEmail = process.env['SUPER_ADMIN_EMAIL'];
  if (!superAdminEmail) throw new Error('SUPER_ADMIN_EMAIL env var is not configured');
  const authHeader = request.headers.get('Authorization') ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) throw new Error('NO_TOKEN');
  const { getAuth } = await import('firebase-admin/auth');
  const decoded = await getAuth().verifyIdToken(token);
  if (decoded.email !== superAdminEmail) throw new Error('FORBIDDEN');
  return decoded;
}

// Fixed allowlist of (child.col → parent.pcol) links that currently have NO FK.
// All identifiers are hardcoded constants here (never user input), so the direct
// interpolation below is injection-safe.
const RELATIONS: { child: string; col: string; parent: string; pcol: string }[] = [
  { child: 'invoices',          col: 'original_invoice_id',     parent: 'invoices',        pcol: 'id' },
  { child: 'invoices',          col: 'journal_entry_id',        parent: 'journal_entries', pcol: 'id' },
  { child: 'payments',          col: 'journal_entry_id',        parent: 'journal_entries', pcol: 'id' },
  { child: 'bookings',          col: 'journal_entry_id',        parent: 'journal_entries', pcol: 'id' },
  { child: 'supplier_payments', col: 'supplier_id',             parent: 'suppliers',       pcol: 'id' },
  { child: 'supplier_payments', col: 'journal_entry_id',        parent: 'journal_entries', pcol: 'id' },
  { child: 'receipt_vouchers',  col: 'journal_entry_id',        parent: 'journal_entries', pcol: 'id' },
  { child: 'quotes',            col: 'converted_to_booking_id', parent: 'bookings',        pcol: 'id' },
];

export async function GET(request: Request) {
  try {
    ensureAdminApp();
    await verifySuperAdmin(request);

    const url = process.env.DATABASE_URL;
    if (!url) return NextResponse.json({ error: 'DATABASE_URL missing' }, { status: 503 });
    const sql = neon(url);

    const toRows = (res: unknown): Record<string, unknown>[] =>
      Array.isArray(res) ? res as Record<string, unknown>[] : ((res as { rows?: Record<string, unknown>[] })?.rows ?? []);

    const relations: unknown[] = [];
    for (const r of RELATIONS) {
      const label = `${r.child}.${r.col} → ${r.parent}.${r.pcol}`;
      try {
        // Skip gracefully if the column doesn't exist on this DB.
        const colCheck = await sql`
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = ${r.child} AND column_name = ${r.col}
          LIMIT 1`;
        if (toRows(colCheck).length === 0) {
          relations.push({ relation: label, status: 'column_missing' });
          continue;
        }
        const res = await sql.query(
          `SELECT COUNT(*)::int AS orphans
             FROM "${r.child}" c
            WHERE c."${r.col}" IS NOT NULL
              AND NOT EXISTS (SELECT 1 FROM "${r.parent}" p WHERE p."${r.pcol}" = c."${r.col}")`,
        );
        const orphans = Number(toRows(res)[0]?.['orphans'] ?? 0);
        relations.push({ relation: label, orphans, fkSafe: orphans === 0 });
      } catch (e) {
        relations.push({ relation: label, status: 'error', error: String(e) });
      }
    }

    const safeToHarden = relations.filter((x): x is { relation: string; orphans: number; fkSafe: boolean } =>
      typeof x === 'object' && x !== null && (x as { fkSafe?: boolean }).fkSafe === true).length;

    return NextResponse.json({ ok: true, checkedAt: new Date().toISOString(), safeToHarden, relations });
  } catch (err) {
    const msg = String(err);
    if (msg.includes('NO_TOKEN'))  return NextResponse.json({ error: 'يجب تسجيل الدخول' }, { status: 401 });
    if (msg.includes('FORBIDDEN')) return NextResponse.json({ error: 'صلاحية المشرف الأعلى مطلوبة' }, { status: 403 });
    console.error(JSON.stringify({ event: 'fk_audit_failed', error: msg }));
    return NextResponse.json({ error: 'خطأ في الخادم' }, { status: 500 });
  }
}
