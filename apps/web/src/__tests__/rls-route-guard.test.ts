/**
 * CRIT-6 (option b) — app-layer tenant-isolation guard.
 *
 * The deployed Postgres RLS is a no-op (the app connects as the table owner and
 * the bypass policy is always TRUE), so tenant isolation rests ENTIRELY on every
 * query carrying an `agencyId` predicate. This static guard scans every API route
 * and fails if a write (`.update()` / `.delete()`) on a tenant table is scoped by
 * neither `agencyId` nor a primary-key `id` — the exact class of bug that caused
 * the CRIT-7 cross-tenant IDOR.
 *
 * Rules:
 *   • A mutation is SAFE if its statement references `agencyId`, OR scopes by the
 *     table's primary-key `<table>.id` (rows loaded under agency scope earlier in
 *     the same agency-authenticated handler / transaction).
 *   • Child tables with no `agency_id` column (scoped by an agency-validated
 *     parent FK) are allowlisted in PARENT_SCOPED_TABLES.
 *   • Global/non-tenant tables are allowlisted in NON_TENANT.
 *
 * This is a regression guard: new code that mutates a tenant table scoped only by
 * some other foreign key will fail here and must add an agencyId predicate.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

const API_ROOT = join(__dirname, '..', 'app', 'api');

// Global tables that legitimately have no per-agency scope.
const NON_TENANT = new Set(['idempotencyKeys', 'agencies', 'exchangeRates', 'agencyCounters', 'users']);

// Child tables with no agency_id column — scoped by their agency-validated parent.
const PARENT_SCOPED_TABLES = new Set(['ticketCoupons']);

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (name === 'route.ts') out.push(p);
  }
  return out;
}

interface Violation { file: string; line: number; op: string; table: string; }

function scanFile(file: string): Violation[] {
  const src = readFileSync(file, 'utf8');
  const re = /\b(?:db|tx)\.(update|delete)\(\s*([A-Za-z_]\w*)/g;
  const violations: Violation[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const op = m[1]!;
    const table = m[2]!;
    if (NON_TENANT.has(table) || PARENT_SCOPED_TABLES.has(table)) continue;

    // Statement window: from the call to the end of the statement (next ';').
    const start = m.index;
    const semi = src.indexOf(';', start);
    const win = src.slice(start, semi === -1 ? start + 1200 : Math.min(semi, start + 1600));

    const hasAgency = /agencyId/.test(win);
    const hasPkId   = new RegExp(`\\b${table}\\.id\\b`).test(win);
    if (!hasAgency && !hasPkId) {
      violations.push({ file: file.slice(file.indexOf('app/api')), line: src.slice(0, start).split('\n').length, op, table });
    }
  }
  return violations;
}

describe('RLS app-layer guard (CRIT-6) — tenant writes must be agency- or PK-scoped', () => {
  it('no API route mutates a tenant table without an agencyId or primary-key predicate', () => {
    const files = walk(API_ROOT);
    expect(files.length).toBeGreaterThan(50); // sanity: the scan actually ran

    const violations = files.flatMap(scanFile);
    if (violations.length > 0) {
      const report = violations.map(v => `  ${v.file}:${v.line} → ${v.op}(${v.table})`).join('\n');
      throw new Error(
        `Found ${violations.length} tenant write(s) scoped by neither agencyId nor a primary key.\n` +
        `Add eq(<table>.agencyId, agencyId) to the WHERE clause, or — for a child table with no ` +
        `agency_id column scoped by an agency-validated parent — add it to PARENT_SCOPED_TABLES:\n${report}`,
      );
    }
    expect(violations).toEqual([]);
  });
});
