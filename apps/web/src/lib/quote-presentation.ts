export type QuoteStatus = 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired' | 'converted';

export interface QuoteItem {
  serviceType: string;
  customLabel?: string;
  description: string;
  quantity: number;
  unitPriceSAR: number;
  costHalalas?: number;
}

export interface PresentedQuote {
  id: string;
  agencyId: string;
  quoteNumber: string;
  customerNameAr: string;
  customerNameEn: string;
  customerPhone: string;
  customerEmail: string;
  issueDate: number;
  expiryDate: number;
  status: QuoteStatus;
  items: QuoteItem[];
  subtotalHalalas: number;
  vatHalalas: number;
  grandTotalHalalas: number;
  notes: string;
  terms: string;
  convertedToBookingId?: string;
  createdAt: string;
}

export interface PreparedQuote {
  quoteNumber: string;
  customerId: string | null;
  customerName: string;
  customerNameEn: string | null;
  customerPhone: string | null;
  customerEmail: string | null;
  items: QuoteItem[];
  subtotalHalalas: number;
  vatHalalas: number;
  totalHalalas: number;
  status: Exclude<QuoteStatus, 'converted'>;
  issueDate: string;
  validUntil: string;
  notes: string | null;
  terms: string | null;
}

export class QuotePayloadError extends Error {}

const CREATE_STATUSES = new Set<PreparedQuote['status']>(['draft', 'sent', 'accepted', 'rejected', 'expired']);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new QuotePayloadError('بيانات عرض السعر غير صالحة');
  }
  return value as Record<string, unknown>;
}

function optionalText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function nonNegativeInteger(value: unknown, field: string, fallback?: number): number {
  const resolved = value ?? fallback;
  if (typeof resolved !== 'number' || !Number.isInteger(resolved) || resolved < 0) {
    throw new QuotePayloadError(`${field} غير صالح`);
  }
  return resolved;
}

function dateText(value: unknown, field: string, fallback: string): string {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'string' && DATE_RE.test(value)) return value;
  if (typeof value === 'number' && Number.isFinite(value)) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date.toISOString().slice(0, 10);
  }
  throw new QuotePayloadError(`${field} غير صالح`);
}

function parseItems(value: unknown): QuoteItem[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new QuotePayloadError('يجب إضافة خدمة واحدة على الأقل');
  }
  return value.map((raw, index) => {
    const item = record(raw);
    const serviceType = optionalText(item['serviceType']);
    const quantity = Number(item['quantity']);
    const unitPriceSAR = Number(item['unitPriceSAR']);
    if (!serviceType || !Number.isFinite(quantity) || quantity <= 0 ||
        !Number.isFinite(unitPriceSAR) || unitPriceSAR <= 0) {
      throw new QuotePayloadError(`الخدمة رقم ${index + 1} غير صالحة`);
    }
    const costHalalas = item['costHalalas'];
    return {
      serviceType,
      customLabel: optionalText(item['customLabel']) ?? undefined,
      description: optionalText(item['description']) ?? '',
      quantity,
      unitPriceSAR,
      ...(typeof costHalalas === 'number' && Number.isInteger(costHalalas) && costHalalas >= 0
        ? { costHalalas }
        : {}),
    };
  });
}

export function prepareQuote(input: unknown, now = new Date()): PreparedQuote {
  const body = record(input);
  const quoteNumber = optionalText(body['quoteNumber']);
  const customerName = optionalText(body['customerNameAr'] ?? body['customerName']);
  if (!quoteNumber) throw new QuotePayloadError('رقم عرض السعر مطلوب');
  if (!customerName) throw new QuotePayloadError('اسم العميل مطلوب');

  const items = parseItems(body['items']);
  const computedSubtotal = Math.round(items.reduce((sum, item) =>
    sum + item.quantity * item.unitPriceSAR * 100, 0));
  const subtotalHalalas = nonNegativeInteger(body['subtotalHalalas'], 'الإجمالي قبل الضريبة', computedSubtotal);
  if (subtotalHalalas !== computedSubtotal) {
    throw new QuotePayloadError('الإجمالي قبل الضريبة لا يطابق الخدمات المدخلة');
  }
  const vatHalalas = nonNegativeInteger(body['vatHalalas'], 'الضريبة', 0);
  const totalHalalas = nonNegativeInteger(
    body['grandTotalHalalas'] ?? body['totalHalalas'],
    'الإجمالي الكلي',
    subtotalHalalas + vatHalalas,
  );
  if (subtotalHalalas + vatHalalas !== totalHalalas) {
    throw new QuotePayloadError('الإجمالي الكلي لا يساوي الإجمالي قبل الضريبة مع الضريبة');
  }

  const rawStatus = optionalText(body['status']) ?? 'draft';
  if (!CREATE_STATUSES.has(rawStatus as PreparedQuote['status'])) {
    throw new QuotePayloadError('حالة عرض السعر غير صالحة');
  }
  const today = now.toISOString().slice(0, 10);
  return {
    quoteNumber,
    customerId: optionalText(body['customerId']),
    customerName,
    customerNameEn: optionalText(body['customerNameEn']),
    customerPhone: optionalText(body['customerPhone']),
    customerEmail: optionalText(body['customerEmail']),
    items,
    subtotalHalalas,
    vatHalalas,
    totalHalalas,
    status: rawStatus as PreparedQuote['status'],
    issueDate: dateText(body['issueDate'], 'تاريخ الإصدار', today),
    validUntil: dateText(body['expiryDate'] ?? body['validUntil'], 'تاريخ الصلاحية', today),
    notes: optionalText(body['notes']),
    terms: optionalText(body['terms']),
  };
}

export function validateQuoteTax(
  quote: Pick<PreparedQuote, 'subtotalHalalas' | 'vatHalalas' | 'totalHalalas'>,
  agency: { isVatRegistered: boolean; vatRate: number },
): void {
  const expectedVat = agency.isVatRegistered
    ? Math.round(quote.subtotalHalalas * agency.vatRate / 100)
    : 0;
  if (quote.vatHalalas !== expectedVat || quote.totalHalalas !== quote.subtotalHalalas + expectedVat) {
    throw new QuotePayloadError('ضريبة وإجمالي عرض السعر لا يطابقان إعدادات الوكالة');
  }
}

interface StoredQuote {
  id: string;
  agencyId: string;
  quoteNumber: string;
  customerName: string | null;
  customerNameEn: string | null;
  customerPhone: string | null;
  customerEmail: string | null;
  items: unknown;
  subtotalHalalas: number;
  vatHalalas: number;
  totalHalalas: number;
  status: string;
  issueDate: string | null;
  validUntil: string | null;
  notes: string | null;
  terms: string | null;
  convertedToBookingId: string | null;
  createdAt: Date;
}

function epoch(date: string | null, fallback: Date): number {
  const parsed = date && DATE_RE.test(date) ? new Date(`${date}T00:00:00.000Z`) : fallback;
  return Number.isNaN(parsed.getTime()) ? fallback.getTime() : parsed.getTime();
}

export function presentQuote(row: StoredQuote): PresentedQuote {
  const status = row.status === 'approved' ? 'accepted' : row.status;
  const safeStatus: QuoteStatus = ['draft', 'sent', 'accepted', 'rejected', 'expired', 'converted'].includes(status)
    ? status as QuoteStatus
    : 'draft';
  return {
    id: row.id,
    agencyId: row.agencyId,
    quoteNumber: row.quoteNumber,
    customerNameAr: row.customerName ?? '',
    customerNameEn: row.customerNameEn ?? row.customerName ?? '',
    customerPhone: row.customerPhone ?? '',
    customerEmail: row.customerEmail ?? '',
    issueDate: epoch(row.issueDate, row.createdAt),
    expiryDate: epoch(row.validUntil, row.createdAt),
    status: safeStatus,
    items: Array.isArray(row.items) ? row.items as QuoteItem[] : [],
    subtotalHalalas: row.subtotalHalalas,
    vatHalalas: row.vatHalalas,
    grandTotalHalalas: row.totalHalalas,
    notes: row.notes ?? '',
    terms: row.terms ?? '',
    ...(row.convertedToBookingId ? { convertedToBookingId: row.convertedToBookingId } : {}),
    createdAt: row.createdAt.toISOString(),
  };
}
