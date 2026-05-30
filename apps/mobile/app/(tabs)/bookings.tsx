import {
  View, Text, FlatList, TouchableOpacity, TextInput,
  StyleSheet, RefreshControl, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useState, useCallback, useEffect } from 'react';
import { fetchBookings, type ApiBooking } from '@/src/lib/api-client';

const SERVICE_LABELS_AR: Record<string, string> = {
  flights: 'طيران', hotels: 'فنادق', packages: 'باقات', umrah: 'عمرة',
  hajj: 'حج', insurance: 'تأمين', visa: 'تأشيرة', transport: 'نقل', custom: 'خدمة',
};

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  draft:     { bg: '#f1f5f9', text: '#64748b' },
  confirmed: { bg: '#d1fae5', text: '#059669' },
  completed: { bg: '#dbeafe', text: '#1d4ed8' },
  cancelled: { bg: '#fee2e2', text: '#dc2626' },
};

const STATUS_LABELS_AR: Record<string, string> = {
  draft: 'مسودة', confirmed: 'مؤكد', completed: 'مكتمل', cancelled: 'ملغي',
};

export default function BookingsScreen() {
  const { i18n } = useTranslation();
  const isRtl = i18n.language === 'ar';

  const [bookings, setBookings]   = useState<ApiBooking[]>([]);
  const [search, setSearch]       = useState('');
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [page, setPage]           = useState(1);
  const [hasMore, setHasMore]     = useState(false);

  const load = useCallback(async (reset = false) => {
    const nextPage = reset ? 1 : page;
    try {
      setError(null);
      const res = await fetchBookings(nextPage, 20);
      setBookings(prev => reset ? res.data : [...prev, ...res.data]);
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

  const filtered = bookings.filter(b => {
    const name = (b.customerNameAr ?? '') + ' ' + (b.customerNameEn ?? '');
    return (
      name.toLowerCase().includes(search.toLowerCase()) ||
      b.bookingNumber.toLowerCase().includes(search.toLowerCase())
    );
  });

  const renderBooking = ({ item }: { item: ApiBooking }) => {
    const colors = STATUS_COLORS[item.status] ?? STATUS_COLORS['draft']!;
    const name   = isRtl ? (item.customerNameAr ?? item.customerNameEn ?? '-') : (item.customerNameEn ?? item.customerNameAr ?? '-');
    const type   = isRtl
      ? (SERVICE_LABELS_AR[item.serviceType] ?? item.customTypeName ?? item.serviceType)
      : (item.customTypeName ?? item.serviceType);
    const totalSar = (item.totalPriceHalalas / 100).toLocaleString(isRtl ? 'ar-SA' : 'en-SA', { minimumFractionDigits: 2 });
    const statusLabel = isRtl ? (STATUS_LABELS_AR[item.status] ?? item.status) : item.status;

    return (
      <TouchableOpacity
        style={styles.bookingCard}
        onPress={() => Alert.alert(item.bookingNumber, `${name}\n${type}`)}
        activeOpacity={0.75}
      >
        <View style={[styles.cardRow, isRtl && styles.rtlRow]}>
          <View style={styles.cardLeft}>
            <Text style={[styles.bookingId, isRtl && styles.rtlText]}>{item.bookingNumber}</Text>
            <Text style={[styles.customerName, isRtl && styles.rtlText]} numberOfLines={1}>{name}</Text>
            <Text style={[styles.bookingType, isRtl && styles.rtlText]}>{type}</Text>
          </View>
          <View style={styles.cardRight}>
            <Text style={styles.amount}>{totalSar} {isRtl ? 'ر.س' : 'SAR'}</Text>
            <View style={[styles.statusBadge, { backgroundColor: colors.bg }]}>
              <Text style={[styles.statusText, { color: colors.text }]}>{statusLabel}</Text>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={[styles.headerRow, isRtl && styles.rtlRow]}>
        <Text style={[styles.headerTitle, isRtl && styles.rtlText]}>{isRtl ? 'الحجوزات' : 'Bookings'}</Text>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => Alert.alert(isRtl ? 'حجز جديد' : 'New Booking', isRtl ? 'سيتم إضافة هذه الميزة قريباً' : 'Coming soon')}
          activeOpacity={0.8}
        >
          <Text style={styles.addButtonText}>+</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.searchContainer}>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder={isRtl ? 'ابحث برقم الحجز أو اسم العميل...' : 'Search bookings...'}
          placeholderTextColor="#94a3b8"
          textAlign={isRtl ? 'right' : 'left'}
          style={[styles.searchInput, isRtl && styles.rtlInput]}
        />
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
            {filtered.length} {isRtl ? 'حجز' : 'bookings'}
          </Text>
          <FlatList
            data={filtered}
            keyExtractor={(item) => item.id}
            renderItem={renderBooking}
            contentContainerStyle={styles.listContent}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0284c7" />}
            onEndReached={() => { if (hasMore) load(); }}
            onEndReachedThreshold={0.3}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Text style={styles.emptyIcon}>📋</Text>
                <Text style={[styles.emptyText, isRtl && styles.rtlText]}>{isRtl ? 'لا توجد حجوزات' : 'No bookings found'}</Text>
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
  container:       { flex: 1, backgroundColor: '#f8fafc' },
  centered:        { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  headerRow:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6 },
  rtlRow:          { flexDirection: 'row-reverse' },
  headerTitle:     { fontSize: 20, fontWeight: '700', color: '#0f172a' },
  addButton:       { width: 36, height: 36, borderRadius: 18, backgroundColor: '#0284c7', alignItems: 'center', justifyContent: 'center' },
  addButtonText:   { color: 'white', fontSize: 22, lineHeight: 26 },
  searchContainer: { padding: 12, paddingBottom: 6 },
  searchInput:     { backgroundColor: 'white', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, color: '#0f172a', borderWidth: 1, borderColor: '#e2e8f0' },
  rtlInput:        { textAlign: 'right' },
  countText:       { fontSize: 12, color: '#94a3b8', paddingHorizontal: 16, paddingBottom: 8 },
  rtlText:         { textAlign: 'right' },
  listContent:     { padding: 12, paddingTop: 4, gap: 8 },
  bookingCard:     { backgroundColor: 'white', borderRadius: 16, padding: 14, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  cardRow:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  cardLeft:        { flex: 1, gap: 3 },
  cardRight:       { alignItems: 'flex-end', gap: 6 },
  bookingId:       { fontSize: 12, color: '#0284c7', fontWeight: '700' },
  customerName:    { fontSize: 15, fontWeight: '600', color: '#0f172a' },
  bookingType:     { fontSize: 12, color: '#94a3b8' },
  amount:          { fontSize: 14, fontWeight: '700', color: '#0f172a' },
  statusBadge:     { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  statusText:      { fontSize: 11, fontWeight: '600' },
  emptyState:      { alignItems: 'center', paddingTop: 80 },
  emptyIcon:       { fontSize: 48, marginBottom: 12 },
  emptyText:       { fontSize: 15, color: '#94a3b8' },
  errorText:       { fontSize: 14, color: '#dc2626', textAlign: 'center', marginBottom: 12 },
  retryBtn:        { backgroundColor: '#0284c7', borderRadius: 8, paddingHorizontal: 20, paddingVertical: 10 },
  retryText:       { color: 'white', fontWeight: '600' },
});
