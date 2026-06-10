'use client';

import { useState } from 'react';
import { useLocale } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { cn } from '@/lib/utils';
import { ArrowRight, ArrowLeft, UserPlus, Building2, User } from 'lucide-react';
import { useAuth } from '@masarat/firebase';
import { apiFetch } from '@/lib/api-client';
import { COUNTRIES } from '@/lib/countries';

// ─── Schema ───────────────────────────────────────────────────────────────────

const schema = z.object({
  type:                z.enum(['individual', 'company']).default('individual'),
  nameAr:              z.string().min(2, 'الاسم يجب أن يكون حرفين على الأقل'),
  nameEn:              z.string().optional(),
  phone:               z.string().min(9, 'رقم الهاتف يجب أن يكون 9 أرقام على الأقل'),
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

type FormData = z.infer<typeof schema>;

// ─── Component ────────────────────────────────────────────────────────────────

export default function NewCustomerPage() {
  const locale      = useLocale();
  const router      = useRouter();
  const isAr        = locale === 'ar';
  const { user }    = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState('');

  const BackIcon = isAr ? ArrowRight : ArrowLeft;

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { type: 'individual', nationality: isAr ? 'السعودية' : 'Saudi Arabia', gender: 'male' },
  });

  const customerType = watch('type');
  const isCompany    = customerType === 'company';

  async function onSubmit(data: FormData) {
    if (!user) return;
    setSubmitting(true);
    setServerError('');
    try {
      const result = await apiFetch<{ id: string }>('/api/customers', {
        method: 'POST',
        body: JSON.stringify({
          nameAr:         data.nameAr,
          nameEn:         data.nameEn || data.nameAr,
          phone:          data.phone,
          email:          data.email || null,
          nationality:    data.nationality,
          nationalId:     data.nationalId || null,
          passportNumber: data.passportNumber || null,
          dateOfBirth:    data.dateOfBirth || null,
          vatNumber:           data.vatNumber || null,
          notes:               data.notes || null,
          openingBalanceHalalas: Math.round((data.openingBalanceSar ?? 0) * 100),
        }),
      });
      router.push(`/${locale}/customers/${result.id}`);
    } catch {
      setServerError(isAr ? 'حدث خطأ أثناء الحفظ، حاول مرة أخرى' : 'Error saving, please try again');
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-5 pb-10">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => router.back()}
          className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors"
        >
          <BackIcon size={18} />
        </button>
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-brand-100 flex items-center justify-center">
            <UserPlus size={18} className="text-brand-600" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900">
              {isAr ? 'إضافة عميل جديد' : 'New Customer'}
            </h1>
            <p className="text-xs text-slate-500">
              {isAr ? 'أدخل بيانات العميل' : 'Enter customer details'}
            </p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">

        {/* ── Customer Type Toggle ──────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle>{isAr ? 'نوع العميل' : 'Customer Type'}</CardTitle>
          </CardHeader>
          <div className="grid grid-cols-2 gap-3">
            {[
              { value: 'individual', ar: 'فرد', en: 'Individual', icon: User,     descAr: 'عميل شخصي أو مسافر', descEn: 'Personal or traveler' },
              { value: 'company',   ar: 'شركة', en: 'Company',    icon: Building2, descAr: 'شركة أو مؤسسة تجارية', descEn: 'Company or business' },
            ].map(opt => {
              const Icon    = opt.icon;
              const active  = customerType === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setValue('type', opt.value as 'individual' | 'company')}
                  className={cn(
                    'flex items-center gap-3 p-4 rounded-xl border-2 text-start transition-all',
                    active
                      ? 'border-brand-400 bg-brand-50 shadow-sm'
                      : 'border-slate-200 bg-white hover:border-slate-300',
                  )}
                >
                  <div className={cn(
                    'w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0',
                    active ? 'bg-brand-600' : 'bg-slate-100',
                  )}>
                    <Icon size={18} className={active ? 'text-white' : 'text-slate-500'} />
                  </div>
                  <div>
                    <p className={cn('text-sm font-bold', active ? 'text-brand-700' : 'text-slate-700')}>
                      {isAr ? opt.ar : opt.en}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {isAr ? opt.descAr : opt.descEn}
                    </p>
                  </div>
                  {active && (
                    <div className="ms-auto w-5 h-5 rounded-full bg-brand-600 flex items-center justify-center flex-shrink-0">
                      <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                        <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </Card>

        {/* ── Basic Info ───────────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle>
              {isAr
                ? isCompany ? 'بيانات الشركة' : 'البيانات الأساسية'
                : isCompany ? 'Company Info' : 'Basic Information'}
            </CardTitle>
          </CardHeader>
          <div className="space-y-4">

            {/* Names */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label={isAr
                  ? isCompany ? 'اسم الشركة (عربي) *' : 'الاسم بالعربي *'
                  : isCompany ? 'Company Name (Arabic) *' : 'Name (Arabic) *'}
                required
                placeholder={isAr
                  ? isCompany ? 'الاسم التجاري بالعربي' : 'الاسم الكامل بالعربي'
                  : isCompany ? 'Company Arabic name' : 'Full name in Arabic'}
                error={errors.nameAr?.message}
                {...register('nameAr')}
              />
              <Input
                label={isAr
                  ? isCompany ? 'اسم الشركة (إنجليزي)' : 'الاسم بالإنجليزي'
                  : isCompany ? 'Company Name (English)' : 'Name (English)'}
                placeholder={isAr
                  ? isCompany ? 'Commercial name' : 'كما في جواز السفر'
                  : isCompany ? 'اختياري' : 'As in passport'}
                dir="ltr"
                error={errors.nameEn?.message}
                {...register('nameEn')}
              />
            </div>

            {/* Contact */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label={isAr ? 'رقم الهاتف *' : 'Phone *'}
                type="tel"
                required
                placeholder="05xxxxxxxx"
                dir="ltr"
                error={errors.phone?.message}
                {...register('phone')}
              />
              <Input
                label={isAr ? 'البريد الإلكتروني' : 'Email'}
                type="email"
                placeholder={isAr ? 'اختياري' : 'Optional'}
                dir="ltr"
                error={errors.email?.message}
                {...register('email')}
              />
            </div>

            {/* Individual-only fields */}
            {!isCompany && (
              <>
                {/* Gender + Nationality */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Gender */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">
                      {isAr ? 'الجنس' : 'Gender'}
                    </label>
                    <div className="flex gap-2">
                      {[
                        { value: 'male',   ar: 'ذكر',  en: 'Male'   },
                        { value: 'female', ar: 'أنثى', en: 'Female' },
                      ].map(g => {
                        const current = watch('gender');
                        const active  = current === g.value;
                        return (
                          <button
                            key={g.value}
                            type="button"
                            onClick={() => setValue('gender', g.value as 'male' | 'female')}
                            className={cn(
                              'flex-1 py-2 rounded-lg border-2 text-sm font-medium transition-all',
                              active
                                ? 'border-brand-400 bg-brand-50 text-brand-700'
                                : 'border-slate-200 text-slate-500 hover:border-slate-300',
                            )}
                          >
                            {isAr ? g.ar : g.en}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Nationality */}
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">
                      {isAr ? 'الجنسية' : 'Nationality'}
                    </label>
                    <input
                      type="text"
                      list="countries-datalist"
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                      placeholder={isAr ? 'اختر أو اكتب الجنسية...' : 'Select or type nationality...'}
                      {...register('nationality')}
                    />
                    <datalist id="countries-datalist">
                      {COUNTRIES.map(c => (
                        <option key={c.code} value={isAr ? c.ar : c.en} />
                      ))}
                    </datalist>
                  </div>
                </div>

                {/* DOB + National ID */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input
                    label={isAr ? 'تاريخ الميلاد' : 'Date of Birth'}
                    type="date"
                    hint={isAr ? 'اختياري' : 'Optional'}
                    {...register('dateOfBirth')}
                  />
                  <Input
                    label={isAr ? 'رقم الهوية الوطنية' : 'National ID'}
                    placeholder={isAr ? '10 أرقام' : '10 digits'}
                    hint={isAr ? 'للمواطنين السعوديين' : 'Saudi nationals'}
                    dir="ltr"
                    error={errors.nationalId?.message}
                    {...register('nationalId')}
                  />
                </div>
              </>
            )}

            {/* Company-only: VAT number */}
            {isCompany && (
              <Input
                label={isAr ? 'الرقم الضريبي (VAT)' : 'VAT Number'}
                placeholder={isAr ? '15 رقماً (اختياري)' : '15 digits (optional)'}
                hint={isAr ? 'للشركات المسجلة بضريبة القيمة المضافة' : 'For VAT-registered companies'}
                dir="ltr"
                error={errors.vatNumber?.message}
                {...register('vatNumber')}
              />
            )}

          </div>
        </Card>

        {/* ── Passport (individuals only) ───────────────────────────────── */}
        {!isCompany && (
          <Card>
            <CardHeader>
              <CardTitle>{isAr ? 'بيانات جواز السفر' : 'Passport Details'}</CardTitle>
            </CardHeader>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label={isAr ? 'رقم جواز السفر' : 'Passport Number'}
                placeholder="A12345678"
                hint={isAr ? 'اختياري' : 'Optional'}
                dir="ltr"
                {...register('passportNumber')}
              />
              <Input
                label={isAr ? 'تاريخ انتهاء الجواز' : 'Passport Expiry'}
                type="date"
                hint={isAr ? 'اختياري' : 'Optional'}
                {...register('passportExpiry')}
              />
            </div>
          </Card>
        )}

        {/* ── Opening Balance ───────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle>{isAr ? 'الرصيد الافتتاحي' : 'Opening Balance'}</CardTitle>
          </CardHeader>
          <div className="space-y-3">
            <Input
              label={isAr ? 'الرصيد الافتتاحي (ر.س)' : 'Opening Balance (SAR)'}
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              hint={isAr ? 'الرصيد المستحق من العميل قبل بدء استخدام النظام (0 = لا يوجد)' : 'Amount owed by customer before system start (0 = none)'}
              dir="ltr"
              {...register('openingBalanceSar')}
            />
          </div>
        </Card>

        {/* ── Notes ────────────────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle>{isAr ? 'ملاحظات' : 'Notes'}</CardTitle>
          </CardHeader>
          <div>
            <textarea
              rows={3}
              placeholder={isAr ? 'أي ملاحظات إضافية حول العميل...' : 'Any additional notes...'}
              className="w-full rounded-lg border border-slate-200 px-3.5 py-2.5 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none transition-colors"
              {...register('notes')}
            />
          </div>
        </Card>

        {serverError && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {serverError}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between gap-3">
          <Button type="button" variant="outline" onClick={() => router.back()} disabled={submitting}>
            <BackIcon size={15} />
            {isAr ? 'إلغاء' : 'Cancel'}
          </Button>
          <Button type="submit" loading={submitting}>
            {submitting
              ? (isAr ? 'جارٍ الحفظ...' : 'Saving...')
              : (isAr ? 'حفظ العميل' : 'Save Customer')}
          </Button>
        </div>
      </form>
    </div>
  );
}
