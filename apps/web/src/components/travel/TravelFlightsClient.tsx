'use client';

import { useState } from 'react';
import { useLocale } from 'next-intl';
import { CheckCircle2, Hash, Globe, Clock, Users, ArrowRight } from 'lucide-react';
import { FlightSearchForm } from './FlightSearchForm';
import { FlightResults } from './FlightResults';
import { PnrModal } from './PnrModal';
import type { FlightOffer, CreatedPnr } from './types';

interface SearchState {
  offers:         FlightOffer[];
  credentialId:   string;
  passengerCount: number;
}

function formatSAR(halalas: number, currency: string): string {
  return `${(halalas / 100).toLocaleString('en-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

function PnrSuccessCard({ pnr, onReset }: { pnr: CreatedPnr; onReset: () => void }) {
  const locale  = useLocale();
  const isAr    = locale === 'ar';

  return (
    <div className="bg-white rounded-2xl border border-emerald-200 shadow-sm overflow-hidden">
      {/* Green banner */}
      <div className="bg-emerald-500 px-5 py-4 flex items-center gap-3">
        <CheckCircle2 size={22} className="text-white shrink-0" />
        <div>
          <p className="text-white font-bold text-base">
            {isAr ? 'تم إنشاء الحجز بنجاح' : 'PNR Created Successfully'}
          </p>
          <p className="text-emerald-100 text-xs mt-0.5">
            {isAr ? 'يمكنك الآن استرجاع الحجز في أي وقت' : 'You can retrieve this booking at any time'}
          </p>
        </div>
      </div>

      {/* Details */}
      <div className="p-5 space-y-4">
        {/* PNR code */}
        <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
          <Hash size={18} className="text-indigo-500 shrink-0" />
          <div>
            <p className="text-xs text-slate-500 font-medium">{isAr ? 'رمز الحجز' : 'PNR Code'}</p>
            <p className="text-2xl font-extrabold text-slate-900 font-mono tracking-widest">{pnr.pnrCode}</p>
          </div>
        </div>

        {/* Meta row */}
        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="p-2.5 rounded-xl bg-slate-50">
            <Globe size={14} className="text-slate-400 mx-auto mb-1" />
            <p className="text-xs text-slate-500">{isAr ? 'المزود' : 'GDS'}</p>
            <p className="text-sm font-bold text-slate-800 uppercase">{pnr.gds}</p>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-50">
            <Users size={14} className="text-slate-400 mx-auto mb-1" />
            <p className="text-xs text-slate-500">{isAr ? 'الإجمالي' : 'Total'}</p>
            <p className="text-sm font-bold text-indigo-600">{formatSAR(pnr.totalHalalas, pnr.currency)}</p>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-50">
            <Clock size={14} className="text-slate-400 mx-auto mb-1" />
            <p className="text-xs text-slate-500">{isAr ? 'الحالة' : 'Status'}</p>
            <p className="text-sm font-bold text-emerald-600 uppercase">{pnr.status}</p>
          </div>
        </div>

        {/* Segments */}
        {pnr.segments.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
              {isAr ? 'التفاصيل' : 'Segments'}
            </p>
            {pnr.segments.map((seg, i) => (
              <div key={i} className="flex items-center gap-3 text-sm px-3 py-2.5 rounded-xl border border-slate-100 bg-slate-50">
                <span className="font-mono font-bold text-slate-800">{seg.origin}</span>
                <ArrowRight size={13} className="text-slate-400 shrink-0" />
                <span className="font-mono font-bold text-slate-800">{seg.destination}</span>
                <span className="text-slate-400 mx-1">·</span>
                <span className="font-mono text-xs text-slate-500">{seg.airline}{seg.flightNumber}</span>
                <span className="text-slate-400 mx-1">·</span>
                <span className="text-xs text-slate-500">{seg.departureDate} {seg.departureTime}</span>
              </div>
            ))}
          </div>
        )}

        {pnr.expiresAt && (
          <p className="text-xs text-amber-600 bg-amber-50 px-3 py-2 rounded-lg border border-amber-200">
            {isAr
              ? `ينتهي الحجز في: ${new Date(pnr.expiresAt).toLocaleString('ar-SA')}`
              : `Expires: ${new Date(pnr.expiresAt).toLocaleString('en-SA')}`
            }
          </p>
        )}

        <button
          onClick={onReset}
          className="w-full border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold rounded-xl py-2.5 text-sm transition-colors"
        >
          {isAr ? 'بحث جديد' : 'New Search'}
        </button>
      </div>
    </div>
  );
}

export function TravelFlightsClient() {
  const [search, setSearch]             = useState<SearchState | null>(null);
  const [selectedOffer, setSelectedOffer] = useState<FlightOffer | null>(null);
  const [pnrResult, setPnrResult]       = useState<CreatedPnr | null>(null);

  function handleResult(r: SearchState) {
    setSearch(r);
    setPnrResult(null);
  }

  function handleClear() {
    setSearch(null);
    setSelectedOffer(null);
    setPnrResult(null);
  }

  function handleCreated(pnr: CreatedPnr) {
    setSelectedOffer(null);
    setSearch(null);
    setPnrResult(pnr);
  }

  function handleReset() {
    setPnrResult(null);
    setSearch(null);
  }

  return (
    <div className="space-y-5">
      {!pnrResult && (
        <FlightSearchForm onResult={handleResult} onClear={handleClear} />
      )}

      {pnrResult && (
        <PnrSuccessCard pnr={pnrResult} onReset={handleReset} />
      )}

      {search && !pnrResult && (
        <FlightResults
          offers={search.offers}
          onBook={offer => setSelectedOffer(offer)}
        />
      )}

      {selectedOffer && search && (
        <PnrModal
          offer={selectedOffer}
          credentialId={search.credentialId}
          passengerCount={search.passengerCount}
          onClose={() => setSelectedOffer(null)}
          onCreated={handleCreated}
        />
      )}
    </div>
  );
}
