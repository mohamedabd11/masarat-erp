import { z } from 'zod';

export const customerFormSchema = z.object({
  type:                z.enum(['individual', 'company']).default('individual'),
  nameAr:              z.string().min(2, 'الاسم يجب أن يكون حرفين على الأقل'),
  nameEn:              z.string().optional(),
  phone:               z.string().min(9, 'رقم الهاتف يجب أن يكون 9 أرقام على الأقل').optional().or(z.literal('')),
  email:               z.string().email('البريد الإلكتروني غير صالح').optional().or(z.literal('')),
  gender:              z.enum(['male', 'female']).optional(),
  nationality:         z.string().default('SA'),
  nationalId:          z.string().regex(/^\d{10}$/, 'رقم الهوية يجب أن يكون 10 أرقام').optional().or(z.literal('')),
  passportNumber:      z.string().optional(),
  passportExpiry:      z.string().optional(),
  dateOfBirth:         z.string().optional(),
  vatNumber:           z.string().regex(/^3\d{14}$/, 'الرقم الضريبي يجب أن يكون 15 خانة ويبدأ بـ 3').optional().or(z.literal('')),
  notes:               z.string().optional(),
  openingBalanceSar:   z.coerce.number().min(0).optional(),
});

export type CustomerFormData = z.infer<typeof customerFormSchema>;
