/**
 * CRIT-6 — app-layer tenant-isolation guard.
 *
 * Postgres RLS is now genuinely enforced (instrumentation.ts FORCE ROW LEVEL
 * SECURITY + the agency_isolation policy), but only as defense-in-depth: the
 * `app.current_agency_id` context is set inside `db.transaction` (lib/db.ts), and
 * the policy is FAIL-OPEN when no context is set. Read paths that query outside a
 * transaction therefore get NO RLS, so tenant isolation still rests on every
 * query carrying an `agencyId` predicate. This static guard is that backstop.
 *
 * Two checks:
 *   1. WRITE path — every `.update()` / `.delete()` on a tenant table must be
 *      scoped by `agencyId` or the table's primary-key `id`. This is the exact
 *      class of bug behind the CRIT-7 cross-tenant IDOR.
 *   2. READ path (dynamic `[id]` routes only) — a `.from(<tenant table>)` that
 *      loads a resource addressed by a URL parameter must reference `agencyId`,
 *      so a forged id cannot read another agency's row (IDOR-on-read). Static,
 *      list-style reads (no dynamic segment) are out of scope here — they are far
 *      less IDOR-prone and would swamp the guard with aggregate/join noise.
 *
 * Rules:
 *   • A statement is SAFE if it references `agencyId`, OR scopes by the table's
 *     primary-key `<table>.id` (rows loaded under agency scope earlier in the same
 *     agency-authenticated handler / transaction).
 *   • Child tables with no `agency_id` column (scoped by an agency-validated
 *     parent FK) are allowlisted in PARENT_SCOPED_TABLES.
 *   • Global/non-tenant tables are allowlisted in NON_TENANT.
 *
 * Regression guard: new code that touches a tenant table scoped only by some
 * other foreign key fails here and must add an agencyId predicate.
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

// Read-path scan: only for routes with a dynamic URL segment (path contains
// '[') — those load a resource by a client-supplied id and are the IDOR-on-read
// risk. Each `.from(<tenant table>)` statement must carry an agencyId predicate.
function scanReadsInDynamicRoute(file: string): Violation[] {
  if (!file.includes('[')) return [];
  const src = readFileSync(file, 'utf8');
  const re = /\.from\(\s*([A-Za-z_]\w*)/g;
  const violations: Violation[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const table = m[1]!;
    if (NON_TENANT.has(table) || PARENT_SCOPED_TABLES.has(table)) continue;

    const start = m.index;
    const semi = src.indexOf(';', start);
    const win = src.slice(start, semi === -1 ? start + 1200 : Math.min(semi, start + 1600));

    const hasAgency = /agencyId/.test(win);
    const hasPkId   = new RegExp(`\\b${table}\\.id\\b`).test(win);
    if (!hasAgency && !hasPkId) {
      violations.push({ file: file.slice(file.indexOf('app/api')), line: src.slice(0, start).split('\n').length, op: 'read', table });
    }
  }
  return violations;
}

describe('RLS app-layer guard (CRIT-6) — tenant access must be agency- or PK-scoped', () => {
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

  it('no dynamic [id] route reads a tenant table without an agencyId predicate (IDOR-on-read)', () => {
    const files = walk(API_ROOT);
    const violations = files.flatMap(scanReadsInDynamicRoute);
    if (violations.length > 0) {
      const report = violations.map(v => `  ${v.file}:${v.line} → from(${v.table})`).join('\n');
      throw new Error(
        `Found ${violations.length} dynamic-route read(s) of a tenant table with no agencyId predicate ` +
        `(RLS is fail-open on non-transactional reads, so a forged id could read another agency's row).\n` +
        `Add eq(<table>.agencyId, agencyId) to the WHERE clause:\n${report}`,
      );
    }
    expect(violations).toEqual([]);
  });
});
