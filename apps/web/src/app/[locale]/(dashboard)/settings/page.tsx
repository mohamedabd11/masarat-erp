'use client';

import { useState, useEffect } from 'react';
import { useLocale } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@masarat/firebase';
import type { Agency, User } from '@/lib/schema';
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
  Server,
  RefreshCw,
  Eye,
  EyeOff,
  Wifi,
  WifiOff,
  Activity,
} from 'lucide-react';
import { InviteUserModal } from '@/components/settings/InviteUserModal';
import { useSubscription } from '@/providers/SubscriptionProvider';
import { MessageCircle, CheckCircle, XCircle as XCircleIcon, Star } from 'lucide-react';
import { PLAN_DISPLAY, FEATURE_LABEL } from '@/lib/plan-features';

// ─── Types ───────────────────────────────────────────────────────────────────

type Tab = 'agency' | 'users' | 'modules' | 'zatca' | 'billing' | 'service_types' | 'providers' | 'monitoring';

// ─── Tab definitions ─────────────────────────────────────────────────────────

const ALL_TABS: Array<{ key: Tab; ar: string; en: string; icon: React.ReactNode; vatOnly?: boolean }> = [
  { key: 'agency',        ar: 'بيانات الوكالة',  en: 'Agency Info',    icon: <Building2 size={16} /> },
  { key: 'users',         ar: 'المستخدمون',       en: 'Users',          icon: <Users size={16} /> },
  { key: 'modules',       ar: 'الوحدات',          en: 'Modules',        icon: <Package size={16} /> },
  { key: 'service_types', ar: 'أنواع الخدمات',    en: 'Service Types',  icon: <Layers size={16} /> },
  { key: 'zatca',         ar: 'ZATCA',            en: 'ZATCA',          icon: <Shield size={16} />, vatOnly: true },
  { key: 'billing',       ar: 'الاشتراك',         en: 'Billing',        icon: <CreditCard size={16} /> },
  { key: 'providers',     ar: 'مزودو GDS',        en: 'GDS Providers',  icon: <Server size={16} /> },
  { key: 'monitoring',    ar: 'المراقبة',          en: 'Monitoring',     icon: <Activity size={16} /> },
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

interface PlanDef {
  key: string;
  ar: string; en: string;
  billing: { ar: string; en: string };
  badge: { ar: string; en: string } | null;
  highlighted: boolean;
  features: { ar: string[]; en: string[] };
  limits: { users: number | null; bookings: number | null };
}

const PLANS: PlanDef[] = [
  {
    key: 'starter',
    ar: 'المبتدئ', en: 'Starter',
    billing: { ar: 'اشتراك شهري / سنوي', en: 'Monthly / Yearly' },
    badge: null, highlighted: false,
    features: {
      ar: ['حتى 3 مستخدمين', 'حتى 500 حجز شهرياً', 'الوحدات الأساسية (حجوزات، فواتير، محاسبة)', 'دعم عبر واتساب'],
      en: ['Up to 3 users', 'Up to 500 bookings / month', 'Core modules (bookings, invoices, accounting)', 'WhatsApp support'],
    },
    limits: { users: 3, bookings: 500 },
  },
  {
    key: 'professional',
    ar: 'الاحترافي', en: 'Professional',
    billing: { ar: 'اشتراك شهري / سنوي', en: 'Monthly / Yearly' },
    badge: { ar: 'الأكثر شيوعاً', en: 'Most Popular' }, highlighted: true,
    features: {
      ar: ['مستخدمون غير محدودين', 'حجوزات غير محدودة', 'جميع الوحدات + ZATCA', 'تقارير متقدمة', 'دعم ذو أولوية عبر واتساب'],
      en: ['Unlimited users', 'Unlimited bookings', 'All modules + ZATCA', 'Advanced reports', 'Priority WhatsApp support'],
    },
    limits: { users: null, bookings: null },
  },
  {
    key: 'lifetime',
    ar: 'مدى الحياة', en: 'Lifetime',
    billing: { ar: 'دفعة واحدة للأبد', en: 'One-time payment' },
    badge: { ar: 'قيمة كبرى', en: 'Best Value' }, highlighted: false,
    features: {
      ar: ['كل مميزات الاحترافي', 'دفعة واحدة فقط', 'تحديثات مجانية مدى الحياة', 'دعم مدى الحياة'],
      en: ['Everything in Professional', 'One-time payment only', 'Free lifetime updates', 'Lifetime support'],
    },
    limits: { users: null, bookings: null },
  },
];

// Map Firestore plan key → display plan key
function resolveDisplayPlan(plan: string, status: string): string {
  if (plan === 'lifetime') return 'lifetime';
  if (plan === 'professional') return 'professional';
  if (plan === 'starter') return 'starter';
  if (status === 'trial') return 'trial';
  return 'starter';
}

// Firestore plan keys that match a paid plan
const PAID_PLAN_KEYS = new Set(['starter', 'professional', 'lifetime']);

export default function SettingsPage() {
  const locale = useLocale();
  const isAr = locale === 'ar';
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const agencyId = user?.agencyId ?? null;
  const { status: subStatus, plan: subPlan, agencyName: subAgencyName, daysRemaining } = useSubscription();

  // Support ?tab=service_types URL param
  const tabParam = searchParams.get('tab') as Tab | null;
  const validTabs: Tab[] = ['agency', 'users', 'modules', 'service_types', 'zatca', 'billing', 'providers', 'monitoring'];
  const initialTab: Tab = tabParam && validTabs.includes(tabParam) ? tabParam : 'agency';

  const [activeTab, setActiveTab] = useState<Tab>(initialTab);
  const [modules, setModules] = useState<Module[]>(INITIAL_MODULES);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [dbSetupRunning, setDbSetupRunning] = useState(false);
  const [dbSetupResult, setDbSetupResult] = useState<{ ok: boolean; message?: string; error?: string } | null>(null);

  async function handleDbSetup() {
    setDbSetupRunning(true);
    setDbSetupResult(null);
    try {
      const { apiFetch } = await import('@/lib/api-client');
      const data = await apiFetch<{ ok: boolean; message?: string; error?: string }>('/api/setup-db', { method: 'POST' });
      setDbSetupResult(data);
    } catch (err) {
      setDbSetupResult({ ok: false, error: err instanceof Error ? err.message : 'خطأ غير معروف' });
    } finally {
      setDbSetupRunning(false);
    }
  }
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
  const [vatRate, setVatRate] = useState(15);
  const [streetName, setStreetName] = useState('');
  const [buildingNumber, setBuildingNumber] = useState('');
  const [district, setDistrict] = useState('');
  const [city, setCity] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [defaultQuoteTerms, setDefaultQuoteTerms] = useState('');

  // ── Service Types state ─────────────────────────────────────────────────
  const [tick, setTick] = useState(0);
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
  const [agencyUsers, setAgencyUsers]     = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers]   = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);

  // ── Billing usage stats ─────────────────────────────────────────────────
  const [usersCount, setUsersCount]       = useState<number | null>(null);
  const [bookingsCount, setBookingsCount] = useState<number | null>(null);

  // ── Role helpers ────────────────────────────────────────────────────────
  const isAdmin = ['owner', 'admin'].includes(user?.claims.role ?? '');

  // ── Providers (GDS credentials) ─────────────────────────────────────────
  type ProviderRow = {
    id: string; providerCode: string; label: string | null; isActive: boolean;
    testedAt: string | null; testStatus: string | null; testError: string | null;
  };
  const [providers,        setProviders]        = useState<ProviderRow[]>([]);
  const [loadingProviders, setLoadingProviders] = useState(false);
  const [providerError,    setProviderError]    = useState('');
  const [testingId,        setTestingId]        = useState<string | null>(null);
  // form state
  const [showProviderForm, setShowProviderForm] = useState(false);
  const [editingProvider,  setEditingProvider]  = useState<ProviderRow | null>(null);
  const [providerForm,     setProviderForm]     = useState({
    providerCode: 'amadeus', label: '',
    clientId: '', clientSecret: '', hostname: 'test.api.amadeus.com',
  });
  const [showSecret,    setShowSecret]    = useState(false);
  const [providerSaving, setProviderSaving] = useState(false);

  // ── Monitoring ───────────────────────────────────────────────────────
  type MonitoringData = {
    statusCounts: Record<string, number>;
    stalledByCredential: {
      credentialId: string | null;
      providerCode: string | null;
      label:        string | null;
      affectedTickets: number;
      maxAttempts:  number;
    }[];
    orphanCount: number;
  };
  const [monitoringData,    setMonitoringData]    = useState<MonitoringData | null>(null);
  const [loadingMonitoring, setLoadingMonitoring] = useState(false);
  const [monitoringError,   setMonitoringError]   = useState('');

  // Load all agency info from REST API
  useEffect(() => {
    if (!agencyId) return;

    async function loadAgency() {
      const { apiFetch } = await import('@/lib/api-client');
      const data = await apiFetch<{ agency: Agency; users: User[] }>('/api/settings');
      const d = data.agency;
      if (d.nameAr)        setNameAr(d.nameAr);
      if (d.nameEn)        setNameEn(d.nameEn);
      if (d.logoUrl)       setLogoUrl(d.logoUrl);
      setIsVatRegistered(d.isVatRegistered === true);
      if (d.vatNumber)     setVatNumber(d.vatNumber);
      if (d.crNumber)      setCrNumber(d.crNumber);
      if (d.vatRate)       setVatRate(d.vatRate);
      if (d.city)          setCity(d.city);
      setContactEmail(d.contactEmail ?? '');
      setContactPhone(d.contactPhone ?? '');
      if (d.defaultQuoteTerms) setDefaultQuoteTerms(d.defaultQuoteTerms);
    }

    void loadAgency();
  }, [agencyId]);

  // Load agency users from REST API when on users tab
  useEffect(() => {
    if (!agencyId || activeTab !== 'users') return;

    async function load() {
      setLoadingUsers(true);
      const { apiFetch } = await import('@/lib/api-client');
      const data = await apiFetch<{ agency: unknown; users: User[] }>('/api/settings');
      setAgencyUsers(data.users);
      setLoadingUsers(false);
    }

    void load();
  }, [agencyId, activeTab]);

  // Load usage stats when billing tab is active
  useEffect(() => {
    if (!agencyId || activeTab !== 'billing') return;
    async function load() {
      const { apiFetch } = await import('@/lib/api-client');
      const [usersData, bookingsData] = await Promise.all([
        apiFetch<{ agency: unknown; users: unknown[] }>('/api/settings'),
        apiFetch<{ bookings: unknown[] }>('/api/bookings'),
      ]);
      setUsersCount(usersData.users.length);
      setBookingsCount(bookingsData.bookings.length);
    }
    void load();
  }, [agencyId, activeTab]);

  // ── Providers: load, test, save, delete ─────────────────────────────────
  async function loadProviders() {
    if (!agencyId) return;
    setLoadingProviders(true);
    setProviderError('');
    try {
      const { apiFetch } = await import('@/lib/api-client');
      const data = await apiFetch<{ providers: ProviderRow[] }>('/api/settings/providers');
      setProviders(data.providers ?? []);
    } catch { setProviderError(isAr ? 'فشل تحميل المزودين' : 'Failed to load providers'); }
    finally  { setLoadingProviders(false); }
  }

  useEffect(() => {
    if (!agencyId || activeTab !== 'providers') return;
    void loadProviders();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agencyId, activeTab]);

  async function loadMonitoring() {
    if (!agencyId) return;
    setLoadingMonitoring(true);
    setMonitoringError('');
    try {
      const { apiFetch } = await import('@/lib/api-client');
      const [monData, provData] = await Promise.all([
        apiFetch<MonitoringData>('/api/monitoring/tickets'),
        apiFetch<{ providers: ProviderRow[] }>('/api/settings/providers'),
      ]);
      setMonitoringData(monData);
      setProviders(provData.providers ?? []);
    } catch (e) {
      setMonitoringError((e as Error).message);
    } finally {
      setLoadingMonitoring(false);
    }
  }

  useEffect(() => {
    if (!agencyId || activeTab !== 'monitoring') return;
    void loadMonitoring();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agencyId, activeTab]);

  async function handleTestProvider(id: string) {
    setTestingId(id);
    try {
      const { apiFetch } = await import('@/lib/api-client');
      await apiFetch(`/api/settings/providers/${id}/test`, { method: 'POST' });
      await loadProviders();
    } catch (e) {
      await loadProviders();
      console.error(e);
    } finally { setTestingId(null); }
  }

  async function handleDeleteProvider(id: string) {
    const msg = isAr ? 'هل أنت متأكد من حذف هذا المزود؟' : 'Delete this provider credential?';
    if (!confirm(msg)) return;
    try {
      const { apiFetch } = await import('@/lib/api-client');
      await apiFetch(`/api/settings/providers/${id}`, { method: 'DELETE' });
      await loadProviders();
    } catch { setProviderError(isAr ? 'فشل الحذف' : 'Delete failed'); }
  }

  function openAddProvider() {
    setEditingProvider(null);
    setProviderForm({ providerCode: 'amadeus', label: '', clientId: '', clientSecret: '', hostname: 'test.api.amadeus.com' });
    setShowSecret(false);
    setShowProviderForm(true);
  }

  function openEditProvider(p: ProviderRow) {
    setEditingProvider(p);
    setProviderForm({ providerCode: p.providerCode, label: p.label ?? '', clientId: '', clientSecret: '', hostname: 'test.api.amadeus.com' });
    setShowSecret(false);
    setShowProviderForm(true);
  }

  async function handleSaveProvider() {
    setProviderSaving(true);
    setProviderError('');
    try {
      const { apiFetch } = await import('@/lib/api-client');
      const credentials = providerForm.providerCode === 'amadeus'
        ? { clientId: providerForm.clientId, clientSecret: providerForm.clientSecret, hostname: providerForm.hostname }
        : {};
      if (editingProvider) {
        const patch: Record<string, unknown> = { label: providerForm.label || null };
        if (providerForm.clientId || providerForm.clientSecret) patch.credentials = credentials;
        await apiFetch(`/api/settings/providers/${editingProvider.id}`, { method: 'PATCH', body: JSON.stringify(patch) });
      } else {
        await apiFetch('/api/settings/providers', { method: 'POST', body: JSON.stringify({ providerCode: providerForm.providerCode, label: providerForm.label || null, credentials }) });
      }
      setShowProviderForm(false);
      await loadProviders();
    } catch (e) {
      setProviderError((e as Error).message ?? (isAr ? 'فشل الحفظ' : 'Save failed'));
    } finally { setProviderSaving(false); }
  }

  // Load custom service types from REST API
  useEffect(() => {
    if (!agencyId || activeTab !== 'service_types') return;

    async function load() {
      const { apiFetch } = await import('@/lib/api-client');
      const data = await apiFetch<{ serviceTypes: CustomServiceType[] }>('/api/service-types');
      setCustomTypes(data.serviceTypes);
    }

    void load();
  }, [agencyId, activeTab, tick]);

  // Service type handlers
  async function handleAddServiceType() {
    if (!user?.agencyId || !addForm.nameAr.trim()) return;
    setAddSaving(true);
    try {
      const { apiFetch } = await import('@/lib/api-client');
      await apiFetch('/api/service-types', { method: 'POST', body: JSON.stringify({
        nameAr: addForm.nameAr.trim(),
        nameEn: addForm.nameEn.trim() || addForm.nameAr.trim(),
        icon: addForm.icon,
      }) });
      setAddForm({ nameAr: '', nameEn: '', icon: 'layers', color: PRESET_COLORS[0] });
      setShowAddForm(false);
      setTick(t => t + 1);
    } catch (err) {
      console.error('Error adding service type:', err);
    } finally {
      setAddSaving(false);
    }
  }

  async function handleDeleteServiceType(id: string) {
    try {
      const { apiFetch } = await import('@/lib/api-client');
      await apiFetch(`/api/service-types/${id}`, { method: 'DELETE' });
      setTick(t => t + 1);
    } catch (err) {
      console.error('Error deleting service type:', err);
    }
  }

  async function handleEditSave(id: string) {
    try {
      const { apiFetch } = await import('@/lib/api-client');
      await apiFetch(`/api/service-types/${id}`, { method: 'PATCH', body: JSON.stringify({
        nameAr: editForm.nameAr.trim(),
        nameEn: editForm.nameEn.trim() || editForm.nameAr.trim(),
        icon: editForm.icon,
      }) });
      setEditingId(null);
      setTick(t => t + 1);
    } catch (err) {
      console.error('Error updating service type:', err);
    }
  }

  async function handleToggleServiceType(id: string) {
    try {
      const current = customTypes.find(t => t.id === id);
      if (!current) return;
      const { apiFetch } = await import('@/lib/api-client');
      await apiFetch(`/api/service-types/${id}`, { method: 'PATCH', body: JSON.stringify({
        isActive: !current.isActive,
      }) });
      setTick(t => t + 1);
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

      const { apiFetch } = await import('@/lib/api-client');
      await apiFetch('/api/settings', { method: 'PATCH', body: JSON.stringify({ logoUrl: base64 }) });

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
    setSaveError('');
    try {
      const { apiFetch } = await import('@/lib/api-client');
      await apiFetch('/api/settings', {
        method: 'PATCH',
        body: JSON.stringify({
          nameAr:             nameAr.trim(),
          nameEn:             nameEn.trim(),
          isVatRegistered,
          vatNumber:          isVatRegistered ? vatNumber.trim() : '',
          vatRate:            isVatRegistered ? vatRate : 0,
          crNumber:           crNumber.trim(),
          city:               city.trim(),
          contactEmail:       contactEmail.trim(),
          contactPhone:       contactPhone.trim(),
          defaultQuoteTerms:  defaultQuoteTerms.trim(),
        }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setSaveError(isAr ? 'فشل الحفظ — تحقق من اتصالك وحاول مجدداً' : 'Save failed — check your connection and try again');
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
              {ALL_TABS.filter(t => !t.vatOnly || isVatRegistered).map(tab => (
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

                {/* VAT registration section */}
                <div className="space-y-3">
                  <div className={cn(
                    'border-2 rounded-2xl p-4 transition-colors',
                    isVatRegistered
                      ? 'border-emerald-300 bg-emerald-50/60'
                      : 'border-slate-200 bg-slate-50',
                  )}>
                    <div className="flex items-center justify-between gap-4 mb-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-800">
                          {isAr ? 'تسجيل ضريبة القيمة المضافة (VAT)' : 'VAT Registration'}
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {isAr
                            ? 'يحدد نوع الفواتير الصادرة والمعالجة المحاسبية'
                            : 'Determines the type of issued invoices and accounting treatment'}
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

                    {/* Feature comparison cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {/* Non-VAT card */}
                      <div className={cn(
                        'rounded-xl p-3 border transition-all',
                        !isVatRegistered
                          ? 'border-brand-300 bg-white shadow-sm ring-2 ring-brand-100'
                          : 'border-slate-200 bg-white/60 opacity-60',
                      )}>
                        <div className="flex items-center gap-2 mb-2">
                          <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0">
                            <FileText size={13} className="text-slate-600" />
                          </div>
                          <p className="text-xs font-bold text-slate-800">
                            {isAr ? 'سجل تجاري فقط' : 'CR Only'}
                          </p>
                          {!isVatRegistered && (
                            <span className="ms-auto text-[10px] font-bold text-brand-600 bg-brand-50 px-1.5 py-0.5 rounded-full">
                              {isAr ? 'نشط' : 'Active'}
                            </span>
                          )}
                        </div>
                        <ul className="space-y-1">
                          {[
                            isAr ? '✓ فاتورة تجارية بدون VAT' : '✓ Commercial invoice (no VAT)',
                            isAr ? '✓ رقم السجل التجاري' : '✓ Commercial registration number',
                            isAr ? '✓ قيد محاسبي مبسّط' : '✓ Simplified journal entry',
                            isAr ? '✗ لا QR code زاتكا' : '✗ No ZATCA QR code',
                            isAr ? '✗ لا تقرير ضريبي' : '✗ No tax report',
                          ].map(f => (
                            <li key={f} className={cn(
                              'text-[11px]',
                              f.startsWith('✓') ? 'text-slate-600' : 'text-slate-400',
                            )}>{f}</li>
                          ))}
                        </ul>
                      </div>

                      {/* VAT card */}
                      <div className={cn(
                        'rounded-xl p-3 border transition-all',
                        isVatRegistered
                          ? 'border-emerald-300 bg-white shadow-sm ring-2 ring-emerald-100'
                          : 'border-slate-200 bg-white/60 opacity-60',
                      )}>
                        <div className="flex items-center gap-2 mb-2">
                          <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                            <Shield size={13} className="text-emerald-600" />
                          </div>
                          <p className="text-xs font-bold text-slate-800">
                            {isAr ? 'مسجّل بضريبة القيمة المضافة' : 'VAT Registered'}
                          </p>
                          {isVatRegistered && (
                            <span className="ms-auto text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full">
                              {isAr ? 'نشط' : 'Active'}
                            </span>
                          )}
                        </div>
                        <ul className="space-y-1">
                          {[
                            { text: isAr ? '✓ فاتورة ضريبية رسمية'                      : '✓ Official tax invoice',          cls: 'text-slate-600' },
                            { text: isAr ? '✓ QR code المرحلة الأولى (TLV)'             : '✓ QR code Phase 1 (TLV)',          cls: 'text-slate-600' },
                            { text: isAr ? '✓ قيد محاسبي مع ضريبة'                      : '✓ Journal entry with VAT',         cls: 'text-slate-600' },
                            { text: isAr ? '✓ تقرير ضريبة القيمة المضافة'               : '✓ VAT report',                    cls: 'text-slate-600' },
                            { text: isAr ? '✓ السجل التجاري + الرقم الضريبي'            : '✓ CR + VAT numbers',              cls: 'text-slate-600' },
                            { text: isAr ? '— زاتكا المرحلة الثانية: قريباً'            : '— ZATCA Phase 2: coming soon',    cls: 'text-amber-600 font-medium' },
                          ].map(f => (
                            <li key={f.text} className={`text-[11px] ${f.cls}`}>{f.text}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
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

                {/* VAT rate — configurable for Gulf countries */}
                {isVatRegistered && (
                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-slate-700">
                      {isAr ? 'معدل ضريبة القيمة المضافة' : 'VAT Rate'}
                    </label>
                    <p className="text-xs text-slate-500">
                      {isAr ? 'السعودية 15%، الإمارات وعُمان 5%، البحرين 10%' : 'KSA 15%, UAE & Oman 5%, Bahrain 10%'}
                    </p>
                    <div className="flex gap-2 flex-wrap">
                      {[{ v: 5, label: '5%' }, { v: 10, label: '10%' }, { v: 15, label: '15%' }].map(opt => (
                        <button
                          key={opt.v}
                          type="button"
                          onClick={() => setVatRate(opt.v)}
                          className={cn(
                            'px-4 py-2 rounded-lg border text-sm font-semibold transition-colors',
                            vatRate === opt.v
                              ? 'bg-brand-600 text-white border-brand-600'
                              : 'bg-white text-slate-600 border-slate-200 hover:border-brand-300',
                          )}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Address section */}
                <div className="border-t border-surface-border pt-5">
                  <div className="flex items-center gap-2 mb-4">
                    <p className="text-sm font-semibold text-slate-700">
                      {isAr ? 'العنوان الوطني' : 'National Address'}
                    </p>
                    <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                      {isAr ? 'مطلوب لـ ZATCA' : 'Required for ZATCA'}
                    </span>
                  </div>
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
                  </div>
                </div>

                {/* Default quote terms */}
                <div className="border-t border-surface-border pt-5">
                  <p className="text-sm font-semibold text-slate-700 mb-1">
                    {isAr ? 'الشروط والأحكام الافتراضية لعروض الأسعار' : 'Default Quote Terms & Conditions'}
                  </p>
                  <p className="text-xs text-slate-400 mb-3">
                    {isAr
                      ? 'تُعبَّأ تلقائياً في كل عرض سعر جديد ويمكن تعديلها عند الحاجة'
                      : 'Auto-filled in every new quotation and can be edited per quote'}
                  </p>
                  <textarea
                    value={defaultQuoteTerms}
                    onChange={e => setDefaultQuoteTerms(e.target.value)}
                    rows={5}
                    dir={isAr ? 'rtl' : 'ltr'}
                    placeholder={isAr
                      ? '• العرض صالح حتى تاريخ الانتهاء المحدد\n• الأسعار بالريال السعودي\n• يُرجى التأكيد خطياً لحجز هذا العرض\n• شروط الإلغاء وفق سياسة المورد'
                      : '• Quote valid until the expiry date stated above\n• Prices in SAR\n• Written confirmation required to book\n• Cancellation terms apply per supplier policy'}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
                  />
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
                          // eslint-disable-next-line @next/next/no-img-element
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
                            {/* eslint-disable-next-line @next/next/no-img-element */}
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
                            {/* eslint-disable-next-line @next/next/no-img-element */}
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
                  {saveError && (
                    <span className="flex items-center gap-1.5 text-sm text-red-600 font-medium">
                      <XCircle size={15} />
                      {saveError}
                    </span>
                  )}
                  {!saved && !saveError && <span />}
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
                    const displayName  = isAr ? (u.nameAr || u.nameEn) : (u.nameEn || u.nameAr);
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

              {/* ── Development status banner ── */}
              <div className="flex items-start gap-3 p-4 rounded-2xl bg-slate-900 text-white">
                <div className="flex-shrink-0 mt-0.5 w-8 h-8 rounded-full bg-amber-400/20 flex items-center justify-center">
                  <AlertTriangle size={16} className="text-amber-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-sm font-bold text-white">
                      {isAr ? 'حالة تكامل ZATCA' : 'ZATCA Integration Status'}
                    </p>
                    <span className="text-[10px] font-bold bg-amber-400/20 text-amber-300 border border-amber-400/30 px-2 py-0.5 rounded-full">
                      {isAr ? 'قيد التطوير' : 'In Development'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    {isAr
                      ? 'تكامل ZATCA المرحلة الثانية (الفوترة الإلكترونية) غير مفعّل حالياً. الفواتير الصادرة حالياً هي فواتير ضريبية ورقية (مرحلة أولى) فقط. سيتم إضافة الربط الكامل مع منصة ZATCA في إصدار قادم.'
                      : 'ZATCA Phase 2 (e-invoicing) is not yet active. Invoices issued are paper-based tax invoices (Phase 1) only. Full ZATCA platform integration will be added in a future release.'}
                  </p>
                  <div className="mt-2 flex items-center gap-4 text-[11px]">
                    <span className="flex items-center gap-1.5 text-emerald-400">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                      {isAr ? 'المرحلة الأولى (ورقية): مدعومة' : 'Phase 1 (paper): supported'}
                    </span>
                    <span className="flex items-center gap-1.5 text-slate-400">
                      <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
                      {isAr ? 'المرحلة الثانية (إلكترونية): قريباً' : 'Phase 2 (electronic): coming soon'}
                    </span>
                  </div>
                </div>
              </div>

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
            const isTrial = subStatus === 'trial';
            const isActive = subStatus === 'active' || subStatus === 'lifetime';
            const PAID_PLAN_ALL = new Set(['operations', 'business', 'enterprise', 'starter', 'professional', 'lifetime']);
            const isPaidPlan = PAID_PLAN_ALL.has(subPlan) && isActive;

            // Status badge
            const statusBadge = (() => {
              if (subStatus === 'trial')     return <Badge variant="info">{isAr ? 'تجريبي' : 'Trial'}</Badge>;
              if (subStatus === 'active')    return <Badge variant="success">{isAr ? 'نشط' : 'Active'}</Badge>;
              if (subStatus === 'lifetime')  return <Badge variant="success">{isAr ? 'مدى الحياة' : 'Lifetime'}</Badge>;
              if (subStatus === 'past_due')  return <Badge variant="warning">{isAr ? 'متأخر' : 'Past Due'}</Badge>;
              if (subStatus === 'cancelled') return <Badge variant="danger">{isAr ? 'ملغى' : 'Cancelled'}</Badge>;
              return null;
            })();

            // Current plan display name
            const planKeyNorm = subPlan === 'starter' ? 'operations' : subPlan === 'professional' ? 'business' : subPlan;
            const currentPlanDef = PLAN_DISPLAY.find(p => p.key === planKeyNorm);
            const currentPlanName = isTrial
              ? (isAr ? 'تجريبي' : 'Trial')
              : subStatus === 'lifetime'
                ? (isAr ? 'مدى الحياة' : 'Lifetime')
                : (currentPlanDef ? (isAr ? currentPlanDef.nameAr : currentPlanDef.nameEn) : (isAr ? 'تجريبي' : 'Trial'));

            // Status line
            const statusLine = (() => {
              if (isTrial && daysRemaining !== null) {
                return isAr
                  ? `متبقي ${daysRemaining} ${daysRemaining === 1 ? 'يوم' : 'أيام'} على انتهاء الفترة التجريبية`
                  : `${daysRemaining} day${daysRemaining === 1 ? '' : 's'} left in free trial`;
              }
              if (subStatus === 'lifetime') return isAr ? 'اشتراك مدى الحياة — لا تنتهي صلاحيته' : 'Lifetime subscription — never expires';
              if (isActive) return isAr ? 'اشتراك نشط — يُجدَّد بالتواصل مع فريق المبيعات' : 'Active — renewed via sales team';
              return isAr ? 'يرجى التواصل مع فريق المبيعات' : 'Contact our sales team';
            })();

            // Usage limits — all paid plans are unlimited in the new tier model
            const userLimit    = (isPaidPlan || subStatus === 'lifetime') ? null : 3;
            const bookingLimit = (isPaidPlan || subStatus === 'lifetime') ? null : 500;

            // WhatsApp message helper
            function waUrl(planAr: string) {
              const msg = subAgencyName
                ? `مرحباً فريق مسارات، أرغب في ترقية اشتراك وكالتي (${subAgencyName}) إلى باقة ${planAr}.`
                : `مرحباً فريق مسارات، أرغب في الاشتراك في باقة ${planAr}.`;
              return `https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(msg)}`;
            }

            return (
              <div className="space-y-6">

                {/* ── Current status ─────────────────────────────────────── */}
                <Card>
                  <CardHeader>
                    <CardTitle>{isAr ? 'اشتراكك الحالي' : 'Your Current Plan'}</CardTitle>
                  </CardHeader>
                  <div className="flex items-start gap-4 flex-wrap">
                    {/* Plan name + status */}
                    <div className="flex-1 min-w-[180px]">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="text-2xl font-bold text-slate-900">{currentPlanName}</span>
                        {statusBadge}
                      </div>
                      <p className="text-sm text-slate-500">{statusLine}</p>
                    </div>
                    {/* Trial countdown */}
                    {isTrial && daysRemaining !== null && (
                      <div className={cn(
                        'rounded-xl px-5 py-3 text-center flex-shrink-0',
                        daysRemaining <= 3
                          ? 'bg-red-50 border border-red-200'
                          : 'bg-amber-50 border border-amber-200',
                      )}>
                        <p className={cn('text-3xl font-bold', daysRemaining <= 3 ? 'text-red-600' : 'text-amber-600')}>{daysRemaining}</p>
                        <p className={cn('text-xs mt-0.5', daysRemaining <= 3 ? 'text-red-500' : 'text-amber-500')}>
                          {isAr ? 'يوم متبقي' : 'days left'}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Usage meters */}
                  {(usersCount !== null || bookingsCount !== null) && (
                    <div className="mt-5 pt-5 border-t border-surface-border grid grid-cols-2 gap-4">
                      {/* Users */}
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-xs font-medium text-slate-600">{isAr ? 'المستخدمون' : 'Users'}</span>
                          <span className="text-xs text-slate-500">
                            {usersCount ?? '…'} {userLimit !== null ? `/ ${userLimit}` : (isAr ? '(غير محدود)' : '(unlimited)')}
                          </span>
                        </div>
                        {userLimit !== null ? (
                          <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                            <div
                              className={cn('h-full rounded-full transition-all', (usersCount ?? 0) >= userLimit ? 'bg-red-500' : 'bg-emerald-500')}
                              style={{ width: `${Math.min(100, ((usersCount ?? 0) / userLimit) * 100)}%` }}
                            />
                          </div>
                        ) : (
                          <div className="h-1.5 rounded-full bg-emerald-100">
                            <div className="h-full w-full rounded-full bg-emerald-400 opacity-40" />
                          </div>
                        )}
                      </div>
                      {/* Bookings */}
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-xs font-medium text-slate-600">{isAr ? 'الحجوزات' : 'Bookings'}</span>
                          <span className="text-xs text-slate-500">
                            {bookingsCount ?? '…'} {bookingLimit !== null ? `/ ${bookingLimit}` : (isAr ? '(غير محدود)' : '(unlimited)')}
                          </span>
                        </div>
                        {bookingLimit !== null ? (
                          <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                            <div
                              className={cn('h-full rounded-full transition-all', (bookingsCount ?? 0) >= bookingLimit ? 'bg-red-500' : 'bg-brand-500')}
                              style={{ width: `${Math.min(100, ((bookingsCount ?? 0) / bookingLimit) * 100)}%` }}
                            />
                          </div>
                        ) : (
                          <div className="h-1.5 rounded-full bg-brand-100">
                            <div className="h-full w-full rounded-full bg-brand-400 opacity-40" />
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </Card>

                {/* ── Pricing plans ──────────────────────────────────────── */}
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-base font-bold text-slate-800">
                      {isAr ? 'خطط الاشتراك' : 'Subscription Plans'}
                    </h3>
                    <span className="text-xs text-slate-400">
                      {isAr ? 'الأسعار بالريال السعودي / شهرياً' : 'Prices in SAR / month'}
                    </span>
                  </div>

                  <div className="grid gap-5 sm:grid-cols-3">
                    {PLAN_DISPLAY.map(plan => {
                      const isCurrent = (subPlan === plan.key ||
                        (subPlan === 'starter' && plan.key === 'operations') ||
                        (subPlan === 'professional' && plan.key === 'business')) && isPaidPlan;
                      const name = isAr ? plan.nameAr : plan.nameEn;
                      const notIncluded = isAr ? plan.notIncluded.ar : plan.notIncluded.en;

                      return (
                        <div
                          key={plan.key}
                          className={cn(
                            'relative rounded-2xl border flex flex-col transition-shadow',
                            plan.highlighted
                              ? 'border-brand-400 shadow-lg shadow-brand-100'
                              : 'border-slate-200 shadow-sm',
                            isCurrent && 'ring-2 ring-emerald-400',
                          )}
                        >
                          {/* Popular badge */}
                          {plan.badgeAr && (
                            <div className="absolute -top-3 inset-x-0 flex justify-center">
                              <span className={cn(
                                'inline-flex items-center gap-1 px-3 py-1 rounded-full text-[11px] font-bold whitespace-nowrap',
                                plan.highlighted
                                  ? 'bg-brand-600 text-white'
                                  : 'bg-slate-700 text-white',
                              )}>
                                <Star size={10} className="fill-current" />
                                {isAr ? plan.badgeAr : plan.badgeEn}
                              </span>
                            </div>
                          )}

                          {/* Header */}
                          <div className={cn(
                            'px-5 pt-6 pb-4 rounded-t-2xl',
                            plan.highlighted
                              ? 'bg-gradient-to-br from-brand-600 to-brand-700'
                              : 'bg-slate-50',
                          )}>
                            <div className="flex items-center justify-between mb-1">
                              <span className={cn(
                                'text-sm font-bold',
                                plan.highlighted ? 'text-white/80' : 'text-slate-500',
                              )}>
                                {name}
                              </span>
                              {isCurrent && (
                                <span className="text-[10px] bg-emerald-100 text-emerald-700 font-bold px-2 py-0.5 rounded-full">
                                  {isAr ? 'خطتك الحالية' : 'Current Plan'}
                                </span>
                              )}
                            </div>
                            <div className="flex items-end gap-1">
                              <span className={cn(
                                'text-4xl font-extrabold tracking-tight',
                                plan.highlighted ? 'text-white' : 'text-slate-900',
                              )}>
                                {plan.priceMonthly ?? '–'}
                              </span>
                              {plan.priceMonthly && (
                                <span className={cn(
                                  'text-sm mb-1',
                                  plan.highlighted ? 'text-white/70' : 'text-slate-400',
                                )}>
                                  {isAr ? 'ر.س / شهر' : 'SAR/mo'}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Feature list */}
                          <div className="px-5 py-4 flex-1 space-y-2">
                            {plan.features.slice(0, 8).map(fk => {
                              const label = FEATURE_LABEL[fk];
                              if (!label) return null;
                              return (
                                <div key={fk} className="flex items-center gap-2">
                                  <CheckCircle2 size={13} className="text-emerald-500 flex-shrink-0" />
                                  <span className="text-xs text-slate-700">{isAr ? label.ar : label.en}</span>
                                </div>
                              );
                            })}
                            {plan.features.length > 8 && (
                              <div className="text-xs text-brand-600 font-medium mt-1">
                                {isAr
                                  ? `+ ${plan.features.length - 8} ميزة إضافية`
                                  : `+ ${plan.features.length - 8} more features`}
                              </div>
                            )}

                            {/* Not included */}
                            {notIncluded.length > 0 && (
                              <div className="pt-2 mt-2 border-t border-slate-100 space-y-1.5">
                                {notIncluded.slice(0, 4).map(f => (
                                  <div key={f} className="flex items-center gap-2">
                                    <XCircleIcon size={13} className="text-slate-300 flex-shrink-0" />
                                    <span className="text-xs text-slate-400">{f}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* CTA */}
                          <div className="px-5 pb-5">
                            {isCurrent ? (
                              <div className="flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                <CheckCircle size={14} />
                                {isAr ? 'خطتك الحالية' : 'Your current plan'}
                              </div>
                            ) : (
                              <a
                                href={waUrl(isAr ? plan.nameAr : plan.nameEn)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={cn(
                                  'flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-colors w-full',
                                  plan.highlighted
                                    ? 'bg-brand-600 hover:bg-brand-700 text-white'
                                    : 'bg-slate-900 hover:bg-slate-800 text-white',
                                )}
                              >
                                <MessageCircle size={14} />
                                {isAr ? 'تواصل للاشتراك' : 'Contact to Subscribe'}
                              </a>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Customization note */}
                  <div className="mt-6 rounded-2xl border border-brand-100 bg-brand-50/50 px-5 py-4">
                    <p className="text-sm text-slate-600 text-center mb-3">
                      {isAr
                        ? 'يمكن تخصيص الباقة حسب عدد المستخدمين أو الفروع أو احتياجات الوكالة.'
                        : 'Plans can be customized by number of users, branches, or agency requirements.'}
                    </p>
                    <div className="flex justify-center">
                      <a
                        href={`https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(isAr ? 'مرحباً فريق مسارات، أرغب في الحصول على عرض مخصص لوكالتي.' : 'Hello Masarat team, I would like a custom quote for my agency.')}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold transition-colors"
                      >
                        <MessageCircle size={16} />
                        {isAr ? 'تواصل معنا للحصول على عرض مخصص' : 'Contact us for a custom quote'}
                      </a>
                    </div>
                  </div>
                </div>

                {/* ── Billing history ────────────────────────────────────── */}
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
                        ? 'ستظهر هنا فواتير اشتراكك'
                        : 'Your subscription invoices will appear here'}
                    </p>
                  </div>
                </Card>

                {/* ── Database setup ─────────────────────────────────────── */}
                <Card>
                  <CardHeader>
                    <CardTitle>{isAr ? 'تهيئة قاعدة البيانات' : 'Database Setup'}</CardTitle>
                  </CardHeader>
                  <div className="px-6 pb-6 space-y-3">
                    <p className="text-sm text-slate-500">
                      {isAr
                        ? 'إذا ظهرت رسالة "خطأ في الخادم" في جميع الصفحات، اضغط الزر أدناه لإنشاء جداول قاعدة البيانات.'
                        : 'If you see "Server Error" on all pages, click the button below to create the database tables.'}
                    </p>
                    <div className="flex items-center gap-3 flex-wrap">
                      <button
                        onClick={handleDbSetup}
                        disabled={dbSetupRunning}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
                      >
                        {dbSetupRunning
                          ? (isAr ? 'جارٍ الإنشاء...' : 'Running...')
                          : (isAr ? 'إنشاء الجداول' : 'Create Tables')}
                      </button>
                      <a
                        href="/api/health"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-brand-600 hover:underline"
                      >
                        {isAr ? 'فحص حالة قاعدة البيانات' : 'Check DB Status'}
                      </a>
                    </div>
                    {dbSetupResult && (
                      <div className={`p-3 rounded-lg text-sm ${dbSetupResult.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-800'}`}>
                        {dbSetupResult.ok
                          ? (isAr ? '✓ تم إنشاء الجداول بنجاح. أعد تحميل الصفحة.' : '✓ Tables created successfully. Reload the page.')
                          : (dbSetupResult.error ?? 'Error')}
                      </div>
                    )}
                  </div>
                </Card>
              </div>
            );
          })()}

          {/* ── GDS Providers ────────────────────────────────────────────── */}
          {activeTab === 'providers' && (
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>{isAr ? 'مزودو GDS' : 'GDS Providers'}</CardTitle>
                  {isAdmin && !showProviderForm && (
                    <Button size="sm" onClick={openAddProvider}>
                      <Plus size={14} />
                      {isAr ? 'إضافة مزود' : 'Add Provider'}
                    </Button>
                  )}
                </CardHeader>

                {/* ── Add / Edit form ── */}
                {showProviderForm && (
                  <div className="mb-5 p-4 rounded-xl border border-brand-200 bg-brand-50/40 space-y-3">
                    <p className="text-sm font-semibold text-slate-800">
                      {editingProvider
                        ? (isAr ? 'تعديل المزود' : 'Edit Provider')
                        : (isAr ? 'إضافة مزود جديد' : 'Add New Provider')}
                    </p>

                    {/* Provider Code — only on Add */}
                    {!editingProvider && (
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">
                          {isAr ? 'المزود' : 'Provider'}
                        </label>
                        <select
                          value={providerForm.providerCode}
                          onChange={e => setProviderForm(f => ({ ...f, providerCode: e.target.value }))}
                          className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-brand-400"
                        >
                          <option value="amadeus">Amadeus</option>
                          <option value="sabre">Sabre (قريباً)</option>
                          <option value="galileo">Galileo (قريباً)</option>
                          <option value="worldspan">Worldspan (قريباً)</option>
                        </select>
                      </div>
                    )}

                    {/* Coming-soon notice for providers not yet integrated */}
                    {providerForm.providerCode !== 'amadeus' && (
                      <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                        <AlertTriangle size={16} className="mt-0.5 flex-shrink-0 text-amber-500" />
                        <span>
                          {isAr
                            ? `${providerForm.providerCode.toUpperCase()} قيد التطوير — التكامل الكامل مع هذا المزود غير متاح بعد. المزود المدعوم حالياً هو Amadeus فقط.`
                            : `${providerForm.providerCode.toUpperCase()} is not yet integrated — full GDS connectivity is under development. Only Amadeus is currently supported.`}
                        </span>
                      </div>
                    )}

                    {/* Label */}
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        {isAr ? 'الاسم التعريفي (اختياري)' : 'Label (optional)'}
                      </label>
                      <Input
                        value={providerForm.label}
                        onChange={e => setProviderForm(f => ({ ...f, label: e.target.value }))}
                        placeholder={isAr ? 'مثال: Amadeus إنتاج' : 'e.g. Amadeus Production'}
                      />
                    </div>

                    {/* Amadeus-specific fields */}
                    {providerForm.providerCode === 'amadeus' && (
                      <>
                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-1">
                            Client ID
                            {editingProvider && <span className="text-slate-400 ms-1">({isAr ? 'اتركه فارغاً للإبقاء على القديم' : 'leave blank to keep current'})</span>}
                          </label>
                          <Input
                            value={providerForm.clientId}
                            onChange={e => setProviderForm(f => ({ ...f, clientId: e.target.value }))}
                            placeholder="Client ID"
                            dir="ltr"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-1">
                            Client Secret
                            {editingProvider && <span className="text-slate-400 ms-1">({isAr ? 'اتركه فارغاً للإبقاء على القديم' : 'leave blank to keep current'})</span>}
                          </label>
                          <div className="relative">
                            <Input
                              type={showSecret ? 'text' : 'password'}
                              value={providerForm.clientSecret}
                              onChange={e => setProviderForm(f => ({ ...f, clientSecret: e.target.value }))}
                              placeholder="Client Secret"
                              dir="ltr"
                              className="pe-10"
                            />
                            <button
                              type="button"
                              onClick={() => setShowSecret(s => !s)}
                              className="absolute end-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                            >
                              {showSecret ? <EyeOff size={15} /> : <Eye size={15} />}
                            </button>
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-1">
                            {isAr ? 'البيئة' : 'Environment'}
                          </label>
                          <select
                            value={providerForm.hostname}
                            onChange={e => setProviderForm(f => ({ ...f, hostname: e.target.value }))}
                            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-brand-400"
                            dir="ltr"
                          >
                            <option value="test.api.amadeus.com">Test — test.api.amadeus.com</option>
                            <option value="api.amadeus.com">Production — api.amadeus.com</option>
                          </select>
                        </div>
                      </>
                    )}

                    {providerError && (
                      <p className="text-xs text-red-600">{providerError}</p>
                    )}

                    <div className="flex gap-2 pt-1">
                      <Button size="sm" onClick={handleSaveProvider} disabled={providerSaving}>
                        {providerSaving ? <Spinner size="sm" /> : null}
                        {isAr ? 'حفظ' : 'Save'}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => { setShowProviderForm(false); setProviderError(''); }}>
                        {isAr ? 'إلغاء' : 'Cancel'}
                      </Button>
                    </div>
                  </div>
                )}

                {/* ── Providers list ── */}
                {loadingProviders ? (
                  <div className="py-8 flex justify-center"><Spinner size="sm" /></div>
                ) : providers.length === 0 ? (
                  <div className="py-10 text-center">
                    <Server size={32} className="mx-auto text-slate-300 mb-3" />
                    <p className="text-sm text-slate-500">
                      {isAr ? 'لم يتم إضافة أي مزود بعد' : 'No providers configured yet'}
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                      {isAr ? 'أضف بيانات Amadeus للبدء في إصدار التذاكر' : 'Add Amadeus credentials to start issuing tickets'}
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-surface-border">
                    {providers.map(p => (
                      <div key={p.id} className="flex items-start justify-between py-4 gap-4">
                        <div className="flex items-start gap-3 min-w-0">
                          <div className="w-9 h-9 rounded-lg bg-brand-50 flex items-center justify-center flex-shrink-0">
                            <Server size={16} className="text-brand-600" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-900">
                              {p.label || p.providerCode.toUpperCase()}
                            </p>
                            <p className="text-xs text-slate-400 mt-0.5">{p.providerCode}</p>
                            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                              {p.isActive
                                ? <span className="text-[10px] bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded-full font-medium">{isAr ? 'نشط' : 'Active'}</span>
                                : <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full font-medium">{isAr ? 'معطّل' : 'Inactive'}</span>}
                              {p.testStatus === 'success' && (
                                <span className="text-[10px] bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded-full font-medium flex items-center gap-1">
                                  <Wifi size={9} />{isAr ? 'متصل' : 'Connected'}
                                </span>
                              )}
                              {p.testStatus === 'failed' && (
                                <span className="text-[10px] bg-red-50 text-red-600 px-1.5 py-0.5 rounded-full font-medium flex items-center gap-1">
                                  <WifiOff size={9} />{isAr ? 'فشل الاتصال' : 'Failed'}
                                </span>
                              )}
                              {p.testedAt && (
                                <span className="text-[10px] text-slate-400">
                                  {isAr ? 'آخر اختبار:' : 'Tested:'} {new Date(p.testedAt).toLocaleDateString(isAr ? 'ar-SA' : 'en-US')}
                                </span>
                              )}
                            </div>
                            {p.testStatus === 'failed' && p.testError && (
                              <p className="text-[10px] text-red-500 mt-1 max-w-xs truncate" title={p.testError}>{p.testError}</p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <button
                            onClick={() => handleTestProvider(p.id)}
                            disabled={testingId === p.id || !p.isActive}
                            className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 flex items-center gap-1.5 transition-colors"
                          >
                            {testingId === p.id
                              ? <Spinner size="sm" />
                              : <RefreshCw size={11} />}
                            {isAr ? 'اختبار' : 'Test'}
                          </button>
                          {isAdmin && (
                            <>
                              <button
                                onClick={() => openEditProvider(p)}
                                className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors"
                                title={isAr ? 'تعديل' : 'Edit'}
                              >
                                <Pencil size={13} />
                              </button>
                              <button
                                onClick={() => void handleDeleteProvider(p.id)}
                                className="p-1.5 rounded-lg border border-red-100 text-red-400 hover:bg-red-50 transition-colors"
                                title={isAr ? 'حذف' : 'Delete'}
                              >
                                <Trash2 size={13} />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {providerError && !showProviderForm && (
                  <p className="mt-3 text-xs text-red-600 flex items-center gap-1">
                    <AlertTriangle size={12} />{providerError}
                  </p>
                )}
              </Card>

              {/* ── Note for non-admins ── */}
              {!isAdmin && (
                <div className="p-4 rounded-xl bg-amber-50 border border-amber-200">
                  <p className="text-xs text-amber-700">
                    {isAr
                      ? 'إضافة أو تعديل بيانات المزود متاحة للمشرف والمالك فقط.'
                      : 'Adding or editing provider credentials requires admin or owner role.'}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ── Monitoring ───────────────────────────────────────────────── */}
          {activeTab === 'monitoring' && (
            <div className="space-y-5">
              {/* Refresh bar */}
              <div className="flex items-center justify-between">
                <p className="text-xs text-slate-500">
                  {isAr ? 'آخر تحديث: الآن' : 'Last refreshed: now'}
                </p>
                <button
                  onClick={() => void loadMonitoring()}
                  disabled={loadingMonitoring}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors"
                >
                  <RefreshCw size={12} className={loadingMonitoring ? 'animate-spin' : ''} />
                  {isAr ? 'تحديث' : 'Refresh'}
                </button>
              </div>

              {loadingMonitoring ? (
                <div className="py-16 flex justify-center"><Spinner size="sm" /></div>
              ) : monitoringError ? (
                <div className="py-10 flex flex-col items-center gap-2 text-sm text-red-600">
                  <AlertTriangle size={20} />
                  {monitoringError}
                </div>
              ) : (
                <>
                  {/* Provider Health */}
                  <Card>
                    <CardHeader>
                      <CardTitle>{isAr ? 'حالة المزودين' : 'Provider Health'}</CardTitle>
                      <button
                        onClick={() => setActiveTab('providers')}
                        className="text-xs text-brand-600 hover:underline"
                      >
                        {isAr ? 'إعداد المزودين' : 'Configure'}
                      </button>
                    </CardHeader>
                    {providers.length === 0 ? (
                      <div className="py-8 text-center">
                        <Server size={28} className="mx-auto text-slate-300 mb-3" />
                        <p className="text-sm text-slate-500">{isAr ? 'لم يتم إعداد أي مزود' : 'No providers configured'}</p>
                      </div>
                    ) : (
                      <div className="divide-y divide-surface-border">
                        {providers.map(p => (
                          <div key={p.id} className="flex items-center justify-between py-3.5">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className={cn(
                                'w-2.5 h-2.5 rounded-full flex-shrink-0',
                                p.testStatus === 'success' ? 'bg-emerald-400' :
                                p.testStatus === 'failed'  ? 'bg-red-400'     : 'bg-slate-300',
                              )} />
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-slate-900">{p.label || p.providerCode.toUpperCase()}</p>
                                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                  {p.testStatus === 'success' && (
                                    <span className="text-[10px] text-emerald-700 flex items-center gap-0.5">
                                      <Wifi size={9} />{isAr ? 'متصل' : 'Connected'}
                                    </span>
                                  )}
                                  {p.testStatus === 'failed' && (
                                    <span className="text-[10px] text-red-600 flex items-center gap-0.5">
                                      <WifiOff size={9} />{isAr ? 'فشل الاتصال' : 'Connection failed'}
                                    </span>
                                  )}
                                  {!p.testStatus && (
                                    <span className="text-[10px] text-slate-400">{isAr ? 'لم يختبر بعد' : 'Never tested'}</span>
                                  )}
                                  {p.testedAt && (
                                    <span className="text-[10px] text-slate-400">
                                      {isAr ? 'آخر اختبار:' : 'Tested:'} {new Date(p.testedAt).toLocaleString(isAr ? 'ar-SA' : 'en-US')}
                                    </span>
                                  )}
                                </div>
                                {p.testStatus === 'failed' && p.testError && (
                                  <p className="text-[10px] text-red-500 mt-0.5 max-w-xs truncate" title={p.testError}>{p.testError}</p>
                                )}
                              </div>
                            </div>
                            <button
                              onClick={() => void handleTestProvider(p.id)}
                              disabled={testingId === p.id || !p.isActive}
                              className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 flex items-center gap-1.5 flex-shrink-0 transition-colors"
                            >
                              {testingId === p.id ? <Spinner size="sm" /> : <RefreshCw size={11} />}
                              {isAr ? 'اختبار' : 'Test'}
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </Card>

                  {/* Ticket Health Summary */}
                  {monitoringData && (() => {
                    const totalPending = Object.values(monitoringData.statusCounts).reduce((s, n) => s + n, 0);
                    return (
                      <>
                        {/* Stat cards */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                          <div className={cn('p-4 rounded-xl border', totalPending > 0 ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-200')}>
                            <p className={cn('text-2xl font-bold', totalPending > 0 ? 'text-amber-700' : 'text-slate-700')}>{totalPending}</p>
                            <p className="text-xs text-slate-500 mt-0.5">{isAr ? 'تذكرة معلقة' : 'Pending tickets'}</p>
                          </div>
                          <div className={cn('p-4 rounded-xl border', monitoringData.orphanCount > 0 ? 'bg-red-50 border-red-200' : 'bg-slate-50 border-slate-200')}>
                            <p className={cn('text-2xl font-bold', monitoringData.orphanCount > 0 ? 'text-red-600' : 'text-slate-700')}>{monitoringData.orphanCount}</p>
                            <p className="text-xs text-slate-500 mt-0.5">{isAr ? 'تذكرة يتيمة' : 'Orphan tickets'}</p>
                          </div>
                          <div className="p-4 rounded-xl border bg-slate-50 border-slate-200">
                            <p className="text-2xl font-bold text-slate-700">{monitoringData.statusCounts['pending_void'] ?? 0}</p>
                            <p className="text-xs text-slate-500 mt-0.5">{isAr ? 'إلغاء قيد' : 'Voiding'}</p>
                          </div>
                          <div className="p-4 rounded-xl border bg-slate-50 border-slate-200">
                            <p className="text-2xl font-bold text-slate-700">{monitoringData.statusCounts['pending_refund'] ?? 0}</p>
                            <p className="text-xs text-slate-500 mt-0.5">{isAr ? 'استرداد قيد' : 'Refunding'}</p>
                          </div>
                        </div>

                        {/* Orphan warning */}
                        {monitoringData.orphanCount > 0 && (
                          <div className="flex items-start gap-3 p-4 rounded-xl bg-red-50 border border-red-200">
                            <AlertTriangle size={16} className="text-red-600 flex-shrink-0 mt-0.5" />
                            <div>
                              <p className="text-sm font-semibold text-red-800">
                                {isAr
                                  ? `${monitoringData.orphanCount} تذكرة يتيمة تحتاج مراجعة يدوية`
                                  : `${monitoringData.orphanCount} orphan ticket${monitoringData.orphanCount !== 1 ? 's' : ''} require manual review`}
                              </p>
                              <p className="text-xs text-red-600 mt-0.5">
                                {isAr
                                  ? 'استنفدت هذه التذاكر محاولات المصالحة التلقائية (≥ 20). يلزم التدخل اليدوي.'
                                  : 'These tickets exhausted automatic reconciliation (≥ 20 attempts). Manual intervention required.'}
                              </p>
                            </div>
                          </div>
                        )}

                        {/* Stalled by credential */}
                        {monitoringData.stalledByCredential.length > 0 && (
                          <Card>
                            <CardHeader>
                              <CardTitle>{isAr ? 'التذاكر المعلقة حسب المزود' : 'Stalled Tickets by Provider'}</CardTitle>
                            </CardHeader>
                            <div className="divide-y divide-surface-border">
                              {monitoringData.stalledByCredential.map((sc, i) => (
                                <div key={i} className="flex items-center justify-between py-3">
                                  <div>
                                    <p className="text-sm font-medium text-slate-900">
                                      {sc.label ?? sc.providerCode ?? (isAr ? 'مزود غير معروف' : 'Unknown provider')}
                                    </p>
                                    <p className="text-xs text-slate-400 mt-0.5">{sc.providerCode}</p>
                                  </div>
                                  <div className="flex items-center gap-5 text-end">
                                    <div>
                                      <p className="text-base font-bold text-amber-600">{sc.affectedTickets}</p>
                                      <p className="text-[10px] text-slate-400">{isAr ? 'تذكرة' : 'tickets'}</p>
                                    </div>
                                    <div>
                                      <p className={cn('text-base font-bold', sc.maxAttempts >= 20 ? 'text-red-600' : 'text-slate-600')}>
                                        {sc.maxAttempts}
                                      </p>
                                      <p className="text-[10px] text-slate-400">{isAr ? 'أقصى محاولة' : 'max attempts'}</p>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </Card>
                        )}

                        {/* All clear */}
                        {totalPending === 0 && monitoringData.orphanCount === 0 && (
                          <div className="py-10 flex flex-col items-center gap-2">
                            <CheckCircle2 size={36} className="text-emerald-400" />
                            <p className="text-sm font-medium text-emerald-700">
                              {isAr ? 'جميع التذاكر بحالة سليمة' : 'All tickets are healthy'}
                            </p>
                          </div>
                        )}
                      </>
                    );
                  })()}

                  {/* Quick links */}
                  <div className="flex gap-4 flex-wrap pt-1">
                    <a
                      href={`/${locale}/tickets`}
                      className="flex items-center gap-1 text-sm text-brand-600 hover:text-brand-700 font-medium"
                    >
                      {isAr ? 'عرض جميع التذاكر' : 'View all tickets'}
                      <ChevronRight size={14} className={isAr ? 'rotate-180' : ''} />
                    </a>
                    <button
                      onClick={() => setActiveTab('providers')}
                      className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 font-medium"
                    >
                      {isAr ? 'إعداد المزودين' : 'Configure providers'}
                      <ChevronRight size={14} className={isAr ? 'rotate-180' : ''} />
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

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
