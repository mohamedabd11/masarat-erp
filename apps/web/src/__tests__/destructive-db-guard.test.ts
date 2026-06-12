/**
 * Data-loss prevention guard — schema / migration / tooling layer.
 *
 * Companion to rls-route-guard.test.ts. That test guards the *application* layer
 * (every `db.delete()/db.update()` on a tenant table must be agencyId/PK scoped).
 * THIS test guards the layer that actually wiped a real agency's `invoices` rows:
 * raw schema SQL, the boot-time migrator, package scripts and CI workflows.
 *
 * It fails the build if any "DB-surface" file introduces an operation that can
 * destroy a whole table's data for EVERY agency at once — regardless of who
 * (human or AI) wrote it, where, or how small the change is:
 *
 *   • `drizzle-kit push`        — diffs the schema straight against the live DB and
 *                                 will DROP/RECREATE a table to reconcile it; in a
 *                                 non-interactive shell it auto-picks the
 *                                 destructive answer. This is the exact command
 *                                 that emptied the invoices table.
 *   • `DROP TABLE`              — deletes every row in the table.
 *   • `TRUNCATE`               — empties the table.
 *   • `ALTER TABLE … DROP COLUMN` — permanently loses that column for all rows.
 *   • `DELETE FROM …` with no WHERE — deletes every row, cross-tenant.
 *
 * Deliberately NOT flagged (no row-data loss): `DROP INDEX`, `DROP CONSTRAINT`,
 * `ALTER COLUMN … TYPE` (safe widening), and ORM `db.delete()` calls (those are
 * row-scoped CRUD, already covered by rls-route-guard.test.ts).
 *
 * Escape hatch — when an operation is genuinely safe (e.g. it runs only against a
 * disposable CI Postgres, never the shared DATABASE_URL), annotate the SAME line
 * or the line directly above it with `db-safe: <reason>`. That forces a conscious,
 * reviewable justification instead of a silent destructive change. A `drizzle-kit
 * push` invocation is also exempt when it is gated behind an `ALLOW_DB_PUSH` env
 * check on the same line (the opt-in used by the package.json scripts).
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync, existsSync } from 'fs';
import { join } from 'path';

const REPO_ROOT = join(__dirname, '..', '..', '..', '..');

// Directories whose *.ts/*.sql files form the database surface area. Application
// React components and integration tests are intentionally excluded: components
// never touch the DB (the `truncate` CSS class is not SQL), and integration tests
// run their scoped `DELETE FROM … WHERE` cleanup against a throwaway test DB.
const SCAN_DIRS = [
  'apps/web/drizzle',
  'apps/web/src/lib',
  'apps/web/src/app/api',
  'apps/web/src/instrumentation.ts',
  'packages/database/src/schema',
  'packages/database/src/migrations',
  '.github/workflows',
];

// Individual files (scripts / manifests) that can carry destructive commands.
const SCAN_FILES = [
  'apps/web/package.json',
  'packages/database/package.json',
  'package.json',
];

const SCAN_EXT = ['.ts', '.js', '.mjs', '.cjs', '.sql', '.yml', '.yaml', '.sh', '.json'];

function isTestPath(p: string): boolean {
  return /(?:^|[\\/])__tests__[\\/]/.test(p) || /\.test\.[cm]?[jt]s$/.test(p) || /[\\/]tests?[\\/]/.test(p);
}

function walk(path: string, out: string[]): void {
  if (!existsSync(path)) return;
  const st = statSync(path);
  if (st.isFile()) {
    if (!isTestPath(path) && SCAN_EXT.some((e) => path.endsWith(e))) out.push(path);
    return;
  }
  for (const name of readdirSync(path)) {
    if (name === 'node_modules' || name === '.next' || name === 'dist') continue;
    walk(join(path, name), out);
  }
}

interface Finding { file: string; line: number; rule: string; snippet: string; }

/** Does `line` (or the line above it) carry a `db-safe:` justification? */
function annotated(lines: string[], idx: number): boolean {
  const here = lines[idx] ?? '';
  const above = idx > 0 ? lines[idx - 1] ?? '' : '';
  return /db-safe\s*:/i.test(here) || /db-safe\s*:/i.test(above);
}

function scan(file: string): Finding[] {
  const rel = file.slice(file.indexOf('masarat') === -1 ? 0 : file.indexOf(REPO_ROOT) + REPO_ROOT.length).replace(/^[\\/]/, '');
  const src = readFileSync(file, 'utf8');
  const lines = src.split('\n');
  const findings: Finding[] = [];

  // Case-SENSITIVE on purpose: every destructive SQL statement in this codebase is
  // written in uppercase (SQL convention), whereas English prose in comments is
  // mixed-case ("Delete from Vercel Blob…", "drop the column"). Matching uppercase
  // only keeps the guard focused on real SQL and avoids comment false positives.
  const lineRules: { rule: string; re: RegExp }[] = [
    { rule: 'DROP TABLE (destroys every row)', re: /\bDROP\s+TABLE\b/ },
    { rule: 'TRUNCATE (empties the table)', re: /\bTRUNCATE\s+(?:TABLE\s+)?["a-zA-Z_]/ },
    { rule: 'ALTER TABLE … DROP COLUMN (loses the column for all rows)', re: /\bDROP\s+COLUMN\b/ },
  ];

  lines.forEach((text, i) => {
    // drizzle-kit push: exempt only when gated by ALLOW_DB_PUSH on the same line.
    if (/drizzle-kit\s+push/.test(text)) {
      if (!/ALLOW_DB_PUSH/.test(text) && !annotated(lines, i)) {
        findings.push({ file: rel, line: i + 1, rule: 'drizzle-kit push (can DROP/RECREATE a table against the live DB)', snippet: text.trim().slice(0, 120) });
      }
    }
    for (const { rule, re } of lineRules) {
      if (re.test(text) && !annotated(lines, i)) {
        findings.push({ file: rel, line: i + 1, rule, snippet: text.trim().slice(0, 120) });
      }
    }
  });

  // DELETE FROM with no WHERE in the same statement (window → next ';' or +400 chars).
  // Case-sensitive (see lineRules note) so an English "Delete from …" comment is ignored.
  const del = /\bDELETE\s+FROM\b/g;
  let m: RegExpExecArray | null;
  while ((m = del.exec(src))) {
    const start = m.index;
    const semi = src.indexOf(';', start);
    const win = src.slice(start, semi === -1 ? start + 400 : Math.min(semi, start + 400));
    const lineNo = src.slice(0, start).split('\n').length;
    if (!/\bWHERE\b/i.test(win) && !annotated(lines, lineNo - 1)) {
      findings.push({ file: rel, line: lineNo, rule: 'DELETE FROM with no WHERE (deletes every row)', snippet: win.replace(/\s+/g, ' ').trim().slice(0, 120) });
    }
  }

  return findings;
}

describe('Destructive-DB guard — no change may wipe a whole table for every agency', () => {
  it('contains no unannotated table-wide destructive operation in the DB surface area', () => {
    const files: string[] = [];
    for (const d of SCAN_DIRS) walk(join(REPO_ROOT, d), files);
    for (const f of SCAN_FILES) walk(join(REPO_ROOT, f), files);

    // Sanity: the scan must actually be finding the migration/schema files.
    expect(files.length).toBeGreaterThan(20);

    const findings = files.flatMap(scan);
    if (findings.length > 0) {
      const report = findings.map((f) => `  ${f.file}:${f.line} → ${f.rule}\n      ${f.snippet}`).join('\n');
      throw new Error(
        `Found ${findings.length} operation(s) that could delete a whole table's data for EVERY agency.\n\n` +
        `${report}\n\n` +
        `Apply schema changes the safe way instead:\n` +
        `  • additive change  → an idempotent statement (ADD COLUMN/CREATE … IF NOT EXISTS) in\n` +
        `    apps/web/src/instrumentation.ts, or a numbered apps/web/drizzle/NNNN_*.sql file.\n` +
        `  • If the operation is genuinely safe (e.g. it only ever runs against a disposable\n` +
        `    CI/local Postgres, never the shared DATABASE_URL), annotate that line or the line\n` +
        `    above it with "db-safe: <reason>".`,
      );
    }
    expect(findings).toEqual([]);
  });
});
