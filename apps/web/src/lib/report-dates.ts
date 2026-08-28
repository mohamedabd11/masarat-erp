const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isStrictIsoDate(value: string): boolean {
  const match = ISO_DATE.exec(value);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));

  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day;
}

export type ReportRangeValidation =
  | { valid: true }
  | { valid: false; error: string };

export function validateReportRange(from: string, to: string): ReportRangeValidation {
  if (!isStrictIsoDate(from) || !isStrictIsoDate(to)) {
    return { valid: false, error: 'صيغة التاريخ يجب أن تكون YYYY-MM-DD وتمثل تاريخاً صحيحاً' };
  }
  if (from > to) {
    return { valid: false, error: 'تاريخ البداية يجب ألا يكون بعد تاريخ النهاية' };
  }
  return { valid: true };
}

export function todayIsoDate(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}
