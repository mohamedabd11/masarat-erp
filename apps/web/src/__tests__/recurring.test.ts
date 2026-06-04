/**
 * Unit tests for calcNextIssueDate (pure schedule arithmetic, no DB).
 */
import { describe, it, expect } from 'vitest';
import { calcNextIssueDate } from '@/lib/recurring';

const from = (s: string) => new Date(s + 'T00:00:00Z');

describe('calcNextIssueDate', () => {
  it('weekly → +7 days', () => {
    expect(calcNextIssueDate('weekly', 1, from('2026-01-01'))).toBe('2026-01-08');
    expect(calcNextIssueDate('weekly', 1, from('2026-01-28'))).toBe('2026-02-04'); // crosses month
  });

  it('monthly → +1 month, same day', () => {
    expect(calcNextIssueDate('monthly', 15, from('2026-01-15'))).toBe('2026-02-15');
    expect(calcNextIssueDate('monthly', 15, from('2026-11-15'))).toBe('2026-12-15');
  });

  it('monthly → rolls the year over December', () => {
    expect(calcNextIssueDate('monthly', 10, from('2026-12-10'))).toBe('2027-01-10');
  });

  it('monthly → clamps to month end WITHOUT skipping a month (the bug fix)', () => {
    // Jan 31 monthly must land on Feb 28 (2026 is not a leap year), not Mar 31.
    expect(calcNextIssueDate('monthly', 31, from('2026-01-31'))).toBe('2026-02-28');
    // Feb → Mar restores the 31st.
    expect(calcNextIssueDate('monthly', 31, from('2026-02-28'))).toBe('2026-03-31');
    // Leap-year February.
    expect(calcNextIssueDate('monthly', 31, from('2028-01-31'))).toBe('2028-02-29');
  });

  it('quarterly → +3 months with clamping', () => {
    expect(calcNextIssueDate('quarterly', 15, from('2026-01-15'))).toBe('2026-04-15');
    expect(calcNextIssueDate('quarterly', 30, from('2026-11-30'))).toBe('2027-02-28'); // year + month-end
  });

  it('yearly → +1 year, clamps Feb 29 → Feb 28', () => {
    expect(calcNextIssueDate('yearly', 1, from('2026-03-01'))).toBe('2027-03-01');
    expect(calcNextIssueDate('yearly', 29, from('2028-02-29'))).toBe('2029-02-28');
  });

  it('unknown frequency → no advance (defensive)', () => {
    expect(calcNextIssueDate('hourly', 1, from('2026-05-05'))).toBe('2026-05-05');
  });
});
