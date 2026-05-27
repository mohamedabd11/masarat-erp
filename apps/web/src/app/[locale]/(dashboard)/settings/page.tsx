'use client';

import { useState, useEffect } from 'react';
import { useLocale } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@masarat/firebase';
import type { UserDoc } from '@masarat/firebase';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/lib/utils';
import {
  Building2,
  Users,
  Package,
  Shield,
  CreditCard,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ChevronRight,
  Plane,
  Hotel,
  Moon,
  Anchor,
  BarChart3,
  Truck,
  Globe,
  FileText,
  ImagePlus,
  UserPlus,
  Layers,
  Plus,
  Trash2,
  Stamp,
  Car,
  Train,
  Camera,
  Mountain,
  Pencil,
  X,
} from 'lucide-react';
import { InviteUserModal } from '@/components/settings/InviteUserModal';
import { useSubscription } from '@/providers/SubscriptionProvider';
import { MessageCircle } from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

type Tab = 'agency' | 'users' | 'modules' | 'zatca' | 'billing' | 'service_types';

// ─── Tab definitions ─────────────────────────────────────────────────────────

const TABS: Array<{ key: Tab; ar: string; en: string; icon: React.ReactNode }> = [
  { key: 'agency',        ar: 'بيانات الوكالة',  en: 'Agency Info',    icon: <Building2 size={16} /> },
  { key: 'users',         ar: 'المستخدمون',       en: 'Users',          icon: <Users size={16} /> },
  { key: 'modules',       ar: 'الوحدات',          en: 'Modules',        icon: <Package size={16} /> },
  { key: 'service_types', ar: 'أنواع الخدمات',    en: 'Service Types',  icon: <Layers size={16} /> },
  { key: 'zatca',         ar: 'ZATCA',            en: 'ZATCA',          icon: <Shield size={16} /> },
  { key: 'billing',       ar: 'الاشتراك',         en: 'Billing',        icon: <CreditCard size={16} /> },
];

// ─── Module definitions ───────────────────────────────────────────────────────

interface Module {
  id: string;
  ar: string;
  en: string;
  descAr: string;
  descEn: string;
  icon: React.ReactNode;
  core?: boolean;
  enabled: boolean;
}

const INITIAL_MODULES: Module[] = [
  {
    id: 'bookings',
    ar: 'الحجوزات',
    en: 'Bookings',
    descAr: 'إدارة جميع أنواع الحجوزات',
    descEn: 'Manage all booking types',
    icon: <FileText size={18} />,
    core: true,
    enabled: true,
  },
  {
    id: 'customers',
    ar: 'العملاء',
    en: 'Customers',
    descAr: 'قاعدة بيانات العملاء والمسافرين',
    descEn: 'Customer & traveler database',
    icon: <Users size={18} />,
    core: true,
    enabled: true,
  },
  {
    id: 'flights',
    ar: 'الطيران',
    en: 'Flights',
    descAr: 'إدارة حجوزات الطيران',
    descEn: 'Flight booking management',
    icon: <Plane size={18} />,
    enabled: true,
  },
  {
    id: 'hotels',
    ar: 'الفنادق',
    en: 'Hotels',
    descAr: 'إدارة حجوزات الفنادق',
    descEn: 'Hotel booking management',
    icon: <Hotel size={18} />,
    enabled: true,
  },
  {
    id: 'packages',
    ar: 'الباقات السياحية',
    en: 'Tour Packages',
    descAr: 'باقات سياحية متكاملة',
    descEn: 'Complete tour packages',
    icon: <Package size={18} />,
    enabled: true,
  },
  {
    id: 'umrah',
    ar: 'العمرة والحج',
    en: 'Umrah & Hajj',
    descAr: 'برامج العمرة والحج المتخصصة',
    descEn: 'Specialized Umrah & Hajj programs',
    icon: <Moon size={18} />,
    enabled: false,
  },
  {
    id: 'insurance',
    ar: 'التأمين',
    en: 'Insurance',
    descAr: 'تأمين السفر والطوارئ',
    descEn: 'Travel & emergency insurance',
    icon: <Shield size={18} />,
    enabled: false,
  },
  {
    id: 'visas',
    ar: 'التأشيرات',
    en: 'Visas',
    descAr: 'معالجة طلبات التأشيرات',
    descEn: 'Visa application processing',
    icon: <Globe size={18} />,
    enabled: false,
  },
  {
    id: 'transfers',
    ar: 'النقل',
    en: 'Transfers',
    descAr: 'نقل المسافرين والمجموعات',
    descEn: 'Passenger & group transfers',
    icon: <Truck size={18} />,
    enabled: false,
  },
  {
    id: 'cruises',
    ar: 'الرحلات البحرية',
    en: 'Cruises',
    descAr: 'حجوزات الرحلات البحرية',
    descEn: 'Cruise booking management',
    icon: <Anchor size={18} />,
    enabled: false,
  },
  {
    id: 'accounting',
    ar: 'المحاسبة',
    en: 'Accounting',
    descAr: 'قيود محاسبية وتقارير مالية',
    descEn: 'Journal entries & financial reports',
    icon: <BarChart3 size={18} />,
    enabled: true,
  },
];

// ─── Plan features ────────────────────────────────────────────────────────────


// ─── Service Types ────────────────────────────────────────────────────────────

interface CustomServiceType {
  id: string;
  agencyId: string;
  nameAr: string;
  nameEn: string;
  icon: string;
  color: string;
  isActive: boolean;
}

const DEFAULT_SERVICE_TYPES: Array<{
  id: string;
  ar: string;
  en: string;
  icon: React.ReactNode;
  color: string;
}> = [
  { id: 'flight',    ar: 'طيران',         en: 'Flight',     icon: <Plane size={16} />,    color: '#3B82F6' },
  { id: 'hotel',     ar: 'فندق',          en: 'Hotel',      icon: <Hotel size={16} />,    color: '#8B5CF6' },
  { id: 'package',   ar: 'باقة سياحية',   en: 'Package',    icon: <Package size={16} />,  color: '#F59E0B' },
  { id: 'umrah',     ar: 'عمرة وحج',      en: 'Umrah',      icon: <Moon size={16} />,     color: '#10B981' },
  { id: 'insurance', ar: 'تأمين',         en: 'Insurance',  icon: <Shield size={16} />,   color: '#EF4444' },
  { id: 'visa',      ar: 'تأشيرة',        en: 'Visa',       icon: <Stamp size={16} />,    color: '#6B7280' },
];

const ICON_OPTIONS: Array<{ key: string; icon: React.ReactNode }> = [
  { key: 'plane',     icon: <Plane size={16} /> },
  { key: 'building2', icon: <Hotel size={16} /> },
  { key: 'package',   icon: <Package size={16} /> },
  { key: 'moon',      icon: <Moon size={16} /> },
  { key: 'shield',    icon: <Shield size={16} /> },
  { key: 'stamp',     icon: <Stamp size={16} /> },
  { key: 'anchor',    icon: <Anchor size={16} /> },
  { key: 'car',       icon: <Car size={16} /> },
  { key: 'train',     icon: <Train size={16} /> },
  { key: 'camera',    icon: <Camera size={16} /> },
  { key: 'mountain',  icon: <Mountain size={16} /> },
  { key: 'layers',    icon: <Layers size={16} /> },
];

const PRESET_COLORS = ['#3B82F6', '#8B5CF6', '#10B981', '#F59E0B', '#EF4444', '#6B7280'];

// ─── Toggle Switch sub-component ─────────────────────────────────────────────

function ToggleSwitch({
  checked,
  disabled,
  onChange,
  label,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
      className={cn(
        'relative flex-shrink-0 w-10 h-6 rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-1',
        checked ? 'bg-brand-600' : 'bg-slate-200',
        disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
      )}
    >
      <span
        className={cn(
          'absolute top-0.5 start-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200',
          checked ? 'translate-x-4 rtl:-translate-x-4' : 'translate-x-0',
        )}
      />
    </button>
  );
}

// ─── Page component ───────────────────────────────────────────────────────────

const WA_NUMBER = '249969837823';

const PLAN_META: Record<string, { ar: string; en: string; price: string; features: { ar: string[]; en: string[] } }> = {
  trial: {
    ar: 'تجريبي', en: 'Trial', price: '0',
    features: {
      ar: ['حتى 3 مستخدمين', 'حتى 500 حجز شهرياً', 'الوحدات الأساسية', 'دعم بالبريد الإلكتروني'],
      en: ['Up to 3 users', 'Up to 500 bookings / month', 'Core modules', 'Email support'],
    },
  },
  starter: {
    ar: 'المبتدئ', en: 'Starter', price: '199',
    features: {
      ar: ['حتى 3 مستخدمين', 'حتى 500 حجز شهرياً', 'الوحدات الأساسية', 'دعم بالبريد الإلكتروني'],
      en: ['Up to 3 users', 'Up to 500 bookings / month', 'Core modules', 'Email support'],
    },
  },
  professional: {
    ar: 'الاحترافي', en: 'Professional', price: '399',
    features: {
      ar: ['مستخدمون غير محدودين', 'حجوزات غير محدودة', 'جميع الوحدات + ZATCA', 'دعم ذو أولوية'],
      en: ['Unlimited users', 'Unlimited bookings', 'All modules + ZATCA', 'Priority support'],
    },
  },
};

export default function SettingsPage() {
  const locale = useLocale();
  const isAr = locale === 'ar';
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const { status: subStatus, plan: subPlan, agencyName: subAgencyName, daysRemaining } = useSubscription();

  // Support ?tab=service_types URL param
  const tabParam = searchParams.get('tab') as Tab | null;
  const validTabs: Tab[] = ['agency', 'users', 'modules', 'service_types', 'zatca', 'billing'];
  const initialTab: Tab = tabParam && validTabs.includes(tabParam) ? tabParam : 'agency';

  const [activeTab, setActiveTab] = useState<Tab>(initialTab);
  const [modules, setModules] = useState<Module[]>(INITIAL_MODULES);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [zatcaEnv, setZatcaEnv] = useState<'testing' | 'production'>('testing');

  // ── Agency info (loaded from / saved to Firestore) ────────────────────
  const [nameAr, setNameAr] = useState('مسارات للسياحة والسفر');
  const [nameEn, setNameEn] = useState('Masarat Travel & Tourism');
  const [logoUrl, setLogoUrl] = useState('');
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoError, setLogoError] = useState('');
  const [logoPendingFile, setLogoPendingFile] = useState<File | null>(null);
  const [logoPendingPreview, setLogoPendingPreview] = useState('');
  const [logoCropMode, setLogoCropMode] = useState<'fit' | 'square'>('fit');
  const [isVatRegistered, setIsVatRegistered] = useState(false);
  const [vatNumber, setVatNumber] = useState('');
  const [crNumber, setCrNumber] = useState('');
  const [streetName, setStreetName] = useState('');
  const [buildingNumber, setBuildingNumber] = useState('');
  const [district, setDistrict] = useState('');
  const [city, setCity] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactHours, setContactHours] = useState('');

  // ── Service Types state ─────────────────────────────────────────────────
  const [customTypes, setCustomTypes] = useState<CustomServiceType[]>([]);
  const [defaultToggles, setDefaultToggles] = useState<Record<string, boolean>>(
    Object.fromEntries(DEFAULT_SERVICE_TYPES.map(d => [d.id, true]))
  );
  const [showAddForm, setShowAddForm] = useState(false);
  const [addForm, setAddForm] = useState({ nameAr: '', nameEn: '', icon: 'layers', color: PRESET_COLORS[0] });
  const [addSaving, setAddSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ nameAr: '', nameEn: '', icon: 'layers', color: PRESET_COLORS[0] });

  // ── Agency users ────────────────────────────────────────────────────────
  const [agencyUsers, setAgencyUsers]     = useState<UserDoc[]>([]);
  const [loadingUsers, setLoadingUsers]   = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);

  // Load all agency info from Firestore
  useEffect(() => {
    if (!user?.agencyId) return;

    async function loadAgency() {
      const { getFirestore, doc, getDoc } = await import('firebase/firestore');
      const { getApp } = await import('@masarat/firebase');
      const db = getFirestore(getApp());
      const snap = await getDoc(doc(db, 'agencies', user!.agencyId));
      if (snap.exists()) {
        const d = snap.data();
        if (d.nameAr)        setNameAr(d.nameAr);
        if (d.nameEn)        setNameEn(d.nameEn);
        if (d.logoUrl)       setLogoUrl(d.logoUrl);
        setIsVatRegistered(d.isVatRegistered ?? (d.vatNumber ?? '').trim().length > 0);
        if (d.vatNumber)     setVatNumber(d.vatNumber);
        if (d.crNumber)      setCrNumber(d.crNumber);
        if (d.streetName)    setStreetName(d.streetName);
        if (d.buildingNumber) setBuildingNumber(d.buildingNumber);
        if (d.district)      setDistrict(d.district);
        if (d.city)          setCity(d.city);
        if (d.postalCode)    setPostalCode(d.postalCode);
        setContactEmail(d.contactEmail ?? '');
        setContactPhone(d.contactPhone ?? '');
        setContactHours(d.contactHours ?? '');
      }
    }

    void loadAgency();
  }, [user?.agencyId]);

  // Load agency users from Firestore when on users tab
  useEffect(() => {
    if (!user?.agencyId || activeTab !== 'users') return;
    let unsub: (() => void) | undefined;

    async function load() {
      setLoadingUsers(true);
      const { getFirestore, collection, query, where, onSnapshot } = await import('firebase/firestore');
      const { getApp } = await import('@masarat/firebase');
      const db = getFirestore(getApp());
      const q = query(collection(db, 'users'), where('agencyId', '==', user!.agencyId));
      unsub = onSnapshot(q, snap => {
        setAgencyUsers(snap.docs.map(d => ({ id: d.id, ...d.data() } as UserDoc)));
        setLoadingUsers(false);
      }, () => setLoadingUsers(false));
    }

    void load();
    return () => unsub?.();
  }, [user?.agencyId, activeTab]);

  // Load custom service types from Firestore
  useEffect(() => {
    if (!user?.agencyId || activeTab !== 'service_types') return;
    let unsub: (() => void) | undefined;

    async function load() {
      const { getFirestore, collection, query, where, onSnapshot } = await import('firebase/firestore');
      const { getApp } = await import('@masarat/firebase');
      const db = getFirestore(getApp());
      const q = query(
        collection(db, 'service_types'),
        where('agencyId', '==', user!.agencyId),
      );
      unsub = onSnapshot(q, snap => {
        setCustomTypes(snap.docs.map(d => ({ id: d.id, ...d.data() } as CustomServiceType)));
      });
    }

    void load();
    return () => unsub?.();
  }, [user?.agencyId, activeTab]);

  // Service type handlers
  async function handleAddServiceType() {
    if (!user?.agencyId || !addForm.nameAr.trim()) return;
    setAddSaving(true);
    try {
      const { getFirestore, collection, addDoc, Timestamp } = await import('firebase/firestore');
      const { getApp } = await import('@masarat/firebase');
      const db = getFirestore(getApp());
      await addDoc(collection(db, 'service_types'), {
        agencyId: user.agencyId,
        nameAr: addForm.nameAr.trim(),
        nameEn: addForm.nameEn.trim() || addForm.nameAr.trim(),
        icon: addForm.icon,
        color: addForm.color,
        isActive: true,
        createdAt: Timestamp.now(),
      });
      setAddForm({ nameAr: '', nameEn: '', icon: 'layers', color: PRESET_COLORS[0] });
      setShowAddForm(false);
    } catch (err) {
      console.error('Error adding service type:', err);
    } finally {
      setAddSaving(false);
    }
  }

  async function handleDeleteServiceType(id: string) {
    try {
      const { getFirestore, doc, deleteDoc } = await import('firebase/firestore');
      const { getApp } = await import('@masarat/firebase');
      const db = getFirestore(getApp());
      await deleteDoc(doc(db, 'service_types', id));
    } catch (err) {
      console.error('Error deleting service type:', err);
    }
  }

  async function handleEditSave(id: string) {
    try {
      const { getFirestore, doc, updateDoc } = await import('firebase/firestore');
      const { getApp } = await import('@masarat/firebase');
      const db = getFirestore(getApp());
      await updateDoc(doc(db, 'service_types', id), {
        nameAr: editForm.nameAr.trim(),
        nameEn: editForm.nameEn.trim() || editForm.nameAr.trim(),
        icon: editForm.icon,
        color: editForm.color,
      });
      setEditingId(null);
    } catch (err) {
      console.error('Error updating service type:', err);
    }
  }

  async function handleToggleServiceType(id: string) {
    try {
      const { getFirestore, doc, updateDoc } = await import('firebase/firestore');
      const { getApp } = await import('@masarat/firebase');
      const db = getFirestore(getApp());
      const current = customTypes.find(t => t.id === id);
      if (!current) return;
      await updateDoc(doc(db, 'service_types', id), { isActive: !current.isActive });
    } catch (err) {
      console.error('Error toggling service type:', err);
    }
  }

  function toggleModule(id: string) {
    setModules((prev: Module[]) =>
      prev.map((m: Module) => (m.id === id && !m.core ? { ...m, enabled: !m.enabled } : m)),
    );
  }

  function handleLogoSelect(file: File) {
    setLogoError('');
    if (!file.type.startsWith('image/')) {
      setLogoError(isAr ? 'يجب أن يكون الملف صورة' : 'File must be an image');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setLogoError(isAr ? 'حجم الصورة يجب أن يكون أقل من 10MB' : 'Image must be under 10MB');
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    setLogoPendingPreview(objectUrl);
    setLogoPendingFile(file);
    setLogoCropMode('fit');
  }

  function cancelLogoPending() {
    if (logoPendingPreview) URL.revokeObjectURL(logoPendingPreview);
    setLogoPendingPreview('');
    setLogoPendingFile(null);
    setLogoError('');
  }

  function processLogoWithCanvas(file: File, mode: 'fit' | 'square'): Promise<string> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const MAX = 400;
        let sx = 0, sy = 0, sw = img.naturalWidth, sh = img.naturalHeight;
        let dw: number, dh: number;

        if (mode === 'square') {
          const size = Math.min(sw, sh);
          sx = Math.floor((sw - size) / 2);
          sy = Math.floor((sh - size) / 2);
          sw = size; sh = size;
          dw = dh = Math.min(MAX, size);
        } else {
          const scale = Math.min(MAX / sw, MAX / sh);
          dw = Math.round(sw * scale);
          dh = Math.round(sh * scale);
        }

        const canvas = document.createElement('canvas');
        canvas.width = dw; canvas.height = dh;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, dw, dh);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('load failed')); };
      img.src = url;
    });
  }

  async function confirmLogoUpload() {
    if (!user?.agencyId || !logoPendingFile) return;
    setLogoError('');
    setLogoUploading(true);
    try {
      const base64 = await processLogoWithCanvas(logoPendingFile, logoCropMode);

      const { getFirestore, doc, updateDoc } = await import('firebase/firestore');
      const { getApp } = await import('@masarat/firebase');
      const db = getFirestore(getApp());
      await updateDoc(doc(db, 'agencies', user.agencyId), { logoUrl: base64 });

      setLogoUrl(base64);
      cancelLogoPending();
    } catch {
      setLogoError(isAr ? 'فشل معالجة الصورة — حاول مرة أخرى' : 'Failed to process image — try again');
    } finally {
      setLogoUploading(false);
    }
  }

  async function handleSave() {
    if (!user?.agencyId) return;
    setSaving(true);
    setSaved(false);
    try {
      const { getFirestore, doc, setDoc } = await import('firebase/firestore');
      const { getApp } = await import('@masarat/firebase');
      const db = getFirestore(getApp());
      await setDoc(
        doc(db, 'agencies', user.agencyId),
        {
          nameAr:          nameAr.trim(),
          nameEn:          nameEn.trim(),
          isVatRegistered,
          vatNumber:       isVatRegistered ? vatNumber.trim() : '',
          crNumber:        crNumber.trim(),
          streetName:      streetName.trim(),
          buildingNumber:  buildingNumber.trim(),
          district:        district.trim(),
          city:            city.trim(),
          postalCode:      postalCode.trim(),
          contactEmail:    contactEmail.trim(),
          contactPhone:    contactPhone.trim(),
          contactHours:    contactHours.trim(),
        },
        { merge: true },
      );
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      // ignore save error silently — UI already shows saved state on success
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
    <div className="space-y-6">
      {/* ── Page header ────────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          {isAr ? 'الإعدادات' : 'Settings'}
        </h1>
        <p className="text-slate-500 text-sm mt-0.5">
          {isAr ? 'إدارة إعدادات الوكالة والنظام' : 'Manage agency and system settings'}
        </p>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* ── Sidebar navigation ─────────────────────────────────────────── */}
        <nav className="lg:w-52 flex-shrink-0">
          <Card padding="sm">
            <ul className="space-y-0.5">
              {TABS.map(tab => (
                <li key={tab.key}>
                  <button
                    onClick={() => setActiveTab(tab.key)}
                    className={cn(
                      'w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-start',
                      activeTab === tab.key
                        ? 'bg-brand-50 text-brand-700'
                        : 'text-slate-600 hover:bg-slate-100',
                    )}
                  >
                    <span
                      className={cn(
                        'flex-shrink-0',
                        activeTab === tab.key ? 'text-brand-600' : 'text-slate-400',
                      )}
                    >
                      {tab.icon}
                    </span>
                    {isAr ? tab.ar : tab.en}
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        </nav>

        {/* ── Tab content ────────────────────────────────────────────────── */}
        <div className="flex-1 min-w-0">

          {/* ── Agency Info ──────────────────────────────────────────────── */}
          {activeTab === 'agency' && (
            <Card>
              <CardHeader>
                <CardTitle>{isAr ? 'بيانات الوكالة' : 'Agency Information'}</CardTitle>
              </CardHeader>

              <div className="space-y-5">
                {/* Names */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input
                    label={isAr ? 'اسم الوكالة بالعربي' : 'Agency Name (Arabic)'}
                    value={nameAr}
                    onChange={e => setNameAr(e.target.value)}
                    required
                    dir="rtl"
                  />
                  <Input
                    label={isAr ? 'اسم الوكالة بالإنجليزي' : 'Agency Name (English)'}
                    value={nameEn}
                    onChange={e => setNameEn(e.target.value)}
                    dir="ltr"
                  />
                </div>

                {/* VAT registration toggle */}
                <div className="border border-surface-border rounded-xl p-4 bg-slate-50 space-y-3">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">
                        {isAr
                          ? 'هل المنشأة مسجّلة في ضريبة القيمة المضافة؟'
                          : 'Is the agency VAT-registered?'}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {isAr
                          ? 'يحدد نوع الوثائق المالية الصادرة: فاتورة ضريبية أو فاتورة تجارية'
                          : 'Determines issued document type: tax invoice vs commercial invoice'}
                      </p>
                    </div>
                    <ToggleSwitch
                      checked={isVatRegistered}
                      onChange={() => {
                        const next = !isVatRegistered;
                        setIsVatRegistered(next);
                        if (!next) setVatNumber('');
                      }}
                      label={isAr ? 'تسجيل ضريبة القيمة المضافة' : 'VAT Registration'}
                    />
                  </div>
                  {isVatRegistered ? (
                    <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                      <CheckCircle2 size={13} />
                      {isAr
                        ? 'سيتم إصدار فاتورة ضريبية مع QR code متوافق مع زاتكا'
                        : 'Tax invoices with ZATCA-compliant QR code will be issued'}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                      <AlertTriangle size={13} />
                      {isAr
                        ? 'سيتم إصدار فاتورة تجارية — لا تتضمن ضريبة القيمة المضافة'
                        : 'Commercial invoices will be issued — no VAT applied'}
                    </div>
                  )}
                </div>

                {/* Registration numbers */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {isVatRegistered && (
                    <Input
                      label={isAr ? 'الرقم الضريبي (VAT)' : 'VAT Number'}
                      value={vatNumber}
                      onChange={e => setVatNumber(e.target.value)}
                      hint={isAr ? '15 خانة تبدأ بـ 300' : '15 digits starting with 300'}
                      maxLength={15}
                      dir="ltr"
                      placeholder="300000000000003"
                    />
                  )}
                  <Input
                    label={isAr ? 'رقم السجل التجاري' : 'CR Number'}
                    value={crNumber}
                    onChange={e => setCrNumber(e.target.value)}
                    dir="ltr"
                    placeholder="4030000000"
                  />
                </div>

                {/* Address section */}
                <div className="border-t border-surface-border pt-5">
                  <p className="text-sm font-semibold text-slate-700 mb-4">
                    {isAr ? 'العنوان الوطني' : 'National Address'}
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Input
                      label={isAr ? 'اسم الشارع' : 'Street Name'}
                      value={streetName}
                      onChange={e => setStreetName(e.target.value)}
                      placeholder={isAr ? 'طريق الملك عبدالعزيز' : 'King Abdul Aziz Road'}
                    />
                    <Input
                      label={isAr ? 'رقم المبنى' : 'Building Number'}
                      value={buildingNumber}
                      onChange={e => setBuildingNumber(e.target.value)}
                      dir="ltr"
                      placeholder="3246"
                    />
                    <Input
                      label={isAr ? 'الحي' : 'District'}
                      value={district}
                      onChange={e => setDistrict(e.target.value)}
                      placeholder={isAr ? 'العليا' : 'Al Olaya'}
                    />
                    <Input
                      label={isAr ? 'المدينة' : 'City'}
                      value={city}
                      onChange={e => setCity(e.target.value)}
                      placeholder={isAr ? 'الرياض' : 'Riyadh'}
                    />
                    <Input
                      label={isAr ? 'الرمز البريدي' : 'Postal Code'}
                      value={postalCode}
                      onChange={e => setPostalCode(e.target.value)}
                      dir="ltr"
                      placeholder="12271"
                    />
                  </div>
                </div>

                {/* Contact info section */}
                <div className="border-t border-surface-border pt-5">
                  <p className="text-sm font-semibold text-slate-700 mb-4">
                    {isAr ? 'معلومات التواصل' : 'Contact Information'}
                  </p>
                  <p className="text-xs text-slate-400 mb-4 -mt-2">
                    {isAr
                      ? 'تظهر هذه المعلومات في صفحة المساعدة ليتمكن الموظفون من التواصل معك'
                      : 'This info appears on the Help page so staff can contact you'}
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Input
                      label={isAr ? 'البريد الإلكتروني للدعم' : 'Support Email'}
                      type="email"
                      value={contactEmail}
                      onChange={e => setContactEmail(e.target.value)}
                      placeholder="support@agency.sa"
                      dir="ltr"
                    />
                    <Input
                      label={isAr ? 'رقم الهاتف' : 'Phone Number'}
                      type="tel"
                      value={contactPhone}
                      onChange={e => setContactPhone(e.target.value)}
                      placeholder="+966 11 000 0000"
                      dir="ltr"
                    />
                    <div className="sm:col-span-2">
                      <Input
                        label={isAr ? 'ساعات الدعم' : 'Support Hours'}
                        value={contactHours}
                        onChange={e => setContactHours(e.target.value)}
                        placeholder={isAr ? 'الأحد — الخميس، 9ص — 6م' : 'Sun — Thu, 9AM — 6PM'}
                      />
                    </div>
                  </div>
                </div>

                {/* Logo upload */}
                <div className="border-t border-surface-border pt-5">
                  <p className="text-sm font-semibold text-slate-700 mb-3">
                    {isAr ? 'شعار الوكالة' : 'Agency Logo'}
                  </p>

                  {/* ── Step 1: no pending file ── */}
                  {!logoPendingPreview && (
                    <div className="flex items-center gap-4">
                      <div className="w-20 h-20 rounded-xl bg-brand-50 border-2 border-dashed border-brand-200 flex items-center justify-center flex-shrink-0 overflow-hidden">
                        {logoUrl ? (
                          <img src={logoUrl} alt="logo" className="w-full h-full object-contain p-1" />
                        ) : (
                          <Building2 size={26} className="text-brand-300" />
                        )}
                      </div>
                      <div className="space-y-1.5">
                        <input
                          id="logo-file-input"
                          type="file"
                          accept="image/png,image/jpeg,image/webp,image/gif"
                          className="hidden"
                          onChange={e => {
                            const file = e.target.files?.[0];
                            if (file) handleLogoSelect(file);
                            e.target.value = '';
                          }}
                        />
                        <label
                          htmlFor="logo-file-input"
                          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-brand-200 text-brand-700 bg-brand-50 hover:bg-brand-100 text-sm font-medium cursor-pointer transition-colors"
                        >
                          <ImagePlus size={15} />
                          {isAr ? (logoUrl ? 'تغيير الشعار' : 'اختيار شعار') : (logoUrl ? 'Change Logo' : 'Choose Logo')}
                        </label>
                        <p className="text-xs text-slate-400">
                          {isAr ? 'PNG · JPG · WebP · GIF — حد أقصى 10MB' : 'PNG · JPG · WebP · GIF — max 10MB'}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* ── Step 2: crop selector ── */}
                  {logoPendingPreview && (
                    <div className="space-y-4 bg-slate-50 rounded-2xl p-4 border border-slate-200">
                      <p className="text-sm font-semibold text-slate-700">
                        {isAr ? 'اختر شكل الشعار' : 'Choose logo shape'}
                      </p>

                      {/* Shape options */}
                      <div className="flex gap-3">
                        {/* Fit option */}
                        <button
                          type="button"
                          onClick={() => setLogoCropMode('fit')}
                          className={cn(
                            'flex-1 flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all',
                            logoCropMode === 'fit'
                              ? 'border-brand-500 bg-brand-50'
                              : 'border-slate-200 bg-white hover:border-slate-300',
                          )}
                        >
                          <div className="w-16 h-16 rounded-lg bg-slate-100 overflow-hidden flex items-center justify-center">
                            <img
                              src={logoPendingPreview}
                              alt="fit"
                              className="max-w-full max-h-full object-contain p-1"
                            />
                          </div>
                          <span className="text-xs font-semibold text-slate-600">
                            {isAr ? 'كامل الصورة' : 'Full image'}
                          </span>
                          {logoCropMode === 'fit' && (
                            <span className="text-[10px] text-brand-600 font-bold">✓ {isAr ? 'مختار' : 'Selected'}</span>
                          )}
                        </button>

                        {/* Square option */}
                        <button
                          type="button"
                          onClick={() => setLogoCropMode('square')}
                          className={cn(
                            'flex-1 flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all',
                            logoCropMode === 'square'
                              ? 'border-brand-500 bg-brand-50'
                              : 'border-slate-200 bg-white hover:border-slate-300',
                          )}
                        >
                          <div className="w-16 h-16 rounded-lg bg-slate-100 overflow-hidden">
                            <img
                              src={logoPendingPreview}
                              alt="square"
                              className="w-full h-full object-cover"
                            />
                          </div>
                          <span className="text-xs font-semibold text-slate-600">
                            {isAr ? 'قص مربع' : 'Square crop'}
                          </span>
                          {logoCropMode === 'square' && (
                            <span className="text-[10px] text-brand-600 font-bold">✓ {isAr ? 'مختار' : 'Selected'}</span>
                          )}
                        </button>
                      </div>

                      <p className="text-xs text-slate-400">
                        {isAr
                          ? 'سيتم ضغط الصورة تلقائياً إلى 400×400 بكسل كحد أقصى'
                          : 'Image will be automatically compressed to max 400×400 px'}
                      </p>

                      {/* Action buttons */}
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => void confirmLogoUpload()}
                          disabled={logoUploading}
                          className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm font-semibold transition-colors"
                        >
                          {logoUploading ? <Spinner size="sm" /> : <CheckCircle2 size={15} />}
                          {logoUploading
                            ? (isAr ? 'جارٍ الحفظ...' : 'Saving...')
                            : (isAr ? 'حفظ الشعار' : 'Save Logo')}
                        </button>
                        <button
                          type="button"
                          onClick={cancelLogoPending}
                          disabled={logoUploading}
                          className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-100 disabled:opacity-50 text-sm font-medium transition-colors"
                        >
                          {isAr ? 'إلغاء' : 'Cancel'}
                        </button>
                      </div>
                    </div>
                  )}

                  {logoError && (
                    <p className="text-xs text-red-500 mt-2">{logoError}</p>
                  )}
                </div>

                {/* Save button */}
                <div className="flex items-center justify-between border-t border-surface-border pt-5">
                  {saved && (
                    <span className="flex items-center gap-1.5 text-sm text-emerald-600 font-medium">
                      <CheckCircle2 size={15} />
                      {isAr ? 'تم الحفظ بنجاح' : 'Saved successfully'}
                    </span>
                  )}
                  {!saved && <span />}
                  <Button onClick={handleSave} loading={saving}>
                    {saving
                      ? (isAr ? 'جارٍ الحفظ...' : 'Saving...')
                      : (isAr ? 'حفظ التغييرات' : 'Save Changes')}
                  </Button>
                </div>
              </div>
            </Card>
          )}

          {/* ── Users ────────────────────────────────────────────────────── */}
          {activeTab === 'users' && (
            <Card>
              <CardHeader>
                <CardTitle>{isAr ? 'المستخدمون' : 'Users'}</CardTitle>
                <Button size="sm" onClick={() => setShowInviteModal(true)}>
                  <UserPlus size={14} />
                  {isAr ? 'دعوة مستخدم' : 'Invite User'}
                </Button>
              </CardHeader>

              <div className="divide-y divide-surface-border min-h-[60px]">
                {loadingUsers ? (
                  <div className="py-8 flex justify-center"><Spinner size="sm" /></div>
                ) : agencyUsers.length === 0 ? (
                  <p className="py-8 text-center text-sm text-slate-400">
                    {isAr ? 'لا يوجد مستخدمون مسجّلون بعد' : 'No users registered yet'}
                  </p>
                ) : (
                  agencyUsers.map(u => {
                    const displayName  = isAr ? (u.name?.ar || u.name?.en) : (u.name?.en || u.name?.ar);
                    const initials     = (displayName || u.email || '?').charAt(0).toUpperCase();
                    const isCurrentUser = user?.uid === u.id;
                    return (
                      <div key={u.id} className="flex items-center justify-between py-3.5 first:pt-0 last:pb-0">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-brand-100 flex items-center justify-center text-sm font-bold text-brand-700 flex-shrink-0">
                            {initials}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-slate-900 flex items-center gap-1.5">
                              {displayName || u.email}
                              {isCurrentUser && (
                                <span className="text-[10px] text-brand-600 font-bold bg-brand-50 px-1.5 py-0.5 rounded-full">
                                  {isAr ? 'أنت' : 'You'}
                                </span>
                              )}
                            </p>
                            <p className="text-xs text-slate-400 mt-0.5">{u.email}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          {u.role && (
                            <span className="text-xs bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full font-medium">
                              {u.role}
                            </span>
                          )}
                          {u.isActive
                            ? <CheckCircle2 size={16} className="text-emerald-500 flex-shrink-0" />
                            : <XCircle     size={16} className="text-slate-300   flex-shrink-0" />}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Invite note */}
              <div className="mt-5 p-4 rounded-xl bg-slate-50 border border-slate-200">
                <p className="text-xs text-slate-500">
                  {isAr
                    ? 'خطة المبتدئ تدعم حتى 3 مستخدمين. قم بالترقية لإضافة المزيد.'
                    : 'The Starter plan supports up to 3 users. Upgrade to add more.'}
                </p>
              </div>
            </Card>
          )}

          {/* ── Modules ──────────────────────────────────────────────────── */}
          {activeTab === 'modules' && (
            <div className="space-y-4">
              {/* Warning banner */}
              <Card padding="sm" className="border-amber-200 bg-amber-50">
                <p className="text-sm text-amber-800 flex items-start gap-2">
                  <AlertTriangle size={16} className="flex-shrink-0 mt-0.5 text-amber-600" />
                  {isAr
                    ? 'تفعيل الوحدات أو تعطيلها يؤثر فوراً على القائمة الجانبية وصلاحيات جميع المستخدمين.'
                    : 'Enabling or disabling modules immediately affects the sidebar and all user permissions.'}
                </p>
              </Card>

              {/* Module grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {modules.map((mod: Module) => (
                  <Card
                    key={mod.id}
                    padding="sm"
                    className={cn(
                      'transition-opacity duration-150',
                      !mod.enabled && 'opacity-60',
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      {/* Icon + text */}
                      <div className="flex items-start gap-3 min-w-0">
                        <div
                          className={cn(
                            'p-2 rounded-lg flex-shrink-0',
                            mod.enabled
                              ? 'bg-brand-50 text-brand-600'
                              : 'bg-slate-100 text-slate-400',
                          )}
                        >
                          {mod.icon}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-semibold text-slate-900">
                              {isAr ? mod.ar : mod.en}
                            </span>
                            {mod.core && (
                              <Badge variant="neutral">
                                {isAr ? 'أساسي' : 'Core'}
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-slate-500 mt-0.5">
                            {isAr ? mod.descAr : mod.descEn}
                          </p>
                        </div>
                      </div>

                      {/* Toggle */}
                      <ToggleSwitch
                        checked={mod.enabled}
                        disabled={mod.core}
                        onChange={() => toggleModule(mod.id)}
                        label={`Toggle ${mod.en}`}
                      />
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* ── Service Types ────────────────────────────────────────── */}
          {activeTab === 'service_types' && (
            <div className="space-y-6">
              {/* Default service types */}
              <Card>
                <CardHeader>
                  <CardTitle>{isAr ? 'الخدمات الافتراضية' : 'Default Service Types'}</CardTitle>
                </CardHeader>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {DEFAULT_SERVICE_TYPES.map(svc => (
                    <div
                      key={svc.id}
                      className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 bg-slate-50/50"
                    >
                      <div
                        className="p-2 rounded-lg flex-shrink-0"
                        style={{ backgroundColor: `${svc.color}20`, color: svc.color }}
                      >
                        {svc.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900">
                          {isAr ? svc.ar : svc.en}
                        </p>
                        <p className="text-xs text-slate-400">{isAr ? svc.en : svc.ar}</p>
                      </div>
                      <ToggleSwitch
                        checked={defaultToggles[svc.id] ?? true}
                        onChange={() =>
                          setDefaultToggles(prev => ({
                            ...prev,
                            [svc.id]: !(prev[svc.id] ?? true),
                          }))
                        }
                        label={`Toggle ${svc.en}`}
                      />
                    </div>
                  ))}
                </div>
              </Card>

              {/* Custom service types */}
              <Card>
                <CardHeader>
                  <CardTitle>{isAr ? 'الخدمات المخصصة' : 'Custom Service Types'}</CardTitle>
                  <Button size="sm" onClick={() => setShowAddForm(v => !v)}>
                    <Plus size={14} />
                    {isAr ? 'إضافة خدمة' : 'Add Service'}
                  </Button>
                </CardHeader>

                {/* Add form */}
                {showAddForm && (
                  <div className="mb-5 p-4 rounded-xl border border-brand-200 bg-brand-50/30 space-y-4">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-slate-800">
                        {isAr ? 'إضافة خدمة مخصصة' : 'Add Custom Service'}
                      </p>
                      <button
                        onClick={() => setShowAddForm(false)}
                        className="p-1 rounded text-slate-400 hover:text-slate-600 transition-colors"
                      >
                        <X size={14} />
                      </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <Input
                        label={isAr ? 'الاسم بالعربي' : 'Arabic Name'}
                        required
                        value={addForm.nameAr}
                        onChange={e => setAddForm(f => ({ ...f, nameAr: e.target.value }))}
                        dir="rtl"
                      />
                      <Input
                        label={isAr ? 'الاسم بالإنجليزي' : 'English Name'}
                        value={addForm.nameEn}
                        onChange={e => setAddForm(f => ({ ...f, nameEn: e.target.value }))}
                        dir="ltr"
                      />
                    </div>

                    {/* Icon selector */}
                    <div>
                      <p className="text-xs font-medium text-slate-600 mb-2">
                        {isAr ? 'الأيقونة' : 'Icon'}
                      </p>
                      <div className="flex gap-2 flex-wrap">
                        {ICON_OPTIONS.map(opt => (
                          <button
                            key={opt.key}
                            type="button"
                            onClick={() => setAddForm(f => ({ ...f, icon: opt.key }))}
                            className={cn(
                              'p-2 rounded-lg border transition-colors',
                              addForm.icon === opt.key
                                ? 'border-brand-500 bg-brand-50 text-brand-600'
                                : 'border-slate-200 text-slate-500 hover:border-slate-300',
                            )}
                          >
                            {opt.icon}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Color picker */}
                    <div>
                      <p className="text-xs font-medium text-slate-600 mb-2">
                        {isAr ? 'اللون' : 'Color'}
                      </p>
                      <div className="flex gap-2">
                        {PRESET_COLORS.map(c => (
                          <button
                            key={c}
                            type="button"
                            onClick={() => setAddForm(f => ({ ...f, color: c }))}
                            className={cn(
                              'w-7 h-7 rounded-full border-2 transition-transform',
                              addForm.color === c ? 'border-slate-700 scale-110' : 'border-transparent',
                            )}
                            style={{ backgroundColor: c }}
                          />
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-3">
                      <Button variant="secondary" size="sm" onClick={() => setShowAddForm(false)}>
                        {isAr ? 'إلغاء' : 'Cancel'}
                      </Button>
                      <Button
                        size="sm"
                        loading={addSaving}
                        disabled={!addForm.nameAr.trim()}
                        onClick={handleAddServiceType}
                      >
                        {isAr ? 'حفظ' : 'Save'}
                      </Button>
                    </div>
                  </div>
                )}

                {/* Custom types list */}
                {customTypes.length === 0 && !showAddForm && (
                  <div className="text-center py-8">
                    <Layers size={36} className="text-slate-200 mx-auto mb-3" />
                    <p className="text-sm text-slate-500">
                      {isAr ? 'لا توجد خدمات مخصصة بعد' : 'No custom service types yet'}
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                      {isAr
                        ? 'أضف خدمات مخصصة تظهر في القائمة الجانبية'
                        : 'Add custom services that appear in the sidebar'}
                    </p>
                  </div>
                )}

                <div className="space-y-2">
                  {customTypes.map(ct => (
                    <div key={ct.id} className="border border-slate-200 rounded-xl overflow-hidden">
                      {editingId === ct.id ? (
                        /* Edit mode */
                        <div className="p-4 bg-slate-50/50 space-y-3">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <Input
                              label={isAr ? 'الاسم بالعربي' : 'Arabic Name'}
                              value={editForm.nameAr}
                              onChange={e => setEditForm(f => ({ ...f, nameAr: e.target.value }))}
                              dir="rtl"
                            />
                            <Input
                              label={isAr ? 'الاسم بالإنجليزي' : 'English Name'}
                              value={editForm.nameEn}
                              onChange={e => setEditForm(f => ({ ...f, nameEn: e.target.value }))}
                              dir="ltr"
                            />
                          </div>
                          <div>
                            <p className="text-xs font-medium text-slate-600 mb-2">
                              {isAr ? 'الأيقونة' : 'Icon'}
                            </p>
                            <div className="flex gap-2 flex-wrap">
                              {ICON_OPTIONS.map(opt => (
                                <button
                                  key={opt.key}
                                  type="button"
                                  onClick={() => setEditForm(f => ({ ...f, icon: opt.key }))}
                                  className={cn(
                                    'p-2 rounded-lg border transition-colors',
                                    editForm.icon === opt.key
                                      ? 'border-brand-500 bg-brand-50 text-brand-600'
                                      : 'border-slate-200 text-slate-500 hover:border-slate-300',
                                  )}
                                >
                                  {opt.icon}
                                </button>
                              ))}
                            </div>
                          </div>
                          <div>
                            <p className="text-xs font-medium text-slate-600 mb-2">
                              {isAr ? 'اللون' : 'Color'}
                            </p>
                            <div className="flex gap-2">
                              {PRESET_COLORS.map(c => (
                                <button
                                  key={c}
                                  type="button"
                                  onClick={() => setEditForm(f => ({ ...f, color: c }))}
                                  className={cn(
                                    'w-7 h-7 rounded-full border-2 transition-transform',
                                    editForm.color === c ? 'border-slate-700 scale-110' : 'border-transparent',
                                  )}
                                  style={{ backgroundColor: c }}
                                />
                              ))}
                            </div>
                          </div>
                          <div className="flex items-center justify-end gap-2">
                            <Button variant="secondary" size="sm" onClick={() => setEditingId(null)}>
                              {isAr ? 'إلغاء' : 'Cancel'}
                            </Button>
                            <Button size="sm" onClick={() => handleEditSave(ct.id)}>
                              {isAr ? 'حفظ' : 'Save'}
                            </Button>
                          </div>
                        </div>
                      ) : (
                        /* View mode */
                        <div className="flex items-center gap-3 p-3">
                          <div
                            className="p-2 rounded-lg flex-shrink-0"
                            style={{ backgroundColor: `${ct.color}20`, color: ct.color }}
                          >
                            <Layers size={16} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-slate-900">{ct.nameAr}</p>
                            {ct.nameEn && (
                              <p className="text-xs text-slate-400">{ct.nameEn}</p>
                            )}
                          </div>
                          <ToggleSwitch
                            checked={ct.isActive}
                            onChange={() => handleToggleServiceType(ct.id)}
                            label={`Toggle ${ct.nameEn}`}
                          />
                          <button
                            onClick={() => {
                              setEditingId(ct.id);
                              setEditForm({ nameAr: ct.nameAr, nameEn: ct.nameEn, icon: ct.icon, color: ct.color });
                            }}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-brand-600 hover:bg-brand-50 transition-colors"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            onClick={() => handleDeleteServiceType(ct.id)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          )}

          {/* ── ZATCA ────────────────────────────────────────────────────── */}
          {activeTab === 'zatca' && (
            <div className="space-y-5">
              <Card>
                <CardHeader>
                  <CardTitle>ZATCA {isAr ? 'المرحلة الثانية' : 'Phase 2'}</CardTitle>
                  <Badge variant="warning">{isAr ? 'غير مُهيأ' : 'Not Configured'}</Badge>
                </CardHeader>

                <div className="space-y-5">
                  {/* Certificate status */}
                  <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-50 border border-amber-200">
                    <AlertTriangle size={20} className="text-amber-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold text-amber-900">
                        {isAr ? 'الشهادة الرقمية غير مُهيأة' : 'Digital Certificate Not Configured'}
                      </p>
                      <p className="text-xs text-amber-700 mt-1 leading-relaxed">
                        {isAr
                          ? 'يلزم تحميل شهادة ZATCA وتهيئتها لتفعيل إصدار الفواتير الإلكترونية المتوافقة مع متطلبات هيئة الزكاة والضريبة والجمارك.'
                          : 'A ZATCA digital certificate must be uploaded and configured to enable e-invoicing compliant with ZATCA requirements.'}
                      </p>
                    </div>
                  </div>

                  {/* Environment toggle */}
                  <div>
                    <p className="text-sm font-semibold text-slate-700 mb-1">
                      {isAr ? 'بيئة العمل' : 'Environment'}
                    </p>
                    <p className="text-xs text-slate-500 mb-3">
                      {isAr
                        ? 'اختر بيئة الاختبار للتطوير وبيئة الإنتاج للفواتير الحقيقية فقط.'
                        : 'Use Testing for development. Switch to Production only for real invoices.'}
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {(
                        [
                          {
                            value: 'testing' as const,
                            ar: 'بيئة الاختبار',
                            en: 'Testing',
                            descAr: 'للتطوير والتجربة — لا تُولَّد فواتير حقيقية',
                            descEn: 'For development & testing — no real invoices',
                            safe: true,
                          },
                          {
                            value: 'production' as const,
                            ar: 'بيئة الإنتاج',
                            en: 'Production',
                            descAr: 'للفواتير الحقيقية — قرار لا رجعة فيه',
                            descEn: 'For real invoices — irreversible decision',
                            safe: false,
                          },
                        ] as const
                      ).map(env => (
                        <label
                          key={env.value}
                          className={cn(
                            'flex flex-col gap-2 p-4 rounded-xl border-2 cursor-pointer transition-colors',
                            zatcaEnv === env.value
                              ? env.safe
                                ? 'border-emerald-400 bg-emerald-50'
                                : 'border-red-400 bg-red-50'
                              : 'border-slate-200 bg-white hover:border-slate-300',
                          )}
                        >
                          <div className="flex items-center gap-2">
                            <input
                              type="radio"
                              name="zatca-env"
                              value={env.value}
                              checked={zatcaEnv === env.value}
                              onChange={() => setZatcaEnv(env.value)}
                              className="accent-brand-600 w-4 h-4"
                            />
                            <span className="text-sm font-semibold text-slate-900">
                              {isAr ? env.ar : env.en}
                            </span>
                            {!env.safe && (
                              <Badge variant="danger" className="ms-auto">
                                {isAr ? 'تحذير' : 'Warning'}
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-slate-500 ps-6">
                            {isAr ? env.descAr : env.descEn}
                          </p>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Certificate upload instructions */}
                  <div className="border-t border-surface-border pt-5">
                    <p className="text-sm font-semibold text-slate-700 mb-2">
                      {isAr ? 'تحميل الشهادة الرقمية' : 'Upload Digital Certificate'}
                    </p>
                    <p className="text-xs text-slate-500 mb-4 leading-relaxed">
                      {isAr
                        ? 'لأسباب أمنية، يتم رفع شهادة ZATCA عبر Firebase Console ← Functions ← Environment Variables. لا تُرسل الشهادة عبر البريد الإلكتروني أو تحتفظ بها في الكود المصدري.'
                        : 'For security reasons, upload the ZATCA certificate via Firebase Console → Functions → Environment Variables. Never send the certificate by email or store it in source code.'}
                    </p>
                    <div className="flex flex-col sm:flex-row gap-3">
                      <a
                        href="#"
                        className="inline-flex items-center gap-1.5 text-sm text-brand-600 hover:text-brand-700 font-semibold"
                      >
                        {isAr ? 'دليل إعداد ZATCA' : 'ZATCA Setup Guide'}
                        <ChevronRight size={14} />
                      </a>
                      <a
                        href="https://console.firebase.google.com"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 font-medium"
                      >
                        {isAr ? 'فتح Firebase Console' : 'Open Firebase Console'}
                        <ChevronRight size={14} />
                      </a>
                    </div>
                  </div>
                </div>
              </Card>
            </div>
          )}

          {/* ── Billing ──────────────────────────────────────────────────── */}
          {activeTab === 'billing' && (() => {
            const planKey   = subPlan && PLAN_META[subPlan] ? subPlan : (subStatus === 'trial' ? 'trial' : 'starter');
            const planMeta  = PLAN_META[planKey] ?? PLAN_META['starter']!;
            const planName  = isAr ? planMeta.ar : planMeta.en;
            const planPrice = planMeta.price;
            const planFeats = isAr ? planMeta.features.ar : planMeta.features.en;

            const statusBadge = (() => {
              if (subStatus === 'trial')     return <Badge variant="info">{isAr ? 'تجريبي' : 'Trial'}</Badge>;
              if (subStatus === 'active')    return <Badge variant="success">{isAr ? 'نشط' : 'Active'}</Badge>;
              if (subStatus === 'past_due')  return <Badge variant="warning">{isAr ? 'متأخر' : 'Past Due'}</Badge>;
              if (subStatus === 'cancelled') return <Badge variant="danger">{isAr ? 'ملغى' : 'Cancelled'}</Badge>;
              return null;
            })();

            const statusLine = (() => {
              if (subStatus === 'trial' && daysRemaining !== null) {
                return isAr
                  ? `متبقي ${daysRemaining} ${daysRemaining === 1 ? 'يوم' : 'أيام'} على انتهاء الفترة التجريبية`
                  : `${daysRemaining} day${daysRemaining === 1 ? '' : 's'} remaining in free trial`;
              }
              return isAr ? 'يُجدَّد بالتواصل مع فريق المبيعات' : 'Renewed via sales team';
            })();

            const waMsg = subAgencyName
              ? `مرحباً فريق مسارات، أرغب في ترقية اشتراك وكالتي (${subAgencyName}) إلى باقة الاحترافي.`
              : 'مرحباً فريق مسارات، أرغب في الاشتراك في باقة الاحترافي.';
            const waUrl = `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(waMsg)}`;

            const isProfessional = planKey === 'professional';

            return (
              <div className="space-y-4">
                {/* Current plan */}
                <Card>
                  <CardHeader>
                    <CardTitle>{isAr ? 'خطة الاشتراك الحالية' : 'Current Plan'}</CardTitle>
                  </CardHeader>

                  <div className="flex items-start justify-between gap-6 flex-wrap">
                    {/* Plan details */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <span className="text-2xl font-bold text-slate-900">{planName}</span>
                        {statusBadge}
                      </div>
                      <p className="text-sm text-slate-500 mb-5">{statusLine}</p>
                      <ul className="space-y-2">
                        {planFeats.map(f => (
                          <li key={f} className="flex items-center gap-2 text-sm text-slate-700">
                            <CheckCircle2 size={15} className="text-emerald-500 flex-shrink-0" />
                            {f}
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Price */}
                    <div className="text-end flex-shrink-0">
                      {planKey === 'trial' ? (
                        <>
                          <p className="text-3xl font-bold text-slate-900">{isAr ? 'مجاناً' : 'Free'}</p>
                          <p className="text-xs text-slate-400 mt-1">{isAr ? 'فترة تجريبية' : 'Trial period'}</p>
                        </>
                      ) : (
                        <>
                          <p className="text-4xl font-bold text-slate-900">{planPrice}</p>
                          <p className="text-sm text-slate-500 mt-1">{isAr ? 'ريال سعودي / شهر' : 'SAR / month'}</p>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Upgrade CTA — only when not already on professional */}
                  {!isProfessional && (
                    <div className="border-t border-surface-border pt-5 mt-5">
                      <div className="rounded-xl bg-gradient-to-br from-brand-50 to-sky-50 border border-brand-100 p-5">
                        <p className="text-sm font-semibold text-slate-900 mb-1">
                          {isAr ? 'هل تريد المزيد؟' : 'Need more?'}
                        </p>
                        <p className="text-xs text-slate-600 mb-4">
                          {isAr
                            ? 'خطة الاحترافي تدعم مستخدمين غير محدودين، حجوزات غير محدودة، ووصولاً كاملاً لجميع الوحدات.'
                            : 'The Professional plan includes unlimited users, unlimited bookings, and full access to all modules.'}
                        </p>
                        <a
                          href={waUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-sm font-bold bg-brand-600 hover:bg-brand-700 text-white transition-colors"
                        >
                          <MessageCircle size={16} />
                          {isAr ? 'تواصل للترقية إلى الاحترافي' : 'Contact to Upgrade to Professional'}
                        </a>
                      </div>
                    </div>
                  )}
                </Card>

                {/* Billing history placeholder */}
                <Card>
                  <CardHeader>
                    <CardTitle>{isAr ? 'سجل الفواتير' : 'Billing History'}</CardTitle>
                  </CardHeader>
                  <div className="text-center py-8">
                    <CreditCard size={36} className="text-slate-200 mx-auto mb-3" />
                    <p className="text-sm text-slate-500">
                      {isAr ? 'لا توجد فواتير سابقة' : 'No billing history yet'}
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                      {isAr
                        ? 'ستظهر هنا فواتير الاشتراك بعد أول دفعة'
                        : 'Subscription invoices will appear here after the first payment'}
                    </p>
                  </div>
                </Card>
              </div>
            );
          })()}

        </div>
      </div>
    </div>

    {showInviteModal && (
      <InviteUserModal
        isAr={isAr}
        onClose={() => setShowInviteModal(false)}
        onDone={() => setShowInviteModal(false)}
      />
    )}
    </>
  );
}
