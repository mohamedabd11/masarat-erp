const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const YEAR_MONTH = /^(\d{4})-(\d{2})$/;
const TIME_24H = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = ISO_DATE.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

export function isYearMonth(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = YEAR_MONTH.exec(value);
  return !!match && Number(match[2]) >= 1 && Number(match[2]) <= 12;
}

export function isTime24h(value: unknown): value is string {
  return typeof value === 'string' && TIME_24H.test(value);
}

export function isNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

export function inclusiveCalendarDays(startDate: string, endDate: string): number {
  if (!isIsoDate(startDate) || !isIsoDate(endDate) || endDate < startDate) return 0;
  const start = Date.parse(`${startDate}T00:00:00.000Z`);
  const end = Date.parse(`${endDate}T00:00:00.000Z`);
  return Math.floor((end - start) / 86_400_000) + 1;
}

export function monthStart(month: string): string {
  return `${month}-01`;
}

export function monthEnd(month: string): string {
  if (!isYearMonth(month)) throw new Error('Invalid year-month');
  const [year, monthNumber] = month.split('-').map(Number) as [number, number];
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return `${month}-${String(lastDay).padStart(2, '0')}`;
}

export function dateInTimeZone(now = new Date(), timeZone = 'Asia/Riyadh'): string {
  const parts = new Intl.DateTimeFormat('en-US-u-ca-gregory-nu-latn', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

/**
 * Returns the accounting date for a payroll accrual.
 * Past payroll is posted at month-end, current payroll at the approval date,
 * and future payroll is rejected so a disbursement can never precede accrual.
 */
export function payrollPostingDate(month: string, asOfDate: string): string | null {
  if (!isYearMonth(month) || !isIsoDate(asOfDate)) return null;
  const asOfMonth = asOfDate.slice(0, 7);
  if (month > asOfMonth) return null;
  return month === asOfMonth ? asOfDate : monthEnd(month);
}

export function parseValidTimestamp(value: unknown): Date | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

export function validDaysOfWeek(value: unknown): value is number[] {
  return Array.isArray(value)
    && value.length > 0
    && value.every((day) => Number.isInteger(day) && day >= 0 && day <= 6)
    && new Set(value).size === value.length;
}
