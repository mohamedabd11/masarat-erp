import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  RefreshControl,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useState, useCallback } from 'react';

type BookingStatus =
  | 'draft'
  | 'pending_approval'
  | 'confirmed'
  | 'in_progress'
  | 'completed'
  | 'cancelled';

interface Booking {
  id: string;
  customerNameAr: string;
  customerNameEn: string;
  typeAr: string;
  typeEn: string;
  status: BookingStatus;
  departureDate: string;
  totalSAR: number;
}

const STATUS_COLORS: Record<BookingStatus, { bg: string; text: string }> = {
  draft:            { bg: '#f1f5f9', text: '#64748b' },
  pending_approval: { bg: '#fef3c7', text: '#d97706' },
  confirmed:        { bg: '#d1fae5', text: '#059669' },
  in_progress:      { bg: '#e0f2fe', text: '#0284c7' },
  completed:        { bg: '#dbeafe', text: '#1d4ed8' },
  cancelled:        { bg: '#fee2e2', text: '#dc2626' },
};

const DEMO_BOOKINGS: Booking[] = [
  {
    id: 'BK-248',
    customerNameAr: 'أحمد محمد العمري',
    customerNameEn: 'Ahmed Al-Omari',
    typeAr: 'عمرة',
    typeEn: 'Umrah',
    status: 'confirmed',
    departureDate: '2026-06-10',
    totalSAR: 9025,
  },
  {
    id: 'BK-247',
    customerNameAr: 'فاطمة علي الزهراني',
    customerNameEn: 'Fatima Al-Zahrani',
    typeAr: 'طيران',
    typeEn: 'Flight',
    status: 'pending_approval',
    departureDate: '2026-05-28',
    totalSAR: 2530,
  },
  {
    id: 'BK-246',
    customerNameAr: 'خالد إبراهيم السعد',
    customerNameEn: 'Khalid Al-Saad',
    typeAr: 'فندق',
    typeEn: 'Hotel',
    status: 'confirmed',
    departureDate: '2026-06-05',
    totalSAR: 5175,
  },
  {
    id: 'BK-245',
    customerNameAr: 'منى عبدالله القحطاني',
    customerNameEn: 'Mona Al-Qahtani',
    typeAr: 'باقة سياحية',
    typeEn: 'Tour Package',
    status: 'in_progress',
    departureDate: '2026-05-25',
    totalSAR: 13800,
  },
  {
    id: 'BK-244',
    customerNameAr: 'سعود محمد الغامدي',
    customerNameEn: 'Saud Al-Ghamdi',
    typeAr: 'تأشيرة',
    typeEn: 'Visa',
    status: 'draft',
    departureDate: '2026-06-15',
    totalSAR: 863,
  },
];

export default function BookingsScreen() {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language === 'ar';
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const filtered = DEMO_BOOKINGS.filter((b) => {
    const name = isRtl ? b.customerNameAr : b.customerNameEn;
    return (
      name.toLowerCase().includes(search.toLowerCase()) ||
      b.id.toLowerCase().includes(search.toLowerCase())
    );
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await new Promise((r) => setTimeout(r, 1000));
    setRefreshing(false);
  }, []);

  const statusLabel = (status: BookingStatus): string =>
    t(`bookings.statuses.${status}`) as string;

  const renderBooking = ({ item }: { item: Booking }) => {
    const colors = STATUS_COLORS[item.status];
    const name = isRtl ? item.customerNameAr : item.customerNameEn;
    const type = isRtl ? item.typeAr : item.typeEn;

    return (
      <TouchableOpacity
        style={styles.bookingCard}
        onPress={() =>
          Alert.alert(
            item.id,
            `${name}\n${type}\n${item.departureDate}`,
          )
        }
        activeOpacity={0.75}
      >
        <View style={[styles.cardRow, isRtl && styles.rtlRow]}>
          <View style={styles.cardLeft}>
            <Text style={[styles.bookingId, isRtl && styles.rtlText]}>
              {item.id}
            </Text>
            <Text
              style={[styles.customerName, isRtl && styles.rtlText]}
              numberOfLines={1}
            >
              {name}
            </Text>
            <Text style={[styles.bookingType, isRtl && styles.rtlText]}>
              {type} · {item.departureDate}
            </Text>
          </View>
          <View style={styles.cardRight}>
            <Text style={styles.amount}>
              {item.totalSAR.toLocaleString(isRtl ? 'ar-SA' : 'en-SA')}{' '}
              {isRtl ? 'ر.س' : 'SAR'}
            </Text>
            <View
              style={[styles.statusBadge, { backgroundColor: colors.bg }]}
            >
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
      {/* Header row with add button */}
      <View style={[styles.headerRow, isRtl && styles.rtlRow]}>
        <Text style={[styles.headerTitle, isRtl && styles.rtlText]}>
          {isRtl ? 'الحجوزات' : 'Bookings'}
        </Text>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() =>
            Alert.alert(
              isRtl ? 'حجز جديد' : 'New Booking',
              isRtl ? 'سيتم إضافة هذه الميزة قريباً' : 'Coming soon',
            )
          }
          activeOpacity={0.8}
        >
          <Text style={styles.addButtonText}>+</Text>
        </TouchableOpacity>
      </View>

      {/* Search */}
      <View style={styles.searchContainer}>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder={
            isRtl
              ? 'ابحث برقم الحجز أو اسم العميل...'
              : 'Search bookings...'
          }
          placeholderTextColor="#94a3b8"
          textAlign={isRtl ? 'right' : 'left'}
          style={[styles.searchInput, isRtl && styles.rtlInput]}
        />
      </View>

      {/* Count */}
      <Text style={[styles.countText, isRtl && styles.rtlText]}>
        {filtered.length} {isRtl ? 'حجز' : 'bookings'}
      </Text>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={renderBooking}
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
            <Text style={styles.emptyIcon}>📋</Text>
            <Text style={[styles.emptyText, isRtl && styles.rtlText]}>
              {isRtl ? 'لا توجد حجوزات' : 'No bookings found'}
            </Text>
          </View>
        }
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:       { flex: 1, backgroundColor: '#f8fafc' },
  headerRow:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6 },
  rtlRow:          { flexDirection: 'row-reverse' },
  headerTitle:     { fontSize: 20, fontWeight: '700', color: '#0f172a' },
  addButton:       { width: 36, height: 36, borderRadius: 18, backgroundColor: '#0284c7', alignItems: 'center', justifyContent: 'center', shadowColor: '#0284c7', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 4 },
  addButtonText:   { color: 'white', fontSize: 22, lineHeight: 26, fontWeight: '400' },
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
  bookingId:       { fontSize: 12, color: '#0284c7', fontFamily: 'monospace', fontWeight: '700' },
  customerName:    { fontSize: 15, fontWeight: '600', color: '#0f172a' },
  bookingType:     { fontSize: 12, color: '#94a3b8' },
  amount:          { fontSize: 14, fontWeight: '700', color: '#0f172a' },
  statusBadge:     { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  statusText:      { fontSize: 11, fontWeight: '600' },
  emptyState:      { alignItems: 'center', paddingTop: 80 },
  emptyIcon:       { fontSize: 48, marginBottom: 12 },
  emptyText:       { fontSize: 15, color: '#94a3b8', fontWeight: '500' },
});
