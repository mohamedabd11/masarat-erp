export function canRecordTerminationPayment(
  paymentDate: string,
  terminationDate: string,
): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(paymentDate) && paymentDate >= terminationDate;
}
