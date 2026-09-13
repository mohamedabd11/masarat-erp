export function canRecordTerminationPayment(
  paymentDate: string,
  terminationDate: string,
): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(paymentDate) && paymentDate >= terminationDate;
}

export interface AttendanceEditorValues {
  employeeId: string;
  date: string;
  status: string;
  checkIn: string;
  checkOut: string;
  notes: string;
}

export function isNoAttendanceStatus(status: string): boolean {
  return status === 'absent' || status === 'on_leave';
}

export function localAttendanceTimestamp(date: string, time: string, addDay = false): string {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  const [hour, minute] = time.split(':').map(Number) as [number, number];
  return new Date(year, month - 1, day + (addDay ? 1 : 0), hour, minute, 0, 0).toISOString();
}

export function attendanceTimeInput(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export function buildAttendanceMutation(
  values: AttendanceEditorValues,
  mode: 'create' | 'edit',
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    status: values.status,
    notes: values.notes.trim() || (mode === 'edit' ? '' : undefined),
  };

  if (mode === 'create') {
    payload.employeeId = values.employeeId;
    payload.date = values.date;
  }

  if (isNoAttendanceStatus(values.status)) {
    if (mode === 'edit') {
      payload.checkIn = null;
      payload.checkOut = null;
    }
    return payload;
  }

  if (values.checkIn) {
    payload.checkIn = localAttendanceTimestamp(values.date, values.checkIn);
  } else if (mode === 'edit') {
    payload.checkIn = null;
  }

  if (values.checkOut) {
    payload.checkOut = localAttendanceTimestamp(
      values.date,
      values.checkOut,
      Boolean(values.checkIn) && values.checkOut <= values.checkIn,
    );
  } else if (mode === 'edit') {
    payload.checkOut = null;
  }

  return payload;
}
