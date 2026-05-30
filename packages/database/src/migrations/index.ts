/**
 * Migration Runner — ينفذ SQL migrations بالترتيب
 *
 * الاستخدام:
 * pnpm --filter @masarat/database db:migrate
 *
 * أو في CI/CD:
 * DATABASE_URL=... node -e "import('./src/migrations/index.ts').then(m => m.runMigrations())"
 */

import { neon } from '@neondatabase/serverless';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const MIGRATIONS = [
  '001_initial_schema.sql',
  '002_row_level_security.sql',
] as const;

export async function runMigrations(databaseUrl?: string): Promise<void> {
  const url = databaseUrl ?? process.env['DATABASE_URL'];
  if (!url) throw new Error('DATABASE_URL is required');

  const sql = neon(url);

  // إنشاء جدول تتبع الـ migrations إذا لم يكن موجوداً
  await sql`
    CREATE TABLE IF NOT EXISTS _migrations (
      id         SERIAL PRIMARY KEY,
      filename   VARCHAR(255) NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  for (const filename of MIGRATIONS) {
    // التحقق من تطبيق الـ migration مسبقاً
    const [existing] = await sql`
      SELECT id FROM _migrations WHERE filename = ${filename}
    `;

    if (existing) {
      console.log(`⏭️  Skipping (already applied): ${filename}`);
      continue;
    }

    console.log(`⏳ Applying migration: ${filename}`);

    const filePath = join(__dirname, filename);
    const migrationSQL = readFileSync(filePath, 'utf-8');

    // تنفيذ الـ migration
    await sql.transaction((tsql) => [
      tsql(migrationSQL as unknown as TemplateStringsArray),
      tsql`INSERT INTO _migrations (filename) VALUES (${filename})`,
    ]);

    console.log(`✅ Applied: ${filename}`);
  }

  console.log('\n🎉 All migrations applied successfully!');
}

// تشغيل مباشر (عند استدعاء الملف مباشرة)
if (import.meta.url === `file://${process.argv[1]}`) {
  runMigrations().catch((error) => {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  });
}
