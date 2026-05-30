import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';

// Public health-check endpoint — safe to call from browser with no auth.
// Returns DB connectivity status and which tables exist.
export async function GET() {
  const url = process.env.DATABASE_URL;

  if (!url) {
    return NextResponse.json({
      ok: false,
      problem: 'DATABASE_URL_MISSING',
      fix: 'Add DATABASE_URL to Vercel environment variables (Settings → Environment Variables)',
    }, { status: 503 });
  }

  try {
    const sql = neon(url);
    const rows = await sql`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `;
    const tables = (rows as { table_name: string }[]).map(r => r.table_name);
    const REQUIRED = ['agencies', 'users', 'bookings', 'invoices', 'payments',
      'journal_entries', 'journal_lines', 'chart_of_accounts', 'exchange_rates'];
    const missing = REQUIRED.filter(t => !tables.includes(t));

    return NextResponse.json({
      ok: missing.length === 0,
      db: 'connected',
      tables,
      missing,
      fix: missing.length > 0
        ? 'Some tables are missing. Open Settings → تهيئة قاعدة البيانات and click the setup button.'
        : null,
    });
  } catch (err) {
    console.error(JSON.stringify({ event: 'health_check_failed', error: String(err) }));
    return NextResponse.json({
      ok: false,
      problem: 'DB_CONNECTION_FAILED',
      fix: 'Check that DATABASE_URL is correct in Vercel environment variables.',
    }, { status: 503 });
  }
}
