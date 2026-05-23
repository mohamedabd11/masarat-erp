'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { cn, formatCurrency } from '@/lib/utils';
import { ArrowRight, ArrowLeft, Plus, Trash2, ChevronRight, ChevronLeft, Calculator } from 'lucide-react';
import { useAuth } from '@masarat/firebase';

// ─── Schema ───────────────────────────────────────────────────────────────────

const travelerSchema = z.object({
  nameAr: z.string().min(2),
  nameEn: z.string().optional(),
  passportNumber: z.string().min(5).optional().or(z.literal('')),
  passportExpiry: z.string().optional(),
  nationality: z.string().default('SA'),
  dateOfBirth: z.string().optional(),
});

const newBookingSchema = z.object({
  bookingType: z.string().min(1),
  customerName: z.string().min(2),
  customerPhone: z.string().min(9),
  customerEmail: z.string().email().optional().or(z.literal('')),
  revenueModel: z.enum(['agent', 'principal']),
  supplierName: z.string().optional(),
  supplierRef: z.string().optional(),
  destination: z.string().optional(),
  departureDate: z.string().min(1),
  returnDate: z.string().optional(),
  travelers: z.array(travelerSchema).min(1),
  costPriceSAR: z.coerce.number().min(0),
  serviceFeeSAR: z.coerce.number().min(0),
  notes: z.string().optional(),
});

type NewBookingFormData = z.infer<typeof newBookingSchema>;

// ─── Constants ────────────────────────────────────────────────────────────────

const BOOKING_TYPES = [
  { value: 'flight',       label: { ar: 'طيران',          en: 'Flight' } },
  { value: 'hotel',        label: { ar: 'فندق',           en: 'Hotel' } },
  { value: 'flight_hotel', label: { ar: 'طيران وفندق',    en: 'Flight + Hotel' } },
  { value: 'package',      label: { ar: 'باقة سياحية',   en: 'Tour Package' } },
  { value: 'umrah',        label: { ar: 'عمرة',           en: 'Umrah' } },
  { value: 'hajj',         label: { ar: 'حج',             en: 'Hajj' } },
  { value: 'visa',         label: { ar: 'تأشيرة',         en: 'Visa' } },
  { value: 'insurance',    label: { ar: 'تأمين سفر',     en: 'Travel Insurance' } },
  { value: 'transfer',     label: { ar: 'نقل',            en: 'Transfer' } },
  { value: 'cruise',       label: { ar: 'رحلة بحرية',    en: 'Cruise' } },
];

const STEPS = [
  { key: 'type_customer', ar: 'النوع والعميل',    en: 'Type & Customer' },
  { key: 'travelers',     ar: 'المسافرون والخدمة', en: 'Travelers & Service' },
  { key: 'pricing',       ar: 'التسعير والدفع',    en: 'Pricing & Payment' },
];

const VAT_RATE = 0.15;

// ─── Component ────────────────────────────────────────────────────────────────

export default function NewBookingPage() {
  const locale = useLocale();
  const router = useRouter();
  const t = useTranslations('bookings.form');
  const isRtl = locale === 'ar';
  const { user } = useAuth();
  const [currentStep, setCurrentStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    control,
    watch,
    handleSubmit,
    formState: { errors },
  } = useForm<NewBookingFormData>({
    resolver: zodResolver(newBookingSchema),
    defaultValues: {
      revenueModel: 'agent',
      travelers: [{ nameAr: '', nationality: 'SA' }],
      costPriceSAR: 0,
      serviceFeeSAR: 0,
    },
  });

  const { fields: travelerFields, append, remove } = useFieldArray({
    control,
    name: 'travelers',
  });

  // Live pricing calculation
  const costPriceSAR = watch('costPriceSAR') || 0;
  const serviceFeeSAR = watch('serviceFeeSAR') || 0;
  const revenueModel = watch('revenueModel');

  const sellingPriceSAR = revenueModel === 'agent'
    ? costPriceSAR + serviceFeeSAR
    : costPriceSAR;

  const vatBase = revenueModel === 'agent' ? serviceFeeSAR : sellingPriceSAR;
  const vatAmountSAR = vatBase * VAT_RATE;
  const totalSAR = sellingPriceSAR + vatAmountSAR;

  // Convert to halalas for display
  const toH = (sar: number) => Math.round(sar * 100);

  function nextStep() {
    setCurrentStep(s => Math.min(s + 1, STEPS.length - 1));
  }

  function prevStep() {
    setCurrentStep(s => Math.max(s - 1, 0));
  }

  async function onSubmit(data: NewBookingFormData) {
    if (!user) return;
    setSubmitting(true);
    try {
      const { getFirestore, collection, addDoc, Timestamp } = await import('firebase/firestore');
      const { getApp } = await import('@masarat/firebase');
      const db = getFirestore(getApp());
      const agencyId = user.agencyId;

      const costHalalas = Math.round((data.costPriceSAR ?? 0) * 100);
      const feeHalalas  = Math.round((data.serviceFeeSAR ?? 0) * 100);
      const selling = data.revenueModel === 'agent' ? costHalalas + feeHalalas : costHalalas;
      const vatBase = data.revenueModel === 'agent' ? feeHalalas : selling;
      const vatHalalas  = Math.round(vatBase * 0.15);
      const totalHalalas = selling + vatHalalas;

      const nameParts = data.customerName.trim().split(' ');
      const nameEn = nameParts.join(' ');

      const bookingRef = await addDoc(collection(db, 'bookings'), {
        agencyId,
        type: data.bookingType,
        status: 'confirmed',
        customerName: { ar: data.customerName, en: nameEn },
        customerPhone: data.customerPhone,
        customerId: '',
        agentId: user.uid,
        agentName: user.displayName ?? '',
        passengers: data.travelers.map((t, i) => ({
          order: i + 1,
          type: 'adult',
          nameAr: t.nameAr,
          nameEn: t.nameEn ?? t.nameAr,
          passportNumber: t.passportNumber ?? '',
          passportExpiry: t.passportExpiry ?? '',
          nationality: t.nationality ?? 'SA',
          dateOfBirth: t.dateOfBirth ?? '',
          gender: 'male',
          customerId: '',
        })),
        pricing: {
          revenueModel: data.revenueModel,
          currency: 'SAR',
          totalCost: costHalalas,
          serviceFee: feeHalalas,
          vatAmount: vatHalalas,
          totalAmount: totalHalalas,
          commission: feeHalalas,
        },
        paymentStatus: 'unpaid',
        totalPaid: 0,
        totalDue: totalHalalas,
        invoiceIds: [],
        supplierId: '',
        supplierName: data.supplierName ?? '',
        supplierRef: data.supplierRef ?? '',
        travelDate: data.departureDate
          ? Timestamp.fromDate(new Date(data.departureDate))
          : Timestamp.now(),
        returnDate: data.returnDate
          ? Timestamp.fromDate(new Date(data.returnDate))
          : null,
        notes: data.notes ?? '',
        customFields: {},
        source: 'web',
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
        createdBy: user.uid,
      });

      router.push(`/${locale}/bookings/${bookingRef.id}`);
    } catch (err) {
      console.error('Failed to create booking:', err);
      setSubmitting(false);
    }
  }

  const BackIcon = isRtl ? ArrowRight : ArrowLeft;
  const StepIcon = isRtl ? ChevronLeft : ChevronRight;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => router.back()}
          className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors"
        >
          <BackIcon size={18} />
        </button>
        <h1 className="text-xl font-bold text-slate-900">{t('title')}</h1>
      </div>

      {/* Steps indicator */}
      <div className="flex items-center gap-0">
        {STEPS.map((step, idx) => (
          <div key={step.key} className="flex items-center flex-1">
            <button
              type="button"
              onClick={() => idx < currentStep && setCurrentStep(idx)}
              className={cn(
                'flex items-center gap-2.5 text-sm font-medium transition-colors',
                idx === currentStep ? 'text-brand-600' : '',
                idx < currentStep ? 'text-emerald-600 cursor-pointer' : '',
                idx > currentStep ? 'text-slate-400 cursor-default' : '',
              )}
            >
              <span
                className={cn(
                  'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 transition-colors',
                  idx === currentStep ? 'bg-brand-600 text-white' : '',
                  idx < currentStep ? 'bg-emerald-500 text-white' : '',
                  idx > currentStep ? 'bg-slate-200 text-slate-500' : '',
                )}
              >
                {idx < currentStep ? '✓' : idx + 1}
              </span>
              <span className="hidden sm:block">
                {locale === 'ar' ? step.ar : step.en}
              </span>
            </button>
            {idx < STEPS.length - 1 && (
              <div className={cn(
                'flex-1 h-0.5 mx-3',
                idx < currentStep ? 'bg-emerald-400' : 'bg-slate-200'
              )} />
            )}
          </div>
        ))}
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit(onSubmit)}>
        {/* Step 1: Type & Customer */}
        {currentStep === 0 && (
          <div className="space-y-5">
            <Card>
              <CardHeader>
                <CardTitle>{locale === 'ar' ? 'نوع الحجز' : 'Booking Type'}</CardTitle>
              </CardHeader>
              <Select
                label={t('selectType')}
                required
                placeholder={t('selectType')}
                options={BOOKING_TYPES.map(bt => ({
                  value: bt.value,
                  label: locale === 'ar' ? bt.label.ar : bt.label.en,
                }))}
                error={errors.bookingType?.message}
                {...register('bookingType')}
              />
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{locale === 'ar' ? 'بيانات العميل' : 'Customer Info'}</CardTitle>
              </CardHeader>
              <div className="space-y-4">
                <Input
                  label={locale === 'ar' ? 'اسم العميل' : 'Customer Name'}
                  required
                  placeholder={locale === 'ar' ? 'أدخل اسم العميل' : 'Enter customer name'}
                  error={errors.customerName?.message}
                  {...register('customerName')}
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input
                    label={locale === 'ar' ? 'رقم الهاتف' : 'Phone Number'}
                    type="tel"
                    required
                    placeholder="05xxxxxxxx"
                    error={errors.customerPhone?.message}
                    {...register('customerPhone')}
                  />
                  <Input
                    label={locale === 'ar' ? 'البريد الإلكتروني' : 'Email'}
                    type="email"
                    placeholder={locale === 'ar' ? 'اختياري' : 'Optional'}
                    error={errors.customerEmail?.message}
                    {...register('customerEmail')}
                  />
                </div>
              </div>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{locale === 'ar' ? 'نموذج الإيراد' : 'Revenue Model'}</CardTitle>
              </CardHeader>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  {
                    value: 'agent',
                    title: { ar: 'وكيل (Agent)', en: 'Agent Model' },
                    desc: {
                      ar: 'يُسجَّل صافي الإيراد (العمولة والرسوم فقط) وفق IFRS 15',
                      en: 'Net revenue recognized (commission/fees only) per IFRS 15',
                    },
                  },
                  {
                    value: 'principal',
                    title: { ar: 'مالك (Principal)', en: 'Principal Model' },
                    desc: {
                      ar: 'يُسجَّل الإيراد الإجمالي (سعر البيع كاملاً) وفق IFRS 15',
                      en: 'Gross revenue recognized (full selling price) per IFRS 15',
                    },
                  },
                ].map((model) => {
                  const selected = watch('revenueModel') === model.value;
                  return (
                    <label
                      key={model.value}
                      className={cn(
                        'flex flex-col gap-2 p-4 rounded-xl border-2 cursor-pointer transition-colors',
                        selected ? 'border-brand-500 bg-brand-50' : 'border-slate-200 hover:border-slate-300'
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="radio"
                          value={model.value}
                          className="accent-brand-600"
                          {...register('revenueModel')}
                        />
                        <span className="font-semibold text-sm text-slate-900">
                          {locale === 'ar' ? model.title.ar : model.title.en}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 ps-5">
                        {locale === 'ar' ? model.desc.ar : model.desc.en}
                      </p>
                    </label>
                  );
                })}
              </div>
            </Card>

            <div className="flex justify-end">
              <Button type="button" onClick={nextStep}>
                {locale === 'ar' ? 'التالي' : 'Next'}
                <StepIcon size={16} />
              </Button>
            </div>
          </div>
        )}

        {/* Step 2: Travelers & Service */}
        {currentStep === 1 && (
          <div className="space-y-5">
            <Card>
              <CardHeader>
                <CardTitle>{locale === 'ar' ? 'تفاصيل الرحلة' : 'Trip Details'}</CardTitle>
              </CardHeader>
              <div className="space-y-4">
                <Input
                  label={locale === 'ar' ? 'الوجهة' : 'Destination'}
                  placeholder={locale === 'ar' ? 'مثال: إسطنبول، تركيا' : 'e.g. Istanbul, Turkey'}
                  {...register('destination')}
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input
                    label={locale === 'ar' ? 'تاريخ المغادرة' : 'Departure Date'}
                    type="date"
                    required
                    error={errors.departureDate?.message}
                    {...register('departureDate')}
                  />
                  <Input
                    label={locale === 'ar' ? 'تاريخ العودة' : 'Return Date'}
                    type="date"
                    {...register('returnDate')}
                  />
                </div>
              </div>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{locale === 'ar' ? 'المسافرون' : 'Travelers'}</CardTitle>
              </CardHeader>
              <div className="space-y-4">
                {travelerFields.map((field, idx) => (
                  <div key={field.id} className="p-4 rounded-lg bg-slate-50 border border-slate-200 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-slate-700">
                        {locale === 'ar' ? `مسافر ${idx + 1}` : `Traveler ${idx + 1}`}
                      </span>
                      {idx > 0 && (
                        <button
                          type="button"
                          onClick={() => remove(idx)}
                          className="p-1 text-red-500 hover:text-red-700 transition-colors"
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <Input
                        label={locale === 'ar' ? 'الاسم بالعربي' : 'Name (Arabic)'}
                        required
                        placeholder={locale === 'ar' ? 'الاسم الكامل بالعربي' : 'Full name in Arabic'}
                        error={errors.travelers?.[idx]?.nameAr?.message}
                        {...register(`travelers.${idx}.nameAr`)}
                      />
                      <Input
                        label={locale === 'ar' ? 'الاسم بالإنجليزي' : 'Name (English)'}
                        placeholder={locale === 'ar' ? 'كما في جواز السفر' : 'As in passport'}
                        {...register(`travelers.${idx}.nameEn`)}
                      />
                      <Input
                        label={locale === 'ar' ? 'رقم الجواز' : 'Passport Number'}
                        placeholder="A12345678"
                        {...register(`travelers.${idx}.passportNumber`)}
                      />
                      <Input
                        label={locale === 'ar' ? 'انتهاء الجواز' : 'Passport Expiry'}
                        type="date"
                        {...register(`travelers.${idx}.passportExpiry`)}
                      />
                    </div>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => append({ nameAr: '', nationality: 'SA' })}
                >
                  <Plus size={15} />
                  {t('addTraveler')}
                </Button>
              </div>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{locale === 'ar' ? 'بيانات المورد' : 'Supplier Info'}</CardTitle>
              </CardHeader>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label={t('supplierName')}
                  placeholder={locale === 'ar' ? 'اسم شركة الطيران أو الفندق' : 'Airline or hotel name'}
                  {...register('supplierName')}
                />
                <Input
                  label={t('supplierRef')}
                  placeholder={locale === 'ar' ? 'رقم الحجز لدى المورد' : 'Supplier booking reference'}
                  {...register('supplierRef')}
                />
              </div>
            </Card>

            <div className="flex justify-between">
              <Button type="button" variant="outline" onClick={prevStep}>
                <BackIcon size={16} />
                {locale === 'ar' ? 'السابق' : 'Back'}
              </Button>
              <Button type="button" onClick={nextStep}>
                {locale === 'ar' ? 'التالي' : 'Next'}
                <StepIcon size={16} />
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Pricing */}
        {currentStep === 2 && (
          <div className="space-y-5">
            <Card>
              <CardHeader>
                <CardTitle>
                  <div className="flex items-center gap-2">
                    <Calculator size={18} className="text-brand-600" />
                    {locale === 'ar' ? 'التسعير' : 'Pricing'}
                  </div>
                </CardTitle>
              </CardHeader>
              <div className="space-y-4">
                {revenueModel === 'agent' ? (
                  <>
                    <Input
                      label={`${t('costPrice')} (${locale === 'ar' ? 'ريال' : 'SAR'})`}
                      type="number"
                      step="0.01"
                      min="0"
                      required
                      hint={locale === 'ar' ? 'التكلفة الفعلية للمورد' : 'Actual cost from supplier'}
                      error={errors.costPriceSAR?.message}
                      {...register('costPriceSAR')}
                    />
                    <Input
                      label={`${t('serviceFee')} (${locale === 'ar' ? 'ريال' : 'SAR'})`}
                      type="number"
                      step="0.01"
                      min="0"
                      required
                      hint={locale === 'ar' ? 'رسوم الوكالة (تخضع للضريبة)' : 'Agency fee (subject to VAT)'}
                      error={errors.serviceFeeSAR?.message}
                      {...register('serviceFeeSAR')}
                    />
                  </>
                ) : (
                  <Input
                    label={`${locale === 'ar' ? 'سعر البيع' : 'Selling Price'} (${locale === 'ar' ? 'ريال' : 'SAR'})`}
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    hint={locale === 'ar' ? 'السعر الكامل للعميل (شامل COGS)' : 'Full price to customer (includes COGS)'}
                    error={errors.costPriceSAR?.message}
                    {...register('costPriceSAR')}
                  />
                )}
              </div>
            </Card>

            {/* Pricing summary */}
            <Card className="border-brand-200 bg-brand-50/30">
              <CardHeader>
                <CardTitle>{locale === 'ar' ? 'ملخص التسعير' : 'Pricing Summary'}</CardTitle>
              </CardHeader>
              <div className="space-y-2.5">
                {[
                  {
                    label: revenueModel === 'agent'
                      ? (locale === 'ar' ? 'سعر التكلفة' : 'Cost Price')
                      : (locale === 'ar' ? 'سعر البيع (قبل الضريبة)' : 'Selling Price (excl. VAT)'),
                    value: formatCurrency(toH(revenueModel === 'agent' ? costPriceSAR : sellingPriceSAR), locale === 'ar' ? 'ar-SA' : 'en-SA'),
                    bold: false,
                  },
                  ...(revenueModel === 'agent' ? [{
                    label: locale === 'ar' ? 'رسوم الخدمة' : 'Service Fee',
                    value: formatCurrency(toH(serviceFeeSAR), locale === 'ar' ? 'ar-SA' : 'en-SA'),
                    bold: false,
                  }] : []),
                  {
                    label: `${locale === 'ar' ? 'ضريبة القيمة المضافة' : 'VAT'} (15%)`,
                    value: formatCurrency(toH(vatAmountSAR), locale === 'ar' ? 'ar-SA' : 'en-SA'),
                    bold: false,
                  },
                ].map((row) => (
                  <div key={row.label} className="flex items-center justify-between text-sm">
                    <span className={row.bold ? 'font-semibold text-slate-900' : 'text-slate-600'}>{row.label}</span>
                    <span className={row.bold ? 'font-bold text-slate-900' : 'text-slate-700'}>{row.value}</span>
                  </div>
                ))}
                <div className="border-t border-brand-200 pt-2.5 flex items-center justify-between">
                  <span className="font-bold text-slate-900">
                    {locale === 'ar' ? 'الإجمالي شامل الضريبة' : 'Total (incl. VAT)'}
                  </span>
                  <span className="text-lg font-bold text-brand-700">
                    {formatCurrency(toH(totalSAR), locale === 'ar' ? 'ar-SA' : 'en-SA')}
                  </span>
                </div>
              </div>
            </Card>

            {/* Notes */}
            <Card>
              <div className="space-y-1">
                <label className="block text-sm font-medium text-slate-700">
                  {locale === 'ar' ? 'ملاحظات' : 'Notes'}
                </label>
                <textarea
                  rows={3}
                  placeholder={locale === 'ar' ? 'أي ملاحظات إضافية...' : 'Any additional notes...'}
                  className="block w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent resize-none"
                  {...register('notes')}
                />
              </div>
            </Card>

            <div className="flex justify-between">
              <Button type="button" variant="outline" onClick={prevStep}>
                <BackIcon size={16} />
                {locale === 'ar' ? 'السابق' : 'Back'}
              </Button>
              <Button type="submit" loading={submitting}>
                {submitting
                  ? (locale === 'ar' ? 'جارٍ الحفظ...' : 'Saving...')
                  : (locale === 'ar' ? 'إنشاء الحجز' : 'Create Booking')}
              </Button>
            </div>
          </div>
        )}
      </form>
    </div>
  );
}
