'use client';

import { useState, useEffect, useRef } from 'react';
import { Search, X, Link2, Loader2 } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';

interface BookingRow {
  id:              string;
  bookingNumber:   string;
  customerNameAr:  string;
  customerNameEn:  string;
  serviceType:     string;
  status:          string;
  totalPriceHalalas: number;
}

interface CustomerRow {
  id:           string;
  nameAr:       string;
  nameEn:       string;
  phone:        string;
  bookingCount: number;
}

interface Props {
  pnrId:    string;
  mode:     'booking' | 'customer';
  isAr:     boolean;
  onClose:  () => void;
  onLinked: () => void;
}

const STATUS_STYLE: Record<string, string> = {
  confirmed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  cancelled: 'bg-red-50 text-red-700 border-red-200',
};

export function PnrLinkModal({ pnrId, mode, isAr, onClose, onLinked }: Props) {
  const [query,     setQuery]    = useState('');
  const [bookings,  setBookings] = useState<BookingRow[]>([]);
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [loading,   setLoading]  = useState(true);
  const [linking,   setLinking]  = useState(false);
  const [error,     setError]    = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  // Escape to close
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        if (mode === 'booking') {
          const res = await apiFetch<{ data: BookingRow[] }>('/api/bookings?limit=50');
          setBookings(res.data);
        } else {
          const res = await apiFetch<{ data: CustomerRow[] }>('/api/customers?limit=50');
          setCustomers(res.data);
        }
      } catch (err) {
        setError(String(err));
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [mode]);

  const q = query.toLowerCase();

  const filteredBookings = bookings.filter(b =>
    b.bookingNumber.toLowerCase().includes(q) ||
    b.customerNameAr.includes(q) ||
    b.customerNameEn.toLowerCase().includes(q),
  );

  const filteredCustomers = customers.filter(c =>
    c.nameAr.includes(q) ||
    c.nameEn.toLowerCase().includes(q) ||
    (c.phone && c.phone.includes(q)),
  );

  async function handleSelect(targetId: string) {
    setLinking(true);
    setError(null);
    try {
      const field = mode === 'booking' ? 'bookingId' : 'customerId';
      await apiFetch(`/api/pnr/${pnrId}`, {
        method: 'PATCH',
        body:   JSON.stringify({ [field]: targetId }),
      });
      onLinked();
    } catch (err) {
      setError(String(err));
      setLinking(false);
    }
  }

  const title = mode === 'booking'
    ? (isAr ? 'ربط PNR بحجز'   : 'Link PNR to Booking')
    : (isAr ? 'ربط PNR بعميل' : 'Link PNR to Customer');

  const emptyLabel = mode === 'booking'
    ? (isAr ? 'لا توجد حجوزات' : 'No bookings found')
    : (isAr ? 'لا يوجد عملاء'  : 'No customers found');

  return (
    <>
      {/* Backdrop — above drawer (z-50) */}
      <div
        className="fixed inset-0 bg-black/50"
        style={{ zIndex: 60 }}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal panel */}
      <div
        className="fixed inset-0 flex items-center justify-center p-4"
        style={{ zIndex: 70 }}
      >
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[70vh]">

          {/* Header */}
          <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Link2 size={15} className="text-brand-500" />
              <h2 className="text-sm font-bold text-slate-900">{title}</h2>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition-colors"
            >
              <X size={15} />
            </button>
          </div>

          {/* Search */}
          <div className="px-4 py-3 border-b border-slate-100">
            <div className="relative">
              <Search size={14} className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder={isAr ? 'بحث...' : 'Search...'}
                className="w-full border border-slate-200 rounded-xl ps-8 pe-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-300 focus:border-brand-400"
              />
            </div>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto py-1">
            {loading && (
              <div className="flex items-center justify-center h-24">
                <Loader2 size={20} className="animate-spin text-slate-300" />
              </div>
            )}

            {!loading && error && (
              <p className="text-xs text-rose-600 px-5 py-4">{error}</p>
            )}

            {!loading && !error && mode === 'booking' && (
              filteredBookings.length === 0
                ? <p className="text-xs text-slate-400 text-center py-8">{emptyLabel}</p>
                : filteredBookings.map(b => (
                    <button
                      key={b.id}
                      onClick={() => void handleSelect(b.id)}
                      disabled={linking}
                      className="w-full text-start px-4 py-3 hover:bg-slate-50 transition-colors flex items-center justify-between gap-3 border-b border-slate-50 last:border-0 disabled:opacity-50"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-mono font-bold text-slate-900">{b.bookingNumber}</p>
                        <p className="text-xs text-slate-500 truncate">
                          {isAr ? b.customerNameAr : b.customerNameEn}
                          {' · '}
                          {b.serviceType}
                        </p>
                      </div>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border whitespace-nowrap shrink-0 ${STATUS_STYLE[b.status] ?? 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                        {b.status}
                      </span>
                    </button>
                  ))
            )}

            {!loading && !error && mode === 'customer' && (
              filteredCustomers.length === 0
                ? <p className="text-xs text-slate-400 text-center py-8">{emptyLabel}</p>
                : filteredCustomers.map(c => (
                    <button
                      key={c.id}
                      onClick={() => void handleSelect(c.id)}
                      disabled={linking}
                      className="w-full text-start px-4 py-3 hover:bg-slate-50 transition-colors flex items-center justify-between gap-3 border-b border-slate-50 last:border-0 disabled:opacity-50"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900">{isAr ? c.nameAr : c.nameEn}</p>
                        <p className="text-xs text-slate-500">
                          {c.phone}
                          {' · '}
                          {c.bookingCount} {isAr ? 'حجز' : 'bookings'}
                        </p>
                      </div>
                    </button>
                  ))
            )}
          </div>

          {/* Linking indicator */}
          {linking && (
            <div className="px-4 py-2.5 border-t border-slate-100 flex items-center gap-2 text-xs text-slate-500">
              <Loader2 size={13} className="animate-spin" />
              {isAr ? 'جاري الربط...' : 'Linking...'}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
