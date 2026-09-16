import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const migrationsDir = join(process.cwd(), 'drizzle');
const journal = JSON.parse(readFileSync(join(migrationsDir, 'meta', '_journal.json'), 'utf8')) as {
  entries: Array<{ idx: number; tag: string }>;
};

describe('registered database migration chain', () => {
  it('has one active SQL file for every journal entry in journal order', () => {
    const activeSql = readdirSync(migrationsDir)
      .filter(name => name.endsWith('.sql'))
      .sort();
    const tags = journal.entries.map(entry => entry.tag);

    expect(journal.entries.map(entry => entry.idx)).toEqual(
      Array.from({ length: journal.entries.length }, (_, idx) => idx),
    );
    expect(new Set(tags).size).toBe(tags.length);
    expect(activeSql).toEqual(tags.map(tag => `${tag}.sql`).sort());
  });

  it('keeps the latest schema snapshot aligned with the registered migration', () => {
    const last = journal.entries.at(-1);
    expect(last).toMatchObject({ idx: 7, tag: '0007_clever_living_mummy' });
    expect(readdirSync(join(migrationsDir, 'meta'))).toContain('0007_snapshot.json');
  });

  it('keeps data backfills and tenant protection in the registered HR migration', () => {
    const sql = readFileSync(join(migrationsDir, '0006_registered_schema_completion.sql'), 'utf8');
    expect(sql).toContain("'gosi-new-2028-07-01'");
    expect(sql).toContain('INSERT INTO salary_advance_installments');
    expect(sql).toContain("WHERE sa.status IN ('paid', 'deducted', 'repaid')");
    expect(sql).toContain('employee_terminations_open_uq');
    expect(sql).toContain('FORCE ROW LEVEL SECURITY');
  });

  it('registers and backfills invoice credit and cancellation balances', () => {
    const sql = readFileSync(join(migrationsDir, '0007_clever_living_mummy.sql'), 'utf8');
    expect(sql).toContain('ADD COLUMN "credited_halalas"');
    expect(sql).toContain('ADD COLUMN "cancelled_halalas"');
    expect(sql).toContain('SUM("total_halalas")');
    expect(sql).toContain('WHERE "status" = \'refunded\'');
  });
});
