/**
 * Accounting period lock guard.
 *
 * Call assertPeriodOpen(agencyId, dateStr, tx) before inserting any journal
 * entry. It throws a descriptive Arabic error if the period is closed,
 * preventing retroactive modification of audited periods.
 */
import { eq, and, desc } from 'drizzle-orm';
import { accountingPeriods } from '@/lib/schema';
import type { db as DbType } from '@/lib/db';
import { BusinessError } from '@/lib/api-auth';

type Tx = Parameters<Parameters<typeof DbType.transaction>[0]>[0];

export async function assertPeriodOpen(
  agencyId: string,
  dateStr:  string,           // YYYY-MM-DD
  tx:       Tx | typeof DbType,
): Promise<void> {
  const parts = dateStr.split('-');
  const year  = parseInt(parts[0] ?? '0', 10);
  const month = parseInt(parts[1] ?? '0', 10);

  if (!Number.isFinite(year) || !Number.isFinite(month) || year < 2000 || month < 1 || month > 12) {
    throw new BusinessError('تاريخ غير صالح — لا يمكن تحديد الفترة المحاسبية', 400);
  }

  const [period] = await (tx as typeof DbType)
    .select({ isLocked: accountingPeriods.isLocked, notes: accountingPeriods.notes })
    .from(accountingPeriods)
    .where(and(
      eq(accountingPeriods.agencyId, agencyId),
      eq(accountingPeriods.periodYear, year),
      eq(accountingPeriods.periodMonth, month),
    ))
    .limit(1);

  if (period?.isLocked) {
    const periodLabel = `${year}/${String(month).padStart(2, '0')}`;
    throw new BusinessError(
      `الفترة المحاسبية ${periodLabel} مقفلة — لا يمكن إنشاء قيود جديدة${period.notes ? ': ' + period.notes : ''}`,
      422,
    );
  }

  // MED-1: close the open-by-default hole. Books close sequentially, so a month
  // with NO explicit period row that falls at/before the latest LOCKED period is
  // implicitly closed — otherwise a backdated posting into a never-opened month
  // always slips through. An explicit (even unlocked) row is respected as a
  // deliberate reopen, so this only applies when no row exists for the target month.
  if (!period) {
    const [latestLocked] = await (tx as typeof DbType)
      .select({ y: accountingPeriods.periodYear, m: accountingPeriods.periodMonth })
      .from(accountingPeriods)
      .where(and(eq(accountingPeriods.agencyId, agencyId), eq(accountingPeriods.isLocked, true)))
      .orderBy(desc(accountingPeriods.periodYear), desc(accountingPeriods.periodMonth))
      .limit(1);

    if (latestLocked && (year * 12 + month) <= (latestLocked.y * 12 + latestLocked.m)) {
      throw new BusinessError(
        `الفترة المحاسبية ${year}/${String(month).padStart(2, '0')} مقفلة — الكتب مقفلة حتى ${latestLocked.y}/${String(latestLocked.m).padStart(2, '0')}`,
        422,
      );
    }
  }
}
