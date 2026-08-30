import { describe, expect, it } from 'vitest';
import { customerFormSchema } from '@/app/[locale]/(dashboard)/customers/new/customer-form-schema';

describe('customer form schema', () => {
  it('accepts a customer with only an Arabic name', () => {
    const result = customerFormSchema.safeParse({ nameAr: 'حساب تجريبي' });

    expect(result.success).toBe(true);
  });

  it('accepts an empty optional phone number', () => {
    const result = customerFormSchema.safeParse({ nameAr: 'حساب تجريبي', phone: '' });

    expect(result.success).toBe(true);
  });

  it('still validates a phone number when one is provided', () => {
    const result = customerFormSchema.safeParse({ nameAr: 'حساب تجريبي', phone: '123' });

    expect(result.success).toBe(false);
  });
});
