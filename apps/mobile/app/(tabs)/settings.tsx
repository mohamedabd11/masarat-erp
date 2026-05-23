import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  I18nManager,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

// Demo user profile
const DEMO_USER = {
  nameAr: 'محمد عبدالعزيز',
  nameEn: 'Mohammed Abdulaziz',
  email: 'mohammed@masarat.sa',
  roleAr: 'مدير الحجوزات',
  roleEn: 'Bookings Manager',
  avatarColor: '#0284c7',
  initials: 'م',
  initialsEn: 'MA',
};

interface SettingsItem {
  key: string;
  iconEmoji: string;
  labelAr: string;
  labelEn: string;
  subtitleAr?: string;
  subtitleEn?: string;
  destructive?: boolean;
  onPress: () => void;
}

export default function SettingsScreen() {
  const { t, i18n } = useTranslation();
  const isRtl = i18n.language === 'ar';

  const switchLanguage = () => {
    const newLang = isRtl ? 'en' : 'ar';
    i18n.changeLanguage(newLang);
    // Note: full RTL layout flip requires a restart in production;
    // here we surface a notice so users know.
    Alert.alert(
      newLang === 'ar' ? 'تم تغيير اللغة' : 'Language Changed',
      newLang === 'ar'
        ? 'تم التبديل إلى العربية'
        : 'Switched to English',
    );
  };

  const settingsItems: SettingsItem[] = [
    {
      key: 'agency',
      iconEmoji: '🏢',
      labelAr: 'معلومات الوكالة',
      labelEn: 'Agency Info',
      subtitleAr: 'مسارات للسياحة والسفر',
      subtitleEn: 'Masarat Travel & Tourism',
      onPress: () =>
        Alert.alert(
          isRtl ? 'معلومات الوكالة' : 'Agency Info',
          isRtl ? 'سيتم إضافة هذه الميزة قريباً' : 'Coming soon',
        ),
    },
    {
      key: 'language',
      iconEmoji: '🌐',
      labelAr: 'اللغة',
      labelEn: 'Language',
      subtitleAr: isRtl ? 'العربية  ·  تبديل إلى English' : 'English  ·  تبديل إلى العربية',
      subtitleEn: isRtl ? 'العربية  ·  Switch to English' : 'English  ·  Switch to العربية',
      onPress: switchLanguage,
    },
    {
      key: 'notifications',
      iconEmoji: '🔔',
      labelAr: 'الإشعارات',
      labelEn: 'Notifications',
      subtitleAr: 'ضبط تفضيلات الإشعارات',
      subtitleEn: 'Manage notification preferences',
      onPress: () =>
        Alert.alert(
          isRtl ? 'الإشعارات' : 'Notifications',
          isRtl ? 'سيتم إضافة هذه الميزة قريباً' : 'Coming soon',
        ),
    },
    {
      key: 'help',
      iconEmoji: '❓',
      labelAr: 'المساعدة والدعم',
      labelEn: 'Help & Support',
      subtitleAr: 'تواصل مع فريق الدعم',
      subtitleEn: 'Contact support team',
      onPress: () =>
        Alert.alert(
          isRtl ? 'المساعدة' : 'Help',
          isRtl ? 'support@masarat.sa' : 'support@masarat.sa',
        ),
    },
    {
      key: 'logout',
      iconEmoji: '🚪',
      labelAr: 'تسجيل الخروج',
      labelEn: 'Logout',
      destructive: true,
      onPress: () =>
        Alert.alert(
          isRtl ? 'تسجيل الخروج' : 'Logout',
          isRtl ? 'هل أنت متأكد أنك تريد تسجيل الخروج؟' : 'Are you sure you want to logout?',
          [
            { text: isRtl ? 'إلغاء' : 'Cancel', style: 'cancel' },
            { text: isRtl ? 'خروج' : 'Logout', style: 'destructive', onPress: () => {} },
          ],
        ),
    },
  ];

  const userName = isRtl ? DEMO_USER.nameAr : DEMO_USER.nameEn;
  const userRole = isRtl ? DEMO_USER.roleAr : DEMO_USER.roleEn;
  const avatarInitial = isRtl ? DEMO_USER.initials : DEMO_USER.initialsEn;

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Page title */}
        <Text style={[styles.pageTitle, isRtl && styles.rtlText]}>
          {isRtl ? 'الإعدادات' : 'Settings'}
        </Text>

        {/* Profile card */}
        <View style={[styles.profileCard, isRtl && styles.profileCardRtl]}>
          <View style={[styles.profileRow, isRtl && styles.rtlRow]}>
            {/* Avatar */}
            <View style={[styles.avatar, { backgroundColor: DEMO_USER.avatarColor }]}>
              <Text style={styles.avatarText}>{avatarInitial}</Text>
            </View>

            {/* Name & email */}
            <View style={[styles.profileInfo, isRtl && styles.profileInfoRtl]}>
              <Text style={[styles.profileName, isRtl && styles.rtlText]}>
                {userName}
              </Text>
              <Text style={[styles.profileEmail, isRtl && styles.rtlText]}>
                {DEMO_USER.email}
              </Text>
              {/* Role badge */}
              <View style={styles.roleBadge}>
                <Text style={styles.roleText}>{userRole}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Divider label */}
        <Text style={[styles.sectionLabel, isRtl && styles.rtlText]}>
          {isRtl ? 'عام' : 'General'}
        </Text>

        {/* Settings items */}
        <View style={styles.settingsList}>
          {settingsItems.map((item, index) => {
            const isLast = index === settingsItems.length - 1;
            return (
              <TouchableOpacity
                key={item.key}
                style={[
                  styles.settingsItem,
                  isRtl && styles.rtlRow,
                  isLast && styles.settingsItemLast,
                ]}
                onPress={item.onPress}
                activeOpacity={0.7}
              >
                {/* Icon */}
                <View
                  style={[
                    styles.settingsIcon,
                    item.destructive && styles.settingsIconDestructive,
                  ]}
                >
                  <Text style={styles.settingsIconEmoji}>{item.iconEmoji}</Text>
                </View>

                {/* Label + subtitle */}
                <View style={[styles.settingsLabelBlock, isRtl && styles.settingsLabelBlockRtl]}>
                  <Text
                    style={[
                      styles.settingsLabel,
                      item.destructive && styles.settingsLabelDestructive,
                      isRtl && styles.rtlText,
                    ]}
                  >
                    {isRtl ? item.labelAr : item.labelEn}
                  </Text>
                  {(item.subtitleAr || item.subtitleEn) && (
                    <Text style={[styles.settingsSubtitle, isRtl && styles.rtlText]}>
                      {isRtl ? item.subtitleAr : item.subtitleEn}
                    </Text>
                  )}
                </View>

                {/* Chevron (hidden for destructive) */}
                {!item.destructive && (
                  <Text style={[styles.chevron, isRtl && styles.chevronRtl]}>
                    {isRtl ? '‹' : '›'}
                  </Text>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* App version */}
        <Text style={styles.versionText}>
          {isRtl ? 'الإصدار 1.0.0 · مسارات ERP' : 'Version 1.0.0 · Masarat ERP'}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: '#f8fafc' },
  scrollContent: { padding: 16, paddingBottom: 32 },

  pageTitle:  { fontSize: 20, fontWeight: '700', color: '#0f172a', marginBottom: 16 },
  rtlText:    { textAlign: 'right' },
  rtlRow:     { flexDirection: 'row-reverse' },

  // Profile card
  profileCard:      { backgroundColor: 'white', borderRadius: 20, padding: 16, marginBottom: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 8, elevation: 3 },
  profileCardRtl:   { alignItems: 'flex-end' },
  profileRow:       { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar:           { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  avatarText:       { color: 'white', fontSize: 26, fontWeight: '700' },
  profileInfo:      { flex: 1, gap: 3 },
  profileInfoRtl:   { alignItems: 'flex-end' },
  profileName:      { fontSize: 17, fontWeight: '700', color: '#0f172a' },
  profileEmail:     { fontSize: 13, color: '#64748b' },
  roleBadge:        { alignSelf: 'flex-start', backgroundColor: '#dbeafe', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2, marginTop: 2 },
  roleText:         { fontSize: 11, fontWeight: '600', color: '#1d4ed8' },

  // Section label
  sectionLabel: { fontSize: 12, fontWeight: '600', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 },

  // Settings list
  settingsList:     { backgroundColor: 'white', borderRadius: 16, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2, marginBottom: 20 },
  settingsItem:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#f1f5f9' },
  settingsItemLast: { borderBottomWidth: 0 },

  settingsIcon:            { width: 38, height: 38, borderRadius: 10, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  settingsIconDestructive: { backgroundColor: '#fee2e2' },
  settingsIconEmoji:       { fontSize: 18 },

  settingsLabelBlock:     { flex: 1, gap: 2 },
  settingsLabelBlockRtl:  { alignItems: 'flex-end' },
  settingsLabel:          { fontSize: 15, fontWeight: '500', color: '#0f172a' },
  settingsLabelDestructive: { color: '#dc2626', fontWeight: '600' },
  settingsSubtitle:       { fontSize: 12, color: '#94a3b8' },

  chevron:    { fontSize: 20, color: '#cbd5e1', lineHeight: 22 },
  chevronRtl: { transform: [{ scaleX: -1 }] },

  versionText: { textAlign: 'center', fontSize: 12, color: '#cbd5e1', marginTop: 4 },
});
