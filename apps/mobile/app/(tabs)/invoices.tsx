import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Alert,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useState, useCallback } from 'react';

type InvoiceStatus = 'draft' | 'pending' | 'paid' | 'overdue' | 'cancelled';
type ZatcaStatus = 'not_submitted' | 'pending' | 'accepted' | 'rejected';
type TabFilter = 'all' | 'pending' | 'paid';

interface Invoice {
  id: string;
  invoiceNumber: string;
  customerNameAr: string;
  customerNameEn: string;
  amountSAR: number;
  status: InvoiceStatus;
  zatcaStatus: ZatcaStatus;
  issueDate: string;
  dueDate: string;
}

const INVOICE_STATUS_COLORS: Record<InvoiceStatus, { bg: string; text: string }> = {
  draft:     { bg: '#f1f5f9', text: '#64748b' },
  pending:   { bg: '#fef3c7', text: '#d97706' },
  paid:      { bg: '#d1fae5', text: '#059669' },
  overdue:   { bg: '#fee2e2', text: '#dc2626' },
  cancelled: { bg: '#f1f5f9', text: '#94a3b8' },
};

const ZATCA_DOT_COLORS: Record<ZatcaStatus, string> = {
  not_submitted: '#94a3b8',
  pending:       '#d97706',
  accepted:      '#059669',
  rejected:      '#dc2626',
};

const DEMO_INVOICES: Invoice[] = [
  {
    id: 'INV-001',
    invoiceNumber: 'INV-2026-0148',
    customerNameAr: 'أحمد محمد العمري',
    customerNameEn: 'Ahmed Al-Omari',
    amountSAR: 9025,
    status: 'paid',
    zatcaStatus: 'accepted',
    issueDate: '2026-05-01',
    dueDate: '2026-05-15',
  },
  {
    id: 'INV-002',
    invoiceNumber: 'INV-2026-0147',
    customerNameAr: 'فاطمة علي الزهراني',
    customerNameEn: 'Fatima Al-Zahrani',
    amountSAR: 2530,
    status: 'pending',
    zatcaStatus: 'accepted',
    issueDate: '2026-05-10',
    dueDate: '2026-05-24',
  },
  {
    id: 'INV-003',
    invoiceNumber: 'INV-2026-0146',
    customerNameAr: 'خالد إبراهيم السعد',
    customerNameEn: 'Khalid Al-Saad',
    amountSAR: 5175,
    status: 'overdue',
    zatcaStatus: 'accepted',
    issueDate: '2026-04-20',
    dueDate: '2026-05-04',
  },
  {
    id: 'INV-004',
    invoiceNumber: 'INV-2026-0145',
    customerNameAr: 'منى عبدالله القحطاني',
    customerNameEn: 'Mona Al-Qahtani',
    amountSAR: 13800,
    status: 'paid',
    zatcaStatus: 'accepted',
    issueDate: '2026-05-05',
    dueDate: '2026-05-19',
  },
  {
    id: 'INV-005',
    invoiceNumber: 'INV-2026-0144',
    customerNameAr: 'سعود محمد الغامدي',
    customerNameEn: 'Saud Al-Ghamdi',
    amountSAR: 863,
    status: 'draft',
    zatcaStatus: 'not_submitted',
    issueDate: '2026-05-20',
    dueDate: '2026-06-03',
  },
];

const TABS: { key: TabFilter; labelAr: string; labelEn: string }[] = [
  { key: 'all',     labelAr: 'الكل',    labelEn: 'All' },
  { key: 'pending', labelAr: 'معلقة',   labelEn: 'Pending' },
  { key: 'paid',    labelAr: 'مدفوعة',  labelEn: 'Paid' },
];

export default function InvoicesScreen() {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language === 'ar';
  const [activeTab, setActiveTab] = useState<TabFilter>('all');
  const [refreshing, setRefreshing] = useState(false);

  const filtered = DEMO_INVOICES.filter((inv) => {
    if (activeTab === 'all') return true;
    if (activeTab === 'pending') return inv.status === 'pending' || inv.status === 'overdue';
    if (activeTab === 'paid') return inv.status === 'paid';
    return true;
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await new Promise((r) => setTimeout(r, 1000));
    setRefreshing(false);
  }, []);

  const statusLabel = (status: InvoiceStatus): string => {
    const labels: Record<InvoiceStatus, { ar: string; en: string }> = {
      draft:     { ar: 'مسودة',     en: 'Draft' },
      pending:   { ar: 'معلقة',     en: 'Pending' },
      paid:      { ar: 'مدفوعة',    en: 'Paid' },
      overdue:   { ar: 'متأخرة',    en: 'Overdue' },
      cancelled: { ar: 'ملغاة',     en: 'Cancelled' },
    };
    return isRtl ? labels[status].ar : labels[status].en;
  };

  const zatcaLabel = (status: ZatcaStatus): string => {
    const labels: Record<ZatcaStatus, { ar: string; en: string }> = {
      not_submitted: { ar: 'لم يُرسل',  en: 'Not Submitted' },
      pending:       { ar: 'قيد المعالجة', en: 'Pending' },
      accepted:      { ar: 'مقبول',     en: 'Accepted' },
      rejected:      { ar: 'مرفوض',     en: 'Rejected' },
    };
    return isRtl ? labels[status].ar : labels[status].en;
  };

  const renderInvoice = ({ item }: { item: Invoice }) => {
    const colors = INVOICE_STATUS_COLORS[item.status];
    const dotColor = ZATCA_DOT_COLORS[item.zatcaStatus];
    const name = isRtl ? item.customerNameAr : item.customerNameEn;

    return (
      <TouchableOpacity
        style={styles.invoiceCard}
        onPress={() =>
          Alert.alert(
            item.invoiceNumber,
            `${name}\n${item.amountSAR.toLocaleString(isRtl ? 'ar-SA' : 'en-SA')} ${isRtl ? 'ر.س' : 'SAR'}\n${isRtl ? 'تاريخ الاستحقاق:' : 'Due:'} ${item.dueDate}`,
          )
        }
        activeOpacity={0.75}
      >
        <View style={[styles.cardRow, isRtl && styles.rtlRow]}>
          {/* Left / Main info */}
          <View style={styles.cardLeft}>
            {/* Invoice number row */}
            <View style={[styles.numberRow, isRtl && styles.rtlRow]}>
              <Text style={styles.invoiceNumber}>{item.invoiceNumber}</Text>
              {/* ZATCA status dot */}
              <View style={[styles.zatcaRow, isRtl && styles.rtlRow]}>
                <View style={[styles.zatcaDot, { backgroundColor: dotColor }]} />
                <Text style={[styles.zatcaText, { color: dotColor }]}>
                  {isRtl ? 'زاتكا' : 'ZATCA'}
                </Text>
              </View>
            </View>

            <Text
              style={[styles.customerName, isRtl && styles.rtlText]}
              numberOfLines={1}
            >
              {name}
            </Text>

            <Text style={[styles.dateText, isRtl && styles.rtlText]}>
              {isRtl ? 'الاستحقاق:' : 'Due:'} {item.dueDate}
            </Text>
          </View>

          {/* Right / Amount & status */}
          <View style={styles.cardRight}>
            <Text style={styles.amount}>
              {item.amountSAR.toLocaleString(isRtl ? 'ar-SA' : 'en-SA')}
            </Text>
            <Text style={styles.currency}>{isRtl ? 'ر.س' : 'SAR'}</Text>
            <View style={[styles.statusBadge, { backgroundColor: colors.bg }]}>
              <Text style={[styles.statusText, { color: colors.text }]}>
                {statusLabel(item.status)}
              </Text>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      {/* Header */}
      <View style={[styles.headerRow, isRtl && styles.rtlRow]}>
        <Text style={[styles.headerTitle, isRtl && styles.rtlText]}>
          {isRtl ? 'الفواتير' : 'Invoices'}
        </Text>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() =>
            Alert.alert(
              isRtl ? 'فاتورة جديدة' : 'New Invoice',
              isRtl ? 'سيتم إضافة هذه الميزة قريباً' : 'Coming soon',
            )
          }
          activeOpacity={0.8}
        >
          <Text style={styles.addButtonText}>+</Text>
        </TouchableOpacity>
      </View>

      {/* Tab filter */}
      <View style={styles.tabsWrapper}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={[styles.tabsContainer, isRtl && styles.rtlRow]}
        >
          {TABS.map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <TouchableOpacity
                key={tab.key}
                style={[styles.tab, isActive && styles.activeTab]}
                onPress={() => setActiveTab(tab.key)}
                activeOpacity={0.75}
              >
                <Text style={[styles.tabText, isActive && styles.activeTabText]}>
                  {isRtl ? tab.labelAr : tab.labelEn}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Count */}
      <Text style={[styles.countText, isRtl && styles.rtlText]}>
        {filtered.length} {isRtl ? 'فاتورة' : 'invoices'}
      </Text>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={renderInvoice}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#0284c7"
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>🧾</Text>
            <Text style={[styles.emptyText, isRtl && styles.rtlText]}>
              {isRtl ? 'لا توجد فواتير' : 'No invoices found'}
            </Text>
          </View>
        }
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:     { flex: 1, backgroundColor: '#f8fafc' },
  headerRow:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6 },
  rtlRow:        { flexDirection: 'row-reverse' },
  headerTitle:   { fontSize: 20, fontWeight: '700', color: '#0f172a' },
  addButton:     { width: 36, height: 36, borderRadius: 18, backgroundColor: '#0284c7', alignItems: 'center', justifyContent: 'center', shadowColor: '#0284c7', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 4 },
  addButtonText: { color: 'white', fontSize: 22, lineHeight: 26, fontWeight: '400' },

  tabsWrapper:      { paddingBottom: 2 },
  tabsContainer:    { paddingHorizontal: 12, gap: 8, paddingVertical: 8 },
  tab:              { paddingHorizontal: 16, paddingVertical: 7, borderRadius: 20, backgroundColor: 'white', borderWidth: 1, borderColor: '#e2e8f0' },
  activeTab:        { backgroundColor: '#0284c7', borderColor: '#0284c7' },
  tabText:          { fontSize: 13, fontWeight: '500', color: '#64748b' },
  activeTabText:    { color: 'white', fontWeight: '600' },

  countText:     { fontSize: 12, color: '#94a3b8', paddingHorizontal: 16, paddingBottom: 8 },
  rtlText:       { textAlign: 'right' },
  listContent:   { padding: 12, paddingTop: 4, gap: 8 },

  invoiceCard:   { backgroundColor: 'white', borderRadius: 16, padding: 14, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  cardRow:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  cardLeft:      { flex: 1, gap: 4 },
  cardRight:     { alignItems: 'flex-end', gap: 4 },

  numberRow:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  invoiceNumber: { fontSize: 13, color: '#0284c7', fontFamily: 'monospace', fontWeight: '700' },

  zatcaRow:      { flexDirection: 'row', alignItems: 'center', gap: 4 },
  zatcaDot:      { width: 7, height: 7, borderRadius: 4 },
  zatcaText:     { fontSize: 10, fontWeight: '600' },

  customerName:  { fontSize: 15, fontWeight: '600', color: '#0f172a' },
  dateText:      { fontSize: 12, color: '#94a3b8' },

  amount:        { fontSize: 15, fontWeight: '700', color: '#0f172a' },
  currency:      { fontSize: 11, color: '#94a3b8', marginTop: -2 },
  statusBadge:   { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3, marginTop: 2 },
  statusText:    { fontSize: 11, fontWeight: '600' },

  emptyState:    { alignItems: 'center', paddingTop: 80 },
  emptyIcon:     { fontSize: 48, marginBottom: 12 },
  emptyText:     { fontSize: 15, color: '#94a3b8', fontWeight: '500' },
});
