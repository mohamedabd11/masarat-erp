export interface MessageTemplate {
  key: string;
  labelAr: string;
  labelEn: string;
  textAr: (vars: Record<string, string>) => string;
  textEn: (vars: Record<string, string>) => string;
  requiredVars: string[];
}

function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, k: string) => vars[k] ?? `{{${k}}}`);
}

export const MESSAGE_TEMPLATES: MessageTemplate[] = [
  {
    key: 'booking_confirmation',
    labelAr: 'تأكيد الحجز',
    labelEn: 'Booking Confirmation',
    textAr: (v) => fill(
      'السلام عليكم {{customerName}}،\n\nيسرّنا إعلامكم بتأكيد حجزكم رقم {{bookingNumber}}.\n\nشكراً لثقتكم بخدماتنا.',
      v,
    ),
    textEn: (v) => fill(
      'Dear {{customerName}},\n\nWe are pleased to confirm your booking #{{bookingNumber}}.\n\nThank you for your trust.',
      v,
    ),
    requiredVars: ['customerName', 'bookingNumber'],
  },
  {
    key: 'payment_received',
    labelAr: 'استلام الدفعة',
    labelEn: 'Payment Received',
    textAr: (v) => fill(
      'السلام عليكم {{customerName}}،\n\nتم استلام دفعتكم بمبلغ {{amountSAR}} ريال للحجز رقم {{bookingNumber}}.\n\nالرصيد المتبقي: {{remainingSAR}} ريال.\n\nشكراً لكم.',
      v,
    ),
    textEn: (v) => fill(
      'Dear {{customerName}},\n\nWe have received your payment of SAR {{amountSAR}} for booking #{{bookingNumber}}.\n\nRemaining balance: SAR {{remainingSAR}}.\n\nThank you.',
      v,
    ),
    requiredVars: ['customerName', 'bookingNumber', 'amountSAR', 'remainingSAR'],
  },
  {
    key: 'payment_reminder',
    labelAr: 'تذكير بالدفع',
    labelEn: 'Payment Reminder',
    textAr: (v) => fill(
      'السلام عليكم {{customerName}}،\n\nنذكّركم بأن لديكم مبلغاً مستحقاً بقيمة {{remainingSAR}} ريال للحجز رقم {{bookingNumber}}.\n\nنرجو السداد في أقرب وقت ممكن.',
      v,
    ),
    textEn: (v) => fill(
      'Dear {{customerName}},\n\nThis is a reminder that you have an outstanding balance of SAR {{remainingSAR}} for booking #{{bookingNumber}}.\n\nPlease arrange payment at your earliest convenience.',
      v,
    ),
    requiredVars: ['customerName', 'bookingNumber', 'remainingSAR'],
  },
  {
    key: 'invoice_ready',
    labelAr: 'الفاتورة جاهزة',
    labelEn: 'Invoice Ready',
    textAr: (v) => fill(
      'السلام عليكم {{customerName}}،\n\nفاتورتكم للحجز رقم {{bookingNumber}} جاهزة.\n\nيمكنكم التواصل معنا للحصول عليها.\n\nشكراً لكم.',
      v,
    ),
    textEn: (v) => fill(
      'Dear {{customerName}},\n\nYour invoice for booking #{{bookingNumber}} is ready.\n\nPlease contact us to receive it.\n\nThank you.',
      v,
    ),
    requiredVars: ['customerName', 'bookingNumber'],
  },
  {
    key: 'travel_reminder',
    labelAr: 'تذكير بالسفر',
    labelEn: 'Travel Reminder',
    textAr: (v) => fill(
      'السلام عليكم {{customerName}}،\n\nنذكّركم بموعد سفركم المقرر بتاريخ {{travelDate}} للحجز رقم {{bookingNumber}}.\n\nنتمنى لكم رحلة موفقة.',
      v,
    ),
    textEn: (v) => fill(
      'Dear {{customerName}},\n\nThis is a reminder of your upcoming travel on {{travelDate}} for booking #{{bookingNumber}}.\n\nWe wish you a pleasant journey.',
      v,
    ),
    requiredVars: ['customerName', 'bookingNumber', 'travelDate'],
  },
];

export function getTemplate(key: string): MessageTemplate | undefined {
  return MESSAGE_TEMPLATES.find((t) => t.key === key);
}
