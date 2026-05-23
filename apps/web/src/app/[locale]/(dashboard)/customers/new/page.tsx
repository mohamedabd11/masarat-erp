'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { ArrowRight, ArrowLeft, UserPlus } from 'lucide-react';
import { useAuth } from '@masarat/firebase';

// ─── Schema ───────────────────────────────────────────────────────────────────

const newCustomerSchema = z.object({
  nameAr: z.string().min(2, { message: 'الاسم يجب أن يكون حرفين على الأقل' }),
  nameEn: z.string().optional(),
  phone: z.string().min(9, { message: 'رقم الهاتف يجب أن يكون 9 أرقام على الأقل' }),
  email: z.string().email({ message: 'البريد الإلكتروني غير صالح' }).optional().or(z.literal('')),
  nationalId: z
    .string()
    .regex(/^\d{10}$/, { message: 'رقم الهوية يجب أن يكون 10 أرقام' })
    .optional()
    .or(z.literal('')),
  passportNumber: z.string().optional(),
  passportExpiry: z.string().optional(),
  nationality: z.string().default('SA'),
  dateOfBirth: z.string().optional(),
  vatNumber: z.string().optional(),
  notes: z.string().optional(),
});

type NewCustomerFormData = z.infer<typeof newCustomerSchema>;

// ─── Constants ────────────────────────────────────────────────────────────────

const NATIONALITY_OPTIONS = [
  { value: 'SA', labelAr: 'السعودية',   labelEn: 'Saudi Arabia' },
  { value: 'EG', labelAr: 'مصر',        labelEn: 'Egypt' },
  { value: 'JO', labelAr: 'الأردن',     labelEn: 'Jordan' },
  { value: 'PK', labelAr: 'باكستان',    labelEn: 'Pakistan' },
  { value: 'IN', labelAr: 'الهند',      labelEn: 'India' },
  { value: 'PH', labelAr: 'الفلبين',    labelEn: 'Philippines' },
  { value: 'BD', labelAr: 'بنغلاديش',   labelEn: 'Bangladesh' },
  { value: 'YE', labelAr: 'اليمن',      labelEn: 'Yemen' },
  { value: 'SY', labelAr: 'سوريا',      labelEn: 'Syria' },
  { value: 'IQ', labelAr: 'العراق',     labelEn: 'Iraq' },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function NewCustomerPage() {
  const locale = useLocale();
  const router = useRouter();
  const t = useTranslations('customers');
  const tCommon = useTranslations('common');
  const isRtl = locale === 'ar';
  const isAr = isRtl;

  const { user } = useAuth();
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<NewCustomerFormData>({
    resolver: zodResolver(newCustomerSchema),
    defaultValues: {
      nationality: 'SA',
    },
  });

  async function onSubmit(data: NewCustomerFormData) {
    if (!user) return;
    setSubmitting(true);
    try {
      const { getFirestore, collection, addDoc, Timestamp } = await import('firebase/firestore');
      const { getApp } = await import('@masarat/firebase');
      const db = getFirestore(getApp());
      const agencyId = user.agencyId;

      const customerRef = await addDoc(collection(db, 'customers'), {
        agencyId,
        type: 'individual',
        name: { ar: data.nameAr, en: data.nameEn ?? data.nameAr },
        mobile: data.phone,
        email: data.email ?? '',
        nationalId: data.nationalId ?? '',
        passportNumber: data.passportNumber ?? '',
        passportExpiry: data.passportExpiry ?? '',
        nationality: data.nationality ?? 'SA',
        dateOfBirth: data.dateOfBirth ?? '',
        vatNumber: data.vatNumber ?? '',
        notes: data.notes ?? '',
        tags: [],
        tier: 'standard',
        loyalty: { points: 0, totalEarned: 0 },
        stats: { totalBookings: 0, totalSpent: 0 },
        flags: { hasUnpaidBalance: false, isBlacklisted: false },
        isActive: true,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });

      router.push(`/${locale}/customers/${customerRef.id}`);
    } catch (err) {
      console.error('Failed to create customer:', err);
      setSubmitting(false);
    }
  }

  const BackIcon = isRtl ? ArrowRight : ArrowLeft;

  const nationalityOptions = NATIONALITY_OPTIONS.map((n) => ({
    value: n.value,
    label: isAr ? n.labelAr : n.labelEn,
  }));

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Page header */}
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={() => router.back()}
          className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors"
          aria-label={tCommon('back')}
        >
          <BackIcon size={18} />
        </button>
        <div className="flex items-center gap-2.5">
          <UserPlus size={22} className="text-brand-600" />
          <h1 className="text-xl font-bold text-slate-900">
            {isAr ? 'إضافة عميل جديد' : 'New Customer'}
          </h1>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
        {/* ── Section 1: Basic Info ─────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle>
              {isAr ? 'البيانات الأساسية' : 'Basic Information'}
            </CardTitle>
          </CardHeader>

          <div className="space-y-4">
            {/* Name row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label={isAr ? 'الاسم بالعربي' : 'Name (Arabic)'}
                required
                placeholder={isAr ? 'الاسم الكامل بالعربي' : 'Full name in Arabic'}
                error={errors.nameAr?.message}
                {...register('nameAr')}
              />
              <Input
                label={isAr ? 'الاسم بالإنجليزي' : 'Name (English)'}
                placeholder={isAr ? 'كما في جواز السفر' : 'As in passport'}
                error={errors.nameEn?.message}
                {...register('nameEn')}
              />
            </div>

            {/* Contact row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label={isAr ? 'رقم الهاتف' : 'Phone Number'}
                type="tel"
                required
                placeholder="05xxxxxxxx"
                dir="ltr"
                error={errors.phone?.message}
                {...register('phone')}
              />
              <Input
                label={isAr ? 'البريد الإلكتروني' : 'Email Address'}
                type="email"
                placeholder={isAr ? 'اختياري' : 'Optional'}
                dir="ltr"
                error={errors.email?.message}
                {...register('email')}
              />
            </div>

            {/* Nationality + DOB */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Select
                label={isAr ? 'الجنسية' : 'Nationality'}
                options={nationalityOptions}
                error={errors.nationality?.message}
                {...register('nationality')}
              />
              <Input
                label={isAr ? 'تاريخ الميلاد' : 'Date of Birth'}
                type="date"
                hint={isAr ? 'اختياري' : 'Optional'}
                error={errors.dateOfBirth?.message}
                {...register('dateOfBirth')}
              />
            </div>

            {/* National ID */}
            <Input
              label={isAr ? 'رقم الهوية الوطنية' : 'National ID Number'}
              placeholder={isAr ? '10 أرقام' : '10 digits'}
              hint={isAr ? 'يُطلب للمواطنين السعوديين' : 'Required for Saudi nationals'}
              dir="ltr"
              error={errors.nationalId?.message}
              {...register('nationalId')}
            />
          </div>
        </Card>

        {/* ── Section 2: Passport ──────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle>
              {isAr ? 'بيانات جواز السفر' : 'Passport Details'}
            </CardTitle>
          </CardHeader>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label={isAr ? 'رقم جواز السفر' : 'Passport Number'}
              placeholder="A12345678"
              hint={isAr ? 'اختياري' : 'Optional'}
              dir="ltr"
              error={errors.passportNumber?.message}
              {...register('passportNumber')}
            />
            <Input
              label={isAr ? 'تاريخ انتهاء الجواز' : 'Passport Expiry'}
              type="date"
              hint={isAr ? 'اختياري' : 'Optional'}
              error={errors.passportExpiry?.message}
              {...register('passportExpiry')}
            />
          </div>
        </Card>

        {/* ── Section 3: Billing ───────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle>
              {isAr ? 'بيانات الفوترة' : 'Billing Details'}
            </CardTitle>
          </CardHeader>

          <div className="space-y-4">
            <Input
              label={isAr ? 'الرقم الضريبي (للشركات)' : 'VAT Number (B2B)'}
              placeholder={isAr ? '15 رقماً (اختياري)' : '15 digits (optional)'}
              hint={
                isAr
                  ? 'أدخل الرقم الضريبي للعملاء من الشركات فقط'
                  : 'Enter VAT number for corporate customers only'
              }
              dir="ltr"
              error={errors.vatNumber?.message}
              {...register('vatNumber')}
            />

            {/* Notes */}
            <div className="space-y-1">
              <label className="block text-sm font-medium text-slate-700">
                {isAr ? 'ملاحظات' : 'Notes'}
                <span className="text-slate-400 font-normal ms-1.5 text-xs">
                  ({tCommon('optional')})
                </span>
              </label>
              <textarea
                rows={3}
                placeholder={
                  isAr
                    ? 'أي ملاحظات إضافية حول العميل...'
                    : 'Any additional notes about the customer...'
                }
                className="block w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent resize-none transition-colors"
                {...register('notes')}
              />
              {errors.notes?.message && (
                <p className="text-xs text-red-600">{errors.notes.message}</p>
              )}
            </div>
          </div>
        </Card>

        {/* ── Form Actions ─────────────────────────────────────────────── */}
        <div className="flex items-center justify-between gap-3 pb-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.back()}
            disabled={submitting}
          >
            <BackIcon size={15} />
            {tCommon('cancel')}
          </Button>

          <Button type="submit" loading={submitting}>
            {submitting
              ? isAr
                ? 'جارٍ الحفظ...'
                : 'Saving...'
              : isAr
              ? 'حفظ العميل'
              : 'Save Customer'}
          </Button>
        </div>
      </form>
    </div>
  );
}
