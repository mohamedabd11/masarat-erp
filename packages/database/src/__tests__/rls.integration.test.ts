/**
 * RLS Integration Tests — Row Level Security Cross-Tenant Isolation
 *
 * These tests verify that PostgreSQL RLS policies correctly isolate
 * data between agencies. They run against a real Neon database.
 *
 * SKIP conditions:
 *   - DATABASE_URL not set (local dev without DB / unit CI)
 *   - DATABASE_URL_TEST not set (test DB not configured)
 *
 * Required setup:
 *   1. Run migrations: pnpm db:migrate
 *   2. Insert two test agencies with known UUIDs (see SEED constants below)
 *
 * Run: DATABASE_URL_TEST=<neon-test-url> pnpm test
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from '../schema/index.js';
import { eq } from 'drizzle-orm';

// ─── Test constants ───────────────────────────────────────────────────────────

const TEST_DB_URL = process.env['DATABASE_URL_TEST'] ?? process.env['DATABASE_URL'];

const AGENCY_A_ID = '00000000-0000-0000-0000-000000000001';
const AGENCY_B_ID = '00000000-0000-0000-0000-000000000002';

// Skip all tests when no test database is available
const skipNoDb = !TEST_DB_URL;

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function dbWithContext(agencyId: string | null) {
  const sql = neon(TEST_DB_URL!);
  if (agencyId) {
    await sql`SELECT set_config('app.current_agency_id', ${agencyId}, false)`;
  } else {
    // No tenant context = anonymous / unauthenticated
    await sql`SELECT set_config('app.current_agency_id', '', false)`;
  }
  return drizzle(sql, { schema });
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeAll(async () => {
  if (skipNoDb) return;

  // Insert test agencies directly as app_admin (bypasses RLS)
  // In real CI, a setup script or migration fixture handles this.
  // Here we use raw SQL to ensure clean state.
  const sql = neon(TEST_DB_URL!);
  await sql`
    INSERT INTO agencies (id, name_ar, name_en, subscription_plan, subscription_status, max_users, is_active)
    VALUES
      (${AGENCY_A_ID}, 'وكالة الاختبار A', 'Test Agency A', 'trial', 'trial', 5, true),
      (${AGENCY_B_ID}, 'وكالة الاختبار B', 'Test Agency B', 'trial', 'trial', 5, true)
    ON CONFLICT (id) DO NOTHING
  `;

  // Insert a test customer for Agency A
  await sql`
    INSERT INTO customers (id, agency_id, name_ar, name_en)
    VALUES (gen_random_uuid(), ${AGENCY_A_ID}, 'عميل A', 'Customer A')
    ON CONFLICT DO NOTHING
  `;

  // Insert a test customer for Agency B
  await sql`
    INSERT INTO customers (id, agency_id, name_ar, name_en)
    VALUES (gen_random_uuid(), ${AGENCY_B_ID}, 'عميل B', 'Customer B')
    ON CONFLICT DO NOTHING
  `;
});

afterAll(async () => {
  if (skipNoDb) return;

  const sql = neon(TEST_DB_URL!);
  // Clean up test data in correct FK order
  await sql`DELETE FROM customers WHERE agency_id IN (${AGENCY_A_ID}, ${AGENCY_B_ID})`;
  await sql`DELETE FROM agencies WHERE id IN (${AGENCY_A_ID}, ${AGENCY_B_ID})`;
});

// ─── Test: Cross-tenant isolation ────────────────────────────────────────────

describe.skipIf(skipNoDb)('RLS — Cross-Tenant Isolation', () => {
  it('Agency A context only returns Agency A customers', async () => {
    const db = await dbWithContext(AGENCY_A_ID);
    const rows = await db.select().from(schema.customers);
    const agencyIds = [...new Set(rows.map(r => r.agencyId))];
    expect(agencyIds).toEqual([AGENCY_A_ID]);
  });

  it('Agency B context only returns Agency B customers', async () => {
    const db = await dbWithContext(AGENCY_B_ID);
    const rows = await db.select().from(schema.customers);
    const agencyIds = [...new Set(rows.map(r => r.agencyId))];
    expect(agencyIds).toEqual([AGENCY_B_ID]);
  });

  it('Agency A cannot see Agency B customers even with explicit query', async () => {
    const db = await dbWithContext(AGENCY_A_ID);
    const rows = await db
      .select()
      .from(schema.customers)
      .where(eq(schema.customers.agencyId, AGENCY_B_ID));
    expect(rows).toHaveLength(0);
  });

  it('No tenant context returns empty result set (not an error)', async () => {
    const db = await dbWithContext(null);
    const rows = await db.select().from(schema.customers);
    // RLS with no context should return empty — never throw
    expect(rows).toHaveLength(0);
  });
});

// ─── Test: Append-only enforcement ───────────────────────────────────────────

describe.skipIf(skipNoDb)('RLS — Append-Only Financial Records', () => {
  let invoiceId: string;

  it('can INSERT an invoice for Agency A', async () => {
    const sql = neon(TEST_DB_URL!);
    await sql`SELECT set_config('app.current_agency_id', ${AGENCY_A_ID}, false)`;

    const result = await sql`
      INSERT INTO invoices (
        id, agency_id, invoice_number, invoice_type, invoice_date,
        subtotal_halalas, vat_halalas, total_halalas, amount_due_halalas,
        status, zatca_uuid, seller_vat_number
      )
      VALUES (
        gen_random_uuid(), ${AGENCY_A_ID}, 'TEST-001', 'standard', NOW(),
        85000, 12750, 97750, 97750,
        'draft', gen_random_uuid(), '300000000000003'
      )
      RETURNING id
    `;
    invoiceId = result[0].id;
    expect(invoiceId).toBeDefined();
  });

  it('cannot DELETE an issued invoice (append-only enforcement)', async () => {
    const sql = neon(TEST_DB_URL!);
    await sql`SELECT set_config('app.current_agency_id', ${AGENCY_A_ID}, false)`;

    // First update to 'issued' status to trigger the append-only rule
    await sql`UPDATE invoices SET status = 'issued' WHERE id = ${invoiceId}`;

    await expect(
      sql`DELETE FROM invoices WHERE id = ${invoiceId}`
    ).rejects.toThrow();
  });

  it('Agency B cannot delete Agency A invoice', async () => {
    const sql = neon(TEST_DB_URL!);
    await sql`SELECT set_config('app.current_agency_id', ${AGENCY_B_ID}, false)`;

    // This should silently delete 0 rows (not throw, but also not succeed)
    const result = await sql`
      DELETE FROM invoices WHERE id = ${invoiceId} RETURNING id
    `;
    expect(result).toHaveLength(0);
  });
});

// ─── Test: Journal entry immutability ────────────────────────────────────────

describe.skipIf(skipNoDb)('RLS — Posted Journal Entry Immutability', () => {
  it('cannot modify a posted journal entry', async () => {
    const sql = neon(TEST_DB_URL!);
    await sql`SELECT set_config('app.current_agency_id', ${AGENCY_A_ID}, false)`;

    // Insert a journal entry and post it
    const [{ id: jeId }] = await sql`
      INSERT INTO journal_entries (id, agency_id, date, description_ar, status, total_debit, total_credit, is_balanced, period)
      VALUES (gen_random_uuid(), ${AGENCY_A_ID}, NOW(), 'قيد اختبار', 'posted', 93625, 93625, true, '2026-01')
      RETURNING id
    `;

    // Attempt to change description — should be blocked by trigger
    await expect(
      sql`UPDATE journal_entries SET description_ar = 'تعديل غير مسموح' WHERE id = ${jeId}`
    ).rejects.toThrow(/cannot modify/i);

    // Cleanup — requires app_admin role bypassing RLS (done in afterAll)
  });
});

// ─── Test: Agency A cannot write to Agency B ─────────────────────────────────

describe.skipIf(skipNoDb)('RLS — Cross-Tenant Write Prevention', () => {
  it('Agency A context cannot insert a record with agency_id = B', async () => {
    const sql = neon(TEST_DB_URL!);
    await sql`SELECT set_config('app.current_agency_id', ${AGENCY_A_ID}, false)`;

    // Even if we specify agency_id = B explicitly, RLS should block it
    // The INSERT policy uses: WITH CHECK (agency_id = current_agency_id())
    await expect(
      sql`
        INSERT INTO customers (id, agency_id, name_ar, name_en)
        VALUES (gen_random_uuid(), ${AGENCY_B_ID}, 'محاولة اختراق', 'Intrusion Attempt')
      `
    ).rejects.toThrow();
  });
});
