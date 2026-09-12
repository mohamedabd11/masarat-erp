import { describe, expect, it } from 'vitest';
import { canRecordTerminationPayment } from '@/lib/employee-lifecycle-ui';

describe('termination payment UI', () => {
  it('requires an explicit payment date on or after termination', () => {
    expect(canRecordTerminationPayment('', '2026-09-11')).toBe(false);
    expect(canRecordTerminationPayment('2026-09-10', '2026-09-11')).toBe(false);
    expect(canRecordTerminationPayment('2026-09-11', '2026-09-11')).toBe(true);
    expect(canRecordTerminationPayment('2026-09-12', '2026-09-11')).toBe(true);
  });
});
