'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Users, Moon, Package, Plus, Search, CalendarDays, ChevronRight, ChevronLeft } from 'lucide-react';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Spinner } from '@/components/ui/Spinner';
import { apiFetch } from '@/lib/api-client';
import { formatDate, formatCurrency } from '@/lib/utils';

// ── Types ──────────────────────────────────────────────────────────────────────

interface GroupTrip {
  id:                    string;
  name:                  string;
  serviceType:           string;
  departureDate:         string | null;
  returnDate:            string | null;
  capacity:              number | null;
  pricePerPersonHalalas: number;
  status:                string;
  notes:                 string | null;
  createdAt:             string;
  memberCount:           number;
  confirmedCount:        number;
  visaApprovedCount:     number;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, { ar: string; en: string; cls: string }> = {
  planning:  { ar: 'تخطيط',   en: 'Planning',   cls: 'bg-slate-100  text-slate-700'   },
  open:      { ar: 'مفتوح',   en: 'Open',        cls: 'bg-blue-100   text-blue-700'    },
  closed:    { ar: 'مغلق',    en: 'Closed',      cls: 'bg-amber-100  text-amber-700'   },
  departed:  { ar: 'مسافر',   en: 'Departed',    cls: 'bg-brand-100  text-brand-700'   },
  completed: { ar: 'مكتمل',   en: 'Completed',   cls: 'bg-emerald-100 text-emerald-700' },
  cancelled: { ar: 'ملغي',    en: 'Cancelled',   cls: 'bg-red-100    text-red-700'     },
};

const SERVICE_LABELS: Record<string, { ar: string; en: string }> = {
  umrah:        { ar: 'عمرة',          en: 'Umrah' },
  hajj:         { ar: 'حج',            en: 'Hajj' },
  package:      { ar: 'باقة سياحية',   en: 'Package' },
  flight_hotel: { ar: 'طيران + فندق',  en: 'Flight + Hotel' },
  other:        { ar: 'أخرى',          en: 'Other' },
};

function StatusBadge({ status, isAr }: { status: string; isAr: boolean }) {
  const s = STATUS_LABELS[status] ?? STATUS_LABELS['planning']!;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${s.cls}`}>
      {isAr ? s.ar : s.en}
    </span>
  );
}

// ── Create Modal ───────────────────────────────────────────────────────────────

interface CreateModalProps {
  isAr:      boolean;
  locale:    string;
  onClose:   () => void;
  onCreated: (id: string) => void;
}

function CreateModal({ isAr, locale, onClose, onCreated }: CreateModalProps) {
  const [name, setName]             = useState('');
  const [serviceType, setServiceType] = useState('umrah');
  const [departureDate, setDepartureDate] = useState('');
  const [returnDate, setReturnDate] = useState('');
  const [capacity, setCapacity]     = useState('');
  const [pricePerPerson, setPricePerPerson] = useState('');
  const [notes, setNotes]           = useState('');
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError(isAr ? 'اسم الرحلة مطلوب' : 'Trip name is required'); return; }
    setSaving(true);
    setError(null);
    try {
      const data = await apiFetch<{ trip: { id: string } }>('/api/group-trips', {
        method: 'POST',
        body: JSON.stringify({
          name:                  name.trim(),
          serviceType,
          departureDate:         departureDate || undefined,
          returnDate:            returnDate    || undefined,
          capacity:              capacity      ? parseInt(capacity, 10)              : undefined,
          pricePerPersonHalalas: pricePerPerson ? Math.round(parseFloat(pricePerPerson) * 100) : 0,
          notes:                 notes.trim()  || undefined,
        }),
      });
      onCreated(data.trip.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : (isAr ? 'حدث خطأ' : 'An error occurred'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <Card className="relative w-full max-w-lg z-10 max-h-[90vh] overflow-y-auto">
        <CardHeader>
          <CardTitle>{isAr ? 'رحلة جديدة' : 'New Group Trip'}</CardTitle>
        </CardHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              {isAr ? 'اسم الرحلة *' : 'Trip Name *'}
            </label>
            <Input value={name} onChange={(e) => setName(e.target.value)} required placeholder={isAr ? 'مثال: عمرة رمضان 1446' : 'e.g. Ramadan Umrah 2025'} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              {isAr ? 'نوع الخدمة' : 'Service Type'}
            </label>
            <Select
              value={serviceType}
              onChange={(e) => setServiceType(e.target.value)}
              options={Object.entries(SERVICE_LABELS).map(([k, v]) => ({ value: k, label: isAr ? v.ar : v.en }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                {isAr ? 'تاريخ السفر' : 'Departure Date'}
              </label>
              <Input type="date" value={departureDate} onChange={(e) => setDepartureDate(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                {isAr ? 'تاريخ العودة' : 'Return Date'}
              </label>
              <Input type="date" value={returnDate} onChange={(e) => setReturnDate(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                {isAr ? 'الطاقة الاستيعابية' : 'Capacity'}
              </label>
              <Input type="number" min="1" value={capacity} onChange={(e) => setCapacity(e.target.value)} placeholder={isAr ? 'عدد المقاعد' : 'Seats'} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                {isAr ? 'سعر الفرد (ر.س)' : 'Price/Person (SAR)'}
              </label>
              <Input type="number" min="0" step="0.01" value={pricePerPerson} onChange={(e) => setPricePerPerson(e.target.value)} placeholder="0.00" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              {isAr ? 'ملاحظات' : 'Notes'}
            </label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={isAr ? 'ملاحظات...' : 'Notes...'} />
          </div>
          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
          <div className="flex gap-2 justify-end pt-2">
            <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={saving}>{isAr ? 'إلغاء' : 'Cancel'}</Button>
            <Button type="submit" size="sm" disabled={saving}>
              {saving ? <Spinner size="sm" /> : (isAr ? 'إنشاء' : 'Create')}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export function GroupTripsClient({ locale }: { locale: string }) {
  const isAr = locale === 'ar';
  const NavIcon = isAr ? ChevronLeft : ChevronRight;

  const [trips, setTrips]           = useState<GroupTrip[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [q, setQ]                   = useState('');
  const [status, setStatus]         = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (q)      params.set('q',      q);
      if (status) params.set('status', status);
      const data = await apiFetch<{ trips: GroupTrip[] }>(`/api/group-trips?${params}`);
      setTrips(data.trips);
    } catch (err) {
      setError(err instanceof Error ? err.message : (isAr ? 'حدث خطأ' : 'An error occurred'));
    } finally {
      setLoading(false);
    }
  }, [q, status, isAr]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="p-3 bg-brand-50 rounded-2xl border border-brand-100">
          <Users size={24} className="text-brand-600" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold text-slate-900">{isAr ? 'رحلات المجموعات' : 'Group Trips'}</h1>
          <p className="text-slate-500 text-sm">{isAr ? 'إدارة رحلات العمرة والحج والباقات الجماعية' : 'Manage Umrah, Hajj & package group trips'}</p>
        </div>
        <Button onClick={() => setShowCreate(true)} className="flex items-center gap-2">
          <Plus size={16} />
          {isAr ? 'رحلة جديدة' : 'New Trip'}
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={15} className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input
            className="ps-9"
            placeholder={isAr ? 'بحث...' : 'Search...'}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div className="w-full sm:w-48">
          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            options={[
              { value: '', label: isAr ? 'كل الحالات' : 'All Statuses' },
              ...Object.entries(STATUS_LABELS).map(([k, v]) => ({ value: k, label: isAr ? v.ar : v.en })),
            ]}
          />
        </div>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : error ? (
        <p className="text-sm text-red-600 text-center py-8">{error}</p>
      ) : trips.length === 0 ? (
        <div className="text-center py-16 text-slate-400 space-y-2">
          <Moon size={40} className="mx-auto opacity-30" />
          <p>{isAr ? 'لا توجد رحلات مجموعات بعد' : 'No group trips yet'}</p>
          <Button variant="outline" size="sm" onClick={() => setShowCreate(true)} className="flex items-center gap-1.5 mx-auto">
            <Plus size={14} />{isAr ? 'أنشئ أول رحلة' : 'Create first trip'}
          </Button>
        </div>
      ) : (
        <div className="grid gap-4">
          {trips.map((trip) => {
            const occupancyPct = trip.capacity ? Math.round((trip.memberCount / trip.capacity) * 100) : null;
            return (
              <Link key={trip.id} href={`/${locale}/group-trips/${trip.id}`}>
                <Card className="hover:shadow-md transition-shadow cursor-pointer">
                  <div className="flex items-start gap-4">
                    <div className="p-2.5 bg-brand-50 rounded-xl flex-shrink-0">
                      {trip.serviceType === 'umrah' || trip.serviceType === 'hajj'
                        ? <Moon size={18} className="text-brand-600" />
                        : <Package size={18} className="text-brand-600" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <div>
                          <h3 className="font-semibold text-slate-900 text-sm leading-snug">{trip.name}</h3>
                          <p className="text-xs text-slate-500 mt-0.5">
                            {isAr
                              ? (SERVICE_LABELS[trip.serviceType]?.ar ?? trip.serviceType)
                              : (SERVICE_LABELS[trip.serviceType]?.en ?? trip.serviceType)}
                          </p>
                        </div>
                        <StatusBadge status={trip.status} isAr={isAr} />
                      </div>
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                        {trip.departureDate && (
                          <span className="flex items-center gap-1">
                            <CalendarDays size={11} />
                            {formatDate(trip.departureDate, isAr ? 'ar-SA' : 'en-SA')}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <Users size={11} />
                          {isAr
                            ? `${trip.memberCount} ${trip.capacity ? `/ ${trip.capacity}` : ''} عضو`
                            : `${trip.memberCount}${trip.capacity ? ` / ${trip.capacity}` : ''} members`}
                        </span>
                        {trip.pricePerPersonHalalas > 0 && (
                          <span>{formatCurrency(trip.pricePerPersonHalalas, isAr ? 'ar-SA' : 'en-SA')} / {isAr ? 'فرد' : 'person'}</span>
                        )}
                      </div>
                      {occupancyPct !== null && (
                        <div className="mt-2">
                          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${occupancyPct >= 90 ? 'bg-red-400' : occupancyPct >= 70 ? 'bg-amber-400' : 'bg-emerald-400'}`}
                              style={{ width: `${Math.min(100, occupancyPct)}%` }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                    <NavIcon size={16} className="text-slate-300 flex-shrink-0 mt-1" />
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}

      {showCreate && (
        <CreateModal
          isAr={isAr}
          locale={locale}
          onClose={() => setShowCreate(false)}
          onCreated={(id) => {
            setShowCreate(false);
            window.location.href = `/${locale}/group-trips/${id}`;
          }}
        />
      )}
    </div>
  );
}
