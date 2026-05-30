import React from 'react';
import {
  Document, Page, Text, View, Image, StyleSheet, Line, Svg,
} from '@react-pdf/renderer';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PdfInvoiceAgency {
  nameAr:     string;
  vatNumber:  string | null;
  crNumber:   string | null;
  addressAr:  string | null;
  phone:      string | null;
  logoUrl:    string | null;
}

export interface PdfInvoiceItem {
  description:      string;
  quantity:         number;
  unitPriceHalalas: number;
  vatHalalas:       number;
  totalHalalas:     number;
}

export interface PdfInvoiceData {
  invoiceNumber:   string;
  type:            string;   // '380' | '381' | '383'
  issueDate:       string;   // YYYY-MM-DD
  dueDate:         string | null;
  buyerNameAr:     string | null;
  buyerPhone:      string | null;
  buyerNationalId: string | null;
  buyerVatNumber:  string | null;
  subtotalHalalas: number;
  vatHalalas:      number;
  totalHalalas:    number;
  paidHalalas:     number;
  notes:           string | null;
  items:           PdfInvoiceItem[];
  agency:          PdfInvoiceAgency;
  qrDataUrl:       string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function sar(halalas: number): string {
  return `${(halalas / 100).toLocaleString('en-SA', { minimumFractionDigits: 2 })} ر.س`;
}

function typeLabel(code: string): string {
  if (code === '381') return 'إشعار دائن — Credit Note';
  if (code === '383') return 'إشعار مدين — Debit Note';
  return 'فاتورة ضريبية — Tax Invoice';
}

// ── Styles ────────────────────────────────────────────────────────────────────

const C = {
  primary: '#1a56db',
  dark:    '#111827',
  muted:   '#6b7280',
  light:   '#f3f4f6',
  border:  '#e5e7eb',
  white:   '#ffffff',
  danger:  '#dc2626',
};

const styles = StyleSheet.create({
  page: {
    fontFamily:  'Cairo',
    fontSize:    9,
    color:       C.dark,
    paddingTop:  32,
    paddingBottom: 48,
    paddingHorizontal: 36,
    direction:   'rtl',
  },

  // ── Header
  header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20 },
  headerLeft: { flex: 1 },
  headerRight: { flex: 1, alignItems: 'flex-start' },
  logo: { width: 80, height: 40, objectFit: 'contain', marginBottom: 6 },
  agencyName: { fontSize: 14, fontWeight: 700, color: C.primary },
  agencyMeta: { fontSize: 8, color: C.muted, marginTop: 2 },
  invoiceTitle: { fontSize: 18, fontWeight: 700, color: C.primary, textAlign: 'right' },
  invoiceMeta: { fontSize: 9, textAlign: 'right', marginTop: 4, color: C.dark },
  invoiceMetaMuted: { fontSize: 8, textAlign: 'right', color: C.muted, marginTop: 2 },

  // ── Divider
  divider: { borderBottomWidth: 1, borderBottomColor: C.border, marginVertical: 10 },

  // ── Party section
  parties: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 },
  partyBox: { flex: 1, backgroundColor: C.light, borderRadius: 4, padding: 10 },
  partyBoxRight: { marginLeft: 8 },
  partyBoxLeft: { marginRight: 8 },
  partyLabel: { fontSize: 8, fontWeight: 700, color: C.muted, marginBottom: 4, textTransform: 'uppercase' },
  partyName: { fontSize: 11, fontWeight: 700, color: C.dark, marginBottom: 2 },
  partyMeta: { fontSize: 8, color: C.muted, marginTop: 1 },

  // ── Table
  table: { marginTop: 8 },
  tableHeader: { flexDirection: 'row', backgroundColor: C.primary, borderRadius: 3, paddingVertical: 6, paddingHorizontal: 8 },
  tableHeaderCell: { color: C.white, fontWeight: 700, fontSize: 8 },
  tableRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: C.border, paddingVertical: 5, paddingHorizontal: 8 },
  tableRowAlt: { backgroundColor: '#f9fafb' },
  tableCell: { fontSize: 8.5, color: C.dark },

  colDesc:   { flex: 4 },
  colQty:    { flex: 1, textAlign: 'center' },
  colUnit:   { flex: 2, textAlign: 'right' },
  colVat:    { flex: 2, textAlign: 'right' },
  colTotal:  { flex: 2, textAlign: 'right' },

  // ── Totals
  totalsRow: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 14 },
  totalsBox: { width: 200 },
  totalLine: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3, borderBottomWidth: 1, borderBottomColor: C.border },
  totalLabel: { fontSize: 9, color: C.muted },
  totalValue: { fontSize: 9, fontWeight: 400 },
  grandLine: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5, backgroundColor: C.primary, borderRadius: 3, paddingHorizontal: 8, marginTop: 4 },
  grandLabel: { fontSize: 10, fontWeight: 700, color: C.white },
  grandValue: { fontSize: 10, fontWeight: 700, color: C.white },

  // ── Footer
  footer: { position: 'absolute', bottom: 24, left: 36, right: 36 },
  footerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  qrBox: { alignItems: 'center' },
  qrImage: { width: 72, height: 72 },
  qrCaption: { fontSize: 7, color: C.muted, marginTop: 2, textAlign: 'center' },
  notes: { fontSize: 8, color: C.muted, flex: 1, textAlign: 'right', marginRight: 16 },
  badge: { backgroundColor: C.danger, borderRadius: 3, paddingHorizontal: 6, paddingVertical: 2 },
  badgeText: { color: C.white, fontSize: 8, fontWeight: 700 },
});

// ── Component ─────────────────────────────────────────────────────────────────

export function InvoicePdf({ data }: { data: PdfInvoiceData }) {
  const { agency, items, qrDataUrl } = data;
  const remaining = data.totalHalalas - data.paidHalalas;

  return (
    <Document title={`${typeLabel(data.type)} ${data.invoiceNumber}`} language="ar">
      <Page size="A4" style={styles.page}>

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            {agency.logoUrl
              ? <Image style={styles.logo} src={agency.logoUrl} />
              : null}
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
            <Text style={styles.invoiceTitle}>{typeLabel(data.type)}</Text>
            <Text style={styles.invoiceMeta}>رقم الفاتورة: {data.invoiceNumber}</Text>
            <Text style={styles.invoiceMetaMuted}>تاريخ الإصدار: {data.issueDate}</Text>
            {data.dueDate
              ? <Text style={styles.invoiceMetaMuted}>تاريخ الاستحقاق: {data.dueDate}</Text>
              : null}
            {data.type !== '380' && (
              <View style={{ ...styles.badge, marginTop: 6 }}>
                <Text style={styles.badgeText}>{data.type === '381' ? 'إشعار دائن' : 'إشعار مدين'}</Text>
              </View>
            )}
          </View>
        </View>

        <View style={styles.divider} />

        {/* ── Parties ─────────────────────────────────────────────────────── */}
        <View style={styles.parties}>
          <View style={[styles.partyBox, styles.partyBoxLeft]}>
            <Text style={styles.partyLabel}>المشتري / Buyer</Text>
            <Text style={styles.partyName}>{data.buyerNameAr ?? 'غير محدد'}</Text>
            {data.buyerPhone
              ? <Text style={styles.partyMeta}>هاتف: {data.buyerPhone}</Text>
              : null}
            {data.buyerNationalId
              ? <Text style={styles.partyMeta}>الهوية: {data.buyerNationalId}</Text>
              : null}
            {data.buyerVatNumber
              ? <Text style={styles.partyMeta}>ر.ض: {data.buyerVatNumber}</Text>
              : null}
          </View>

          <View style={[styles.partyBox, styles.partyBoxRight]}>
            <Text style={styles.partyLabel}>البائع / Seller</Text>
            <Text style={styles.partyName}>{agency.nameAr}</Text>
            {agency.vatNumber
              ? <Text style={styles.partyMeta}>الرقم الضريبي: {agency.vatNumber}</Text>
              : null}
            {agency.crNumber
              ? <Text style={styles.partyMeta}>السجل التجاري: {agency.crNumber}</Text>
              : null}
          </View>
        </View>

        {/* ── Line items table ─────────────────────────────────────────────── */}
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderCell, styles.colDesc]}>الوصف</Text>
            <Text style={[styles.tableHeaderCell, styles.colQty]}>الكمية</Text>
            <Text style={[styles.tableHeaderCell, styles.colUnit]}>سعر الوحدة</Text>
            <Text style={[styles.tableHeaderCell, styles.colVat]}>الضريبة</Text>
            <Text style={[styles.tableHeaderCell, styles.colTotal]}>الإجمالي</Text>
          </View>

          {items.length === 0 && (
            <View style={styles.tableRow}>
              <Text style={[styles.tableCell, styles.colDesc]}>خدمات سفر</Text>
              <Text style={[styles.tableCell, styles.colQty]}>1</Text>
              <Text style={[styles.tableCell, styles.colUnit]}>{sar(data.subtotalHalalas)}</Text>
              <Text style={[styles.tableCell, styles.colVat]}>{sar(data.vatHalalas)}</Text>
              <Text style={[styles.tableCell, styles.colTotal]}>{sar(data.totalHalalas)}</Text>
            </View>
          )}

          {items.map((item, i) => (
            <View key={i} style={[styles.tableRow, i % 2 === 1 ? styles.tableRowAlt : {}]}>
              <Text style={[styles.tableCell, styles.colDesc]}>{item.description}</Text>
              <Text style={[styles.tableCell, styles.colQty]}>{item.quantity}</Text>
              <Text style={[styles.tableCell, styles.colUnit]}>{sar(item.unitPriceHalalas)}</Text>
              <Text style={[styles.tableCell, styles.colVat]}>{sar(item.vatHalalas)}</Text>
              <Text style={[styles.tableCell, styles.colTotal]}>{sar(item.totalHalalas)}</Text>
            </View>
          ))}
        </View>

        {/* ── Totals ───────────────────────────────────────────────────────── */}
        <View style={styles.totalsRow}>
          <View style={styles.totalsBox}>
            <View style={styles.totalLine}>
              <Text style={styles.totalLabel}>المجموع قبل الضريبة</Text>
              <Text style={styles.totalValue}>{sar(data.subtotalHalalas)}</Text>
            </View>
            <View style={styles.totalLine}>
              <Text style={styles.totalLabel}>ضريبة القيمة المضافة (15%)</Text>
              <Text style={styles.totalValue}>{sar(data.vatHalalas)}</Text>
            </View>
            {data.paidHalalas > 0 && (
              <View style={styles.totalLine}>
                <Text style={styles.totalLabel}>المبلغ المدفوع</Text>
                <Text style={styles.totalValue}>({sar(data.paidHalalas)})</Text>
              </View>
            )}
            <View style={styles.grandLine}>
              <Text style={styles.grandLabel}>{data.paidHalalas > 0 ? 'المتبقي' : 'الإجمالي'}</Text>
              <Text style={styles.grandValue}>{sar(remaining > 0 ? remaining : data.totalHalalas)}</Text>
            </View>
          </View>
        </View>

        {/* ── Footer: QR + Notes ───────────────────────────────────────────── */}
        <View style={styles.footer}>
          <View style={styles.divider} />
          <View style={styles.footerRow}>
            {data.notes
              ? <Text style={styles.notes}>{data.notes}</Text>
              : <View style={{ flex: 1 }} />}
            {agency.vatNumber && (
              <View style={styles.qrBox}>
                <Image style={styles.qrImage} src={qrDataUrl} />
                <Text style={styles.qrCaption}>QR Code — ZATCA Phase 1</Text>
              </View>
            )}
          </View>
        </View>

      </Page>
    </Document>
  );
}
