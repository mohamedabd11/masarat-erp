/**
 * Accounting period lock guard.
 *
 * Call assertPeriodOpen(agencyId, dateStr, tx) before inserting any journal
 * entry. It throws a descriptive Arabic error if the period is closed,
 * preventing retroactive modification of audited periods.
 */
import { eq, and } from 'drizzle-orm';
import { accountingPeriods } from '@/lib/schema';
import { BusinessError } from '@/lib/api-auth';
import type { db as DbType } from '@/lib/db';

type Tx = Parameters<Parameters<typeof DbType.transaction>[0]>[0];

export async function assertPeriodOpen(
  agencyId: string,
  dateStr:  string,           // YYYY-MM-DD
  tx:       Tx | typeof DbType,
): Promise<void> {
  const parts = dateStr.split('-');
  const year  = parseInt(parts[0] ?? '0', 10);
  const month = parseInt(parts[1] ?? '0', 10);

  if (!year || !month) return; // malformed date — let the DB reject it

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
    // Throw BusinessError (422) so the standard route catch blocks surface a clear
    // 4xx with this Arabic message instead of masking it as a generic HTTP 500.
    throw new BusinessError(
      `الفترة المحاسبية ${periodLabel} مقفلة — لا يمكن إنشاء قيود جديدة${period.notes ? ': ' + period.notes : ''}`,
      422,
    );
  }
}
