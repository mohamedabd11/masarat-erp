'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useLocale } from 'next-intl';
import { Search, UserPlus, Clock, X, Check, Phone, ChevronRight, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CustomerRecord {
  id: string;
  nameAr: string;
  nameEn?: string;
  phone: string;
  email?: string;
  nationality?: string;
  tier?: 'standard' | 'silver' | 'gold' | 'platinum';
}

interface CustomerSearchProps {
  agencyId: string;
  onSelect: (c: CustomerRecord) => void;
  placeholder?: string;
  className?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const RECENT_KEY = 'masarat_recent_customers';
const MAX_RECENT = 5;

const TIER_COLORS: Record<string, string> = {
  standard:  'bg-slate-100 text-slate-500',
  silver:    'bg-slate-200 text-slate-700',
  gold:      'bg-amber-100 text-amber-700',
  platinum:  'bg-violet-100 text-violet-700',
};

const NATIONALITY_FLAGS: Record<string, string> = {
  SA: '🇸🇦', EG: '🇪🇬', JO: '🇯🇴', PK: '🇵🇰', IN: '🇮🇳',
  PH: '🇵🇭', BD: '🇧🇩', YE: '🇾🇪', SY: '🇸🇾', IQ: '🇮🇶',
  AE: '🇦🇪', KW: '🇰🇼', BH: '🇧🇭', OM: '🇴🇲', QA: '🇶🇦',
  US: '🇺🇸', GB: '🇬🇧', TR: '🇹🇷', MA: '🇲🇦', LB: '🇱🇧',
};

// ─── Recent customers helpers ─────────────────────────────────────────────────

function getRecent(): CustomerRecord[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    return raw ? (JSON.parse(raw) as CustomerRecord[]) : [];
  } catch { return []; }
}

function saveRecent(c: CustomerRecord) {
  try {
    const list = [c, ...getRecent().filter(r => r.id !== c.id)].slice(0, MAX_RECENT);
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch { /* ignore */ }
}

// ─── Quick-Create Modal ───────────────────────────────────────────────────────

const NATIONALITIES = [
  { value: 'SA', ar: 'السعودية',   en: 'Saudi Arabia'  },
  { value: 'EG', ar: 'مصر',        en: 'Egypt'          },
  { value: 'JO', ar: 'الأردن',     en: 'Jordan'         },
  { value: 'AE', ar: 'الإمارات',   en: 'UAE'            },
  { value: 'KW', ar: 'الكويت',     en: 'Kuwait'         },
  { value: 'BH', ar: 'البحرين',    en: 'Bahrain'        },
  { value: 'OM', ar: 'عُمان',      en: 'Oman'           },
  { value: 'QA', ar: 'قطر',        en: 'Qatar'          },
  { value: 'PK', ar: 'باكستان',    en: 'Pakistan'       },
  { value: 'IN', ar: 'الهند',      en: 'India'          },
  { value: 'PH', ar: 'الفلبين',    en: 'Philippines'    },
  { value: 'BD', ar: 'بنغلاديش',   en: 'Bangladesh'     },
  { value: 'YE', ar: 'اليمن',      en: 'Yemen'          },
  { value: 'SY', ar: 'سوريا',      en: 'Syria'          },
  { value: 'IQ', ar: 'العراق',     en: 'Iraq'           },
  { value: 'LB', ar: 'لبنان',      en: 'Lebanon'        },
  { value: 'MA', ar: 'المغرب',     en: 'Morocco'        },
  { value: 'TR', ar: 'تركيا',      en: 'Turkey'         },
  { value: 'US', ar: 'الولايات المتحدة', en: 'USA'     },
  { value: 'GB', ar: 'المملكة المتحدة',  en: 'UK'      },
];

interface QuickCreateProps {
  agencyId: string;
  initialName?: string;
  isAr: boolean;
  onCreated: (c: CustomerRecord) => void;
  onClose: () => void;
}

function QuickCreateModal({ agencyId, initialName, isAr, onCreated, onClose }: QuickCreateProps) {
  const [nameAr,  setNameAr]  = useState(initialName ?? '');
  const [phone,   setPhone]   = useState('');
  const [email,   setEmail]   = useState('');
  const [nat,     setNat]     = useState('SA');
  const [saving,  setSaving]  = useState(false);
  const [errors,  setErrors]  = useState<Record<string, string>>({});

  async function handleCreate() {
    const errs: Record<string, string> = {};
    if (!nameAr.trim() || nameAr.trim().length < 2)
      errs.nameAr = isAr ? 'الاسم مطلوب (حرفان على الأقل)' : 'Name required (2+ chars)';
    if (!phone.trim() || phone.trim().length < 9)
      errs.phone = isAr ? 'رقم الجوال مطلوب' : 'Mobile required';
    if (Object.keys(errs).length) { setErrors(errs); return; }

    setSaving(true);
    try {
      const { getFirestore, collection, addDoc, Timestamp } = await import('firebase/firestore');
      const { getApp } = await import('@masarat/firebase');
      const db = getFirestore(getApp());

      const ref = await addDoc(collection(db, 'customers'), {
        agencyId,
        type: 'individual',
        name: { ar: nameAr.trim(), en: nameAr.trim() },
        mobile: phone.trim(),
        email: email.trim(),
        nationality: nat,
        nationalId: '', passportNumber: '', passportExpiry: '',
        dateOfBirth: '', vatNumber: '', notes: '', tags: [],
        tier: 'standard',
        loyalty: { points: 0, totalEarned: 0 },
        stats: { totalBookings: 0, totalSpent: 0 },
        flags: { hasUnpaidBalance: false, isBlacklisted: false },
        isActive: true,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      });

      const created: CustomerRecord = {
        id: ref.id, nameAr: nameAr.trim(), phone: phone.trim(),
        email: email.trim() || undefined, nationality: nat, tier: 'standard',
      };
      saveRecent(created);
      onCreated(created);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Sheet */}
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-brand-100 flex items-center justify-center">
              <UserPlus size={15} className="text-brand-600" />
            </div>
            <p className="text-sm font-bold text-slate-900">
              {isAr ? 'إضافة عميل سريع' : 'Quick Add Customer'}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-3">
          {/* Name */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              {isAr ? 'الاسم *' : 'Name *'}
            </label>
            <input
              value={nameAr}
              onChange={e => { setNameAr(e.target.value); setErrors(v => ({ ...v, nameAr: '' })); }}
              placeholder={isAr ? 'الاسم الكامل' : 'Full name'}
              className={cn(
                'w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500',
                errors.nameAr ? 'border-red-300 bg-red-50' : 'border-slate-200',
              )}
            />
            {errors.nameAr && <p className="text-xs text-red-600 mt-0.5">{errors.nameAr}</p>}
          </div>

          {/* Phone + Nationality */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {isAr ? 'رقم الجوال *' : 'Mobile *'}
              </label>
              <input
                type="tel"
                value={phone}
                onChange={e => { setPhone(e.target.value); setErrors(v => ({ ...v, phone: '' })); }}
                placeholder="05xxxxxxxx"
                dir="ltr"
                className={cn(
                  'w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500',
                  errors.phone ? 'border-red-300 bg-red-50' : 'border-slate-200',
                )}
              />
              {errors.phone && <p className="text-xs text-red-600 mt-0.5">{errors.phone}</p>}
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {isAr ? 'الجنسية' : 'Nationality'}
              </label>
              <select
                value={nat}
                onChange={e => setNat(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
              >
                {NATIONALITIES.map(n => (
                  <option key={n.value} value={n.value}>
                    {NATIONALITY_FLAGS[n.value]} {isAr ? n.ar : n.en}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Email */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              {isAr ? 'البريد الإلكتروني (اختياري)' : 'Email (optional)'}
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder={isAr ? 'اختياري' : 'Optional'}
              dir="ltr"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          <p className="text-[11px] text-slate-400">
            {isAr
              ? 'يمكنك إكمال بيانات العميل لاحقاً من صفحة العملاء'
              : 'You can complete the customer profile later from the Customers page'}
          </p>
        </div>

        {/* Footer */}
        <div className="flex gap-2 px-5 py-4 border-t border-slate-100 bg-slate-50/60">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors"
          >
            {isAr ? 'إلغاء' : 'Cancel'}
          </button>
          <button
            type="button"
            onClick={() => void handleCreate()}
            disabled={saving}
            className="flex-1 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-sm font-bold text-white transition-colors flex items-center justify-center gap-2"
          >
            {saving ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Check size={14} />
            )}
            {saving
              ? (isAr ? 'جارٍ الحفظ...' : 'Saving...')
              : (isAr ? 'حفظ وتحديد' : 'Save & Select')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function CustomerSearch({ agencyId, onSelect, placeholder, className }: CustomerSearchProps) {
  const locale  = useLocale();
  const isAr    = locale === 'ar';

  const [query,     setQuery]     = useState('');
  const [results,   setResults]   = useState<CustomerRecord[]>([]);
  const [loading,   setLoading]   = useState(false);
  const [open,      setOpen]      = useState(false);
  const [recent,    setRecent]    = useState<CustomerRecord[]>([]);
  const [showModal, setShowModal] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Load recent customers on mount
  useEffect(() => {
    if (typeof window !== 'undefined') setRecent(getRecent());
  }, []);

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Search Firestore
  const search = useCallback(async (q: string) => {
    if (!q.trim() || q.trim().length < 2) { setResults([]); setLoading(false); return; }
    setLoading(true);
    try {
      const { getFirestore, collection, query: fsQuery, where, limit, getDocs } = await import('firebase/firestore');
      const { getApp } = await import('@masarat/firebase');
      const db = getFirestore(getApp());
      const snap = await getDocs(
        fsQuery(collection(db, 'customers'), where('agencyId', '==', agencyId), limit(200))
      );
      const lower = q.toLowerCase();
      const filtered = snap.docs
        .map(d => ({ id: d.id, ...d.data() } as CustomerRecord & { name?: { ar?: string; en?: string }; mobile?: string })
        )
        .map(d => ({
          id:          d.id,
          nameAr:      (d.name?.ar ?? d.nameAr ?? ''),
          nameEn:      (d.name?.en ?? d.nameEn ?? ''),
          phone:       (d.mobile ?? d.phone ?? ''),
          email:       d.email,
          nationality: d.nationality,
          tier:        d.tier,
        } as CustomerRecord))
        .filter(c =>
          c.nameAr.includes(lower) ||
          (c.nameEn ?? '').toLowerCase().includes(lower) ||
          c.phone.includes(lower)
        )
        .slice(0, 8);
      setResults(filtered);
    } finally {
      setLoading(false);
    }
  }, [agencyId]);

  useEffect(() => {
    const t = setTimeout(() => void search(query), 250);
    return () => clearTimeout(t);
  }, [query, search]);

  function handleSelect(c: CustomerRecord) {
    saveRecent(c);
    setRecent(getRecent());
    onSelect(c);
    setQuery('');
    setOpen(false);
  }

  function handleCreated(c: CustomerRecord) {
    setRecent(getRecent());
    onSelect(c);
    setShowModal(false);
    setOpen(false);
  }

  const showRecent  = !query && recent.length > 0;
  const showResults = !!query && query.trim().length >= 2;
  const noResults   = showResults && !loading && results.length === 0;
  const dropdownVisible = open && (showRecent || showResults || noResults);

  return (
    <>
      <div ref={containerRef} className={cn('relative', className)}>
        {/* Input */}
        <div className="relative">
          <Search size={15} className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={query}
            onFocus={() => setOpen(true)}
            onChange={e => { setQuery(e.target.value); setOpen(true); }}
            placeholder={placeholder ?? (isAr ? 'ابحث بالاسم أو رقم الجوال...' : 'Search by name or phone...')}
            className="w-full rounded-xl border border-slate-200 bg-white ps-9 pe-10 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition-colors"
          />
          <div className="absolute end-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
            {loading && <Loader2 size={14} className="animate-spin text-slate-400" />}
            {query && !loading && (
              <button
                type="button"
                onClick={() => { setQuery(''); setResults([]); }}
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X size={13} />
              </button>
            )}
          </div>
        </div>

        {/* Dropdown */}
        {dropdownVisible && (
          <div className="absolute z-50 top-full mt-1.5 start-0 end-0 bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden">

            {/* Recent customers section */}
            {showRecent && (
              <>
                <div className="flex items-center gap-2 px-4 pt-3 pb-1.5">
                  <Clock size={12} className="text-slate-400" />
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">
                    {isAr ? 'آخر العملاء' : 'Recent'}
                  </span>
                </div>
                {recent.map(c => (
                  <CustomerRow key={c.id} c={c} isAr={isAr} onSelect={() => handleSelect(c)} />
                ))}
                <div className="mx-3 my-1.5 border-t border-slate-100" />
              </>
            )}

            {/* Search results */}
            {showResults && results.length > 0 && (
              <>
                <div className="flex items-center gap-2 px-4 pt-3 pb-1.5">
                  <Search size={12} className="text-slate-400" />
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">
                    {isAr ? 'نتائج البحث' : 'Results'}
                  </span>
                </div>
                {results.map(c => (
                  <CustomerRow key={c.id} c={c} isAr={isAr} onSelect={() => handleSelect(c)} />
                ))}
              </>
            )}

            {/* No results */}
            {noResults && (
              <div className="px-4 py-3 text-center">
                <p className="text-sm text-slate-500">
                  {isAr ? `لا يوجد عميل بـ "${query}"` : `No customer found for "${query}"`}
                </p>
              </div>
            )}

            {/* Create new button */}
            <div className="border-t border-slate-100 p-2">
              <button
                type="button"
                onMouseDown={e => { e.preventDefault(); setShowModal(true); setOpen(false); }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-brand-50 transition-colors text-start group"
              >
                <div className="w-8 h-8 rounded-lg bg-brand-100 flex items-center justify-center flex-shrink-0 group-hover:bg-brand-200 transition-colors">
                  <UserPlus size={14} className="text-brand-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-brand-700">
                    {isAr
                      ? query ? `إضافة "${query}" كعميل جديد` : 'إضافة عميل جديد'
                      : query ? `Add "${query}" as new customer` : 'Add new customer'}
                  </p>
                  <p className="text-xs text-slate-400">
                    {isAr ? 'يمكنك إكمال بياناته لاحقاً' : 'Complete profile later'}
                  </p>
                </div>
                <ChevronRight size={14} className={cn('text-brand-400 flex-shrink-0', isAr && 'rotate-180')} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Quick Create Modal */}
      {showModal && (
        <QuickCreateModal
          agencyId={agencyId}
          initialName={query}
          isAr={isAr}
          onCreated={handleCreated}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
}

// ─── Customer Row ─────────────────────────────────────────────────────────────

function CustomerRow({ c, isAr, onSelect }: { c: CustomerRecord; isAr: boolean; onSelect: () => void }) {
  const flag    = c.nationality ? (NATIONALITY_FLAGS[c.nationality] ?? '') : '';
  const initials = (c.nameAr ?? c.nameEn ?? '?').charAt(0);

  return (
    <button
      type="button"
      onMouseDown={e => { e.preventDefault(); onSelect(); }}
      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 transition-colors text-start group"
    >
      {/* Avatar */}
      <div className="w-9 h-9 rounded-full bg-brand-100 flex items-center justify-center text-sm font-bold text-brand-700 flex-shrink-0">
        {initials}
      </div>

      {/* Info */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="text-sm font-semibold text-slate-900 truncate">{c.nameAr ?? c.nameEn}</p>
          {flag && <span className="text-sm leading-none flex-shrink-0">{flag}</span>}
          {c.tier && c.tier !== 'standard' && (
            <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0', TIER_COLORS[c.tier])}>
              {c.tier}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 mt-0.5">
          <Phone size={10} className="text-slate-400 flex-shrink-0" />
          <p className="text-xs text-slate-400" dir="ltr">{c.phone}</p>
          {c.email && (
            <p className="text-xs text-slate-300 truncate">· {c.email}</p>
          )}
        </div>
      </div>

      <ChevronRight size={13} className={cn('text-slate-300 group-hover:text-slate-500 flex-shrink-0 transition-colors', isAr && 'rotate-180')} />
    </button>
  );
}
