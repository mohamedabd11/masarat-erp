import { describe, expect, it } from 'vitest';
import {
  inclusiveCalendarDays,
  isIsoDate,
  isTime24h,
  isYearMonth,
  monthEnd,
  validDaysOfWeek,
} from '@/lib/hr-validation';

describe('HR input validation', () => {
  it('accepts real ISO dates and rejects impossible calendar dates', () => {
    expect(isIsoDate('2024-02-29')).toBe(true);
    expect(isIsoDate('2025-02-29')).toBe(false);
    expect(isIsoDate('2025-13-01')).toBe(false);
    expect(isIsoDate('01/09/2025')).toBe(false);
  });

  it('accepts only real year-month values', () => {
    expect(isYearMonth('2026-01')).toBe(true);
    expect(isYearMonth('2026-12')).toBe(true);
    expect(isYearMonth('2026-00')).toBe(false);
    expect(isYearMonth('2026-13')).toBe(false);
  });

  it('validates 24-hour times', () => {
    expect(isTime24h('00:00')).toBe(true);
    expect(isTime24h('23:59')).toBe(true);
    expect(isTime24h('24:00')).toBe(false);
    expect(isTime24h('09:60')).toBe(false);
  });

  it('calculates inclusive leave days without local-time drift', () => {
    expect(inclusiveCalendarDays('2026-01-01', '2026-01-01')).toBe(1);
    expect(inclusiveCalendarDays('2026-01-30', '2026-02-02')).toBe(4);
    expect(inclusiveCalendarDays('2026-02-02', '2026-01-30')).toBe(0);
  });

  it('returns the real last day of each month', () => {
    expect(monthEnd('2024-02')).toBe('2024-02-29');
    expect(monthEnd('2025-02')).toBe('2025-02-28');
    expect(monthEnd('2026-12')).toBe('2026-12-31');
  });

  it('rejects duplicate and out-of-range shift days', () => {
    expect(validDaysOfWeek([0, 1, 2, 3, 4])).toBe(true);
    expect(validDaysOfWeek([1, 1])).toBe(false);
    expect(validDaysOfWeek([7])).toBe(false);
    expect(validDaysOfWeek([])).toBe(false);
  });
});
