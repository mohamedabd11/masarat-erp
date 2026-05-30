import React from 'react';
import {
  Document, Page, Text, View, Image, StyleSheet,
} from '@react-pdf/renderer';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PdfBookingAgency {
  nameAr:    string;
  vatNumber: string | null;
  crNumber:  string | null;
  addressAr: string | null;
  phone:     string | null;
  logoUrl:   string | null;
}

export interface PdfBookingData {
  bookingNumber:      string;
  serviceType:        string;
  customTypeName:     string | null;
  status:             string;
  customerNameAr:     string | null;
  customerPhone:      string | null;
  totalPriceHalalas:  number;
  paidHalalas:        number;
  notes:              string | null;
  issueDate:          string;   // YYYY-MM-DD
  agency:             PdfBookingAgency;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function sar(halalas: number): string {
  return `${(halalas / 100).toLocaleString('en-SA', { minimumFractionDigits: 2 })} ر.س`;
}

const SERVICE_LABELS: Record<string, string> = {
  flights:   'تذاكر طيران',
  hotels:    'فنادق',
  packages:  'باقات سياحية',
  umrah:     'عمرة',
  hajj:      'حج',
  insurance: 'تأمين',
  visa:      'تأشيرة',
  transport: 'نقل',
  custom:    'خدمة مخصصة',
};

function serviceLabel(type: string, customName: string | null): string {
  if (type === 'custom' && customName) return customName;
  return SERVICE_LABELS[type] ?? type;
}

const STATUS_LABELS: Record<string, string> = {
  draft:     'مسودة',
  confirmed: 'مؤكد',
  completed: 'مكتمل',
  cancelled: 'ملغي',
};

// ── Styles ────────────────────────────────────────────────────────────────────

const C = {
  primary: '#1a56db',
  dark:    '#111827',
  muted:   '#6b7280',
  light:   '#f3f4f6',
  border:  '#e5e7eb',
  white:   '#ffffff',
  success: '#16a34a',
};

const styles = StyleSheet.create({
  page: {
    fontFamily:        'Cairo',
    fontSize:          9,
    color:             C.dark,
    paddingTop:        32,
    paddingBottom:     48,
    paddingHorizontal: 36,
    direction:         'rtl',
  },

  header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  headerLeft: { flex: 1 },
  headerRight: { flex: 1, alignItems: 'flex-start' },
  logo: { width: 80, height: 40, objectFit: 'contain', marginBottom: 6 },
  agencyName: { fontSize: 14, fontWeight: 700, color: C.primary },
  agencyMeta: { fontSize: 8, color: C.muted, marginTop: 2 },

  docTitle: { fontSize: 18, fontWeight: 700, color: C.primary, textAlign: 'right' },
  docMeta:  { fontSize: 9,  textAlign: 'right', marginTop: 4, color: C.dark },
  docMetaMuted: { fontSize: 8, textAlign: 'right', color: C.muted, marginTop: 2 },

  divider: { borderBottomWidth: 1, borderBottomColor: C.border, marginVertical: 10 },

  // ── Detail cards
  cards: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  card:  { flex: 1, backgroundColor: C.light, borderRadius: 4, padding: 10 },
  cardLabel: { fontSize: 8, fontWeight: 700, color: C.muted, marginBottom: 4, textTransform: 'uppercase' },
  cardValue: { fontSize: 11, fontWeight: 700, color: C.dark, marginBottom: 2 },
  cardMeta:  { fontSize: 8,  color: C.muted, marginTop: 1 },

  // ── Summary box
  summaryRow: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 14 },
  summaryBox: { width: 200 },
  sumLine: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3, borderBottomWidth: 1, borderBottomColor: C.border },
  sumLabel: { fontSize: 9, color: C.muted },
  sumValue: { fontSize: 9 },
  grandLine: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5, backgroundColor: C.primary, borderRadius: 3, paddingHorizontal: 8, marginTop: 4 },
  grandLabel: { fontSize: 10, fontWeight: 700, color: C.white },
  grandValue: { fontSize: 10, fontWeight: 700, color: C.white },

  // ── Status badge
  badge: { borderRadius: 3, paddingHorizontal: 6, paddingVertical: 2, marginTop: 6 },
  badgeText: { fontSize: 8, fontWeight: 700 },

  // ── Notes
  notesSection: { marginTop: 12 },
  notesLabel: { fontSize: 8, fontWeight: 700, color: C.muted, marginBottom: 4 },
  notesText:  { fontSize: 8, color: C.dark, lineHeight: 1.4 },

  // ── Footer
  footer: { position: 'absolute', bottom: 24, left: 36, right: 36 },
  footerText: { fontSize: 7, color: C.muted, textAlign: 'center' },
});

// ── Component ─────────────────────────────────────────────────────────────────

export function BookingPdf({ data }: { data: PdfBookingData }) {
  const { agency } = data;
  const remaining = data.totalPriceHalalas - data.paidHalalas;
  const statusColor = data.status === 'confirmed' || data.status === 'completed'
    ? C.success : C.muted;

  return (
    <Document title={`تأكيد الحجز ${data.bookingNumber}`} language="ar">
      <Page size="A4" style={styles.page}>

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            {agency.logoUrl ? <Image style={styles.logo} src={agency.logoUrl} /> : null}
            <Text style={styles.agencyName}>{agency.nameAr}</Text>
            {agency.vatNumber
              ? <Text style={styles.agencyMeta}>الرقم الضريبي: {agency.vatNumber}</Text>
              : null}
            {agency.crNumber
              ? <Text style={styles.agencyMeta}>السجل التجاري: {agency.crNumber}</Text>
              : null}
            {agency.addressAr
              ? <Text style={styles.agencyMeta}>{agency.addressAr}</Text>
              : null}
            {agency.phone
              ? <Text style={styles.agencyMeta}>هاتف: {agency.phone}</Text>
              : null}
          </View>

          <View style={styles.headerRight}>
            <Text style={styles.docTitle}>تأكيد الحجز</Text>
            <Text style={styles.docMeta}>رقم الحجز: {data.bookingNumber}</Text>
            <Text style={styles.docMetaMuted}>تاريخ الإصدار: {data.issueDate}</Text>
            <View style={{ ...styles.badge, backgroundColor: statusColor + '22', marginTop: 6 }}>
              <Text style={{ ...styles.badgeText, color: statusColor }}>
                {STATUS_LABELS[data.status] ?? data.status}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.divider} />

        {/* ── Detail cards ────────────────────────────────────────────────── */}
        <View style={styles.cards}>
          <View style={styles.card}>
            <Text style={styles.cardLabel}>العميل / Customer</Text>
            <Text style={styles.cardValue}>{data.customerNameAr ?? 'غير محدد'}</Text>
            {data.customerPhone
              ? <Text style={styles.cardMeta}>هاتف: {data.customerPhone}</Text>
              : null}
          </View>

          <View style={styles.card}>
            <Text style={styles.cardLabel}>نوع الخدمة / Service</Text>
            <Text style={styles.cardValue}>
              {serviceLabel(data.serviceType, data.customTypeName)}
            </Text>
          </View>
        </View>

        {/* ── Financial summary ────────────────────────────────────────────── */}
        <View style={styles.summaryRow}>
          <View style={styles.summaryBox}>
            <View style={styles.sumLine}>
              <Text style={styles.sumLabel}>إجمالي الحجز</Text>
              <Text style={styles.sumValue}>{sar(data.totalPriceHalalas)}</Text>
            </View>
            {data.paidHalalas > 0 && (
              <View style={styles.sumLine}>
                <Text style={styles.sumLabel}>المبلغ المدفوع</Text>
                <Text style={styles.sumValue}>({sar(data.paidHalalas)})</Text>
              </View>
            )}
            <View style={styles.grandLine}>
              <Text style={styles.grandLabel}>{data.paidHalalas > 0 ? 'المتبقي' : 'الإجمالي'}</Text>
              <Text style={styles.grandValue}>{sar(remaining > 0 ? remaining : data.totalPriceHalalas)}</Text>
            </View>
          </View>
        </View>

        {/* ── Notes ───────────────────────────────────────────────────────── */}
        {data.notes ? (
          <View style={styles.notesSection}>
            <Text style={styles.notesLabel}>ملاحظات / Notes</Text>
            <Text style={styles.notesText}>{data.notes}</Text>
          </View>
        ) : null}

        {/* ── Footer ───────────────────────────────────────────────────────── */}
        <View style={styles.footer}>
          <View style={styles.divider} />
          <Text style={styles.footerText}>
            {agency.nameAr} — وثيقة تأكيد حجز — {data.issueDate}
          </Text>
        </View>

      </Page>
    </Document>
  );
}
