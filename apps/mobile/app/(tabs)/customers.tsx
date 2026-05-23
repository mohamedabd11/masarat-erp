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

interface Customer {
  id: string;
  nameAr: string;
  nameEn: string;
  phone: string;
  email: string;
  totalBookings: number;
  totalSpentSAR: number;
  avatarColor: string;
}

const DEMO_CUSTOMERS: Customer[] = [
  {
    id: 'C-001',
    nameAr: 'أحمد محمد العمري',
    nameEn: 'Ahmed Al-Omari',
    phone: '+966 50 123 4567',
    email: 'ahmed@example.com',
    totalBookings: 8,
    totalSpentSAR: 42500,
    avatarColor: '#0284c7',
  },
  {
    id: 'C-002',
    nameAr: 'فاطمة علي الزهراني',
    nameEn: 'Fatima Al-Zahrani',
    phone: '+966 55 234 5678',
    email: 'fatima@example.com',
    totalBookings: 5,
    totalSpentSAR: 18750,
    avatarColor: '#7c3aed',
  },
  {
    id: 'C-003',
    nameAr: 'خالد إبراهيم السعد',
    nameEn: 'Khalid Al-Saad',
    phone: '+966 54 345 6789',
    email: 'khalid@example.com',
    totalBookings: 12,
    totalSpentSAR: 67300,
    avatarColor: '#059669',
  },
  {
    id: 'C-004',
    nameAr: 'منى عبدالله القحطاني',
    nameEn: 'Mona Al-Qahtani',
    phone: '+966 56 456 7890',
    email: 'mona@example.com',
    totalBookings: 3,
    totalSpentSAR: 13800,
    avatarColor: '#d97706',
  },
  {
    id: 'C-005',
    nameAr: 'سعود محمد الغامدي',
    nameEn: 'Saud Al-Ghamdi',
    phone: '+966 50 567 8901',
    email: 'saud@example.com',
    totalBookings: 6,
    totalSpentSAR: 29400,
    avatarColor: '#dc2626',
  },
  {
    id: 'C-006',
    nameAr: 'نورة سالم الشهري',
    nameEn: 'Noura Al-Shahri',
    phone: '+966 58 678 9012',
    email: 'noura@example.com',
    totalBookings: 4,
    totalSpentSAR: 21600,
    avatarColor: '#0891b2',
  },
];

export default function CustomersScreen() {
  const { i18n } = useTranslation();
  const isRtl = i18n.language === 'ar';
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const filtered = DEMO_CUSTOMERS.filter((c) => {
    const name = isRtl ? c.nameAr : c.nameEn;
    return (
      name.toLowerCase().includes(search.toLowerCase()) ||
      c.phone.includes(search) ||
      c.id.toLowerCase().includes(search.toLowerCase())
    );
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await new Promise((r) => setTimeout(r, 1000));
    setRefreshing(false);
  }, []);

  const getInitial = (nameAr: string, nameEn: string): string => {
    const name = isRtl ? nameAr : nameEn;
    return name.charAt(0).toUpperCase();
  };

  const renderCustomer = ({ item }: { item: Customer }) => {
    const name = isRtl ? item.nameAr : item.nameEn;
    const initial = getInitial(item.nameAr, item.nameEn);

    return (
      <TouchableOpacity
        style={styles.customerCard}
        onPress={() =>
          Alert.alert(
            name,
            `${item.phone}\n${item.email}\n${
              isRtl
                ? `${item.totalBookings} حجز · ${item.totalSpentSAR.toLocaleString('ar-SA')} ر.س`
                : `${item.totalBookings} bookings · ${item.totalSpentSAR.toLocaleString('en-SA')} SAR`
            }`,
          )
        }
        activeOpacity={0.75}
      >
        <View style={[styles.cardRow, isRtl && styles.rtlRow]}>
          {/* Avatar */}
          <View
            style={[styles.avatar, { backgroundColor: item.avatarColor }]}
          >
            <Text style={styles.avatarText}>{initial}</Text>
          </View>

          {/* Info */}
          <View style={[styles.infoBlock, isRtl && styles.infoBlockRtl]}>
            <Text
              style={[styles.customerName, isRtl && styles.rtlText]}
              numberOfLines={1}
            >
              {name}
            </Text>
            <Text style={[styles.customerPhone, isRtl && styles.rtlText]}>
              {item.phone}
            </Text>
            <Text style={[styles.customerEmail, isRtl && styles.rtlText]} numberOfLines={1}>
              {item.email}
            </Text>
          </View>

          {/* Stats */}
          <View style={[styles.statsBlock, isRtl && styles.statsBlockRtl]}>
            <View
              style={[
                styles.bookingsChip,
                { borderColor: item.avatarColor + '40', backgroundColor: item.avatarColor + '12' },
              ]}
            >
              <Text style={[styles.bookingsCount, { color: item.avatarColor }]}>
                {item.totalBookings}
              </Text>
              <Text style={[styles.bookingsLabel, { color: item.avatarColor }]}>
                {isRtl ? 'حجز' : 'bkgs'}
              </Text>
            </View>
            <Text style={styles.spentAmount}>
              {item.totalSpentSAR.toLocaleString(isRtl ? 'ar-SA' : 'en-SA')}
            </Text>
            <Text style={styles.spentCurrency}>{isRtl ? 'ر.س' : 'SAR'}</Text>
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
          {isRtl ? 'العملاء' : 'Customers'}
        </Text>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() =>
            Alert.alert(
              isRtl ? 'عميل جديد' : 'New Customer',
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
          placeholder={isRtl ? 'ابحث بالاسم أو رقم الجوال...' : 'Search customers...'}
          placeholderTextColor="#94a3b8"
          textAlign={isRtl ? 'right' : 'left'}
          style={[styles.searchInput, isRtl && styles.rtlInput]}
        />
      </View>

      {/* Count */}
      <Text style={[styles.countText, isRtl && styles.rtlText]}>
        {filtered.length} {isRtl ? 'عميل' : 'customers'}
      </Text>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        renderItem={renderCustomer}
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
            <Text style={styles.emptyIcon}>👥</Text>
            <Text style={[styles.emptyText, isRtl && styles.rtlText]}>
              {isRtl ? 'لا يوجد عملاء' : 'No customers found'}
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
  customerCard:    { backgroundColor: 'white', borderRadius: 16, padding: 14, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  cardRow:         { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar:          { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  avatarText:      { color: 'white', fontSize: 20, fontWeight: '700' },
  infoBlock:       { flex: 1, gap: 2 },
  infoBlockRtl:    { alignItems: 'flex-end' },
  customerName:    { fontSize: 15, fontWeight: '600', color: '#0f172a' },
  customerPhone:   { fontSize: 13, color: '#475569' },
  customerEmail:   { fontSize: 12, color: '#94a3b8' },
  statsBlock:      { alignItems: 'flex-end', gap: 2, flexShrink: 0 },
  statsBlockRtl:   { alignItems: 'flex-start' },
  bookingsChip:    { flexDirection: 'row', gap: 3, borderRadius: 10, borderWidth: 1, paddingHorizontal: 7, paddingVertical: 3, alignItems: 'center' },
  bookingsCount:   { fontSize: 13, fontWeight: '700' },
  bookingsLabel:   { fontSize: 11, fontWeight: '500' },
  spentAmount:     { fontSize: 13, fontWeight: '700', color: '#0f172a' },
  spentCurrency:   { fontSize: 11, color: '#94a3b8' },
  emptyState:      { alignItems: 'center', paddingTop: 80 },
  emptyIcon:       { fontSize: 48, marginBottom: 12 },
  emptyText:       { fontSize: 15, color: '#94a3b8', fontWeight: '500' },
});
