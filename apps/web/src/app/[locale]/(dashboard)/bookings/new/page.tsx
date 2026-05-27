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
import { Spinner } from '@/components/ui/Spinner';
import { cn, formatCurrency } from '@/lib/utils';
import {
  ArrowRight, ArrowLeft, Plus, Trash2, ChevronRight, ChevronLeft,
  Plane, Building2, Package, Moon, Shield, Stamp, Car, Anchor, Users, Layers,
  X, Check, Search, UserPlus, FileText,
} from 'lucide-react';
import { CustomerSearch } from '@/components/customers/CustomerSearch';

// ─── Service Types Catalog ─────────────────────────────────────────────────────

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
  plane: <Plane size={26} />, building2: <Building2 size={26} />,
  package: <Package size={26} />, moon: <Moon size={26} />,
  shield: <Shield size={26} />, stamp: <Stamp size={26} />,
  anchor: <Anchor size={26} />, car: <Car size={26} />,
  layers: <Layers size={26} />, users: <Users size={26} />,
};

// ─── Form Schema ───────────────────────────────────────────────────────────────

const travelerSchema = z.object({
  nameAr:         z.string().optional(),
  nameEn:         z.string().optional(),
  passportNumber: z.string().optional(),
  passportExpiry: z.string().optional(),
  nationality:    z.string().optional(),
  dateOfBirth:    z.string().optional(),
  gender:         z.string().optional(),
});

const formSchema = z.object({
  // Customer
  customerId:    z.string().optional(),
  customerName:  z.string().min(2, 'الاسم مطلوب'),
  customerPhone: z.string().min(9, 'رقم الجوال مطلوب'),
  customerEmail: z.string().email().optional().or(z.literal('')),

  // Revenue model
  revenueModel: z.enum(['agent', 'principal']).default('agent'),

  // Generic trip
  destination:   z.string().optional(),
  departureDate: z.string().optional(),
  returnDate:    z.string().optional(),

  // Flight specific
  fromCity:    z.string().optional(),
  toCity:      z.string().optional(),
  airline:     z.string().optional(),
  flightClass: z.string().optional(),
  pnr:         z.string().optional(),

  // Hotel / Umrah specific
  hotelName:    z.string().optional(),
  roomType:     z.string().optional(),
  boardType:    z.string().optional(),
  makkahHotel:  z.string().optional(),
  makkahNights: z.coerce.number().optional(),
  madinahHotel: z.string().optional(),
  madinahNights:z.coerce.number().optional(),

  // Visa specific
  visaCountry:    z.string().optional(),
  visaType:       z.string().optional(),
  visaProcessing: z.string().optional(),
  visaEntries:    z.string().optional(),

  // Supplier
  supplierName: z.string().optional(),
  supplierRef:  z.string().optional(),

  // Travelers
  travelers: z.array(travelerSchema).min(1),

  // Pricing
  costPriceSAR:  z.coerce.number().min(0).default(0),
  serviceFeeSAR: z.coerce.number().min(0).default(0),

  notes: z.string().optional(),
});

type FormData = z.infer<typeof formSchema>;

// CustomerSearch is imported from @/components/customers/CustomerSearch

// ─── Service Grid ─────────────────────────────────────────────────────────────

function ServiceGrid({ isAr, onSelect, onAddNew }: {
  isAr:     boolean;
  onSelect: (value: string, nameAr: string, nameEn: string) => void;
  onAddNew: () => void;
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
      const q = query(collection(db, 'service_types'), where('agencyId', '==', user!.agencyId), where('isActive', '==', true));
      unsub = onSnapshot(q, snap => {
        setCustomTypes(snap.docs.map(d => ({ id: d.id, ...d.data() } as { id: string; nameAr: string; nameEn: string; icon: string })));
      });
    }
    void load();
    return () => unsub?.();
  }, [user?.agencyId]);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">{isAr ? 'اختر نوع الخدمة' : 'Select Service'}</h1>
        <p className="text-slate-500 text-sm mt-1">
          {isAr ? 'اختر الخدمة المطلوبة لتبدأ بتسجيل الطلب' : 'Choose the service to start the booking order'}
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
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center bg-slate-100 text-slate-600 group-hover:scale-110 transition-transform">
              {ICON_MAP[ct.icon] ?? <Layers size={26} />}
            </div>
            <span className="text-sm font-semibold text-slate-800 text-center">{isAr ? ct.nameAr : ct.nameEn}</span>
          </button>
        ))}

        <button
          onClick={onAddNew}
          className="group flex flex-col items-center gap-3 p-5 rounded-2xl border-2 border-dashed border-slate-300 hover:border-brand-400 hover:bg-brand-50/40 transition-all duration-200"
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

// ─── Service-Specific Detail Fields ───────────────────────────────────────────

const IC = 'w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white';

function ServiceFields({
  type, isAr, register,
}: {
  type: string;
  isAr: boolean;
  register: ReturnType<typeof useForm<FormData>>['register'];
}) {
  if (type === 'flight' || type === 'flight_hotel') return (
    <div className="grid grid-cols-2 gap-3">
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">{isAr ? 'مدينة المغادرة' : 'From City'}</label>
        <input className={IC} placeholder={isAr ? 'الرياض - RUH' : 'Riyadh - RUH'} {...register('fromCity')} />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">{isAr ? 'مدينة الوصول' : 'To City'}</label>
        <input className={IC} placeholder={isAr ? 'جدة - JED' : 'Jeddah - JED'} {...register('toCity')} />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">{isAr ? 'تاريخ الذهاب' : 'Departure'}</label>
        <input type="date" className={IC} {...register('departureDate')} />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">{isAr ? 'تاريخ العودة' : 'Return'}</label>
        <input type="date" className={IC} {...register('returnDate')} />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">{isAr ? 'شركة الطيران' : 'Airline'}</label>
        <input className={IC} placeholder={isAr ? 'الخطوط السعودية، flyadeal...' : 'Saudia, flyadeal...'} {...register('airline')} />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">{isAr ? 'رقم الرحلة / PNR' : 'Flight No / PNR'}</label>
        <input className={IC} dir="ltr" placeholder="SV123 / ABC123" {...register('pnr')} />
      </div>
      <div className="col-span-2">
        <label className="block text-xs font-medium text-slate-600 mb-1">{isAr ? 'الدرجة' : 'Cabin Class'}</label>
        <select className={IC} {...register('flightClass')}>
          <option value="economy">{isAr ? 'اقتصادية' : 'Economy'}</option>
          <option value="business">{isAr ? 'رجال الأعمال' : 'Business'}</option>
          <option value="first">{isAr ? 'الدرجة الأولى' : 'First Class'}</option>
        </select>
      </div>
    </div>
  );

  if (type === 'hotel') return (
    <div className="grid grid-cols-2 gap-3">
      <div className="col-span-2">
        <label className="block text-xs font-medium text-slate-600 mb-1">{isAr ? 'اسم الفندق' : 'Hotel Name'}</label>
        <input className={IC} placeholder={isAr ? 'اسم الفندق' : 'Hotel name'} {...register('hotelName')} />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">{isAr ? 'الوجهة / المدينة' : 'City / Destination'}</label>
        <input className={IC} placeholder={isAr ? 'دبي، إسطنبول...' : 'Dubai, Istanbul...'} {...register('destination')} />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">{isAr ? 'نوع الغرفة' : 'Room Type'}</label>
        <select className={IC} {...register('roomType')}>
          <option value="single">{isAr ? 'مفردة' : 'Single'}</option>
          <option value="double">{isAr ? 'مزدوجة' : 'Double'}</option>
          <option value="triple">{isAr ? 'ثلاثية' : 'Triple'}</option>
          <option value="suite">{isAr ? 'جناح' : 'Suite'}</option>
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">{isAr ? 'تاريخ الدخول' : 'Check-in'}</label>
        <input type="date" className={IC} {...register('departureDate')} />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">{isAr ? 'تاريخ المغادرة' : 'Check-out'}</label>
        <input type="date" className={IC} {...register('returnDate')} />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">{isAr ? 'الإقامة' : 'Board Type'}</label>
        <select className={IC} {...register('boardType')}>
          <option value="ro">{isAr ? 'غرفة فقط' : 'Room Only'}</option>
          <option value="bb">{isAr ? 'إفطار' : 'Bed & Breakfast'}</option>
          <option value="hb">{isAr ? 'نصف إقامة' : 'Half Board'}</option>
          <option value="fb">{isAr ? 'إقامة كاملة' : 'Full Board'}</option>
          <option value="ai">{isAr ? 'شامل' : 'All Inclusive'}</option>
        </select>
      </div>
    </div>
  );

  if (type === 'visa' || type === 'family_visit') return (
    <div className="grid grid-cols-2 gap-3">
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">{isAr ? 'الدولة المقصودة' : 'Destination Country'}</label>
        <input className={IC} placeholder={isAr ? 'الولايات المتحدة، المملكة المتحدة...' : 'USA, UK...'} {...register('visaCountry')} />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">{isAr ? 'نوع التأشيرة' : 'Visa Type'}</label>
        <select className={IC} {...register('visaType')}>
          <option value="tourist">{isAr ? 'سياحية' : 'Tourist'}</option>
          <option value="family">{isAr ? 'زيارة عائلية' : 'Family Visit'}</option>
          <option value="business">{isAr ? 'تجارية' : 'Business'}</option>
          <option value="transit">{isAr ? 'عبور' : 'Transit'}</option>
          <option value="work">{isAr ? 'عمل' : 'Work'}</option>
          <option value="student">{isAr ? 'دراسة' : 'Student'}</option>
          <option value="medical">{isAr ? 'علاج' : 'Medical'}</option>
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">{isAr ? 'نوع الدخول' : 'Entry Type'}</label>
        <select className={IC} {...register('visaEntries')}>
          <option value="single">{isAr ? 'دخول واحد' : 'Single Entry'}</option>
          <option value="double">{isAr ? 'دخولان' : 'Double Entry'}</option>
          <option value="multiple">{isAr ? 'دخول متعدد' : 'Multiple Entry'}</option>
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">{isAr ? 'سرعة المعالجة' : 'Processing'}</label>
        <select className={IC} {...register('visaProcessing')}>
          <option value="normal">{isAr ? 'عادية 5-7 أيام' : 'Normal 5-7 days'}</option>
          <option value="express">{isAr ? 'سريعة 2-3 أيام' : 'Express 2-3 days'}</option>
          <option value="urgent">{isAr ? 'عاجلة 24 ساعة' : 'Urgent 24h'}</option>
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">{isAr ? 'تاريخ السفر المخطط' : 'Planned Travel Date'}</label>
        <input type="date" className={IC} {...register('departureDate')} />
      </div>
    </div>
  );

  if (type === 'umrah' || type === 'hajj') return (
    <div className="grid grid-cols-2 gap-3">
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">{isAr ? 'تاريخ المجموعة' : 'Group Date'}</label>
        <input type="date" className={IC} {...register('departureDate')} />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">{isAr ? 'تاريخ العودة' : 'Return Date'}</label>
        <input type="date" className={IC} {...register('returnDate')} />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">{isAr ? 'فندق مكة المكرمة' : 'Makkah Hotel'}</label>
        <input className={IC} placeholder={isAr ? 'اسم الفندق' : 'Hotel name'} {...register('makkahHotel')} />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">{isAr ? 'عدد ليالي مكة' : 'Makkah Nights'}</label>
        <input type="number" min="1" className={IC} dir="ltr" {...register('makkahNights')} />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">{isAr ? 'فندق المدينة المنورة' : 'Madinah Hotel'}</label>
        <input className={IC} placeholder={isAr ? 'اسم الفندق' : 'Hotel name'} {...register('madinahHotel')} />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">{isAr ? 'عدد ليالي المدينة' : 'Madinah Nights'}</label>
        <input type="number" min="1" className={IC} dir="ltr" {...register('madinahNights')} />
      </div>
    </div>
  );

  // Generic (package, insurance, transfer, cruise, custom)
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="col-span-2">
        <label className="block text-xs font-medium text-slate-600 mb-1">{isAr ? 'الوجهة / التفاصيل' : 'Destination / Details'}</label>
        <input className={IC} placeholder={isAr ? 'وصف الخدمة أو الوجهة' : 'Service description or destination'} {...register('destination')} />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">{isAr ? 'تاريخ البدء' : 'Start Date'}</label>
        <input type="date" className={IC} {...register('departureDate')} />
      </div>
      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">{isAr ? 'تاريخ الانتهاء' : 'End Date'}</label>
        <input type="date" className={IC} {...register('returnDate')} />
      </div>
    </div>
  );
}

// ─── Main Booking Content ──────────────────────────────────────────────────────

const STEPS = [
  { ar: 'العميل',           en: 'Customer' },
  { ar: 'الخدمة والمسافرون', en: 'Service & Travelers' },
  { ar: 'التسعير',          en: 'Pricing' },
];

function NewBookingContent() {
  const locale   = useLocale();
  const router   = useRouter();
  const params   = useSearchParams();
  const isAr     = locale === 'ar';
  const { user } = useAuth();
  const agencyId = user?.agencyId ?? user?.uid ?? '';

  const [step, setStep]         = useState(0);
  const [selType,  setSelType]  = useState('');
  const [selNames, setSelNames] = useState({ ar: '', en: '' });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError]   = useState('');
  const [agencyIsVatRegistered, setAgencyIsVatRegistered] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<{
    id: string; nameAr: string; nameEn: string; phone: string; email: string;
  } | null>(null);

  // Load agency VAT registration status
  useEffect(() => {
    if (!agencyId) return;
    async function loadVatStatus() {
      try {
        const { getFirestore, doc, getDoc } = await import('firebase/firestore');
        const { getApp } = await import('@masarat/firebase');
        const db = getFirestore(getApp());
        const snap = await getDoc(doc(db, 'agencies', agencyId));
        if (snap.exists()) {
          const d = snap.data();
          setAgencyIsVatRegistered(d.isVatRegistered ?? (d.vatNumber ?? '').trim().length > 0);
        }
      } catch { /* default to false */ }
    }
    void loadVatStatus();
  }, [agencyId]);

  const {
    register, control, watch, handleSubmit, setValue, trigger,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      revenueModel: 'agent',
      travelers: [{ nameAr: '', nationality: 'SA', gender: 'male' }],
      costPriceSAR:  0,
      serviceFeeSAR: 0,
    },
  });

  const { fields: travFields, append, remove } = useFieldArray({ control, name: 'travelers' });

  useEffect(() => {
    const t = params.get('type');
    if (!t) return;
    const found = BUILT_IN.find(s => s.value === t);
    if (found) { setSelType(t); setSelNames({ ar: found.ar, en: found.en }); setStep(1); }
  }, [params]);

  // Pre-fill customer when navigated from customer detail page
  useEffect(() => {
    const custId = params.get('customerId');
    if (!custId || !user) return;
    const resolvedCustId = custId;
    let cancelled = false;
    async function loadPrefilledCustomer() {
      try {
        const { getFirestore, doc, getDoc } = await import('firebase/firestore');
        const { getApp } = await import('@masarat/firebase');
        const db   = getFirestore(getApp());
        const snap = await getDoc(doc(db, 'customers', resolvedCustId));
        if (cancelled || !snap.exists()) return;
        const d    = snap.data() as Record<string, unknown>;
        const name = d['name'] as { ar?: string; en?: string } | undefined;
        const cust = {
          id:     snap.id,
          nameAr: name?.ar ?? (d['nameAr'] as string) ?? '',
          nameEn: name?.en ?? (d['nameEn'] as string) ?? '',
          phone:  (d['mobile'] as string) ?? (d['phone'] as string) ?? '',
          email:  (d['email']  as string) ?? '',
        };
        setSelectedCustomer(cust);
        setValue('customerId',    cust.id);
        setValue('customerName',  cust.nameAr || cust.nameEn);
        setValue('customerPhone', cust.phone);
        setValue('customerEmail', cust.email);
      } catch { /* non-critical — user can search manually */ }
    }
    void loadPrefilledCustomer();
    return () => { cancelled = true; };
  }, [params, user, setValue]);

  // ── Pricing (fixed: use Number() to avoid string concatenation) ──
  const costSAR    = Number(watch('costPriceSAR'))  || 0;
  const feeSAR     = Number(watch('serviceFeeSAR')) || 0;
  const model      = watch('revenueModel');
  const sellSAR    = model === 'agent' ? costSAR + feeSAR : costSAR;
  const vatBaseSAR = model === 'agent' ? feeSAR : sellSAR;
  const vatSAR     = agencyIsVatRegistered ? Math.round(vatBaseSAR * 15) / 100 : 0;
  const totalSAR   = sellSAR + vatSAR;
  const loc2       = isAr ? 'ar-SA' : 'en-SA';
  const toH        = (n: number) => Math.round(n * 100);

  const BackIcon = isAr ? ArrowRight : ArrowLeft;
  const FwdIcon  = isAr ? ChevronLeft : ChevronRight;

  async function advanceTo(next: number) {
    // Validate current step fields before advancing
    let valid = true;
    if (step === 1) valid = await trigger(['customerName', 'customerPhone']);
    if (valid) { setFormError(''); setStep(next); }
    else setFormError(isAr ? 'يرجى تعبئة الحقول المطلوبة' : 'Please fill required fields');
  }

  async function onSubmit(data: FormData) {
    if (!user || !selType) return;
    setSubmitting(true);
    setFormError('');
    try {
      const { getAuth } = await import('firebase/auth');
      const { getApp }  = await import('@masarat/firebase');
      const token = await getAuth(getApp()).currentUser?.getIdToken();
      if (!token) throw new Error('no token');

      const costH  = toH(data.costPriceSAR ?? 0);
      const feeH   = toH(data.serviceFeeSAR ?? 0);
      const sell   = data.revenueModel === 'agent' ? costH + feeH : costH;
      const vBase  = data.revenueModel === 'agent' ? feeH : sell;
      const vatH   = agencyIsVatRegistered ? Math.round(vBase * 0.15) : 0;
      const totalH = sell + vatH;

      const res = await fetch('/api/bookings/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          type:         selType,
          customerName: { ar: data.customerName, en: data.customerName },
          customerPhone: data.customerPhone,
          customerEmail: data.customerEmail ?? '',
          customerId:    data.customerId ?? '',
          passengers: data.travelers.map((t, i) => ({
            order: i + 1, type: 'adult',
            nameAr: t.nameAr ?? '', nameEn: t.nameEn ?? t.nameAr ?? '',
            passportNumber: t.passportNumber ?? '',
            passportExpiry: t.passportExpiry ?? '',
            nationality:    t.nationality ?? 'SA',
            dateOfBirth:    t.dateOfBirth ?? '',
            gender:         t.gender ?? 'male',
            customerId: '',
          })),
          pricing: {
            revenueModel: data.revenueModel, currency: 'SAR',
            totalCost: costH, serviceFee: feeH, vatAmount: vatH,
            totalAmount: totalH, commission: feeH,
          },
          supplierName:  data.supplierName ?? '',
          supplierRef:   data.supplierRef  ?? '',
          destination:   data.destination  ?? data.visaCountry ?? data.toCity ?? '',
          travelDate:    data.departureDate ?? null,
          returnDate:    data.returnDate    ?? null,
          notes:         data.notes ?? '',
          details: {
            fromCity: data.fromCity ?? null, toCity: data.toCity ?? null,
            airline: data.airline ?? null, flightClass: data.flightClass ?? null, pnr: data.pnr ?? null,
            hotelName: data.hotelName ?? null, roomType: data.roomType ?? null, boardType: data.boardType ?? null,
            makkahHotel: data.makkahHotel ?? null, makkahNights: data.makkahNights ?? null,
            madinahHotel: data.madinahHotel ?? null, madinahNights: data.madinahNights ?? null,
            visaCountry: data.visaCountry ?? null, visaType: data.visaType ?? null,
            visaProcessing: data.visaProcessing ?? null, visaEntries: data.visaEntries ?? null,
          },
        }),
      });

      const json = await res.json() as { bookingId?: string; error?: string };
      if (!res.ok) throw new Error(json.error ?? 'server error');

      router.push(`/${locale}/bookings/${json.bookingId}`);
    } catch (err) {
      console.error('Booking save error:', err);
      setFormError(isAr ? 'حدث خطأ أثناء الحفظ، حاول مرة أخرى' : 'Error saving, please try again');
      setSubmitting(false);
    }
  }

  // ── Step 0: Service Grid ─────────────────────────────────────────────────

  if (step === 0) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors">
            <BackIcon size={18} />
          </button>
        </div>
        <ServiceGrid
          isAr={isAr}
          onSelect={(v, ar, en) => { setSelType(v); setSelNames({ ar, en }); setStep(1); }}
          onAddNew={() => router.push(`/${locale}/settings?tab=service_types`)}
        />
      </div>
    );
  }

  // ── Steps 1-3: Form ──────────────────────────────────────────────────────

  const formStep = step - 1;
  const svcConf  = BUILT_IN.find(s => s.value === selType);

  return (
    <div className="max-w-2xl mx-auto space-y-5">

      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={() => setStep(0)} className="p-2 rounded-lg text-slate-500 hover:bg-slate-100">
          <BackIcon size={18} />
        </button>
        <h1 className="text-lg font-bold text-slate-900 flex-1">
          {isAr ? 'تقديم خدمة جديدة' : 'New Service'}
        </h1>
        {/* Service chip */}
        <button
          onClick={() => setStep(0)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold border-2 transition-colors hover:opacity-80"
          style={{ borderColor: svcConf?.color ?? '#64748b', color: svcConf?.color ?? '#64748b', backgroundColor: svcConf?.bg ?? '#f8fafc' }}
        >
          <span>{isAr ? selNames.ar : selNames.en}</span>
          <X size={13} />
        </button>
      </div>

      {/* Step progress */}
      <div className="flex items-center gap-1">
        {STEPS.map((s, idx) => (
          <div key={s.en} className="flex items-center flex-1">
            <div className={cn(
              'flex items-center gap-1.5 text-xs font-semibold',
              idx === formStep ? 'text-brand-600' : idx < formStep ? 'text-emerald-600' : 'text-slate-400',
            )}>
              <span className={cn(
                'w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold flex-shrink-0',
                idx === formStep ? 'bg-brand-600 text-white' : idx < formStep ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-500',
              )}>
                {idx < formStep ? <Check size={11} /> : idx + 1}
              </span>
              <span className="hidden sm:block">{isAr ? s.ar : s.en}</span>
            </div>
            {idx < STEPS.length - 1 && (
              <div className={cn('flex-1 h-0.5 mx-2', idx < formStep ? 'bg-emerald-400' : 'bg-slate-200')} />
            )}
          </div>
        ))}
      </div>

      {formError && (
        <div className="px-4 py-2.5 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          {formError}
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} noValidate>

        {/* ── Step 1: Customer ────────────────────────────────────────────── */}
        {formStep === 0 && (
          <div className="space-y-4">
            {/* Customer search / selected customer */}
            {agencyId && (
              <Card>
                <CardHeader>
                  <CardTitle>
                    <Search size={16} className="text-brand-600" />
                    {isAr ? 'ابحث عن عميل موجود' : 'Search Existing Customer'}
                  </CardTitle>
                </CardHeader>

                {/* Selected customer chip */}
                {selectedCustomer ? (
                  <div className="flex items-center gap-3 p-3 bg-brand-50 border border-brand-200 rounded-xl mb-2">
                    <div className="w-9 h-9 rounded-full bg-brand-600 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                      {selectedCustomer.nameAr[0] ?? '؟'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-slate-900 truncate">{selectedCustomer.nameAr}</p>
                      {selectedCustomer.nameEn && (
                        <p className="text-xs text-slate-400 truncate">{selectedCustomer.nameEn}</p>
                      )}
                      <p className="text-xs text-slate-500" dir="ltr">{selectedCustomer.phone}</p>
                    </div>
                    <button
                      type="button"
                      title={isAr ? 'تغيير العميل' : 'Change customer'}
                      onClick={() => {
                        setSelectedCustomer(null);
                        setValue('customerId',    '');
                        setValue('customerName',  '');
                        setValue('customerPhone', '');
                        setValue('customerEmail', '');
                      }}
                      className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <X size={15} />
                    </button>
                  </div>
                ) : (
                  <CustomerSearch
                    agencyId={agencyId}
                    onSelect={c => {
                      const cust = {
                        id:     c.id,
                        nameAr: c.nameAr ?? c.nameEn ?? '',
                        nameEn: c.nameEn ?? '',
                        phone:  c.phone  ?? '',
                        email:  c.email  ?? '',
                      };
                      setSelectedCustomer(cust);
                      setValue('customerId',    cust.id);
                      setValue('customerName',  cust.nameAr || cust.nameEn);
                      setValue('customerPhone', cust.phone);
                      setValue('customerEmail', cust.email);
                    }}
                  />
                )}

                <p className="text-xs text-slate-400 mt-2">
                  {isAr ? 'أو أدخل بيانات عميل جديد أدناه' : 'Or enter new customer details below'}
                </p>
              </Card>
            )}

            {/* Customer fields */}
            <Card>
              <CardHeader>
                <CardTitle>
                  <UserPlus size={16} className="text-brand-600" />
                  {isAr ? 'بيانات العميل' : 'Customer Information'}
                </CardTitle>
              </CardHeader>
              <div className="space-y-3">
                <Input
                  label={isAr ? 'اسم العميل *' : 'Customer Name *'}
                  placeholder={isAr ? 'الاسم الكامل' : 'Full name'}
                  error={errors.customerName?.message}
                  {...register('customerName')}
                />
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    label={isAr ? 'رقم الجوال *' : 'Mobile *'}
                    type="tel"
                    placeholder="05xxxxxxxx"
                    dir="ltr"
                    error={errors.customerPhone?.message}
                    {...register('customerPhone')}
                  />
                  <Input
                    label={isAr ? 'البريد الإلكتروني' : 'Email'}
                    type="email"
                    placeholder={isAr ? 'اختياري' : 'Optional'}
                    {...register('customerEmail')}
                  />
                </div>
              </div>
            </Card>

            {/* Revenue model */}
            <Card>
              <CardHeader>
                <CardTitle>
                  <FileText size={16} className="text-brand-600" />
                  {isAr ? 'نموذج المحاسبة' : 'Accounting Model'}
                </CardTitle>
              </CardHeader>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  { value: 'agent',     titleAr: 'وكيل (Agent)',     descAr: 'يُسجَّل صافي الإيراد — العمولة والرسوم فقط',     titleEn: 'Agent Model',     descEn: 'Net revenue — commission & fees only (IFRS 15)' },
                  { value: 'principal', titleAr: 'مالك (Principal)',  descAr: 'يُسجَّل الإيراد الإجمالي — سعر البيع كاملاً',   titleEn: 'Principal Model', descEn: 'Gross revenue — full selling price (IFRS 15)' },
                ].map(m => {
                  const sel = watch('revenueModel') === m.value;
                  return (
                    <label key={m.value} className={cn(
                      'flex flex-col gap-1.5 p-3.5 rounded-xl border-2 cursor-pointer transition-colors',
                      sel ? 'border-brand-500 bg-brand-50' : 'border-slate-200 hover:border-slate-300',
                    )}>
                      <div className="flex items-center gap-2">
                        <input type="radio" value={m.value} className="accent-brand-600" {...register('revenueModel')} />
                        <span className="font-semibold text-sm text-slate-900">{isAr ? m.titleAr : m.titleEn}</span>
                      </div>
                      <p className="text-[11px] text-slate-500 ps-5 leading-snug">{isAr ? m.descAr : m.descEn}</p>
                    </label>
                  );
                })}
              </div>
            </Card>

            <div className="flex justify-end">
              <Button type="button" onClick={() => advanceTo(2)}>
                {isAr ? 'التالي' : 'Next'} <FwdIcon size={16} />
              </Button>
            </div>
          </div>
        )}

        {/* ── Step 2: Service Details + Travelers ─────────────────────────── */}
        {formStep === 1 && (
          <div className="space-y-4">
            {/* Service-specific fields */}
            <Card>
              <CardHeader>
                <CardTitle>
                  {svcConf && (
                    <span style={{ color: svcConf.color }}>{svcConf.icon ?? null}</span>
                  )}
                  {isAr ? `تفاصيل ${selNames.ar}` : `${selNames.en} Details`}
                </CardTitle>
              </CardHeader>
              <ServiceFields type={selType} isAr={isAr} register={register} />
            </Card>

            {/* Travelers */}
            <Card>
              <CardHeader>
                <CardTitle>
                  <Users size={16} className="text-brand-600" />
                  {isAr ? 'المسافرون / المتقدمون' : 'Travelers / Applicants'}
                </CardTitle>
                <Button
                  type="button" size="sm" variant="outline"
                  onClick={() => append({ nameAr: '', nationality: 'SA', gender: 'male' })}
                >
                  <Plus size={14} /> {isAr ? 'إضافة' : 'Add'}
                </Button>
              </CardHeader>

              <div className="space-y-3">
                {travFields.map((field, idx) => (
                  <div key={field.id} className="rounded-xl border border-slate-200 p-3 space-y-2.5 bg-slate-50/50">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-600">
                        {isAr ? `مسافر ${idx + 1}` : `Traveler ${idx + 1}`}
                      </span>
                      {idx > 0 && (
                        <button type="button" onClick={() => remove(idx)} className="p-0.5 text-red-400 hover:text-red-600">
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[11px] font-medium text-slate-500 mb-1">{isAr ? 'الاسم بالعربي' : 'Arabic Name'}</label>
                        <input className={IC} placeholder={isAr ? 'الاسم الكامل' : 'Full name'} {...register(`travelers.${idx}.nameAr`)} />
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-slate-500 mb-1">{isAr ? 'الاسم بالإنجليزي' : 'English Name'}</label>
                        <input className={IC} placeholder="As in passport" dir="ltr" {...register(`travelers.${idx}.nameEn`)} />
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-slate-500 mb-1">{isAr ? 'رقم الجواز' : 'Passport No.'}</label>
                        <input className={IC} placeholder="A12345678" dir="ltr" {...register(`travelers.${idx}.passportNumber`)} />
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-slate-500 mb-1">{isAr ? 'انتهاء الجواز' : 'Passport Expiry'}</label>
                        <input type="date" className={IC} {...register(`travelers.${idx}.passportExpiry`)} />
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-slate-500 mb-1">{isAr ? 'الجنسية' : 'Nationality'}</label>
                        <input className={IC} placeholder="SA" dir="ltr" {...register(`travelers.${idx}.nationality`)} />
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-slate-500 mb-1">{isAr ? 'الجنس' : 'Gender'}</label>
                        <select className={IC} {...register(`travelers.${idx}.gender`)}>
                          <option value="male">{isAr ? 'ذكر' : 'Male'}</option>
                          <option value="female">{isAr ? 'أنثى' : 'Female'}</option>
                        </select>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            {/* Supplier */}
            <Card>
              <CardHeader>
                <CardTitle>{isAr ? 'بيانات المورد' : 'Supplier'}</CardTitle>
              </CardHeader>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">{isAr ? 'اسم المورد' : 'Supplier Name'}</label>
                  <input className={IC} placeholder={isAr ? 'شركة الطيران، الفندق...' : 'Airline, hotel...'} {...register('supplierName')} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">{isAr ? 'رقم مرجع المورد' : 'Supplier Ref.'}</label>
                  <input className={IC} dir="ltr" placeholder="REF-12345" {...register('supplierRef')} />
                </div>
              </div>
            </Card>

            <div className="flex justify-between">
              <Button type="button" variant="outline" onClick={() => setStep(1)}>
                <BackIcon size={16} /> {isAr ? 'السابق' : 'Back'}
              </Button>
              <Button type="button" onClick={() => advanceTo(3)}>
                {isAr ? 'التالي' : 'Next'} <FwdIcon size={16} />
              </Button>
            </div>
          </div>
        )}

        {/* ── Step 3: Pricing & Confirm ────────────────────────────────────── */}
        {formStep === 2 && (
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>{isAr ? 'التسعير' : 'Pricing'}</CardTitle>
              </CardHeader>

              {/* Pricing inputs */}
              <div className="space-y-3">
                {model === 'agent' ? (
                  <>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        {isAr ? 'التكلفة من المورد (ريال)' : 'Cost from Supplier (SAR)'}
                      </label>
                      <input
                        type="number" step="0.01" min="0"
                        className={IC} dir="ltr"
                        {...register('costPriceSAR')}
                      />
                      <p className="text-[11px] text-slate-400 mt-0.5">{isAr ? 'المبلغ الذي تدفعه للمورد' : 'Amount you pay to supplier'}</p>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        {isAr ? 'رسوم الوكالة (ريال)' : 'Agency Fee (SAR)'}
                      </label>
                      <input
                        type="number" step="0.01" min="0"
                        className={IC} dir="ltr"
                        {...register('serviceFeeSAR')}
                      />
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {agencyIsVatRegistered
                          ? (isAr ? 'رسومك — تخضع للضريبة 15%' : 'Your fee — subject to 15% VAT')
                          : (isAr ? 'رسومك — الوكالة غير مسجّلة ضريبياً' : 'Your fee — agency not VAT-registered')}
                      </p>
                    </div>
                  </>
                ) : (
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      {isAr ? 'سعر البيع للعميل (ريال)' : 'Selling Price to Client (SAR)'}
                    </label>
                    <input
                      type="number" step="0.01" min="0"
                      className={IC} dir="ltr"
                      {...register('costPriceSAR')}
                    />
                    <p className="text-[11px] text-slate-400 mt-0.5">{isAr ? 'السعر الكامل للعميل شامل التكلفة' : 'Full price to client including cost'}</p>
                  </div>
                )}
              </div>

              {/* Pricing summary table */}
              <div className="mt-4 rounded-xl border border-slate-200 overflow-hidden">
                <table className="w-full text-sm">
                  <tbody className="divide-y divide-slate-100">
                    {model === 'agent' && (
                      <tr className="bg-white">
                        <td className="px-4 py-2.5 text-slate-600">{isAr ? 'تكلفة المورد' : 'Supplier Cost'}</td>
                        <td className="px-4 py-2.5 text-end font-medium text-slate-800">{costSAR.toFixed(2)} {isAr ? 'ر.س' : 'SAR'}</td>
                      </tr>
                    )}
                    {model === 'agent' && (
                      <tr className="bg-white">
                        <td className="px-4 py-2.5 text-slate-600">{isAr ? 'رسوم الوكالة' : 'Agency Fee'}</td>
                        <td className="px-4 py-2.5 text-end font-medium text-slate-800">{feeSAR.toFixed(2)} {isAr ? 'ر.س' : 'SAR'}</td>
                      </tr>
                    )}
                    <tr className="bg-white">
                      <td className="px-4 py-2.5 text-slate-600">{isAr ? 'سعر البيع' : 'Selling Price'}</td>
                      <td className="px-4 py-2.5 text-end font-medium text-slate-800">{sellSAR.toFixed(2)} {isAr ? 'ر.س' : 'SAR'}</td>
                    </tr>
                    {agencyIsVatRegistered && (
                      <tr className="bg-slate-50/50">
                        <td className="px-4 py-2.5 text-slate-500">{isAr ? 'ضريبة القيمة المضافة (15%)' : 'VAT (15%)'}</td>
                        <td className="px-4 py-2.5 text-end text-slate-600">{vatSAR.toFixed(2)} {isAr ? 'ر.س' : 'SAR'}</td>
                      </tr>
                    )}
                    <tr className="bg-brand-50">
                      <td className="px-4 py-3 font-bold text-slate-900">
                        {agencyIsVatRegistered
                          ? (isAr ? 'الإجمالي شامل الضريبة' : 'Total incl. VAT')
                          : (isAr ? 'الإجمالي' : 'Total')}
                      </td>
                      <td className="px-4 py-3 text-end">
                        <span className="text-lg font-bold text-brand-700">{formatCurrency(toH(totalSAR), loc2)}</span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </Card>

            {/* Notes */}
            <Card>
              <CardHeader>
                <CardTitle>{isAr ? 'ملاحظات' : 'Notes'}</CardTitle>
              </CardHeader>
              <textarea
                rows={3}
                placeholder={isAr ? 'ملاحظات داخلية أو تعليمات خاصة...' : 'Internal notes or special instructions...'}
                className={cn(IC, 'resize-none')}
                {...register('notes')}
              />
            </Card>

            <div className="flex justify-between gap-3">
              <Button type="button" variant="outline" onClick={() => setStep(2)}>
                <BackIcon size={16} /> {isAr ? 'السابق' : 'Back'}
              </Button>
              <Button type="submit" loading={submitting} className="flex-1 sm:flex-none">
                {submitting
                  ? (isAr ? 'جارٍ الحفظ...' : 'Saving...')
                  : (isAr ? 'تأكيد وحفظ الطلب' : 'Confirm & Save')}
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
    <Suspense fallback={<div className="flex items-center justify-center py-24"><Spinner size="lg" /></div>}>
      <NewBookingContent />
    </Suspense>
  );
}
