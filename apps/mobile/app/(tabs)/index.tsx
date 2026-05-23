import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { router } from 'expo-router';

interface StatCard { label: string; value: string; color: string; bg: string }

export default function DashboardScreen() {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language === 'ar';

  const stats: StatCard[] = [
    { label: isRtl ? 'إجمالي الحجوزات' : 'Total Bookings', value: '248', color: '#0284c7', bg: '#e0f2fe' },
    { label: isRtl ? 'حجوزات معلقة' : 'Pending', value: '12', color: '#d97706', bg: '#fef3c7' },
    { label: isRtl ? 'الإيرادات (ر.س)' : 'Revenue (SAR)', value: '124,580', color: '#059669', bg: '#d1fae5' },
    { label: isRtl ? 'مدفوعات معلقة' : 'Pending Payments', value: '1,875', color: '#dc2626', bg: '#fee2e2' },
  ];

  const quickActions = [
    { label: isRtl ? 'حجز جديد' : 'New Booking', route: '/(tabs)/bookings', color: '#0284c7' },
    { label: isRtl ? 'عميل جديد' : 'New Customer', route: '/(tabs)/customers', color: '#059669' },
    { label: isRtl ? 'فاتورة' : 'Invoice', route: '/(tabs)/invoices', color: '#7c3aed' },
    { label: isRtl ? 'تقارير' : 'Reports', route: '/(tabs)/settings', color: '#d97706' },
  ];

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Header greeting */}
        <View style={[styles.greetingRow, isRtl && styles.rtlRow]}>
          <View>
            <Text style={[styles.greeting, isRtl && styles.rtlText]}>
              {isRtl ? 'مرحباً 👋' : 'Welcome Back 👋'}
            </Text>
            <Text style={[styles.greetingSub, isRtl && styles.rtlText]}>
              {isRtl ? 'ملخص اليوم' : "Today's Overview"}
            </Text>
          </View>
        </View>

        {/* Stats grid */}
        <View style={styles.statsGrid}>
          {stats.map((stat) => (
            <View key={stat.label} style={[styles.statCard, { backgroundColor: stat.bg }]}>
              <Text style={[styles.statValue, { color: stat.color }]}>{stat.value}</Text>
              <Text style={[styles.statLabel, isRtl && styles.rtlText]}>{stat.label}</Text>
            </View>
          ))}
        </View>

        {/* Quick actions */}
        <Text style={[styles.sectionTitle, isRtl && styles.rtlText]}>
          {isRtl ? 'إجراءات سريعة' : 'Quick Actions'}
        </Text>
        <View style={styles.actionsGrid}>
          {quickActions.map((action) => (
            <TouchableOpacity
              key={action.label}
              onPress={() => router.push(action.route as Parameters<typeof router.push>[0])}
              style={[styles.actionBtn, { backgroundColor: action.color }]}
              activeOpacity={0.8}
            >
              <Text style={[styles.actionLabel, isRtl && styles.rtlText]}>{action.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Recent indicator */}
        <Text style={[styles.sectionTitle, isRtl && styles.rtlText]}>
          {isRtl ? 'آخر الحجوزات' : 'Recent Bookings'}
        </Text>
        {[
          { id: 'BK-248', name: isRtl ? 'أحمد العمري' : 'Ahmed Al-Omari', type: isRtl ? 'عمرة' : 'Umrah', amount: '9,025', status: isRtl ? 'مؤكد' : 'Confirmed', color: '#059669' },
          { id: 'BK-247', name: isRtl ? 'فاطمة الزهراني' : 'Fatima Al-Zahrani', type: isRtl ? 'طيران' : 'Flight', amount: '2,530', status: isRtl ? 'بانتظار الموافقة' : 'Pending', color: '#d97706' },
          { id: 'BK-246', name: isRtl ? 'خالد السعد' : 'Khalid Al-Saad', type: isRtl ? 'فندق' : 'Hotel', amount: '5,175', status: isRtl ? 'مؤكد' : 'Confirmed', color: '#059669' },
        ].map(booking => (
          <View key={booking.id} style={styles.bookingRow}>
            <View style={[styles.bookingLeft, isRtl && styles.rtlRow]}>
              <Text style={styles.bookingId}>{booking.id}</Text>
              <View style={styles.bookingMeta}>
                <Text style={[styles.bookingName, isRtl && styles.rtlText]}>{booking.name}</Text>
                <Text style={[styles.bookingType, isRtl && styles.rtlText]}>{booking.type}</Text>
              </View>
            </View>
            <View style={[styles.bookingRight, isRtl && styles.rtlRow]}>
              <Text style={styles.bookingAmount}>{booking.amount}</Text>
              <View style={[styles.statusPill, { backgroundColor: booking.color + '20' }]}>
                <Text style={[styles.statusText, { color: booking.color }]}>{booking.status}</Text>
              </View>
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  scroll: { padding: 16, paddingBottom: 32 },
  greetingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  rtlRow: { flexDirection: 'row-reverse' },
  greeting: { fontSize: 22, fontWeight: 'bold', color: '#0f172a' },
  greetingSub: { fontSize: 13, color: '#94a3b8', marginTop: 2 },
  rtlText: { textAlign: 'right' },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 24 },
  statCard: { width: '47%', borderRadius: 16, padding: 16 },
  statValue: { fontSize: 22, fontWeight: 'bold', marginBottom: 4 },
  statLabel: { fontSize: 12, color: '#475569' },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#0f172a', marginBottom: 12 },
  actionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 24 },
  actionBtn: { width: '47%', borderRadius: 14, padding: 16, alignItems: 'center', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 6, elevation: 3 },
  actionLabel: { fontSize: 14, fontWeight: '600', color: 'white' },
  bookingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'white', borderRadius: 14, padding: 14, marginBottom: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  bookingLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  bookingMeta: { flex: 1 },
  bookingId: { fontSize: 11, color: '#0284c7', fontFamily: 'monospace', fontWeight: '600' },
  bookingName: { fontSize: 14, fontWeight: '600', color: '#0f172a', marginBottom: 2 },
  bookingType: { fontSize: 12, color: '#94a3b8' },
  bookingRight: { alignItems: 'flex-end', gap: 6 },
  bookingAmount: { fontSize: 14, fontWeight: 'bold', color: '#0f172a' },
  statusPill: { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 2 },
  statusText: { fontSize: 11, fontWeight: '600' },
});
