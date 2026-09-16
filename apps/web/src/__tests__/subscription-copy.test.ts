import { describe, expect, it } from 'vitest';
import { formatTrialDaysRemaining, remainingDaysUnit } from '@/lib/subscription-copy';

describe('subscription copy', () => {
  it.each([
    [1, 'متبقي يوم واحد على انتهاء الفترة التجريبية'],
    [2, 'متبقي يومان على انتهاء الفترة التجريبية'],
    [3, 'متبقي 3 أيام على انتهاء الفترة التجريبية'],
    [10, 'متبقي 10 أيام على انتهاء الفترة التجريبية'],
    [11, 'متبقي 11 يومًا على انتهاء الفترة التجريبية'],
  ])('formats Arabic trial days for %i', (days, expected) => {
    expect(formatTrialDaysRemaining(days, 'ar')).toBe(expected);
  });

  it('formats English trial days', () => {
    expect(formatTrialDaysRemaining(1, 'en')).toBe('1 day remaining in your free trial');
    expect(formatTrialDaysRemaining(11, 'en')).toBe('11 days remaining in your free trial');
  });

  it('formats the compact remaining-days unit', () => {
    expect(remainingDaysUnit(2, 'ar')).toBe('يومان متبقيان');
    expect(remainingDaysUnit(11, 'ar')).toBe('يومًا متبقيًا');
    expect(remainingDaysUnit(1, 'en')).toBe('day left');
    expect(remainingDaysUnit(3, 'en')).toBe('days left');
  });
});
