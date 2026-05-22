import { Badge } from './Badge';

type BookingStatus = 'draft' | 'pending_approval' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled' | 'refunded';
type InvoiceStatus = 'draft' | 'pending' | 'paid' | 'overdue' | 'cancelled' | 'refunded';

const bookingVariants: Record<BookingStatus, 'neutral' | 'warning' | 'success' | 'info' | 'default' | 'danger'> = {
  draft:            'neutral',
  pending_approval: 'warning',
  confirmed:        'success',
  in_progress:      'info',
  completed:        'default',
  cancelled:        'danger',
  refunded:         'neutral',
};

const invoiceVariants: Record<InvoiceStatus, 'neutral' | 'warning' | 'success' | 'info' | 'default' | 'danger'> = {
  draft:     'neutral',
  pending:   'warning',
  paid:      'success',
  overdue:   'danger',
  cancelled: 'neutral',
  refunded:  'info',
};

const bookingLabels: Record<BookingStatus, { ar: string; en: string }> = {
  draft:            { ar: 'مسودة',           en: 'Draft' },
  pending_approval: { ar: 'بانتظار الموافقة', en: 'Pending Approval' },
  confirmed:        { ar: 'مؤكد',            en: 'Confirmed' },
  in_progress:      { ar: 'قيد التنفيذ',     en: 'In Progress' },
  completed:        { ar: 'مكتمل',           en: 'Completed' },
  cancelled:        { ar: 'ملغى',            en: 'Cancelled' },
  refunded:         { ar: 'مسترجع',          en: 'Refunded' },
};

const invoiceLabels: Record<InvoiceStatus, { ar: string; en: string }> = {
  draft:     { ar: 'مسودة',   en: 'Draft' },
  pending:   { ar: 'معلق',    en: 'Pending' },
  paid:      { ar: 'مدفوع',   en: 'Paid' },
  overdue:   { ar: 'متأخر',   en: 'Overdue' },
  cancelled: { ar: 'ملغى',    en: 'Cancelled' },
  refunded:  { ar: 'مسترجع', en: 'Refunded' },
};

interface BookingStatusBadgeProps {
  status: BookingStatus;
  locale?: string;
}

export function BookingStatusBadge({ status, locale = 'ar' }: BookingStatusBadgeProps) {
  const variant = bookingVariants[status] ?? 'neutral';
  const label = bookingLabels[status];
  return (
    <Badge variant={variant}>
      {label ? (locale === 'ar' ? label.ar : label.en) : status}
    </Badge>
  );
}

interface InvoiceStatusBadgeProps {
  status: InvoiceStatus;
  locale?: string;
}

export function InvoiceStatusBadge({ status, locale = 'ar' }: InvoiceStatusBadgeProps) {
  const variant = invoiceVariants[status] ?? 'neutral';
  const label = invoiceLabels[status];
  return (
    <Badge variant={variant}>
      {label ? (locale === 'ar' ? label.ar : label.en) : status}
    </Badge>
  );
}
