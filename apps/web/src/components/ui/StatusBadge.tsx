import { Badge } from './Badge';

type BookingStatus = 'draft' | 'pending_approval' | 'confirmed' | 'ticketed' | 'in_progress' | 'completed' | 'cancelled' | 'refunded';
type InvoiceStatus = 'draft' | 'pending' | 'paid' | 'overdue' | 'cancelled' | 'refunded';
type PaymentStatus = 'unpaid' | 'partial' | 'fully_paid' | 'refunded';

const bookingVariants: Record<BookingStatus, 'neutral' | 'warning' | 'success' | 'info' | 'default' | 'danger'> = {
  draft:            'neutral',
  pending_approval: 'warning',
  confirmed:        'success',
  ticketed:         'info',
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

const paymentVariants: Record<PaymentStatus, 'neutral' | 'warning' | 'success' | 'info' | 'default' | 'danger'> = {
  unpaid:     'danger',
  partial:    'warning',
  fully_paid: 'success',
  refunded:   'info',
};

const bookingLabels: Record<BookingStatus, { ar: string; en: string }> = {
  draft:            { ar: 'مسودة',           en: 'Draft' },
  pending_approval: { ar: 'بانتظار الموافقة', en: 'Pending Approval' },
  confirmed:        { ar: 'مؤكد',            en: 'Confirmed' },
  ticketed:         { ar: 'صدرت التذاكر',    en: 'Ticketed' },
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

const paymentLabels: Record<PaymentStatus, { ar: string; en: string }> = {
  unpaid:     { ar: 'غير مدفوع',    en: 'Unpaid' },
  partial:    { ar: 'مدفوع جزئياً', en: 'Partial' },
  fully_paid: { ar: 'مدفوع بالكامل', en: 'Paid' },
  refunded:   { ar: 'مسترجع',       en: 'Refunded' },
};

interface BookingStatusBadgeProps {
  status: BookingStatus | string;
  locale?: string;
}

export function BookingStatusBadge({ status, locale = 'ar' }: BookingStatusBadgeProps) {
  const variant = bookingVariants[status as BookingStatus] ?? 'neutral';
  const label = bookingLabels[status as BookingStatus];
  return (
    <Badge variant={variant}>
      {label ? (locale === 'ar' ? label.ar : label.en) : status}
    </Badge>
  );
}

interface InvoiceStatusBadgeProps {
  status: InvoiceStatus | PaymentStatus | string;
  locale?: string;
}

export function InvoiceStatusBadge({ status, locale = 'ar' }: InvoiceStatusBadgeProps) {
  // Support both invoice status and payment status values
  const paymentVariant = paymentVariants[status as PaymentStatus];
  const paymentLabel = paymentLabels[status as PaymentStatus];
  if (paymentVariant) {
    return (
      <Badge variant={paymentVariant}>
        {locale === 'ar' ? paymentLabel.ar : paymentLabel.en}
      </Badge>
    );
  }
  const variant = invoiceVariants[status as InvoiceStatus] ?? 'neutral';
  const label = invoiceLabels[status as InvoiceStatus];
  return (
    <Badge variant={variant}>
      {label ? (locale === 'ar' ? label.ar : label.en) : status}
    </Badge>
  );
}
