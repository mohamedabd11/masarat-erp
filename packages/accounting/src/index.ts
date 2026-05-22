/**
 * @masarat/accounting — Public API
 *
 * كل ما يحتاجه الـ Cloud Function أو الـ Frontend من هذه الحزمة.
 */

// الدالة الرئيسية
export { generateJournalEntry } from './engine';

// أدوات المبالغ المالية
export {
  fromSAR,
  toSAR,
  formatSAR,
  calculateVat,
  addVat,
  extractVat,
  sumHalalas,
  assertValidHalalas,
} from './money';

// الـ Validator (للاستخدام المستقل إذا لزم)
export {
  validateBalance,
  validateAndCorrect,
  applyRoundingCorrection,
  AccountingValidationError,
} from './validator';

// جميع الأنواع
export type {
  Halalas,
  RevenueModel,
  VatCategory,
  BookingType,
  JournalEntryType,
  JournalLine,
  AccountMapping,
  AgencyAccountingConfig,
  AgentPaymentReceivedInput,
  AgentServiceDeliveredInput,
  PrincipalPaymentReceivedInput,
  PrincipalRevenueRecognitionInput,
  RefundInput,
  TransactionInput,
  JournalEntryResult,
  ValidationResult,
} from './types';
