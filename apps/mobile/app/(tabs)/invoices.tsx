import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  RefreshControl, Alert, ScrollView, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useState, useCallback, useEffect } from 'react';
import { fetchInvoices, type ApiInvoice } from '@/src/lib/api-client';

type TabFilter = 'all' | 'pending' | 'paid';

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  draft:     { bg: '#f1f5f9', text: '#64748b' },
  issued:    { bg: '#fef3c7', text: '#d97706' },
  partial:   { bg: '#fef3c7', text: '#d97706' },
  paid:      { bg: '#d1fae5', text: '#059669' },
  overdue:   { bg: '#fee2e2', text: '#dc2626' },
  cancelled: { bg: '#f1f5f9', text: '#94a3b8' },
  refunded:  { bg: '#f3e8ff', text: '#7c3aed' },
};

const STATUS_LABELS_AR: Record<string, string> = {
  draft: 'مسودة', issued: 'معلقة', partial: 'جزئي',
  paid: 'مدفوعة', cancelled: 'ملغاة', refunded: 'مستردة',
};
const STATUS_LABELS_EN: Record<string, string> = {
  draft: 'Draft', issued: 'Issued', partial: 'Partial',
  paid: 'Paid', cancelled: 'Cancelled', refunded: 'Refunded',
};

const TABS: { key: TabFilter; labelAr: string; labelEn: string }[] = [
  { key: 'all',     labelAr: 'الكل',   labelEn: 'All' },
  { key: 'pending', labelAr: 'معلقة',  labelEn: 'Pending' },
  { key: 'paid',    labelAr: 'مدفوعة', labelEn: 'Paid' },
];

export default function InvoicesScreen() {
  const { i18n } = useTranslation();
  const isRtl = i18n.language === 'ar';

  const [invoices, setInvoices]       = useState<ApiInvoice[]>([]);
  const [activeTab, setActiveTab]     = useState<TabFilter>('all');
  const [loading, setLoading]         = useState(true);
  const [refreshing, setRefreshing]   = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [page, setPage]               = useState(1);
  const [hasMore, setHasMore]         = useState(false);

  const load = useCallback(async (reset = false) => {
    const nextPage = reset ? 1 : page;
    try {
      setError(null);
      const res = await fetchInvoices(nextPage, 20);
      setInvoices(prev => reset ? res.data : [...prev, ...res.data]);
      setHasMore(res.hasMore);
      setPage(reset ? 2 : nextPage + 1);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [page]);

  useEffect(() => {
    load(true).finally(() => setLoading(false));
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load(true);
    setRefreshing(false);
  }, [load]);

  const filtered = invoices.filter(inv => {
    if (activeTab === 'pending') return inv.status === 'issued' || inv.status === 'partial';
    if (activeTab === 'paid')    return inv.status === 'paid';
    return true;
  });

  const renderInvoice = ({ item }: { item: ApiInvoice }) => {
    const colors  = STATUS_COLORS[item.status] ?? STATUS_COLORS['draft']!;
    const name    = isRtl ? (item.buyerNameAr ?? item.buyerNameEn ?? '-') : (item.buyerNameEn ?? item.buyerNameAr ?? '-');
    const amount  = (item.totalHalalas / 100).toLocaleString(isRtl ? 'ar-SA' : 'en-SA', { minimumFractionDigits: 2 });
    const sLabel  = isRtl ? (STATUS_LABELS_AR[item.status] ?? item.status) : (STATUS_LABELS_EN[item.status] ?? item.status);

    return (
      <TouchableOpacity
        style={styles.invoiceCard}
        onPress={() => Alert.alert(item.invoiceNumber, `${name}\n${amount} ${isRtl ? 'ر.س' : 'SAR'}`)}
        activeOpacity={0.75}
      >
        <View style={[styles.cardRow, isRtl && styles.rtlRow]}>
          <View style={styles.cardLeft}>
            <Text style={styles.invoiceNumber}>{item.invoiceNumber}</Text>
            <Text style={[styles.customerName, isRtl && styles.rtlText]} numberOfLines={1}>{name}</Text>
            <Text style={[styles.dateText, isRtl && styles.rtlText]}>
              {isRtl ? 'الإصدار:' : 'Issued:'} {item.issueDate}
            </Text>
          </View>
          <View style={styles.cardRight}>
            <Text style={styles.amount}>{amount}</Text>
            <Text style={styles.currency}>{isRtl ? 'ر.س' : 'SAR'}</Text>
            <View style={[styles.statusBadge, { backgroundColor: colors.bg }]}>
              <Text style={[styles.statusText, { color: colors.text }]}>{sLabel}</Text>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={[styles.headerRow, isRtl && styles.rtlRow]}>
        <Text style={[styles.headerTitle, isRtl && styles.rtlText]}>{isRtl ? 'الفواتير' : 'Invoices'}</Text>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => Alert.alert(isRtl ? 'فاتورة جديدة' : 'New Invoice', isRtl ? 'سيتم إضافة هذه الميزة قريباً' : 'Coming soon')}
          activeOpacity={0.8}
        >
          <Text style={styles.addButtonText}>+</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.tabsWrapper}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.tabsContainer, isRtl && styles.rtlRow]}>
          {TABS.map(tab => {
            const isActive = activeTab === tab.key;
            return (
              <TouchableOpacity key={tab.key} style={[styles.tab, isActive && styles.activeTab]} onPress={() => setActiveTab(tab.key)} activeOpacity={0.75}>
                <Text style={[styles.tabText, isActive && styles.activeTabText]}>{isRtl ? tab.labelAr : tab.labelEn}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {loading ? (
        <View style={styles.centered}><ActivityIndicator size="large" color="#0284c7" /></View>
      ) : error ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={() => load(true)} style={styles.retryBtn}>
            <Text style={styles.retryText}>{isRtl ? 'إعادة المحاولة' : 'Retry'}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <Text style={[styles.countText, isRtl && styles.rtlText]}>
            {filtered.length} {isRtl ? 'فاتورة' : 'invoices'}
          </Text>
          <FlatList
            data={filtered}
            keyExtractor={(item) => item.id}
            renderItem={renderInvoice}
            contentContainerStyle={styles.listContent}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0284c7" />}
            onEndReached={() => { if (hasMore) load(); }}
            onEndReachedThreshold={0.3}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Text style={styles.emptyIcon}>🧾</Text>
                <Text style={[styles.emptyText, isRtl && styles.rtlText]}>{isRtl ? 'لا توجد فواتير' : 'No invoices found'}</Text>
              </View>
            }
            showsVerticalScrollIndicator={false}
          />
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:     { flex: 1, backgroundColor: '#f8fafc' },
  centered:      { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  headerRow:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6 },
  rtlRow:        { flexDirection: 'row-reverse' },
  headerTitle:   { fontSize: 20, fontWeight: '700', color: '#0f172a' },
  addButton:     { width: 36, height: 36, borderRadius: 18, backgroundColor: '#0284c7', alignItems: 'center', justifyContent: 'center' },
  addButtonText: { color: 'white', fontSize: 22, lineHeight: 26 },
  tabsWrapper:   { paddingBottom: 2 },
  tabsContainer: { paddingHorizontal: 12, gap: 8, paddingVertical: 8 },
  tab:           { paddingHorizontal: 16, paddingVertical: 7, borderRadius: 20, backgroundColor: 'white', borderWidth: 1, borderColor: '#e2e8f0' },
  activeTab:     { backgroundColor: '#0284c7', borderColor: '#0284c7' },
  tabText:       { fontSize: 13, fontWeight: '500', color: '#64748b' },
  activeTabText: { color: 'white', fontWeight: '600' },
  countText:     { fontSize: 12, color: '#94a3b8', paddingHorizontal: 16, paddingBottom: 8 },
  rtlText:       { textAlign: 'right' },
  listContent:   { padding: 12, paddingTop: 4, gap: 8 },
  invoiceCard:   { backgroundColor: 'white', borderRadius: 16, padding: 14, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  cardRow:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  cardLeft:      { flex: 1, gap: 4 },
  cardRight:     { alignItems: 'flex-end', gap: 4 },
  invoiceNumber: { fontSize: 13, color: '#0284c7', fontWeight: '700' },
  customerName:  { fontSize: 15, fontWeight: '600', color: '#0f172a' },
  dateText:      { fontSize: 12, color: '#94a3b8' },
  amount:        { fontSize: 15, fontWeight: '700', color: '#0f172a' },
  currency:      { fontSize: 11, color: '#94a3b8' },
  statusBadge:   { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  statusText:    { fontSize: 11, fontWeight: '600' },
  emptyState:    { alignItems: 'center', paddingTop: 80 },
  emptyIcon:     { fontSize: 48, marginBottom: 12 },
  emptyText:     { fontSize: 15, color: '#94a3b8' },
  errorText:     { fontSize: 14, color: '#dc2626', textAlign: 'center', marginBottom: 12 },
  retryBtn:      { backgroundColor: '#0284c7', borderRadius: 8, paddingHorizontal: 20, paddingVertical: 10 },
  retryText:     { color: 'white', fontWeight: '600' },
});
