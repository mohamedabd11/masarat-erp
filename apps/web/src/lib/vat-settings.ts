export const VAT_NUMBER_PATTERN = /^300\d{12}$/;
export const SUPPORTED_VAT_RATES = new Set([0, 5, 10, 15, 20]);

export type VatSettingsIssue =
  | 'vat_number_required'
  | 'vat_number_invalid'
  | 'vat_rate_unsupported';

export function validateVatSettings(input: {
  isVatRegistered?: boolean;
  vatNumber?: string;
  vatRate?: number;
}): VatSettingsIssue | null {
  const vatNumber = input.vatNumber?.trim() ?? '';

  if (input.isVatRegistered === true && !vatNumber) return 'vat_number_required';
  if (vatNumber && !VAT_NUMBER_PATTERN.test(vatNumber)) return 'vat_number_invalid';
  if (input.vatRate !== undefined
      && (!SUPPORTED_VAT_RATES.has(input.vatRate) || (input.isVatRegistered === true && input.vatRate === 0))) {
    return 'vat_rate_unsupported';
  }
  return null;
}

export function vatSettingsIssueMessage(issue: VatSettingsIssue, isAr = true): string {
  const messages = {
    vat_number_required: {
      ar: 'الرقم الضريبي مطلوب عند تفعيل التسجيل الضريبي',
      en: 'A VAT number is required when VAT registration is enabled',
    },
    vat_number_invalid: {
      ar: 'الرقم الضريبي يجب أن يكون 15 خانة ويبدأ بـ 300',
      en: 'The VAT number must be 15 digits and start with 300',
    },
    vat_rate_unsupported: {
      ar: 'معدل الضريبة غير مدعوم',
      en: 'The VAT rate is not supported',
    },
  } satisfies Record<VatSettingsIssue, { ar: string; en: string }>;

  return messages[issue][isAr ? 'ar' : 'en'];
}
