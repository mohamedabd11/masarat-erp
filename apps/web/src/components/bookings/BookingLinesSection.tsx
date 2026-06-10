'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import { apiFetch } from '@/lib/api-client';
import { formatCurrency } from '@/lib/utils';
import { Layers, AlertTriangle, CheckCircle2, Clock, Ticket, XCircle, Plane } from 'lucide-react';

interface BookingLine {
  id: string;
  serviceType: string;
  description: string;
  quantity: number;
  totalCostHalalas: number;
  totalPriceExclVatHalalas: number;
  vatHalalas: number;
  vatCategory: string;
  revenueModel: string;
  operationalStatus: string;
  status: string;
  isLegacy: boolean;
  pnrReference: string | null;
  voucherNumber: string | null;
  notes: string | null;
}

interface Props {
  bookingId: string;
  locale: string;
  isCancelled: boolean;
  hasInvoice: boolean;
}

const SERVICE_TYPE_LABELS: Record<string, { ar: string; en: string }> = {
  flight:       { ar: 'طيران',         en: 'Flight' },
  hotel:        { ar: 'فندق',          en: 'Hotel' },
  package:      { ar: 'باقة',          en: 'Package' },
  umrah:        { ar: 'عمرة',          en: 'Umrah' },
  hajj:         { ar: 'حج',            en: 'Hajj' },
  insurance:    { ar: 'تأمين',         en: 'Insurance' },
  visa:         { ar: 'تأشيرة',        en: 'Visa' },
  transport:    { ar: 'نقل',           en: 'Transport' },
  custom:       { ar: 'أخرى',          en: 'Other' },
};

const OP_STATUS_CONFIG: Record<string, { ar: string; en: string; className: string; Icon: typeof Clock }> = {
  pending:    { ar: 'قيد الانتظار', en: 'Pending',   className: 'bg-slate-100 text-slate-600', Icon: Clock },
  confirmed:  { ar: 'مؤكد',        en: 'Confirmed',  className: 'bg-brand-50 text-brand-700',  Icon: CheckCircle2 },
  ticketed:   { ar: 'تم التذكير',  en: 'Ticketed',   className: 'bg-violet-50 text-violet-700', Icon: Ticket },
  issued:     { ar: 'صدر',         en: 'Issued',      className: 'bg-emerald-50 text-emerald-700', Icon: CheckCircle2 },
  cancelled:  { ar: 'ملغى',        en: 'Cancelled',   className: 'bg-red-50 text-red-600',     Icon: XCircle },
};

function OpStatusBadge({ status, isAr }: { status: string; isAr: boolean }) {
  const cfg = OP_STATUS_CONFIG[status] ?? OP_STATUS_CONFIG['pending']!;
  const { Icon } = cfg;
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${cfg.className}`}>
      <Icon size={11} strokeWidth={2} />
      {isAr ? cfg.ar : cfg.en}
    </span>
  );
}

export function BookingLinesSection({ bookingId, locale, isCancelled, hasInvoice }: Props) {
  const isAr = locale === 'ar';

  const [lines, setLines]         = useState<BookingLine[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [cancelError, setCancelError]   = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const data = await apiFetch<{ lines: BookingLine[] }>(`/api/bookings/${bookingId}/lines`);
      setLines(data.lines);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [bookingId]);

  useEffect(() => { void load(); }, [load]);

  async function handleCancelLine(lineId: string) {
    if (!confirm(isAr ? 'هل أنت متأكد من إلغاء هذا السطر؟' : 'Cancel this line?')) return;
    setCancellingId(lineId);
    setCancelError(null);
    try {
      await apiFetch(`/api/bookings/${bookingId}/lines/${lineId}`, {
        method: 'PATCH',
        body: JSON.stringify({ action: 'cancel' }),
      });
      await load();
    } catch (e) {
      setCancelError(e instanceof Error ? e.message : String(e));
    } finally {
      setCancellingId(null);
    }
  }

  const nonLegacyLines = lines.filter((l) => !l.isLegacy);

  if (nonLegacyLines.length === 0 && !loading) return null;

  const totalPriceInclVat = nonLegacyLines
    .filter((l) => l.status === 'active')
    .reduce((s, l) => s + l.totalPriceExclVatHalalas + l.vatHalalas, 0);

  const fmt = isAr ? 'ar-SA' : 'en-SA';
  const canCancelLine = !isCancelled && !hasInvoice;

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers size={16} className="text-brand-600" />
              {isAr
                ? `بنود الخدمة${nonLegacyLines.length > 0 ? ` (${nonLegacyLines.length})` : ''}`
                : `Service Lines${nonLegacyLines.length > 0 ? ` (${nonLegacyLines.length})` : ''}`}
            </div>
            {nonLegacyLines.filter((l) => l.status === 'active').length > 0 && (
              <span className="text-sm font-mono font-black text-slate-800 tabular-nums">
                {formatCurrency(totalPriceInclVat, fmt)}
              </span>
            )}
          </div>
        </CardTitle>
      </CardHeader>

      {loading ? (
        <div className="flex justify-center py-6">
          <Spinner size="sm" />
        </div>
      ) : error ? (
        <p className="text-sm text-red-600 py-4 text-center">{error}</p>
      ) : (
        <div className="space-y-2">
          {cancelError && (
            <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2 border border-red-100">
              <AlertTriangle size={14} />
              {cancelError}
            </div>
          )}

          {nonLegacyLines.map((line) => {
            const stLabel = SERVICE_TYPE_LABELS[line.serviceType] ?? { ar: line.serviceType, en: line.serviceType };
            const totalIncl = line.totalPriceExclVatHalalas + line.vatHalalas;
            const isCancelled_ = line.status === 'cancelled';
            const isRefunded_  = line.status === 'refunded';
            const isCancellingThis = cancellingId === line.id;

            return (
              <div
                key={line.id}
                className={`rounded-lg border p-3 transition-colors ${
                  isCancelled_ || isRefunded_
                    ? 'bg-slate-50 border-slate-100 opacity-60'
                    : 'bg-white border-slate-200'
                }`}
              >
                <div className="flex items-start gap-3">
                  {/* Icon */}
                  <div className="mt-0.5 flex-shrink-0">
                    <Plane size={14} className="text-brand-500" />
                  </div>

                  {/* Details */}
                  <div className="flex-1 min-w-0 space-y-1.5">
                    {/* Top row */}
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-medium text-brand-700 bg-brand-50 px-2 py-0.5 rounded-full">
                          {isAr ? stLabel.ar : stLabel.en}
                        </span>
                        <OpStatusBadge status={line.operationalStatus} isAr={isAr} />
                        {(isCancelled_ || isRefunded_) && (
                          <span className="text-xs text-red-600 font-medium">
                            {isCancelled_ ? (isAr ? '(ملغى)' : '(Cancelled)') : (isAr ? '(مُسترد)' : '(Refunded)')}
                          </span>
                        )}
                      </div>
                      <span className="text-sm font-mono font-semibold text-slate-900 tabular-nums flex-shrink-0">
                        {formatCurrency(totalIncl, fmt)}
                      </span>
                    </div>

                    {/* Description */}
                    <p className="text-sm text-slate-700">{line.description}</p>

                    {/* Sub-details */}
                    <div className="flex items-center gap-3 text-xs text-slate-400 flex-wrap">
                      {line.vatHalalas > 0 && (
                        <span>
                          {isAr ? 'ضريبة:' : 'VAT:'} {formatCurrency(line.vatHalalas, fmt)}
                        </span>
                      )}
                      {line.totalCostHalalas > 0 && (
                        <span>
                          {isAr ? 'التكلفة:' : 'Cost:'} {formatCurrency(line.totalCostHalalas, fmt)}
                        </span>
                      )}
                      {line.pnrReference && (
                        <span className="font-mono">PNR: {line.pnrReference}</span>
                      )}
                      {line.voucherNumber && (
                        <span className="font-mono">#{line.voucherNumber}</span>
                      )}
                    </div>
                  </div>

                  {/* Cancel button */}
                  {canCancelLine && line.status === 'active' && (
                    <button
                      onClick={() => void handleCancelLine(line.id)}
                      disabled={isCancellingThis}
                      className="flex-shrink-0 text-xs text-red-500 hover:text-red-700 hover:bg-red-50 px-2 py-1 rounded transition-colors disabled:opacity-50"
                    >
                      {isCancellingThis
                        ? <Spinner size="sm" />
                        : (isAr ? 'إلغاء' : 'Cancel')}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
