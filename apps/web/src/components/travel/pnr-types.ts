import type { PnrSegmentJson, PnrPassengerJson } from '@/lib/schema/pnr';

// PNR record as returned from the API — timestamp fields are ISO strings in JSON
export interface PnrRow {
  id:             string;
  agencyId:       string;
  pnrCode:        string;
  gds:            string | null;
  airline:        string | null;
  origin:         string | null;
  destination:    string | null;
  departureDate:  string | null;
  returnDate:     string | null;
  segments:       PnrSegmentJson[] | null;
  passengers:     PnrPassengerJson[] | null;
  flightNumbers:  unknown;
  passengerNames: unknown;
  ticketNumbers:  unknown;
  passengerCount: number;
  fareHalalas:    number;
  taxHalalas:     number;
  totalHalalas:   number;
  bookingId:      string | null;
  customerId:     string | null;
  status:         string;
  expiresAt:      string | null;
  syncedAt:       string | null;
  syncStatus:     string | null;
  syncError:      string | null;
  deletedAt:      string | null;
  cancelledAt:    string | null;
  cancelledBy:    string | null;
  notes:          string | null;
  createdBy:      string | null;
  createdAt:      string;
  updatedAt:      string;
}

export type ComputedStatus =
  | 'active'
  | 'ticketed'
  | 'cancelled'
  | 'expired'
  | 'voided'
  | 'refunded'
  | 'sync_failed'
  | 'pending_sync';

// Derives the user-facing status from stored fields.
// Priority: definitive DB status → sync failure → client-side expiry check → active
// Note: status='expired' is set authoritatively by the expire-pnrs cron job.
// The expiresAt fallback covers the window before the job next runs.
export function computeStatus(pnr: PnrRow): ComputedStatus {
  if (pnr.status === 'cancelled') return 'cancelled';
  if (pnr.status === 'ticketed')  return 'ticketed';
  if (pnr.status === 'voided')    return 'voided';
  if (pnr.status === 'refunded')  return 'refunded';
  if (pnr.status === 'expired')   return 'expired';
  if (pnr.syncStatus === 'failed')  return 'sync_failed';
  if (pnr.syncStatus === 'pending') return 'pending_sync';
  if (pnr.expiresAt && new Date(pnr.expiresAt) < new Date()) return 'expired';
  return 'active';
}

export const STATUS_CONFIG: Record<ComputedStatus, {
  labelAr:   string;
  labelEn:   string;
  className: string;
  dotColor:  string;
}> = {
  active:       { labelAr: 'نشط',               labelEn: 'Active',       className: 'bg-blue-50 text-blue-700 border-blue-200',          dotColor: 'bg-blue-500' },
  ticketed:     { labelAr: 'مصدَّر',             labelEn: 'Ticketed',     className: 'bg-emerald-50 text-emerald-700 border-emerald-200',  dotColor: 'bg-emerald-500' },
  cancelled:    { labelAr: 'ملغى',               labelEn: 'Cancelled',    className: 'bg-red-50 text-red-700 border-red-200',             dotColor: 'bg-red-500' },
  expired:      { labelAr: 'منتهي الصلاحية',    labelEn: 'Expired',      className: 'bg-orange-50 text-orange-700 border-orange-200',    dotColor: 'bg-orange-500' },
  voided:       { labelAr: 'ملغى (void)',        labelEn: 'Voided',       className: 'bg-slate-50 text-slate-600 border-slate-200',       dotColor: 'bg-slate-400' },
  refunded:     { labelAr: 'مسترد',              labelEn: 'Refunded',     className: 'bg-purple-50 text-purple-700 border-purple-200',    dotColor: 'bg-purple-500' },
  sync_failed:  { labelAr: 'فشل المزامنة',      labelEn: 'Sync Failed',  className: 'bg-rose-50 text-rose-700 border-rose-200',          dotColor: 'bg-rose-500' },
  pending_sync: { labelAr: 'مزامنة معلقة',      labelEn: 'Pending Sync', className: 'bg-yellow-50 text-yellow-700 border-yellow-200',    dotColor: 'bg-yellow-500' },
};

export function formatDate(iso: string | null, isAr: boolean): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString(isAr ? 'ar-SA' : 'en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
    });
  } catch { return '—'; }
}

export function formatDateTime(iso: string | null, isAr: boolean): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString(isAr ? 'ar-SA' : 'en-GB', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return '—'; }
}

export function formatHalalas(halalas: number): string {
  return (halalas / 100).toLocaleString('en', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function segmentCount(pnr: PnrRow): number {
  return Array.isArray(pnr.segments) ? pnr.segments.length : 0;
}

export function routeLabel(pnr: PnrRow): string {
  if (pnr.origin && pnr.destination) return `${pnr.origin} → ${pnr.destination}`;
  const segs = pnr.segments;
  if (segs && segs.length > 0) {
    const first = segs[0];
    const last  = segs[segs.length - 1];
    return `${first.from} → ${last.to}`;
  }
  return '—';
}
