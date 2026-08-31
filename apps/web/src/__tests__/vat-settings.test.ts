import { describe, expect, it } from 'vitest';
import { validateVatSettings } from '@/lib/vat-settings';

describe('validateVatSettings', () => {
  it('allows a non-registered business without a VAT number', () => {
    expect(validateVatSettings({ isVatRegistered: false, vatNumber: '', vatRate: 0 })).toBeNull();
  });

  it('requires a VAT number when registration is enabled', () => {
    expect(validateVatSettings({ isVatRegistered: true, vatNumber: '', vatRate: 15 }))
      .toBe('vat_number_required');
  });

  it('rejects an invalid Saudi VAT number', () => {
    expect(validateVatSettings({ isVatRegistered: true, vatNumber: '310000000000003', vatRate: 15 }))
      .toBe('vat_number_invalid');
  });

  it('accepts a valid Saudi VAT number and supported rate', () => {
    expect(validateVatSettings({ isVatRegistered: true, vatNumber: '300000000000003', vatRate: 15 }))
      .toBeNull();
  });

  it('rejects an unsupported VAT rate', () => {
    expect(validateVatSettings({ isVatRegistered: true, vatNumber: '300000000000003', vatRate: 7 }))
      .toBe('vat_rate_unsupported');
  });

  it('rejects a zero rate when VAT registration is enabled', () => {
    expect(validateVatSettings({ isVatRegistered: true, vatNumber: '300000000000003', vatRate: 0 }))
      .toBe('vat_rate_unsupported');
  });
});
