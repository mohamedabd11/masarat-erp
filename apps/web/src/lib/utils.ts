import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** تنسيق المبلغ بالريال السعودي — يستخدم أرقام لاتينية دائماً */
export function formatCurrency(halalas: number, locale: string = 'ar-SA'): string {
  const riyals = halalas / 100;
  const numberLocale = locale.startsWith('ar') ? 'ar-SA-u-nu-latn' : 'en-US';
  return new Intl.NumberFormat(numberLocale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: true,
  }).format(riyals);
}

/** تنسيق التاريخ — يستخدم أرقام لاتينية دائماً */
export function formatDate(date: Date | { toDate(): Date } | string | null | undefined, locale: string = 'ar-SA'): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : 'toDate' in date ? date.toDate() : date;
  if (isNaN(d.getTime())) return '';
  const dateLocale = locale.startsWith('ar') ? 'ar-SA-u-nu-latn' : locale;
  return new Intl.DateTimeFormat(dateLocale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(d);
}

/** تنسيق التاريخ والوقت — يستخدم أرقام لاتينية دائماً */
export function formatDateTime(date: Date | { toDate(): Date } | string | null | undefined, locale: string = 'ar-SA'): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : 'toDate' in date ? date.toDate() : date;
  if (isNaN(d.getTime())) return '';
  const dateLocale = locale.startsWith('ar') ? 'ar-SA-u-nu-latn' : locale;
  return new Intl.DateTimeFormat(dateLocale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

/** Format integer count with Latin numerals */
export function formatCount(n: number, locale: string = 'ar-SA'): string {
  const numLocale = locale.startsWith('ar') ? 'ar-SA-u-nu-latn' : 'en-US';
  return new Intl.NumberFormat(numLocale).format(n);
}

/** تحويل كود الحالة لاسم عرض */
export function getStatusLabel(status: string, locale: string): string {
  const labels: Record<string, { ar: string; en: string }> = {
    draft:            { ar: 'مسودة',           en: 'Draft' },
    pending_approval: { ar: 'بانتظار الموافقة', en: 'Pending Approval' },
    confirmed:        { ar: 'مؤكد',            en: 'Confirmed' },
    in_progress:      { ar: 'قيد التنفيذ',     en: 'In Progress' },
    completed:        { ar: 'مكتمل',           en: 'Completed' },
    cancelled:        { ar: 'ملغى',            en: 'Cancelled' },
    refunded:         { ar: 'مسترجع',          en: 'Refunded' },
    paid:             { ar: 'مدفوع',           en: 'Paid' },
    pending:          { ar: 'معلق',            en: 'Pending' },
    overdue:          { ar: 'متأخر',           en: 'Overdue' },
  };
  const entry = labels[status];
  if (!entry) return status;
  return locale === 'ar' ? entry.ar : entry.en;
}

/** يُنسق رقم الهاتف السعودي */
export function formatPhone(phone: string): string {
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.startsWith('966')) {
    return `+966 ${cleaned.slice(3, 5)} ${cleaned.slice(5, 9)} ${cleaned.slice(9)}`;
  }
  if (cleaned.startsWith('0') && cleaned.length === 10) {
    return `0${cleaned.slice(1, 3)} ${cleaned.slice(3, 7)} ${cleaned.slice(7)}`;
  }
  return phone;
}
