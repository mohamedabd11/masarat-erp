'use client';

import { useEffect, useState } from 'react';
import { useLocale } from 'next-intl';
import { Search, Loader2, AlertCircle, ChevronDown } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import type { TravelCredential, FlightOffer } from './types';

interface SearchResult {
  offers:        FlightOffer[];
  credentialId:  string;
  passengerCount: number;
}

interface Props {
  onResult:   (r: SearchResult) => void;
  onClear:    () => void;
}

const CABIN_OPTIONS = [
  { value: 'economy',         ar: 'اقتصادي',       en: 'Economy' },
  { value: 'premium_economy', ar: 'اقتصادي مميز',  en: 'Premium Economy' },
  { value: 'business',        ar: 'أعمال',          en: 'Business' },
  { value: 'first',           ar: 'درجة أولى',      en: 'First Class' },
];

const PROVIDER_LABELS: Record<string, string> = {
  amadeus: 'Amadeus',
  galileo: 'Galileo',
  sabre:   'Sabre',
};

export function FlightSearchForm({ onResult, onClear }: Props) {
  const locale = useLocale();
  const isAr   = locale === 'ar';

  const [credentials, setCredentials] = useState<TravelCredential[]>([]);
  const [credentialId, setCredentialId] = useState('');
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');
  const [date, setDate] = useState('');
  const [passengers, setPassengers] = useState(1);
  const [cabin, setCabin] = useState('economy');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [credsLoading, setCredsLoading] = useState(true);

  // Today's date for the min attribute
  const today = new Date().toISOString().split('T')[0]!;

  useEffect(() => {
    apiFetch<{ credentials: TravelCredential[] }>('/api/travel/credentials')
      .then(d => {
        const active = (d.credentials ?? []).filter(c => c.isActive);
        setCredentials(active);
        if (active[0]) setCredentialId(active[0].id);
      })
      .catch(() => setError(isAr ? 'فشل تحميل بيانات الاعتماد' : 'Failed to load credentials'))
      .finally(() => setCredsLoading(false));
  }, [isAr]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!credentialId) { setError(isAr ? 'اختر مزود GDS أولاً' : 'Select a GDS provider first'); return; }
    if (origin.length !== 3)      { setError(isAr ? 'أدخل رمز المطار الصحيح (3 أحرف)' : 'Enter valid origin IATA code (3 letters)'); return; }
    if (destination.length !== 3) { setError(isAr ? 'أدخل رمز المطار الصحيح (3 أحرف)' : 'Enter valid destination IATA code (3 letters)'); return; }
    if (!date) { setError(isAr ? 'حدد تاريخ المغادرة' : 'Select departure date'); return; }

    setError(null);
    setLoading(true);
    onClear();

    try {
      const res = await apiFetch<{ offers: FlightOffer[] }>('/api/travel/flights/search', {
        method: 'POST',
        body: JSON.stringify({
          credentialId,
          params: {
            origin:        origin.toUpperCase(),
            destination:   destination.toUpperCase(),
            departureDate: date,
            passengers:    [{ type: 'ADT', count: passengers }],
            cabin,
          },
        }),
      });
      onResult({ offers: res.offers ?? [], credentialId, passengerCount: passengers });
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  const inputCls = 'w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 bg-white';
  const labelCls = 'block text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wide';

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
      <div className="flex items-center gap-2 mb-1">
        <Search size={16} className="text-indigo-500" />
        <h2 className="text-sm font-bold text-slate-700">
          {isAr ? 'بحث عن رحلات' : 'Search Flights'}
        </h2>
      </div>

      {/* Credential selector */}
      <div>
        <label className={labelCls}>{isAr ? 'مزود GDS' : 'GDS Provider'}</label>
        {credsLoading ? (
          <div className="flex items-center gap-2 text-sm text-slate-400 py-2">
            <Loader2 size={14} className="animate-spin" />
            {isAr ? 'جاري التحميل...' : 'Loading...'}
          </div>
        ) : credentials.length === 0 ? (
          <p className="text-sm text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
            {isAr ? 'لا توجد بيانات اعتماد نشطة — أضفها من الإعدادات' : 'No active credentials — add them in Settings'}
          </p>
        ) : (
          <div className="relative">
            <select
              value={credentialId}
              onChange={e => setCredentialId(e.target.value)}
              className={`${inputCls} appearance-none pr-8`}
            >
              {credentials.map(c => (
                <option key={c.id} value={c.id}>
                  {PROVIDER_LABELS[c.providerCode] ?? c.providerCode} — {c.label}
                </option>
              ))}
            </select>
            <ChevronDown size={14} className="absolute end-2.5 top-3 text-slate-400 pointer-events-none" />
          </div>
        )}
      </div>

      {/* Route */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>{isAr ? 'المغادرة' : 'From'}</label>
          <input
            type="text"
            placeholder="RUH"
            maxLength={3}
            value={origin}
            onChange={e => setOrigin(e.target.value.toUpperCase())}
            className={`${inputCls} font-mono tracking-widest uppercase`}
            dir="ltr"
          />
        </div>
        <div>
          <label className={labelCls}>{isAr ? 'الوصول' : 'To'}</label>
          <input
            type="text"
            placeholder="JED"
            maxLength={3}
            value={destination}
            onChange={e => setDestination(e.target.value.toUpperCase())}
            className={`${inputCls} font-mono tracking-widest uppercase`}
            dir="ltr"
          />
        </div>
      </div>

      {/* Date + Passengers + Cabin */}
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className={labelCls}>{isAr ? 'التاريخ' : 'Date'}</label>
          <input
            type="date"
            min={today}
            value={date}
            onChange={e => setDate(e.target.value)}
            className={`${inputCls}`}
            dir="ltr"
          />
        </div>
        <div>
          <label className={labelCls}>{isAr ? 'الركاب' : 'Passengers'}</label>
          <input
            type="number"
            min={1}
            max={9}
            value={passengers}
            onChange={e => setPassengers(Math.max(1, Math.min(9, +e.target.value)))}
            className={inputCls}
            dir="ltr"
          />
        </div>
        <div>
          <label className={labelCls}>{isAr ? 'الدرجة' : 'Cabin'}</label>
          <div className="relative">
            <select
              value={cabin}
              onChange={e => setCabin(e.target.value)}
              className={`${inputCls} appearance-none pr-8`}
            >
              {CABIN_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{isAr ? o.ar : o.en}</option>
              ))}
            </select>
            <ChevronDown size={14} className="absolute end-2.5 top-3 text-slate-400 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          <AlertCircle size={14} className="mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      {/* Submit */}
      <button
        type="submit"
        disabled={loading || credsLoading || credentials.length === 0}
        className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-xl py-2.5 text-sm transition-colors"
      >
        {loading
          ? <><Loader2 size={15} className="animate-spin" />{isAr ? 'جاري البحث...' : 'Searching...'}</>
          : <><Search size={15} />{isAr ? 'بحث عن رحلات' : 'Search Flights'}</>
        }
      </button>
    </form>
  );
}
