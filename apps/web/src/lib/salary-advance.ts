import { isYearMonth } from '@/lib/hr-validation';

export interface AdvanceInstallmentDraft {
  installmentNumber: number;
  dueMonth: string;
  amountHalalas: number;
}

interface BuildAdvanceInstallmentsInput {
  amountHalalas: number;
  firstMonth: string;
  monthlyCapHalalas: number;
  installmentCount?: number;
  committedByMonth?: ReadonlyMap<string, number>;
}

export function addMonths(month: string, offset: number): string {
  if (!isYearMonth(month) || !Number.isInteger(offset)) throw new Error('Invalid year-month or offset');
  const [year, monthNumber] = month.split('-').map(Number) as [number, number];
  const value = new Date(Date.UTC(year, monthNumber - 1 + offset, 1));
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function buildAdvanceInstallments(input: BuildAdvanceInstallmentsInput): AdvanceInstallmentDraft[] {
  if (!Number.isSafeInteger(input.amountHalalas) || input.amountHalalas <= 0) throw new Error('Advance amount must be positive');
  if (!isYearMonth(input.firstMonth)) throw new Error('First deduction month must be YYYY-MM');
  if (!Number.isSafeInteger(input.monthlyCapHalalas) || input.monthlyCapHalalas <= 0) throw new Error('Monthly cap must be positive');

  const minimumCount = Math.ceil(input.amountHalalas / input.monthlyCapHalalas);
  const count = input.installmentCount ?? minimumCount;
  if (!Number.isSafeInteger(count) || count <= 0 || count > 120) throw new Error('Installment count must be between 1 and 120');
  if (count < minimumCount) throw new Error(`Installment count must be at least ${minimumCount} to respect the monthly cap`);

  const base = Math.floor(input.amountHalalas / count);
  let remainder = input.amountHalalas % count;
  const rows: AdvanceInstallmentDraft[] = [];
  for (let i = 0; i < count; i++) {
    const dueMonth = addMonths(input.firstMonth, i);
    const amountHalalas = base + (remainder > 0 ? 1 : 0);
    remainder = Math.max(0, remainder - 1);
    const committed = input.committedByMonth?.get(dueMonth) ?? 0;
    if (committed + amountHalalas > input.monthlyCapHalalas) {
      throw new Error(`Monthly cap exceeded in ${dueMonth}`);
    }
    rows.push({ installmentNumber: i + 1, dueMonth, amountHalalas });
  }
  return rows;
}
