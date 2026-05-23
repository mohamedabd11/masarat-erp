'use client';

import { useState, useEffect, Suspense } from 'react';
import { useLocale } from 'next-intl';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth } from '@masarat/firebase';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { cn, formatCurrency } from '@/lib/utils';
import {
  ArrowRight, ArrowLeft, Plus, Trash2, ChevronRight, ChevronLeft, Calculator,
  Plane, Building2, Package, Moon, Shield, Stamp, Car, Anchor, Users, Layers,
  X, Check,
} from 'lucide-react';

// ─── Schema ───────────────────────────────────────────────────────────────────

const travelerSchema = z.object({
  nameAr:         z.string().min(2),
  nameEn:         z.string().optional(),
  passportNumber: z.string().min(5).optional().or(z.literal('')),
  passportExpiry: z.string().optional(),
  nationality:    z.string().default('SA'),
  dateOfBirth:    z.string().optional(),
});

const formSchema = z.object({
  customerName:  z.string().min(2),
  customerPhone: z.string().min(9),
  customerEmail: z.string().email().optional().or(z.literal('')),
  revenueModel:  z.enum(['agent', 'principal']),
  supplierName:  z.string().optional(),
  supplierRef:   z.string().optional(),
  destination:   z.string().optional(),
  departureDate: z.string().min(1),
  returnDate:    z.string().optional(),
  travelers:     z.array(travelerSchema).min(1),
  costPriceSAR:  z.coerce.number().min(0),
  serviceFeeSAR: z.coerce.number().min(0),
  notes:         z.string().optional(),
});

type FormData = z.infer<typeof formSchema>;

// ─── Service Types ────────────────────────────────────────────────────────────

interface ServiceOption {
  value: string;
  ar:    string;
  en:    string;
  icon:  React.ReactNode;
  color: string;
  bg:    string;
}

const BUILT_IN: ServiceOption[] = [
  { value: 'flight',       ar: 'حجز طيران',    en: 'Flight',           icon: <Plane size={26} />,    color: '#3b82f6', bg: '#eff6ff' },
  { value: 'hotel',        ar: 'حجز فندق',     en: 'Hotel',            icon: <Building2 size={26} />, color: '#8b5cf6', bg: '#f5f3ff' },
  { value: 'flight_hotel', ar: 'طيران + فندق', en: 'Flight + Hotel',   icon: <Layers size={26} />,   color: '#0ea5e9', bg: '#f0f9ff' },
  { value: 'package',      ar: 'باقة سياحية',  en: 'Tour Package',     icon: <Package size={26} />,  color: '#10b981', bg: '#ecfdf5' },
  { value: 'umrah',        ar: 'عمرة',         en: 'Umrah',            icon: <Moon size={26} />,     color: '#f59e0b', bg: '#fffbeb' },
  { value: 'hajj',         ar: 'حج',           en: 'Hajj',             icon: <Moon size={26} />,     color: '#d97706', bg: '#fef3c7' },
  { value: 'visa',         ar: 'تأشيرة',       en: 'Visa',             icon: <Stamp size={26} />,    color: '#ef4444', bg: '#fef2f2' },
  { value: 'family_visit', ar: 'زيارة عائلية', en: 'Family Visit',     icon: <Users size={26} />,    color: '#ec4899', bg: '#fdf2f8' },
  { value: 'insurance',    ar: 'تأمين سفر',    en: 'Travel Insurance', icon: <Shield size={26} />,   color: '#06b6d4', bg: '#ecfeff' },
  { value: 'transfer',     ar: 'نقل',          en: 'Transfer',         icon: <Car size={26} />,      color: '#84cc16', bg: '#f7fee7' },
  { value: 'cruise',       ar: 'رحلة بحرية',   en: 'Cruise',           icon: <Anchor size={26} />,   color: '#6366f1', bg: '#eef2ff' },
];

const ICON_MAP: Record<string, React.ReactNode> = {
  plane:     <Plane size={26} />,
  building2: <Building2 size={26} />,
  package:   <Package size={26} />,
  moon:      <Moon size={26} />,
  shield:    <Shield size={26} />,
  stamp:     <Stamp size={26} />,
  anchor:    <Anchor size={26} />,
  car:       <Car size={26} />,
  layers:    <Layers size={26} />,
  users:     <Users size={26} />,
};

const STEPS = [
  { ar: 'بيانات العميل والمورد', en: 'Customer & Supplier' },
  { ar: 'المسافرون والتفاصيل',   en: 'Travelers & Details' },
  { ar: 'التسعير والمدفوعات',    en: 'Pricing & Payment' },
];

const VAT_RATE = 0.15;

// ─── Service Selection Grid ────────────────────────────────────────────────────

function ServiceGrid({
  isAr,
  onSelect,
  onAddNew,
  locale,
}: {
  isAr: boolean;
  onSelect: (value: string, nameAr: string, nameEn: string) => void;
  onAddNew: () => void;
  locale: string;
}) {
  const { user } = useAuth();
  const [customTypes, setCustomTypes] = useState<
    Array<{ id: string; nameAr: string; nameEn: string; icon: string }>
  >([]);

  useEffect(() => {
    if (!user?.agencyId) return;
    let unsub: (() => void) | undefined;
    async function load() {
      const { getFirestore, collection, query, where, onSnapshot } = await import('firebase/firestore');
      const { getApp } = await import('@masarat/firebase');
      const db = getFirestore(getApp());
      const q = query(
        collection(db, 'service_types'),
        where('agencyId', '==', user!.agencyId),
        where('isActive', '==', true),
      );
      unsub = onSnapshot(q, snap => {
        setCustomTypes(snap.docs.map(d => ({ id: d.id, ...d.data() } as { id: string; nameAr: string; nameEn: string; icon: string })));
      });
    }
    void load();
    return () => unsub?.();
  }, [user?.agencyId]);

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          {isAr ? 'اختر نوع الخدمة' : 'Select Service Type'}
        </h1>
        <p className="text-slate-500 text-sm mt-1">
          {isAr ? 'اختر الخدمة التي تريد تقديمها للعميل' : 'Choose the service you want to provide to the customer'}
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {BUILT_IN.map(svc => (
          <button
            key={svc.value}
            onClick={() => onSelect(svc.value, svc.ar, svc.en)}
            className="group flex flex-col items-center gap-3 p-5 rounded-2xl border-2 border-slate-200 bg-white hover:border-brand-400 hover:shadow-lg transition-all duration-200"
          >
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center transition-transform duration-200 group-hover:scale-110"
              style={{ backgroundColor: svc.bg, color: svc.color }}
            >
              {svc.icon}
            </div>
            <span className="text-sm font-semibold text-slate-800 text-center leading-snug">
              {isAr ? svc.ar : svc.en}
            </span>
          </button>
        ))}

        {customTypes.map(ct => (
          <button
            key={ct.id}
            onClick={() => onSelect(ct.id, ct.nameAr, ct.nameEn)}
            className="group flex flex-col items-center gap-3 p-5 rounded-2xl border-2 border-slate-200 bg-white hover:border-brand-400 hover:shadow-lg transition-all duration-200"
          >
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center bg-slate-100 text-slate-600 transition-transform duration-200 group-hover:scale-110">
              {ICON_MAP[ct.icon] ?? <Layers size={26} />}
            </div>
            <span className="text-sm font-semibold text-slate-800 text-center leading-snug">
              {isAr ? ct.nameAr : ct.nameEn}
            </span>
          </button>
        ))}

        <button
          onClick={onAddNew}
          className="group flex flex-col items-center gap-3 p-5 rounded-2xl border-2 border-dashed border-slate-300 hover:border-brand-400 hover:bg-brand-50/50 transition-all duration-200"
        >
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center bg-slate-100 text-slate-400 group-hover:bg-brand-100 group-hover:text-brand-600 transition-colors">
            <Plus size={26} />
          </div>
          <span className="text-sm font-semibold text-slate-400 group-hover:text-brand-600 text-center">
            {isAr ? 'إضافة خدمة' : 'Add Service Type'}
          </span>
        </button>
      </div>
    </div>
  );
}

// ─── Inner Component (needs useSearchParams inside Suspense) ──────────────────

function NewBookingContent() {
  const locale   = useLocale();
  const router   = useRouter();
  const params   = useSearchParams();
  const isAr     = locale === 'ar';
  const { user } = useAuth();

  const [step, setStep]         = useState(0); // 0 = service grid, 1-3 = form
  const [selType,  setSelType]  = useState('');
  const [selNames, setSelNames] = useState({ ar: '', en: '' });
  const [submitting, setSubmitting] = useState(false);

  const { register, control, watch, handleSubmit, setValue, formState: { errors } } =
    useForm<FormData>({
      resolver: zodResolver(formSchema),
      defaultValues: {
        revenueModel:  'agent',
        travelers:     [{ nameAr: '', nationality: 'SA' }],
        costPriceSAR:  0,
        serviceFeeSAR: 0,
      },
    });

  const { fields: travelerFields, append, remove } = useFieldArray({ control, name: 'travelers' });

  // Pre-select from URL ?type=X
  useEffect(() => {
    const t = params.get('type');
    if (!t) return;
    const found = BUILT_IN.find(s => s.value === t);
    if (found) {
      setSelType(t);
      setSelNames({ ar: found.ar, en: found.en });
      setStep(1);
    }
  }, [params]);

  const costPriceSAR  = watch('costPriceSAR')  || 0;
  const serviceFeeSAR = watch('serviceFeeSAR') || 0;
  const revenueModel  = watch('revenueModel');

  const sellingPrice = revenueModel === 'agent' ? costPriceSAR + serviceFeeSAR : costPriceSAR;
  const vatBase      = revenueModel === 'agent' ? serviceFeeSAR : sellingPrice;
  const vatAmount    = vatBase * VAT_RATE;
  const total        = sellingPrice + vatAmount;
  const toH          = (sar: number) => Math.round(sar * 100);
  const locale2      = isAr ? 'ar-SA' : 'en-SA';

  const BackIcon = isAr ? ArrowRight : ArrowLeft;
  const NextIcon = isAr ? ChevronLeft : ChevronRight;

  function handleSelectService(value: string, nameAr: string, nameEn: string) {
    setSelType(value);
    setSelNames({ ar: nameAr, en: nameEn });
    setStep(1);
  }

  async function onSubmit(data: FormData) {
    if (!user || !selType) return;
    setSubmitting(true);
    try {
      const { getFirestore, collection, addDoc, Timestamp } = await import('firebase/firestore');
      const { getApp } = await import('@masarat/firebase');
      const db       = getFirestore(getApp());
      const agencyId = user.agencyId;

      const costH    = Math.round((data.costPriceSAR ?? 0) * 100);
      const feeH     = Math.round((data.serviceFeeSAR ?? 0) * 100);
      const selling  = data.revenueModel === 'agent' ? costH + feeH : costH;
      const vBase    = data.revenueModel === 'agent' ? feeH : selling;
      const vatH     = Math.round(vBase * 0.15);
      const totalH   = selling + vatH;

      const ref = await addDoc(collection(db, 'bookings'), {
        agencyId,
        type:         selType,
        status:       'confirmed',
        customerName: { ar: data.customerName, en: data.customerName },
        customerPhone: data.customerPhone,
        customerEmail: data.customerEmail ?? '',
        customerId:   '',
        agentId:      user.uid,
        agentName:    user.displayName ?? '',
        passengers:   data.travelers.map((t, i) => ({
          order: i + 1, type: 'adult',
          nameAr: t.nameAr, nameEn: t.nameEn ?? t.nameAr,
          passportNumber: t.passportNumber ?? '',
          passportExpiry: t.passportExpiry ?? '',
          nationality:    t.nationality ?? 'SA',
          dateOfBirth:    t.dateOfBirth ?? '',
          gender:         'male', customerId: '',
        })),
        pricing: {
          revenueModel: data.revenueModel,
          currency:     'SAR',
          totalCost:    costH,
          serviceFee:   feeH,
          vatAmount:    vatH,
          totalAmount:  totalH,
          commission:   feeH,
        },
        paymentStatus: 'unpaid',
        totalPaid:     0,
        totalDue:      totalH,
        invoiceIds:    [],
        supplierId:    '',
        supplierName:  data.supplierName ?? '',
        supplierRef:   data.supplierRef  ?? '',
        destination:   data.destination  ?? '',
        travelDate:    data.departureDate
          ? Timestamp.fromDate(new Date(data.departureDate))
          : Timestamp.now(),
        returnDate: data.returnDate
          ? Timestamp.fromDate(new Date(data.returnDate))
          : null,
        notes:        data.notes ?? '',
        customFields: {},
        source:       'web',
        createdAt:    Timestamp.now(),
        updatedAt:    Timestamp.now(),
        createdBy:    user.uid,
      });

      router.push(`/${locale}/bookings/${ref.id}`);
    } catch (err) {
      console.error(err);
      setSubmitting(false);
    }
  }

  // ── Step 0: Service Grid ──────────────────────────────────────────────────

  if (step === 0) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.back()}
            className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors"
          >
            <BackIcon size={18} />
          </button>
        </div>
        <ServiceGrid
          isAr={isAr}
          locale={locale}
          onSelect={handleSelectService}
          onAddNew={() => router.push(`/${locale}/settings?tab=service_types`)}
        />
      </div>
    );
  }

  // ── Steps 1-3: Form ───────────────────────────────────────────────────────

  const formStep = step - 1; // 0, 1, 2

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => setStep(0)}
          className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors"
        >
          <BackIcon size={18} />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-slate-900">
            {isAr ? 'تقديم خدمة جديدة' : 'New Service'}
          </h1>
        </div>
        {/* Selected service chip */}
        <button
          onClick={() => setStep(0)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-brand-50 border border-brand-200 text-brand-700 text-sm font-medium hover:bg-brand-100 transition-colors"
        >
          <span>{isAr ? selNames.ar : selNames.en}</span>
          <X size={13} className="text-brand-400" />
        </button>
      </div>

      {/* Steps indicator */}
      <div className="flex items-center gap-0">
        {STEPS.map((s, idx) => (
          <div key={s.en} className="flex items-center flex-1">
            <button
              type="button"
              onClick={() => idx < formStep && setStep(idx + 1)}
              className={cn(
                'flex items-center gap-2 text-sm font-medium transition-colors',
                idx === formStep ? 'text-brand-600' : '',
                idx < formStep  ? 'text-emerald-600 cursor-pointer' : '',
                idx > formStep  ? 'text-slate-400 cursor-default' : '',
              )}
            >
              <span className={cn(
                'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0',
                idx === formStep ? 'bg-brand-600 text-white' : '',
                idx < formStep  ? 'bg-emerald-500 text-white' : '',
                idx > formStep  ? 'bg-slate-200 text-slate-500' : '',
              )}>
                {idx < formStep ? <Check size={13} /> : idx + 1}
              </span>
              <span className="hidden sm:block">{isAr ? s.ar : s.en}</span>
            </button>
            {idx < STEPS.length - 1 && (
              <div className={cn('flex-1 h-0.5 mx-3', idx < formStep ? 'bg-emerald-400' : 'bg-slate-200')} />
            )}
          </div>
        ))}
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit(onSubmit)}>

        {/* ── Step 1: Customer & Supplier ────────────────────────────────── */}
        {formStep === 0 && (
          <div className="space-y-5">
            <Card>
              <CardHeader>
                <CardTitle>{isAr ? 'بيانات العميل' : 'Customer Information'}</CardTitle>
              </CardHeader>
              <div className="space-y-4">
                <Input
                  label={isAr ? 'اسم العميل' : 'Customer Name'}
                  required
                  placeholder={isAr ? 'الاسم الكامل' : 'Full name'}
                  error={errors.customerName?.message}
                  {...register('customerName')}
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input
                    label={isAr ? 'رقم الجوال' : 'Mobile Number'}
                    type="tel"
                    required
                    placeholder="05xxxxxxxx"
                    dir="ltr"
                    error={errors.customerPhone?.message}
                    {...register('customerPhone')}
                  />
                  <Input
                    label={isAr ? 'البريد الإلكتروني' : 'Email'}
                    type="email"
                    placeholder={isAr ? 'اختياري' : 'Optional'}
                    error={errors.customerEmail?.message}
                    {...register('customerEmail')}
                  />
                </div>
              </div>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{isAr ? 'بيانات المورد' : 'Supplier Information'}</CardTitle>
              </CardHeader>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label={isAr ? 'اسم المورد' : 'Supplier Name'}
                  placeholder={isAr ? 'شركة الطيران، الفندق، ...' : 'Airline, hotel, ...'}
                  {...register('supplierName')}
                />
                <Input
                  label={isAr ? 'مرجع المورد' : 'Supplier Reference'}
                  placeholder={isAr ? 'رقم الحجز' : 'Booking reference'}
                  dir="ltr"
                  {...register('supplierRef')}
                />
              </div>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{isAr ? 'نموذج الإيراد' : 'Revenue Model'}</CardTitle>
              </CardHeader>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  {
                    value: 'agent',
                    titleAr: 'وكيل (Agent)',
                    titleEn: 'Agent Model',
                    descAr:  'يُسجَّل صافي الإيراد (العمولة والرسوم فقط) وفق IFRS 15',
                    descEn:  'Net revenue (commission & fees only) per IFRS 15',
                  },
                  {
                    value: 'principal',
                    titleAr: 'مالك (Principal)',
                    titleEn: 'Principal Model',
                    descAr:  'يُسجَّل الإيراد الإجمالي (سعر البيع كاملاً) وفق IFRS 15',
                    descEn:  'Gross revenue (full selling price) per IFRS 15',
                  },
                ].map(m => {
                  const sel = watch('revenueModel') === m.value;
                  return (
                    <label
                      key={m.value}
                      className={cn(
                        'flex flex-col gap-2 p-4 rounded-xl border-2 cursor-pointer transition-colors',
                        sel ? 'border-brand-500 bg-brand-50' : 'border-slate-200 hover:border-slate-300',
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <input type="radio" value={m.value} className="accent-brand-600" {...register('revenueModel')} />
                        <span className="font-semibold text-sm">{isAr ? m.titleAr : m.titleEn}</span>
                      </div>
                      <p className="text-xs text-slate-500 ps-5">{isAr ? m.descAr : m.descEn}</p>
                    </label>
                  );
                })}
              </div>
            </Card>

            <div className="flex justify-end">
              <Button type="button" onClick={() => setStep(2)}>
                {isAr ? 'التالي' : 'Next'}
                <NextIcon size={16} />
              </Button>
            </div>
          </div>
        )}

        {/* ── Step 2: Travelers & Details ────────────────────────────────── */}
        {formStep === 1 && (
          <div className="space-y-5">
            <Card>
              <CardHeader>
                <CardTitle>{isAr ? 'تفاصيل الخدمة' : 'Service Details'}</CardTitle>
              </CardHeader>
              <div className="space-y-4">
                <Input
                  label={isAr ? 'الوجهة / الدولة' : 'Destination / Country'}
                  placeholder={isAr ? 'مثال: تركيا، إسطنبول' : 'e.g. Turkey, Istanbul'}
                  {...register('destination')}
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input
                    label={isAr ? 'تاريخ البدء / المغادرة' : 'Start / Departure Date'}
                    type="date"
                    required
                    error={errors.departureDate?.message}
                    {...register('departureDate')}
                  />
                  <Input
                    label={isAr ? 'تاريخ الانتهاء / العودة' : 'End / Return Date'}
                    type="date"
                    {...register('returnDate')}
                  />
                </div>
              </div>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{isAr ? 'المسافرون' : 'Travelers'}</CardTitle>
              </CardHeader>
              <div className="space-y-4">
                {travelerFields.map((field, idx) => (
                  <div key={field.id} className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-slate-700">
                        {isAr ? `مسافر ${idx + 1}` : `Traveler ${idx + 1}`}
                      </span>
                      {idx > 0 && (
                        <button type="button" onClick={() => remove(idx)} className="p-1 text-red-500 hover:text-red-700">
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <Input
                        label={isAr ? 'الاسم بالعربي' : 'Name (Arabic)'}
                        required
                        placeholder={isAr ? 'الاسم الكامل' : 'Full name in Arabic'}
                        error={errors.travelers?.[idx]?.nameAr?.message}
                        {...register(`travelers.${idx}.nameAr`)}
                      />
                      <Input
                        label={isAr ? 'الاسم بالإنجليزي' : 'Name (English)'}
                        placeholder={isAr ? 'كما في جواز السفر' : 'As in passport'}
                        dir="ltr"
                        {...register(`travelers.${idx}.nameEn`)}
                      />
                      <Input
                        label={isAr ? 'رقم جواز السفر' : 'Passport Number'}
                        placeholder="A12345678"
                        dir="ltr"
                        {...register(`travelers.${idx}.passportNumber`)}
                      />
                      <Input
                        label={isAr ? 'تاريخ انتهاء الجواز' : 'Passport Expiry'}
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
                  {isAr ? 'إضافة مسافر' : 'Add Traveler'}
                </Button>
              </div>
            </Card>

            <div className="flex justify-between">
              <Button type="button" variant="outline" onClick={() => setStep(1)}>
                <BackIcon size={16} />
                {isAr ? 'السابق' : 'Back'}
              </Button>
              <Button type="button" onClick={() => setStep(3)}>
                {isAr ? 'التالي' : 'Next'}
                <NextIcon size={16} />
              </Button>
            </div>
          </div>
        )}

        {/* ── Step 3: Pricing ────────────────────────────────────────────── */}
        {formStep === 2 && (
          <div className="space-y-5">
            <Card>
              <CardHeader>
                <CardTitle>
                  <div className="flex items-center gap-2">
                    <Calculator size={18} className="text-brand-600" />
                    {isAr ? 'التسعير' : 'Pricing'}
                  </div>
                </CardTitle>
              </CardHeader>
              <div className="space-y-4">
                {revenueModel === 'agent' ? (
                  <>
                    <Input
                      label={isAr ? 'سعر التكلفة (ريال)' : 'Cost Price (SAR)'}
                      type="number"
                      step="0.01"
                      min="0"
                      required
                      hint={isAr ? 'التكلفة الفعلية من المورد' : 'Actual cost from supplier'}
                      dir="ltr"
                      error={errors.costPriceSAR?.message}
                      {...register('costPriceSAR')}
                    />
                    <Input
                      label={isAr ? 'رسوم الخدمة (ريال)' : 'Service Fee (SAR)'}
                      type="number"
                      step="0.01"
                      min="0"
                      required
                      hint={isAr ? 'رسوم الوكالة — تخضع لضريبة القيمة المضافة' : 'Agency fee — subject to VAT'}
                      dir="ltr"
                      error={errors.serviceFeeSAR?.message}
                      {...register('serviceFeeSAR')}
                    />
                  </>
                ) : (
                  <Input
                    label={isAr ? 'سعر البيع (ريال)' : 'Selling Price (SAR)'}
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    hint={isAr ? 'السعر الكامل للعميل شامل التكلفة' : 'Full price to customer including cost'}
                    dir="ltr"
                    error={errors.costPriceSAR?.message}
                    {...register('costPriceSAR')}
                  />
                )}
              </div>
            </Card>

            {/* Summary */}
            <Card className="border-brand-200 bg-brand-50/30">
              <CardHeader>
                <CardTitle>{isAr ? 'ملخص المبالغ' : 'Amount Summary'}</CardTitle>
              </CardHeader>
              <div className="space-y-2.5">
                {[
                  {
                    label: revenueModel === 'agent'
                      ? (isAr ? 'سعر التكلفة' : 'Cost Price')
                      : (isAr ? 'سعر البيع' : 'Selling Price'),
                    value: formatCurrency(toH(revenueModel === 'agent' ? costPriceSAR : sellingPrice), locale2),
                  },
                  ...(revenueModel === 'agent' ? [{
                    label: isAr ? 'رسوم الخدمة' : 'Service Fee',
                    value: formatCurrency(toH(serviceFeeSAR), locale2),
                  }] : []),
                  {
                    label: `${isAr ? 'ضريبة القيمة المضافة' : 'VAT'} (15%)`,
                    value: formatCurrency(toH(vatAmount), locale2),
                  },
                ].map(row => (
                  <div key={row.label} className="flex items-center justify-between text-sm">
                    <span className="text-slate-600">{row.label}</span>
                    <span className="text-slate-700 font-medium">{row.value}</span>
                  </div>
                ))}
                <div className="border-t border-brand-200 pt-2.5 flex items-center justify-between">
                  <span className="font-bold text-slate-900">{isAr ? 'الإجمالي شامل الضريبة' : 'Total (incl. VAT)'}</span>
                  <span className="text-lg font-bold text-brand-700">{formatCurrency(toH(total), locale2)}</span>
                </div>
              </div>
            </Card>

            {/* Notes */}
            <Card>
              <div className="space-y-1">
                <label className="block text-sm font-medium text-slate-700">
                  {isAr ? 'ملاحظات' : 'Notes'}
                </label>
                <textarea
                  rows={3}
                  placeholder={isAr ? 'أي ملاحظات إضافية...' : 'Any additional notes...'}
                  className="block w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
                  {...register('notes')}
                />
              </div>
            </Card>

            <div className="flex justify-between">
              <Button type="button" variant="outline" onClick={() => setStep(2)}>
                <BackIcon size={16} />
                {isAr ? 'السابق' : 'Back'}
              </Button>
              <Button type="submit" loading={submitting}>
                {submitting
                  ? (isAr ? 'جارٍ الحفظ...' : 'Saving...')
                  : (isAr ? 'حفظ الخدمة' : 'Save Service')}
              </Button>
            </div>
          </div>
        )}
      </form>
    </div>
  );
}

// ─── Page Export ──────────────────────────────────────────────────────────────

export default function NewBookingPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-24 text-slate-400 text-sm">Loading...</div>}>
      <NewBookingContent />
    </Suspense>
  );
}
