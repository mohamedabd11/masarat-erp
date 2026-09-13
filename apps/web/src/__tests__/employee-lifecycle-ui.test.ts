import { describe, expect, it } from 'vitest';
import {
  attendanceTimeInput,
  buildAttendanceMutation,
  canRecordTerminationPayment,
  localAttendanceTimestamp,
} from '@/lib/employee-lifecycle-ui';

describe('termination payment UI', () => {
  it('requires an explicit payment date on or after termination', () => {
    expect(canRecordTerminationPayment('', '2026-09-11')).toBe(false);
    expect(canRecordTerminationPayment('2026-09-10', '2026-09-11')).toBe(false);
    expect(canRecordTerminationPayment('2026-09-11', '2026-09-11')).toBe(true);
    expect(canRecordTerminationPayment('2026-09-12', '2026-09-11')).toBe(true);
  });
});

describe('attendance editor UI', () => {
  it('builds an edit payload without immutable employee and date fields', () => {
    const payload = buildAttendanceMutation({
      employeeId: 'emp-1',
      date: '2026-09-01',
      status: 'present',
      checkIn: '08:00',
      checkOut: '17:00',
      notes: '  updated  ',
    }, 'edit');

    expect(payload).not.toHaveProperty('employeeId');
    expect(payload).not.toHaveProperty('date');
    expect(payload).toMatchObject({ status: 'present', notes: 'updated' });
    expect(payload.checkIn).toBe(localAttendanceTimestamp('2026-09-01', '08:00'));
    expect(payload.checkOut).toBe(localAttendanceTimestamp('2026-09-01', '17:00'));
  });

  it('clears stale times when an edited record becomes absent', () => {
    expect(buildAttendanceMutation({
      employeeId: 'emp-1',
      date: '2026-09-01',
      status: 'absent',
      checkIn: '08:00',
      checkOut: '17:00',
      notes: '',
    }, 'edit')).toEqual({
      status: 'absent',
      notes: '',
      checkIn: null,
      checkOut: null,
    });
  });

  it('keeps overnight attendance on the following day', () => {
    const payload = buildAttendanceMutation({
      employeeId: 'emp-1',
      date: '2026-09-02',
      status: 'present',
      checkIn: '22:00',
      checkOut: '06:00',
      notes: '',
    }, 'create');

    expect(payload.checkOut).toBe(localAttendanceTimestamp('2026-09-02', '06:00', true));
  });

  it('formats stored timestamps for the time input', () => {
    const stored = localAttendanceTimestamp('2026-09-03', '09:15');
    expect(attendanceTimeInput(stored)).toBe('09:15');
    expect(attendanceTimeInput(null)).toBe('');
    expect(attendanceTimeInput('not-a-date')).toBe('');
  });
});
