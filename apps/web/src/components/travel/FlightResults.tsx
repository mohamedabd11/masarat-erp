'use client';

import { useLocale } from 'next-intl';
import { Plane, Clock, Users, Tag, ChevronRight, Inbox } from 'lucide-react';
import type { FlightOffer } from './types';

interface Props {
  offers: FlightOffer[];
  onBook: (offer: FlightOffer) => void;
}

const AIRLINE_NAMES: Record<string, string> = {
  SV: 'Saudia', EK: 'Emirates', QR: 'Qatar Airways', EY: 'Etihad Airways',
  FZ: 'Flydubai', G9: 'Air Arabia', WY: 'Oman Air',  MS: 'EgyptAir',
  TK: 'Turkish Airlines', LH: 'Lufthansa', BA: 'British Airways',
  KU: 'Kuwait Airways',  GF: 'Gulf Air',
};

const CABIN_LABELS: Record<string, { ar: string; en: string; color: string }> = {
  economy:         { ar: 'اقتصادي',      en: 'Economy',          color: 'bg-slate-100 text-slate-600' },
  premium_economy: { ar: 'اقتصادي مميز', en: 'Prem. Economy',    color: 'bg-sky-100 text-sky-700' },
  business:        { ar: 'أعمال',         en: 'Business',         color: 'bg-indigo-100 text-indigo-700' },
  first:           { ar: 'درجة أولى',    en: 'First',            color: 'bg-amber-100 text-amber-700' },
};

function formatTime(isoAt: string): string {
  return isoAt.split('T')[1]?.substring(0, 5) ?? '--:--';
}

function formatDate(isoAt: string): string {
  return isoAt.split('T')[0] ?? '';
}

function formatDuration(minutes: number, isAr: boolean): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (isAr) return h > 0 ? `${h}س ${m > 0 ? `${m}د` : ''}` : `${m}د`;
  return h > 0 ? `${h}h${m > 0 ? ` ${m}m` : ''}` : `${m}m`;
}

function formatSAR(halalas: number): string {
  return (halalas / 100).toLocaleString('en-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function FlightResults({ offers, onBook }: Props) {
  const locale = useLocale();
  const isAr   = locale === 'ar';

  if (offers.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-10 flex flex-col items-center gap-3 text-slate-400">
        <Inbox size={36} />
        <p className="text-sm font-medium">
          {isAr ? 'لا توجد رحلات لهذا المسار والتاريخ' : 'No flights found for this route and date'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500 font-medium px-1">
        {isAr ? `${offers.length} رحلة متاحة` : `${offers.length} flight${offers.length !== 1 ? 's' : ''} found`}
      </p>

      {offers.map(offer => {
        const cabin      = CABIN_LABELS[offer.cabin] ?? CABIN_LABELS.economy!;
        const airlineName = AIRLINE_NAMES[offer.airline] ?? offer.airline;

        return (
          <div
            key={offer.id}
            className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md hover:border-indigo-200 transition-all"
          >
            <div className="p-4">
              {/* Header row: airline + price */}
              <div className="flex items-start justify-between gap-4 mb-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center text-sm font-bold text-slate-700">
                    {offer.airline}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-900">{airlineName}</p>
                    <p className="text-xs text-slate-400 font-mono">{offer.flightNumber}</p>
                  </div>
                </div>
                <div className="text-end">
                  <p className="text-xl font-extrabold text-indigo-600">
                    {formatSAR(offer.totalHalalas)}
                    <span className="text-xs font-semibold text-slate-400 ms-1">{offer.currency}</span>
                  </p>
                  <p className="text-xs text-slate-400">
                    {isAr
                      ? `ضريبة: ${formatSAR(offer.taxHalalas)} ر.س`
                      : `Tax: ${formatSAR(offer.taxHalalas)} SAR`
                    }
                  </p>
                </div>
              </div>

              {/* Route row */}
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="text-center">
                  <p className="text-2xl font-bold text-slate-900 font-mono tracking-wide">{offer.origin}</p>
                  <p className="text-sm font-semibold text-slate-600">{formatTime(offer.departureAt)}</p>
                  <p className="text-xs text-slate-400">{formatDate(offer.departureAt)}</p>
                </div>

                <div className="flex-1 flex flex-col items-center gap-1">
                  <div className="flex items-center gap-1 text-xs text-slate-400">
                    <Clock size={11} />
                    {formatDuration(offer.durationMinutes, isAr)}
                  </div>
                  <div className="w-full flex items-center gap-1">
                    <div className="flex-1 h-px bg-slate-200" />
                    <Plane size={14} className="text-slate-400" />
                    <div className="flex-1 h-px bg-slate-200" />
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cabin.color}`}>
                    {isAr ? cabin.ar : cabin.en}
                  </span>
                </div>

                <div className="text-center">
                  <p className="text-2xl font-bold text-slate-900 font-mono tracking-wide">{offer.destination}</p>
                  <p className="text-sm font-semibold text-slate-600">{formatTime(offer.arrivalAt)}</p>
                  <p className="text-xs text-slate-400">{formatDate(offer.arrivalAt)}</p>
                </div>
              </div>

              {/* Footer row: badges + book button */}
              <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 text-xs bg-slate-50 text-slate-500 border border-slate-200 px-2 py-0.5 rounded-lg font-mono">
                    <Tag size={10} />{offer.fareClass} · {offer.fareBasis}
                  </span>
                  {offer.seatsAvailable !== null && offer.seatsAvailable <= 5 && (
                    <span className="text-xs text-amber-600 font-semibold">
                      {isAr ? `${offer.seatsAvailable} مقاعد فقط` : `${offer.seatsAvailable} seats left`}
                    </span>
                  )}
                  {offer.seatsAvailable !== null && offer.seatsAvailable > 5 && (
                    <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
                      <Users size={10} />{offer.seatsAvailable}
                    </span>
                  )}
                </div>

                <button
                  onClick={() => onBook(offer)}
                  className="inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-4 py-2 rounded-xl transition-colors"
                >
                  {isAr ? 'احجز الآن' : 'Book'}
                  <ChevronRight size={13} className={isAr ? 'rotate-180' : ''} />
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
