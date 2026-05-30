'use client';

import { useState } from 'react';
import { useLocale } from 'next-intl';
import { X, Loader2, AlertCircle, CheckCircle2, User, Plus, Trash2 } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import type { FlightOffer, PassengerInput, CreatedPnr } from './types';

interface Props {
  offer:        FlightOffer;
  credentialId: string;
  passengerCount: number;
  onClose:      () => void;
  onCreated:    (pnr: CreatedPnr) => void;
}

const EMPTY_PASSENGER: PassengerInput = {
  type:      'ADT',
  firstName: '',
  lastName:  '',
};

function emptyPassengers(count: number): PassengerInput[] {
  return Array.from({ length: count }, () => ({ ...EMPTY_PASSENGER }));
}

export function PnrModal({ offer, credentialId, passengerCount, onClose, onCreated }: Props) {
  const locale = useLocale();
  const isAr   = locale === 'ar';

  const [passengers, setPassengers] = useState<PassengerInput[]>(emptyPassengers(passengerCount));
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updatePassenger(idx: number, field: keyof PassengerInput, value: string) {
    setPassengers(prev => prev.map((p, i) => i === idx ? { ...p, [field]: value } : p));
  }

  function addPassenger() {
    if (passengers.length >= 9) return;
    setPassengers(prev => [...prev, { ...EMPTY_PASSENGER }]);
  }

  function removePassenger(idx: number) {
    if (passengers.length <= 1) return;
    setPassengers(prev => prev.filter((_, i) => i !== idx));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    // Validate
    for (const [i, p] of passengers.entries()) {
      if (!p.firstName.trim() || !p.lastName.trim()) {
        setError(isAr
          ? `الراكب ${i + 1}: الاسم الأول والأخير مطلوبان`
          : `Passenger ${i + 1}: first and last name are required`);
        return;
      }
    }
    if (!contactEmail.trim() || !contactEmail.includes('@')) {
      setError(isAr ? 'بريد إلكتروني صالح مطلوب للتواصل' : 'A valid contact email is required');
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const res = await apiFetch<{ pnr: CreatedPnr & { pnrCode: string }; pnrDbId: string }>(
        '/api/travel/pnr',
        {
          method: 'POST',
          body: JSON.stringify({
            credentialId,
            offer,                             // includes _raw — passed opaquely
            passengers: passengers.map(p => ({
              type:            p.type,
              firstName:       p.firstName.trim(),
              lastName:        p.lastName.trim(),
              dateOfBirth:     p.dateOfBirth    || undefined,
              passportNumber:  p.passportNumber || undefined,
              passportExpiry:  p.passportExpiry || undefined,
              nationality:     p.nationality    || undefined,
            })),
            contactEmail: contactEmail.trim(),
            contactPhone: contactPhone.trim() || undefined,
          }),
        },
      );

      onCreated({ ...res.pnr, pnrDbId: res.pnrDbId });
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  const inputCls = 'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 bg-white';
  const labelCls = 'block text-xs font-semibold text-slate-500 mb-1';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              {isAr ? 'إنشاء PNR' : 'Create PNR'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {offer.flightNumber} · {offer.origin} → {offer.destination}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Body (scrollable) */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
          <div className="p-5 space-y-5">
            {/* Passengers */}
            {passengers.map((p, idx) => (
              <div key={idx} className="space-y-3 rounded-xl border border-slate-200 p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                    <User size={14} className="text-indigo-500" />
                    {isAr ? `الراكب ${idx + 1}` : `Passenger ${idx + 1}`}
                  </div>
                  {passengers.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removePassenger(idx)}
                      className="p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={labelCls}>{isAr ? 'الاسم الأول' : 'First Name'} *</label>
                    <input
                      type="text"
                      value={p.firstName}
                      onChange={e => updatePassenger(idx, 'firstName', e.target.value)}
                      placeholder={isAr ? 'أحمد' : 'AHMED'}
                      className={inputCls}
                      dir="auto"
                    />
                  </div>
                  <div>
                    <label className={labelCls}>{isAr ? 'اسم العائلة' : 'Last Name'} *</label>
                    <input
                      type="text"
                      value={p.lastName}
                      onChange={e => updatePassenger(idx, 'lastName', e.target.value)}
                      placeholder={isAr ? 'السعودي' : 'ALSAUDI'}
                      className={inputCls}
                      dir="auto"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={labelCls}>{isAr ? 'تاريخ الميلاد' : 'Date of Birth'}</label>
                    <input
                      type="date"
                      value={p.dateOfBirth ?? ''}
                      onChange={e => updatePassenger(idx, 'dateOfBirth', e.target.value)}
                      className={inputCls}
                      dir="ltr"
                    />
                  </div>
                  <div>
                    <label className={labelCls}>{isAr ? 'الجنسية (ISO)' : 'Nationality (ISO)'}</label>
                    <input
                      type="text"
                      maxLength={2}
                      value={p.nationality ?? ''}
                      onChange={e => updatePassenger(idx, 'nationality', e.target.value.toUpperCase())}
                      placeholder="SA"
                      className={`${inputCls} uppercase font-mono`}
                      dir="ltr"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={labelCls}>{isAr ? 'رقم جواز السفر' : 'Passport No.'}</label>
                    <input
                      type="text"
                      value={p.passportNumber ?? ''}
                      onChange={e => updatePassenger(idx, 'passportNumber', e.target.value)}
                      placeholder="A12345678"
                      className={`${inputCls} font-mono`}
                      dir="ltr"
                    />
                  </div>
                  <div>
                    <label className={labelCls}>{isAr ? 'تاريخ انتهاء الجواز' : 'Passport Expiry'}</label>
                    <input
                      type="date"
                      value={p.passportExpiry ?? ''}
                      onChange={e => updatePassenger(idx, 'passportExpiry', e.target.value)}
                      className={inputCls}
                      dir="ltr"
                    />
                  </div>
                </div>
              </div>
            ))}

            {/* Add passenger button */}
            {passengers.length < 9 && (
              <button
                type="button"
                onClick={addPassenger}
                className="w-full flex items-center justify-center gap-2 border border-dashed border-slate-300 hover:border-indigo-400 hover:text-indigo-600 text-slate-400 text-sm py-2.5 rounded-xl transition-colors"
              >
                <Plus size={14} />
                {isAr ? 'إضافة راكب' : 'Add Passenger'}
              </button>
            )}

            {/* Contact */}
            <div className="space-y-3 pt-2 border-t border-slate-100">
              <p className="text-xs font-bold text-slate-600 uppercase tracking-wide">
                {isAr ? 'بيانات التواصل' : 'Contact Details'}
              </p>
              <div>
                <label className={labelCls}>{isAr ? 'البريد الإلكتروني' : 'Email'} *</label>
                <input
                  type="email"
                  value={contactEmail}
                  onChange={e => setContactEmail(e.target.value)}
                  placeholder="booking@agency.com"
                  className={inputCls}
                  dir="ltr"
                />
              </div>
              <div>
                <label className={labelCls}>{isAr ? 'رقم الجوال' : 'Phone'}</label>
                <input
                  type="tel"
                  value={contactPhone}
                  onChange={e => setContactPhone(e.target.value)}
                  placeholder="+966 50 000 0000"
                  className={inputCls}
                  dir="ltr"
                />
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                <AlertCircle size={15} className="mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="sticky bottom-0 bg-white border-t border-slate-200 px-5 py-4 flex gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold rounded-xl py-2.5 text-sm transition-colors disabled:opacity-50"
            >
              {isAr ? 'إلغاء' : 'Cancel'}
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold rounded-xl py-2.5 text-sm transition-colors"
            >
              {loading
                ? <><Loader2 size={14} className="animate-spin" />{isAr ? 'جاري الإنشاء...' : 'Creating...'}</>
                : <><CheckCircle2 size={14} />{isAr ? 'إنشاء PNR' : 'Create PNR'}</>
              }
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
