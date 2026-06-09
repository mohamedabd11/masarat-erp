import { lt, eq, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { paymentPlanInstallments } from '@/lib/schema';

export async function markOverdueInstallments(now: Date): Promise<{ marked: number; errors: number }> {
  const today = now.toISOString().split('T')[0]!;
  try {
    const result = await db.update(paymentPlanInstallments)
      .set({ status: 'overdue', updatedAt: now })
      .where(and(
        eq(paymentPlanInstallments.status, 'pending'),
        lt(paymentPlanInstallments.dueDate, today),
      ))
      .returning({ id: paymentPlanInstallments.id });
    return { marked: result.length, errors: 0 };
  } catch (err) {
    console.error(JSON.stringify({ event: 'mark_overdue_installments_failed', error: String(err) }));
    return { marked: 0, errors: 1 };
  }
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function addMonths(dateStr: string, months: number): string {
  const orig = new Date(dateStr);
  const origDay = orig.getDate();
  const d = new Date(dateStr);
  d.setDate(1);                       // avoid overflow during month change
  d.setMonth(d.getMonth() + months);
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = Math.min(origDay, daysInMonth(y, m));
  return `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function generateInstallmentSchedule(
  totalAmountHalalas: number,
  numInstallments: number,
  firstDueDate: string,
): { installmentNumber: number; dueDate: string; amountHalalas: number }[] {
  const perInstallment = Math.floor(totalAmountHalalas / numInstallments);
  const remainder = totalAmountHalalas - perInstallment * numInstallments;

  return Array.from({ length: numInstallments }, (_, i) => ({
    installmentNumber: i + 1,
    dueDate:           addMonths(firstDueDate, i),
    amountHalalas:     i === numInstallments - 1 ? perInstallment + remainder : perInstallment,
  }));
}
